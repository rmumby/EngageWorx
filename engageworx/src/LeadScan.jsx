import { useState, useRef, useEffect } from "react";
import { supabase } from './supabaseClient';

const SP_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';
const CPEXPO_SEQ_ID = '2cc4658f-46f6-4425-8300-95bc9213b720';

const STAGES = ['inquiry','demo_shared','sandbox_shared','opportunity','package_selection','go_live','customer'];
const SOURCES = ['CPExpo','Event','Referral','Direct','LinkedIn','Website','Other'];

function parseVCard(text) {
  var result = {};
  var lines = text.split(/\r?\n/);
  for (var line of lines) {
    if (line.startsWith('FN:')) result.name = line.slice(3).trim();
    if (line.startsWith('ORG:')) result.company = line.slice(4).split(';')[0].trim();
    if (line.startsWith('EMAIL')) result.email = line.split(':').slice(1).join(':').trim();
    if (line.startsWith('TEL')) result.phone = line.split(':').slice(1).join(':').trim();
    if (line.startsWith('URL')) result.website = line.split(':').slice(1).join(':').trim();
    if (line.startsWith('TITLE')) result.title = line.split(':').slice(1).join(':').trim();
  }
  return result;
}

export default function LeadScan({ C }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', bg: '#080d1a', surface: '#0d1425', border: '#182440', text: '#E8F4FD', muted: '#6B8BAE' };

  var [mode, setMode] = useState('home');
  var [form, setForm] = useState({ name: '', company: '', email: '', phone: '', title: '', source: 'CPExpo', stage: 'inquiry', notes: '', urgency: 'Warm' });
  var [saving, setSaving] = useState(false);
  var [saved, setSaved] = useState(null);
  var [error, setError] = useState('');
  var [sequences, setSequences] = useState([]);
  var [selectedSeqId, setSelectedSeqId] = useState(CPEXPO_SEQ_ID);
  var [aiReading, setAiReading] = useState(false);

  useEffect(function() {
    fetch('/api/sequences?action=list&tenant_id=' + SP_TENANT_ID)
      .then(function(r) { return r.json(); })
      .then(function(d) { setSequences(d.sequences || []); })
      .catch(function() {});
  }, []);

  function resetForm() {
    setForm({ name: '', company: '', email: '', phone: '', title: '', source: 'CPExpo', stage: 'inquiry', notes: '', urgency: 'Warm' });
    setError('');
    setSaved(null);
  }

  function updateForm(field, val) {
    setForm(function(prev) { return Object.assign({}, prev, { [field]: val }); });
  }

  async function handleSave() {
    if (!form.name && !form.company) { setError('Name or company required'); return; }
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
        source: form.source,
        notes: form.notes || (form.title ? 'Title: ' + form.title : ''),
        last_action_at: new Date().toISOString().split('T')[0],
        last_activity_at: new Date().toISOString(),
      };
      var leadRes = await supabase.from('leads').insert(leadPayload).select('id').single();
      if (leadRes.error) throw leadRes.error;
      var leadId = leadRes.data.id;

      if (form.name || form.email) {
        var nameParts = (form.name || '').trim().split(' ');
        // Dedup on email or phone
        var existing = null;
        if (form.email) {
          var ec = await supabase.from('contacts').select('id').eq('email', form.email).eq('tenant_id', SP_TENANT_ID).single();
          if (ec.data) existing = ec.data.id;
        }
        if (!existing && form.phone) {
          var pc = await supabase.from('contacts').select('id').eq('phone', form.phone).eq('tenant_id', SP_TENANT_ID).single();
          if (pc.data) existing = pc.data.id;
        }
        var contactPayload = {
          first_name: nameParts[0] || form.company,
          last_name: nameParts.slice(1).join(' ') || null,
          email: form.email || null,
          phone: form.phone || null,
          title: form.title || null,
          company_name: form.company || null,
          pipeline_lead_id: leadId,
          tenant_id: SP_TENANT_ID,
          status: 'active',
          source: form.source,
        };
        if (existing) {
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
      setSaved({ name: form.name || form.company, leadId: leadId, seq: seqName ? seqName.name : null });
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
      var reader = new FileReader();
      reader.onload = async function(ev) {
        var base64 = ev.target.result.split(',')[1];
        var resp = await fetch('/api/read-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64,
            mediaType: file.type || 'image/jpeg',
          })
        });
        var data = await resp.json();
        if (data.success && data.contact) {
          var parsed = data.contact;
          setForm(function(prev) {
            return Object.assign({}, prev, {
              name: parsed.name || prev.name,
              company: parsed.company || prev.company,
              email: parsed.email || prev.email,
              phone: parsed.phone || prev.phone,
              title: parsed.title || prev.title,
            });
          });
        }
        setAiReading(false);
      };
      reader.readAsDataURL(file);
    } catch(e) {
      setError('Could not read card: ' + e.message);
      setAiReading(false);
    }
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

  // ── HOME SCREEN ─────────────────────────────────────────────────────────────
  if (mode === 'home') {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0f1e', fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px 60px' }}>

        {/* Success banner */}
        {saved && (
          <div style={{ width: '100%', maxWidth: 420, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 14, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28 }}>✅</span>
            <div>
              <div style={{ color: '#10b981', fontWeight: 800, fontSize: 16 }}>{saved.name} saved!</div>
              <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>In Pipeline{saved.seq ? ' · enrolled in ' + saved.seq : ''}</div>
            </div>
          </div>
        )}

        {/* Logo */}
        <div style={{ marginBottom: 36, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg, #00C9FF, #E040FB)', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 14px', boxShadow: '0 8px 32px rgba(0,201,255,0.3)' }}>⚡</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#f1f5f9', letterSpacing: '-0.02em' }}>Lead Scan</div>
          <div style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>CPExpo 2026 · The Venetian, Las Vegas</div>
        </div>

        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* HERO — Scan Business Card */}
          <label style={{ width: '100%', padding: '24px 22px', borderRadius: 18, border: 'none', background: 'linear-gradient(135deg, #00C9FF, #0070f3)', color: '#fff', fontWeight: 900, fontSize: 20, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', boxSizing: 'border-box', boxShadow: '0 8px 32px rgba(0,201,255,0.35)', position: 'relative', overflow: 'hidden' }}>
            <span style={{ fontSize: 36, flexShrink: 0 }}>{aiReading ? '⏳' : '📷'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{aiReading ? 'AI Reading Card...' : 'Scan Business Card'}</div>
              <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.85, marginTop: 4 }}>Point camera at card · AI fills everything in</div>
            </div>
            <div style={{ fontSize: 28, opacity: 0.4 }}>→</div>
            <input type="file" accept="image/*" capture="environment" onChange={handleCardPhoto} style={{ display: 'none' }} disabled={aiReading} />
          </label>

          {/* Badge photo — same AI but labelled differently */}
          <label style={{ width: '100%', padding: '20px 22px', borderRadius: 16, border: '2px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.08)', color: '#f1f5f9', fontWeight: 800, fontSize: 17, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', boxSizing: 'border-box' }}>
            <span style={{ fontSize: 30, flexShrink: 0 }}>{aiReading ? '⏳' : '🪪'}</span>
            <div style={{ flex: 1 }}>
              <div>Scan Conference Badge</div>
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.6, marginTop: 3 }}>Photo of badge · AI extracts contact info</div>
            </div>
            <input type="file" accept="image/*" capture="environment" onChange={handleCardPhoto} style={{ display: 'none' }} disabled={aiReading} />
          </label>

          {/* Manual Entry */}
          <button onClick={function() { setMode('manual'); resetForm(); }} style={{ width: '100%', padding: '20px 22px', borderRadius: 16, border: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#f1f5f9', fontWeight: 800, fontSize: 17, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
            <span style={{ fontSize: 30, flexShrink: 0 }}>✏️</span>
            <div style={{ flex: 1 }}>
              <div>Manual Entry</div>
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.6, marginTop: 3 }}>Type name, company, email · 15 seconds</div>
            </div>
          </button>

        </div>

        {/* Sequence selector */}
        <div style={{ marginTop: 32, width: '100%', maxWidth: 420 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Auto-Enrol in Sequence</div>
          <select value={selectedSeqId} onChange={function(e) { setSelectedSeqId(e.target.value); }} style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '14px 16px', color: '#f1f5f9', fontSize: 15, fontFamily: 'inherit', outline: 'none', WebkitAppearance: 'none' }}>
            <option value="">None — don't enrol</option>
            {sequences.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
          </select>
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>Selected sequence fires automatically on every save</div>
        </div>

        {error && <div style={{ marginTop: 16, width: '100%', maxWidth: 420, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '14px 18px', color: '#ef4444', fontSize: 14 }}>{error}</div>}
      </div>
    );
  }

  // ── MANUAL / AI FORM ────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', fontFamily: "'DM Sans', sans-serif", padding: '20px 20px 60px' }}>
      <div style={{ maxWidth: 500, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={function() { setMode('home'); setError(''); setAiReading(false); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 16px', color: '#94a3b8', fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9' }}>
            {aiReading ? '🤖 AI Reading...' : 'New Lead'}
          </div>
        </div>

        {/* AI reading banner */}
        {aiReading && (
          <div style={{ background: 'rgba(0,201,255,0.08)', border: '1px solid rgba(0,201,255,0.25)', borderRadius: 14, padding: '18px 20px', marginBottom: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
            <div style={{ color: '#00C9FF', fontSize: 15, fontWeight: 700 }}>Claude is reading the card...</div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>Fields will fill in automatically</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Name + Company — biggest fields */}
          <div>
            <label style={labelStyle}>Full Name</label>
            <input style={{ ...inputStyle, fontSize: 20, fontWeight: 600 }} value={form.name} onChange={function(e) { updateForm('name', e.target.value); }} placeholder="Jane Smith" autoFocus={!aiReading} />
          </div>
          <div>
            <label style={labelStyle}>Company *</label>
            <input style={{ ...inputStyle, fontSize: 20, fontWeight: 600 }} value={form.company} onChange={function(e) { updateForm('company', e.target.value); }} placeholder="Acme Telecom" />
          </div>

          {/* Email + Phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} type="email" value={form.email} onChange={function(e) { updateForm('email', e.target.value); }} placeholder="jane@acme.com" />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={inputStyle} type="tel" value={form.phone} onChange={function(e) { updateForm('phone', e.target.value); }} placeholder="+1 555 0000" />
            </div>
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>Title</label>
            <input style={inputStyle} value={form.title} onChange={function(e) { updateForm('title', e.target.value); }} placeholder="VP Sales" />
          </div>

          {/* Urgency — big tap targets */}
          <div>
            <label style={labelStyle}>Urgency</label>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {[['Hot','🔥','#ef4444'],['Warm','⚡','#f59e0b'],['Cold','❄️','#64748b']].map(function(u) {
                var isActive = form.urgency === u[0];
                return (
                  <button key={u[0]} onClick={function() { updateForm('urgency', u[0]); }} onTouchEnd={function(e) { e.preventDefault(); updateForm('urgency', u[0]); }} style={{ flex: 1, padding: '14px 8px', borderRadius: 12, border: '2px solid ' + (isActive ? u[2] : 'rgba(255,255,255,0.1)'), background: isActive ? u[2] + '22' : 'rgba(255,255,255,0.03)', color: isActive ? u[2] : '#64748b', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {u[1]} {u[0]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Source + Stage in a row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Source</label>
              <select style={inputStyle} value={form.source} onChange={function(e) { updateForm('source', e.target.value); }}>
                {SOURCES.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Stage</label>
              <select style={inputStyle} value={form.stage} onChange={function(e) { updateForm('stage', e.target.value); }}>
                {STAGES.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical', lineHeight: 1.6 }} value={form.notes} onChange={function(e) { updateForm('notes', e.target.value); }} placeholder="What did you talk about?" />
          </div>

          {/* Sequence */}
          <div>
            <label style={labelStyle}>Auto-Enrol in Sequence</label>
            <select value={selectedSeqId} onChange={function(e) { setSelectedSeqId(e.target.value); }} style={{ ...inputStyle, color: selectedSeqId ? '#f1f5f9' : '#64748b' }}>
              <option value="">None — don't enrol</option>
              {sequences.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
            </select>
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '14px 16px', color: '#ef4444', fontSize: 14 }}>{error}</div>
          )}

          {/* Save — big thumb button */}
          <button onClick={handleSave} onTouchEnd={function(e) { if (!saving && !aiReading) { e.preventDefault(); handleSave(); } }} disabled={saving || aiReading} style={{ width: '100%', padding: '20px', borderRadius: 16, border: 'none', background: saving || aiReading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 900, fontSize: 20, cursor: saving || aiReading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: saving || aiReading ? 'none' : '0 8px 24px rgba(99,102,241,0.4)', marginTop: 8 }}>
            {saving ? 'Saving...' : '⚡ Save Lead'}
          </button>

          {/* Also scan another card from form */}
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
