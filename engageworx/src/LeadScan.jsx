import { useState, useRef, useEffect } from "react";
import { supabase } from './supabaseClient';

const SP_TENANT_ID = (process.env.REACT_APP_SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387');
const CPEXPO_SEQ_ID = '2cc4658f-46f6-4425-8300-95bc9213b720';

const STAGES = ['inquiry','demo_shared','sandbox_shared','opportunity','package_selection','go_live','customer'];

const DEFAULT_LOCATIONS = [
  'CPExpo 2026 · Las Vegas',
  'LinkedIn',
  'Referral',
  'Direct / Cold Outreach',
  'Website',
  'Conference / Event',
];

const LS_LOCATIONS_KEY = 'ew_lead_scan_locations';
const LS_SELECTED_KEY  = 'ew_lead_scan_selected_location';

function loadLocations() {
  try {
    var stored = localStorage.getItem(LS_LOCATIONS_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_LOCATIONS;
  } catch(e) { return DEFAULT_LOCATIONS; }
}

function saveLocations(locs) {
  try { localStorage.setItem(LS_LOCATIONS_KEY, JSON.stringify(locs)); } catch(e) {}
}

function loadSelectedLocation() {
  try { return localStorage.getItem(LS_SELECTED_KEY) || 'CPExpo 2026 · Las Vegas'; } catch(e) { return 'CPExpo 2026 · Las Vegas'; }
}

function saveSelectedLocation(loc) {
  try { localStorage.setItem(LS_SELECTED_KEY, loc); } catch(e) {}
}

var LS_EVENT_KEY = 'engageworx.leadscan.eventTag';
function loadEventTag() {
  try { return localStorage.getItem(LS_EVENT_KEY) || ''; } catch(e) { return ''; }
}
function saveEventTag(val) {
  try { localStorage.setItem(LS_EVENT_KEY, val || ''); } catch(e) {}
}

function parseVCard(text) {
  var result = {};
  var lines = text.split(/\r?\n/);
  for (var line of lines) {
    if (line.startsWith('FN:')) result.name = line.slice(3).trim();
    if (line.startsWith('ORG:')) result.company = line.slice(4).split(';')[0].trim();
    if (line.startsWith('EMAIL')) result.email = line.split(':').slice(1).join(':').trim();
    if (line.startsWith('TEL')) result.phone = line.split(':').slice(1).join(':').trim();
    if (line.startsWith('TITLE')) result.title = line.split(':').slice(1).join(':').trim();
  }
  return result;
}

export default function LeadScan({ C, demoMode = false }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', bg: '#080d1a', surface: '#0d1425', border: '#182440', text: '#E8F4FD', muted: '#6B8BAE' };

  var [mode, setMode]               = useState('home');
  var [form, setForm]               = useState({ name: '', company: '', email: '', phone: '', title: '', linkedinUrl: '', stage: 'inquiry', notes: '', urgency: 'Warm' });
  var [saving, setSaving]           = useState(false);
  var [saved, setSaved]             = useState(null);
  var [error, setError]             = useState('');
  var [sequences, setSequences]     = useState([]);
  var [selectedSeqId, setSelectedSeqId] = useState(CPEXPO_SEQ_ID);
  var [aiReading, setAiReading]     = useState(false);

  // Location manager
  var [locations, setLocations]               = useState(loadLocations);
  var [selectedLocation, setSelectedLocation] = useState(loadSelectedLocation);
  var [eventTag, setEventTag]                 = useState(loadEventTag);
  var [showLocationMgr, setShowLocationMgr]   = useState(false);
  var [newLocationText, setNewLocationText]   = useState('');

  useEffect(function() {
    if (demoMode) { setSequences([]); return; }
    fetch('/api/sequences?action=list&tenant_id=' + SP_TENANT_ID)
      .then(function(r) { return r.json(); })
      .then(function(d) { setSequences(d.sequences || []); })
      .catch(function() {});
  }, [demoMode]);

  function resetForm() {
    setForm({ name: '', company: '', email: '', phone: '', title: '', linkedinUrl: '', stage: 'inquiry', notes: '', urgency: 'Warm' });
    setError('');
    setSaved(null);
  }

  function updateForm(field, val) {
    setForm(function(prev) { return Object.assign({}, prev, { [field]: val }); });
  }

  function handleSelectLocation(loc) {
    setSelectedLocation(loc);
    saveSelectedLocation(loc);
  }

  function handleAddLocation() {
    var trimmed = newLocationText.trim();
    if (!trimmed || locations.includes(trimmed)) return;
    var updated = [trimmed].concat(locations);
    setLocations(updated);
    saveLocations(updated);
    handleSelectLocation(trimmed);
    setNewLocationText('');
  }

  function handleDeleteLocation(loc) {
    var updated = locations.filter(function(l) { return l !== loc; });
    setLocations(updated);
    saveLocations(updated);
    if (selectedLocation === loc) {
      var next = updated[0] || '';
      setSelectedLocation(next);
      saveSelectedLocation(next);
    }
  }

  async function handleSave() {
    if (!form.name && !form.company) { setError('Name or company required'); return; }
    if (demoMode) {
      setSaved({ name: form.name || form.company, leadId: 'demo-' + Date.now(), seq: null, location: selectedLocation });
      return;
    }
    setSaving(true);
    setError('');
    try {
      var leadPayload = {
        name: form.name || form.company,
        company: form.company || '',
        email: form.email || null,
        phone: form.phone || null,
        type: 'Unknown',
        urgency: form.urgency,
        stage: form.stage,
        source: selectedLocation || 'Direct',
        notes: form.notes || (form.title ? 'Title: ' + form.title : ''),
        event_tag: (eventTag || '').trim() || null,
        last_action_at: new Date().toISOString().split('T')[0],
        last_activity_at: new Date().toISOString(),
        tenant_id: SP_TENANT_ID,
      };
      var leadRes = await supabase.from('leads').insert(leadPayload).select('id').single();
      if (leadRes.error) throw leadRes.error;
      var leadId = leadRes.data.id;

      if (form.name || form.email) {
        var nameParts = (form.name || '').trim().split(' ');
        var existing = null;
        if (form.email) {
          var ec = await supabase.from('contacts').select('id').eq('email', form.email).eq('tenant_id', SP_TENANT_ID).single();
          if (ec.data) existing = ec.data.id;
        }
        if (!existing && form.phone) {
          var pc = await supabase.from('contacts').select('id').eq('phone', form.phone).eq('tenant_id', SP_TENANT_ID).single();
          if (pc.data) existing = pc.data.id;
        }
        var scanTag = (eventTag || '').trim();
        var contactTags = ['Lead'];
        if (scanTag && contactTags.indexOf(scanTag) === -1) contactTags.push(scanTag);
        var contactPayload = {
          first_name: nameParts[0] || form.company,
          last_name: nameParts.slice(1).join(' ') || null,
          email: form.email || null,
          phone: form.phone || null,
          title: form.title || null,
          company: form.company || null,
          linkedin_url: (form.linkedinUrl || '').trim() || null,
          pipeline_lead_id: leadId,
          tenant_id: SP_TENANT_ID,
          status: 'active',
          source: selectedLocation || 'Direct',
          event_tag: scanTag || null,
          tags: contactTags,
        };
        console.log('[LeadScan] saving contact:', JSON.stringify({ name: form.name, email: form.email, tags: contactTags, event_tag: scanTag, existing: existing }));
        if (existing) {
          // Merge tags with existing contact's tags
          try {
            var existingContact = await supabase.from('contacts').select('tags').eq('id', existing).maybeSingle();
            if (existingContact.data && Array.isArray(existingContact.data.tags)) {
              var merged = existingContact.data.tags.slice();
              contactTags.forEach(function(t) { if (merged.indexOf(t) === -1) merged.push(t); });
              contactPayload.tags = merged;
            }
          } catch (e) {}
          await supabase.from('contacts').update(contactPayload).eq('id', existing);
        } else {
          await supabase.from('contacts').insert(contactPayload);
        }
      }

      if (selectedSeqId) {
        var firstStepRes = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', selectedSeqId).eq('step_number', 1).single();
        var startDate = new Date();
        if (firstStepRes.data && firstStepRes.data.delay_days > 0) {
          startDate.setDate(startDate.getDate() + firstStepRes.data.delay_days);
        }
        await supabase.from('lead_sequences').upsert({
          tenant_id: SP_TENANT_ID,
          lead_id: leadId,
          sequence_id: selectedSeqId,
          current_step: 0,
          status: 'active',
          enrolled_at: new Date().toISOString(),
          next_step_at: startDate.toISOString(),
        }, { onConflict: 'lead_id,sequence_id' });
      }

      var seqName = sequences.find(function(s) { return s.id === selectedSeqId; });
      setSaved({ name: form.name || form.company, leadId: leadId, seq: seqName ? seqName.name : null, location: selectedLocation });
      resetForm();
      setMode('home');
    } catch(e) {
      setError('Save failed: ' + e.message);
    }
    setSaving(false);
  }

  async function handleCardPhoto(e) {
    var file = e.target.files[0];
    if (!file) return;
    setAiReading(true);
    setMode('manual');
    setError('');
    try {
      var base64 = await new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function(ev) {
          var img = new window.Image();
          img.onload = function() {
            var maxW = 1200;
            var scale = img.width > maxW ? maxW / img.width : 1;
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
          };
          img.onerror = reject;
          img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      var resp = await fetch('/api/read-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType: 'image/jpeg' })
      });

      if (!resp.ok) throw new Error('API error ' + resp.status);

      var data = await resp.json();
      if (data.success && data.contact) {
        var parsed = data.contact;
        setForm(function(prev) {
          var mergedNotes = prev.notes || '';
          if (parsed.website && mergedNotes.indexOf('Website:') === -1) {
            mergedNotes = mergedNotes ? (mergedNotes + '\nWebsite: ' + parsed.website) : ('Website: ' + parsed.website);
          }
          return Object.assign({}, prev, {
            name: parsed.name || prev.name,
            company: parsed.company || prev.company,
            email: parsed.email || prev.email,
            phone: parsed.phone || prev.phone,
            title: parsed.title || prev.title,
            linkedinUrl: parsed.linkedin_url || prev.linkedinUrl,
            notes: mergedNotes,
          });
        });
      } else {
        setError('Could not read card — try manual entry');
      }
    } catch(err) {
      setError('Could not read card: ' + err.message);
    }
    setAiReading(false);
  }

  var inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 12, padding: '14px 16px', color: '#f1f5f9', fontSize: 17,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
    WebkitAppearance: 'none', marginTop: 6,
  };

  var labelStyle = {
    fontSize: 11, fontWeight: 700, color: colors.muted,
    textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block',
  };

  // ── LOCATION MANAGER ─────────────────────────────────────────────────────────
  if (showLocationMgr) {
    return (
      <div style={{ minHeight: '100vh', background: C ? C.bg : '#0a0f1e', fontFamily: "'DM Sans', sans-serif", padding: '24px 20px 60px' }}>
        <div style={{ maxWidth: 420, margin: '0 auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <button onClick={function() { setShowLocationMgr(false); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 16px', color: '#94a3b8', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>📍 Manage Locations</div>
          </div>

          <div style={{ fontSize: 13, color: colors.muted, marginBottom: 20, lineHeight: 1.6 }}>
            Set where you are once — every lead is auto-tagged. Deleting a location keeps existing leads tagged permanently.
          </div>

          {/* Add new */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Add New Location</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={newLocationText}
                onChange={function(e) { setNewLocationText(e.target.value); }}
                onKeyDown={function(e) { if (e.key === 'Enter') handleAddLocation(); }}
                placeholder="e.g. MWC Barcelona 2027"
                style={{ flex: 1, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '12px 14px', color: '#f1f5f9', fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
              />
              <button
                onClick={handleAddLocation}
                disabled={!newLocationText.trim()}
                style={{ background: newLocationText.trim() ? 'linear-gradient(135deg, #00C9FF, #0070f3)' : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10, padding: '12px 20px', color: newLocationText.trim() ? '#fff' : '#475569', fontWeight: 700, fontSize: 15, cursor: newLocationText.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
              >Add</button>
            </div>
          </div>

          {/* Location list */}
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Your Locations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {locations.map(function(loc) {
              var isSelected = selectedLocation === loc;
              return (
                <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: 10, background: isSelected ? 'rgba(0,201,255,0.08)' : 'rgba(255,255,255,0.03)', border: '1px solid ' + (isSelected ? 'rgba(0,201,255,0.3)' : 'rgba(255,255,255,0.08)'), borderRadius: 12, padding: '12px 14px' }}>
                  <button
                    onClick={function() { handleSelectLocation(loc); }}
                    style={{ flex: 1, background: 'none', border: 'none', color: isSelected ? '#00C9FF' : '#94a3b8', fontSize: 15, fontWeight: isSelected ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}
                  >
                    {isSelected ? '📍 ' : '○ '}{loc}
                  </button>
                  {isSelected && <span style={{ fontSize: 10, color: '#00C9FF', fontWeight: 700, background: 'rgba(0,201,255,0.15)', padding: '3px 8px', borderRadius: 6 }}>ACTIVE</span>}
                  <button
                    onClick={function() {
                      if (!window.confirm('Remove "' + loc + '"? Existing leads keep this tag.')) return;
                      handleDeleteLocation(loc);
                    }}
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '6px 10px', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', flexShrink: 0 }}
                  >✕</button>
                </div>
              );
            })}
          </div>

          <button onClick={function() { setShowLocationMgr(false); }} style={{ width: '100%', marginTop: 28, padding: '16px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 800, fontSize: 17, cursor: 'pointer', fontFamily: 'inherit' }}>
            ✓ Done
          </button>
        </div>
      </div>
    );
  }

  // ── HOME SCREEN ──────────────────────────────────────────────────────────────
  if (mode === 'home') {
    return (
      <div style={{ minHeight: '100vh', background: C ? C.bg : '#0a0f1e', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 20px 60px' }}>

        {saved && (
          <div style={{ width: '100%', maxWidth: 420, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 26 }}>✅</span>
            <div>
              <div style={{ color: '#10b981', fontWeight: 800, fontSize: 15 }}>{saved.name} saved!</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                {saved.location && <span>📍 {saved.location} · </span>}
                Pipeline{saved.seq ? ' · ' + saved.seq : ''}
              </div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 22, textAlign: 'center' }}>
          <div style={{ width: 58, height: 58, background: 'linear-gradient(135deg, #00C9FF, #E040FB)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 10px', boxShadow: '0 8px 32px rgba(0,201,255,0.3)' }}>⚡</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#f1f5f9', letterSpacing: '-0.02em' }}>Lead Scan</div>
          <div style={{ fontSize: 13, color: colors.muted, marginTop: 3 }}>EngageWorx · Field Sales</div>
        </div>

        {/* Location selector */}
        <div style={{ width: '100%', maxWidth: 420, marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>📍 Where are you?</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={selectedLocation}
              onChange={function(e) { handleSelectLocation(e.target.value); }}
              style={{ flex: 1, background: 'rgba(0,201,255,0.08)', border: '1px solid rgba(0,201,255,0.3)', borderRadius: 12, padding: '13px 14px', color: '#00C9FF', fontSize: 15, fontFamily: 'inherit', outline: 'none', WebkitAppearance: 'none', fontWeight: 700 }}
            >
              {locations.map(function(loc) { return <option key={loc} value={loc}>{loc}</option>; })}
            </select>
            <button
              onClick={function() { setShowLocationMgr(true); }}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '13px 14px', color: '#94a3b8', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', fontWeight: 600 }}
            >＋ / ✕</button>
          </div>
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 5 }}>Every lead saved is tagged with this location</div>
        </div>

        {/* Capture buttons */}
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ width: '100%', padding: '22px 20px', borderRadius: 18, border: 'none', background: 'linear-gradient(135deg, #00C9FF, #0070f3)', color: '#fff', fontWeight: 900, fontSize: 19, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', boxSizing: 'border-box', boxShadow: '0 8px 32px rgba(0,201,255,0.35)' }}>
            <span style={{ fontSize: 32, flexShrink: 0 }}>{aiReading ? '⏳' : '📷'}</span>
            <div style={{ flex: 1 }}>
              <div>{aiReading ? 'AI Reading...' : 'Scan Business Card'}</div>
              <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.85, marginTop: 3 }}>Point camera · AI fills everything in</div>
            </div>
            <span style={{ fontSize: 22, opacity: 0.4 }}>→</span>
            <input type="file" accept="image/*" capture="environment" onChange={handleCardPhoto} style={{ display: 'none' }} disabled={aiReading} />
          </label>

          <label style={{ width: '100%', padding: '18px 20px', borderRadius: 16, border: '2px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.08)', color: '#f1f5f9', fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', boxSizing: 'border-box' }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>{aiReading ? '⏳' : '🪪'}</span>
            <div style={{ flex: 1 }}>
              <div>Scan Conference Badge</div>
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.6, marginTop: 3 }}>Photo of badge · AI extracts contact info</div>
            </div>
            <input type="file" accept="image/*" capture="environment" onChange={handleCardPhoto} style={{ display: 'none' }} disabled={aiReading} />
          </label>

          <label style={{ width: '100%', padding: '18px 20px', borderRadius: 16, border: '2px solid rgba(224,64,251,0.4)', background: 'rgba(224,64,251,0.08)', color: '#f1f5f9', fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', boxSizing: 'border-box' }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>{aiReading ? '⏳' : '📷'}</span>
            <div style={{ flex: 1 }}>
              <div>Upload Card</div>
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.6, marginTop: 3 }}>Blinq · HiHello · LinkedIn · photo of a card</div>
            </div>
            <input type="file" accept="image/*" onChange={handleCardPhoto} style={{ display: 'none' }} disabled={aiReading} />
          </label>

          <button onClick={function() { setMode('manual'); resetForm(); }} style={{ width: '100%', padding: '18px 20px', borderRadius: 16, border: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#f1f5f9', fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
            <span style={{ fontSize: 28, flexShrink: 0 }}>✏️</span>
            <div style={{ flex: 1 }}>
              <div>Manual Entry</div>
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.6, marginTop: 3 }}>Type name, company, email · 15 seconds</div>
            </div>
          </button>
        </div>

        {/* Event tag — persists across scans via localStorage */}
        <div style={{ marginTop: 22, width: '100%', maxWidth: 420 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Event</div>
          <input
            value={eventTag}
            onChange={function(e) { var v = e.target.value; setEventTag(v); saveEventTag(v); }}
            placeholder="e.g. CPExpo 2026, HIMSS, Mobile World Congress"
            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '13px 14px', color: '#f1f5f9', fontSize: 15, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 5 }}>Saved with every scan. Default remembered on this device.</div>
        </div>

        {/* Sequence selector */}
        <div style={{ marginTop: 22, width: '100%', maxWidth: 420 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Auto-Enrol in Sequence</div>
          <select value={selectedSeqId} onChange={function(e) { setSelectedSeqId(e.target.value); }} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '13px 14px', color: '#f1f5f9', fontSize: 15, fontFamily: 'inherit', outline: 'none', WebkitAppearance: 'none' }}>
            <option value="">None — don't enrol</option>
            {sequences.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
          </select>
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 5 }}>Fires automatically on every save</div>
        </div>

        {error && <div style={{ marginTop: 14, width: '100%', maxWidth: 420, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '14px 18px', color: '#ef4444', fontSize: 14 }}>{error}</div>}
      </div>
    );
  }

  // ── MANUAL / AI FORM ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C ? C.bg : '#0a0f1e', fontFamily: "'DM Sans', sans-serif", padding: '20px 20px 60px' }}>
      <div style={{ maxWidth: 500, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <button onClick={function() { setMode('home'); setError(''); setAiReading(false); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 16px', color: '#94a3b8', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#f1f5f9' }}>{aiReading ? '🤖 AI Reading...' : 'New Lead'}</div>
          {selectedLocation && (
            <div style={{ marginLeft: 'auto', fontSize: 11, color: '#00C9FF', background: 'rgba(0,201,255,0.1)', border: '1px solid rgba(0,201,255,0.2)', borderRadius: 8, padding: '4px 9px', fontWeight: 600 }}>
              📍 {selectedLocation}
            </div>
          )}
        </div>

        {aiReading && (
          <div style={{ background: 'rgba(0,201,255,0.08)', border: '1px solid rgba(0,201,255,0.25)', borderRadius: 14, padding: '16px 20px', marginBottom: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🤖</div>
            <div style={{ color: '#00C9FF', fontSize: 14, fontWeight: 700 }}>Claude is reading the card...</div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>Fields will fill in automatically</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Full Name</label>
            <input style={{ ...inputStyle, fontSize: 20, fontWeight: 600 }} value={form.name} onChange={function(e) { updateForm('name', e.target.value); }} placeholder="Jane Smith" autoFocus={!aiReading} />
          </div>
          <div>
            <label style={labelStyle}>Company *</label>
            <input style={{ ...inputStyle, fontSize: 20, fontWeight: 600 }} value={form.company} onChange={function(e) { updateForm('company', e.target.value); }} placeholder="Acme Telecom" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={form.email} onChange={function(e) { updateForm('email', e.target.value); }} placeholder="jane@acme.com" />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} type="tel" value={form.phone} onChange={function(e) { updateForm('phone', e.target.value); }} placeholder="+1 555 0000" />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Title</label>
            <input style={inputStyle} value={form.title} onChange={function(e) { updateForm('title', e.target.value); }} placeholder="VP Sales" />
          </div>

          <div>
            <label style={labelStyle}>Urgency</label>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {[['Hot','🔥','#ef4444'],['Warm','⚡','#f59e0b'],['Cold','❄️','#64748b']].map(function(u) {
                var isActive = form.urgency === u[0];
                return (
                  <button key={u[0]}
                    onClick={function() { updateForm('urgency', u[0]); }}
                    onTouchEnd={function(e) { e.preventDefault(); updateForm('urgency', u[0]); }}
                    style={{ flex: 1, padding: '14px 8px', borderRadius: 12, border: '2px solid ' + (isActive ? u[2] : 'rgba(255,255,255,0.1)'), background: isActive ? u[2] + '22' : 'rgba(255,255,255,0.03)', color: isActive ? u[2] : '#64748b', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {u[1]} {u[0]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Stage</label>
            <select style={inputStyle} value={form.stage} onChange={function(e) { updateForm('stage', e.target.value); }}>
              {STAGES.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
            </select>
          </div>

          {/* Met At — shows current location, tap to change */}
          <div>
            <label style={labelStyle}>Met At</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <div style={{ flex: 1, background: 'rgba(0,201,255,0.08)', border: '1px solid rgba(0,201,255,0.25)', borderRadius: 12, padding: '13px 14px', color: '#00C9FF', fontSize: 15, fontWeight: 600 }}>
                📍 {selectedLocation || 'Not set'}
              </div>
              <button onClick={function() { setShowLocationMgr(true); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '13px 14px', color: '#94a3b8', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Change</button>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Event</label>
            <input
              style={inputStyle}
              value={eventTag}
              onChange={function(e) { var v = e.target.value; setEventTag(v); saveEventTag(v); }}
              placeholder="e.g. CPExpo 2026"
            />
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical', lineHeight: 1.6 }} value={form.notes} onChange={function(e) { updateForm('notes', e.target.value); }} placeholder="What did you talk about?" />
          </div>

          <div>
            <label style={labelStyle}>Auto-Enrol in Sequence</label>
            <select value={selectedSeqId} onChange={function(e) { setSelectedSeqId(e.target.value); }} style={{ ...inputStyle, color: selectedSeqId ? '#f1f5f9' : '#64748b' }}>
              <option value="">None — don't enrol</option>
              {sequences.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
            </select>
          </div>

          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '14px 16px', color: '#ef4444', fontSize: 14 }}>{error}</div>}

          <button
            onClick={handleSave}
            onTouchEnd={function(e) { if (!saving && !aiReading) { e.preventDefault(); handleSave(); } }}
            disabled={saving || aiReading}
            style={{ width: '100%', padding: '20px', borderRadius: 16, border: 'none', background: saving || aiReading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 900, fontSize: 20, cursor: saving || aiReading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: saving || aiReading ? 'none' : '0 8px 24px rgba(99,102,241,0.4)', marginTop: 4 }}>
            {saving ? 'Saving...' : '⚡ Save Lead'}
          </button>

          {!aiReading && (
            <label style={{ width: '100%', padding: '14px', borderRadius: 12, border: '1px dashed rgba(0,201,255,0.3)', background: 'rgba(0,201,255,0.04)', color: '#00C9FF', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxSizing: 'border-box' }}>
              <span>📷</span> Scan a different card
              <input type="file" accept="image/*" capture="environment" onChange={handleCardPhoto} style={{ display: 'none' }} />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
