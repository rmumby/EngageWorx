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
  var [enrolSeq, setEnrolSeq] = useState(true);
  var [scanning, setScanning] = useState(false);
  var [aiReading, setAiReading] = useState(false);
  var fileRef = useRef();
  var videoRef = useRef();
  var streamRef = useRef();

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
        await supabase.from('contacts').insert({
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
        });
      }

      if (enrolSeq) {
        var firstStepRes = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', CPEXPO_SEQ_ID).eq('step_number', 1).single();
        var startDate = new Date();
        if (firstStepRes.data && firstStepRes.data.delay_days > 0) {
          startDate.setDate(startDate.getDate() + firstStepRes.data.delay_days);
        }
        await supabase.from('lead_sequences').upsert({
          tenant_id: SP_TENANT_ID,
          lead_id: leadId,
          sequence_id: CPEXPO_SEQ_ID,
          current_step: 0,
          status: 'active',
          enrolled_at: new Date().toISOString(),
          next_step_at: startDate.toISOString(),
        }, { onConflict: 'lead_id,sequence_id' });
      }

      setSaved({ name: form.name || form.company, leadId: leadId });
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
        var resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [{
              role: 'user',
              content: [{
                type: 'image',
                source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 }
              }, {
                type: 'text',
                text: 'Extract contact info from this business card. Return ONLY valid JSON with fields: name, company, email, phone, title, website. Use null for missing fields. No explanation.'
              }]
            }]
          })
        });
        var data = await resp.json();
        var text = (data.content || []).find(function(b) { return b.type === 'text'; });
        if (text) {
          var jsonMatch = text.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            var parsed = JSON.parse(jsonMatch[0]);
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
        }
        setAiReading(false);
      };
      reader.readAsDataURL(file);
    } catch(e) {
      setError('Could not read card: ' + e.message);
      setAiReading(false);
    }
  }

  async function handleQRScan(e) {
    var file = e.target.files[0];
    if (!file) return;
    setScanning(true);
    setMode('manual');
    try {
      if ('BarcodeDetector' in window) {
        var detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        var bitmap = await createImageBitmap(file);
        var barcodes = await detector.detect(bitmap);
        if (barcodes.length > 0) {
          var raw = barcodes[0].rawValue;
          if (raw.startsWith('BEGIN:VCARD')) {
            var parsed = parseVCard(raw);
            setForm(function(prev) { return Object.assign({}, prev, parsed); });
          } else if (raw.includes('@')) {
            setForm(function(prev) { return Object.assign({}, prev, { email: raw.trim() }); });
          } else {
            updateForm('notes', raw);
          }
        } else {
          setError('No QR code found in image');
        }
      } else {
        setError('QR scanning not supported on this browser — use manual entry');
      }
    } catch(e) {
      setError('QR scan failed: ' + e.message);
    }
    setScanning(false);
  }

  var inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, padding: '12px 14px', color: '#f1f5f9', fontSize: 16,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
    WebkitAppearance: 'none',
  };

  var labelStyle = { fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' };

  if (mode === 'home') {
    return (
      <div style={{ minHeight: '100vh', background: colors.bg, fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 20px' }}>
        {saved && (
          <div style={{ width: '100%', maxWidth: 400, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: '14px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>✅</span>
            <div>
              <div style={{ color: '#10b981', fontWeight: 700, fontSize: 14 }}>{saved.name} saved</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>Added to Pipeline{enrolSeq ? ' + CPExpo sequence' : ''}</div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, background: 'linear-gradient(135deg, #00C9FF, #E040FB)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 12px' }}>⚡</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>Lead Scan</div>
          <div style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>CPExpo 2026 · Las Vegas</div>
        </div>

        <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <button onClick={function() { setMode('manual'); resetForm(); }} style={{ width: '100%', padding: '18px 20px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 800, fontSize: 17, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
            <span style={{ fontSize: 28 }}>✏️</span>
            <div>
              <div>Manual Entry</div>
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>Type name, company, email</div>
            </div>
          </button>

          <label style={{ width: '100%', padding: '18px 20px', borderRadius: 14, border: '2px dashed rgba(0,201,255,0.3)', background: 'rgba(0,201,255,0.06)', color: '#f1f5f9', fontWeight: 800, fontSize: 17, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', boxSizing: 'border-box' }}>
            <span style={{ fontSize: 28 }}>{aiReading ? '⏳' : '📷'}</span>
            <div>
              <div>{aiReading ? 'Reading card...' : 'Scan Business Card'}</div>
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>AI reads name, company, email</div>
            </div>
            <input type="file" accept="image/*" capture="environment" onChange={handleCardPhoto} style={{ display: 'none' }} />
          </label>

          <label style={{ width: '100%', padding: '18px 20px', borderRadius: 14, border: '2px dashed rgba(224,64,251,0.3)', background: 'rgba(224,64,251,0.06)', color: '#f1f5f9', fontWeight: 800, fontSize: 17, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', boxSizing: 'border-box' }}>
            <span style={{ fontSize: 28 }}>{scanning ? '⏳' : '🔲'}</span>
            <div>
              <div>{scanning ? 'Scanning...' : 'Scan QR Badge'}</div>
              <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>Point at QR code on badge</div>
            </div>
            <input type="file" accept="image/*" capture="environment" onChange={handleQRScan} style={{ display: 'none' }} />
          </label>
        </div>

        <div style={{ marginTop: 28, width: '100%', maxWidth: 400 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '14px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
            <input type="checkbox" checked={enrolSeq} onChange={function(e) { setEnrolSeq(e.target.checked); }} style={{ width: 18, height: 18, accentColor: colors.primary, cursor: 'pointer' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>Auto-enrol in CPExpo sequence</div>
              <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>Starts follow-up emails automatically</div>
            </div>
          </label>
        </div>

        {error && <div style={{ marginTop: 16, width: '100%', maxWidth: 400, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', color: '#ef4444', fontSize: 13 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, fontFamily: "'DM Sans', sans-serif", padding: '20px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={function() { setMode('home'); setError(''); }} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#94a3b8', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>← Back</button>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>{aiReading ? '🤖 Reading card...' : 'New Lead'}</div>
        </div>

        {aiReading && (
          <div style={{ background: 'rgba(0,201,255,0.08)', border: '1px solid rgba(0,201,255,0.2)', borderRadius: 12, padding: '16px', marginBottom: 20, textAlign: 'center', color: '#00C9FF', fontSize: 14, fontWeight: 600 }}>
            AI is reading the business card...
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Full Name</label>
              <input style={inputStyle} value={form.name} onChange={function(e) { updateForm('name', e.target.value); }} placeholder="Jane Smith" autoFocus={!aiReading} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Company *</label>
              <input style={inputStyle} value={form.company} onChange={function(e) { updateForm('company', e.target.value); }} placeholder="Acme Telecom" />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input style={{ ...inputStyle, fontSize: 14 }} type="email" value={form.email} onChange={function(e) { updateForm('email', e.target.value); }} placeholder="jane@acme.com" />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input style={{ ...inputStyle, fontSize: 14 }} type="tel" value={form.phone} onChange={function(e) { updateForm('phone', e.target.value); }} placeholder="+1 555 0000" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Title</label>
              <input style={inputStyle} value={form.title} onChange={function(e) { updateForm('title', e.target.value); }} placeholder="VP Sales" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Source</label>
              <select style={{ ...inputStyle, fontSize: 14 }} value={form.source} onChange={function(e) { updateForm('source', e.target.value); }}>
                {SOURCES.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Urgency</label>
              <select style={{ ...inputStyle, fontSize: 14 }} value={form.urgency} onChange={function(e) { updateForm('urgency', e.target.value); }}>
                <option>Hot</option><option>Warm</option><option>Cold</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Stage</label>
              <select style={{ ...inputStyle, fontSize: 14 }} value={form.stage} onChange={function(e) { updateForm('stage', e.target.value); }}>
                {STAGES.map(function(s) { return <option key={s} value={s}>{s}</option>; })}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }} value={form.notes} onChange={function(e) { updateForm('notes', e.target.value); }} placeholder="What did you talk about?" />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
            <input type="checkbox" checked={enrolSeq} onChange={function(e) { setEnrolSeq(e.target.checked); }} style={{ width: 18, height: 18, accentColor: colors.primary, cursor: 'pointer' }} />
            <div style={{ fontSize: 13, color: '#f1f5f9' }}>Enrol in CPExpo follow-up sequence</div>
          </label>

          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 14px', color: '#ef4444', fontSize: 13 }}>{error}</div>}

          <button onClick={handleSave} disabled={saving || aiReading} style={{ width: '100%', padding: '16px', borderRadius: 12, border: 'none', background: saving || aiReading ? 'rgba(99,102,241,0.4)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', fontWeight: 800, fontSize: 17, cursor: saving || aiReading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving...' : '⚡ Save Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
