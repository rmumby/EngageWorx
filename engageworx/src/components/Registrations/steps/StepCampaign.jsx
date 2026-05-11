import React, { useState } from 'react';
import { USE_CASES } from '../../../tcrTemplates';

var inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' };
var selectStyle = Object.assign({}, inputStyle, { appearance: 'auto', colorScheme: 'dark' });
var labelStyle = { color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 6, fontWeight: 700 };

function Field({ label, required, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}{required && <span style={{ color: '#EC4899', marginLeft: 3 }}>*</span>}</label>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export default function StepCampaign({ campaign, onUpdate, onNext, onBack, C }) {
  var [errors, setErrors] = useState({});
  var [showErrors, setShowErrors] = useState(false);

  function set(field, value) {
    var patch = {};
    patch[field] = value;
    onUpdate(Object.assign({}, campaign, patch));
  }

  function updateSample(idx, value) {
    var msgs = (campaign.sample_messages || ['', '', '', '', '']).slice();
    msgs[idx] = value;
    set('sample_messages', msgs);
  }

  function validate() {
    var e = {};
    if (!campaign.use_case) e.use_case = true;
    if (!campaign.description || campaign.description.trim().length < 10) e.description = true;
    var msgs = campaign.sample_messages || [];
    var filled = msgs.filter(function(m) { return m && m.trim(); });
    if (filled.length < 2) e.sample_messages = true;
    var hasHelpStop = filled.some(function(m) { return /HELP/i.test(m) && /STOP/i.test(m); });
    if (!hasHelpStop && filled.length > 0) e.help_stop = true;
    if (!campaign.help_message) e.help_message = true;
    if (!campaign.stop_message) e.stop_message = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (validate()) { setShowErrors(false); onNext(); }
    else { setShowErrors(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '24px 28px', marginBottom: 20 };
  var errBorder = function(field) { return errors[field] ? { borderColor: '#EC4899' } : {}; };
  var selectedUC = USE_CASES.find(function(uc) { return uc.value === campaign.use_case; });

  return (
    <div>
      <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Campaign Details</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>Define what messages you'll send and how users opt in</div>
      <div style={{ background: 'rgba(0,191,255,0.06)', border: '1px solid rgba(0,191,255,0.15)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 1.6 }}>
        <strong style={{ color: '#00BFFF' }}>How to complete this step:</strong><br/>
        1. Select your <strong>Use Case</strong> below.<br/>
        2. Enter your <strong>Campaign Description</strong> (one paragraph describing what your campaign sends and why).<br/>
        3. Check <strong>Content Flags</strong> that apply to your messages.<br/>
        4. Customize the <strong>sample messages</strong> — replace template content with your actual messaging.<br/>
        5. Set <strong>Keywords &amp; Responses</strong>.
      </div>
      {showErrors && Object.keys(errors).length > 0 && (
        <div style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.25)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, color: '#EC4899', fontSize: 13 }}>
          Please fix the highlighted fields before continuing.
        </div>
      )}

      {/* 1. Use Case */}
      <div style={card}>
        <Field label="Use Case" required>
          <select style={Object.assign({}, selectStyle, errBorder('use_case'))} value={campaign.use_case || ''} onChange={function(e) { set('use_case', e.target.value); }}>
            <option value="">Select use case...</option>
            {USE_CASES.map(function(uc) { return <option key={uc.value} value={uc.value}>{uc.label}</option>; })}
          </select>
          {selectedUC && <div style={{ fontSize: 12, color: selectedUC.warn ? '#F59E0B' : 'rgba(255,255,255,0.3)', marginTop: 6 }}>{selectedUC.desc}</div>}
        </Field>

        {/* 2. Campaign Description */}
        <Field label="Campaign Description" required>
          <textarea style={Object.assign({}, inputStyle, { resize: 'vertical', minHeight: 70 }, errBorder('description'))} value={campaign.description || ''} onChange={function(e) { set('description', e.target.value); }} placeholder="Describe what messages will be sent and why..." />
        </Field>
      </div>

      {/* 3. Content Flags */}
      <div style={card}>
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Content Flags</div>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginBottom: 12 }}>These flags describe your messages to carriers. Set them accurately based on what your samples contain.</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { key: 'embeddedLink', label: 'Embedded Links', default: true },
            { key: 'embeddedPhone', label: 'Phone Numbers', default: false },
            { key: 'ageGated', label: 'Age-Gated', default: false },
            { key: 'directLending', label: 'Direct Lending', default: false },
          ].map(function(flag) {
            var val = campaign[flag.key] !== undefined ? campaign[flag.key] : flag.default;
            return (
              <label key={flag.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#fff', cursor: 'pointer' }}>
                <input type="checkbox" checked={val} onChange={function(e) { set(flag.key, e.target.checked); }} /> {flag.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* 4. Sample Messages */}
      <div style={card}>
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Sample Messages</div>
        <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginBottom: 12 }}>2 required, 5 recommended. At least one must include HELP and STOP keywords. Templates provided as starting points — customize to match your actual messaging.</div>
        {errors.sample_messages && <div style={{ color: '#EC4899', fontSize: 12, marginBottom: 8 }}>At least 2 sample messages required.</div>}
        {errors.help_stop && <div style={{ color: '#EC4899', fontSize: 12, marginBottom: 8 }}>At least one message must include HELP and STOP keywords.</div>}
        {(campaign.sample_messages || ['', '', '', '', '']).map(function(msg, i) {
          return (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>Sample {i + 1}{i < 2 ? ' *' : ''}</span>
                <span style={{ color: (msg || '').length > 160 ? '#EC4899' : 'rgba(255,255,255,0.2)', fontSize: 10 }}>{(msg || '').length} / 160</span>
              </div>
              <textarea style={Object.assign({}, inputStyle, { resize: 'vertical', minHeight: 50 })} value={msg || ''} onChange={function(e) { updateSample(i, e.target.value); }} placeholder={'Sample message ' + (i + 1) + '...'} />
            </div>
          );
        })}
      </div>

      {/* 5. Keywords & Responses */}
      <div style={card}>
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Keywords & Responses</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <Field label="Opt-in Keywords" hint="Default: START. Comma-separated."><input style={inputStyle} value={campaign.opt_in_keywords || 'START'} onChange={function(e) { set('opt_in_keywords', e.target.value); }} /></Field>
          <Field label="Opt-out Keywords" hint="STOP is always included"><input style={inputStyle} value="STOP" disabled /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
          <Field label="HELP Response" required>
            <textarea style={Object.assign({}, inputStyle, { resize: 'vertical', minHeight: 50 }, errBorder('help_message'))} value={campaign.help_message || ''} onChange={function(e) { set('help_message', e.target.value); }} />
          </Field>
          <Field label="STOP Response" required>
            <textarea style={Object.assign({}, inputStyle, { resize: 'vertical', minHeight: 50 }, errBorder('stop_message'))} value={campaign.stop_message || ''} onChange={function(e) { set('stop_message', e.target.value); }} />
          </Field>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>← Back</button>
        <button onClick={handleNext} style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Continue →</button>
      </div>
    </div>
  );
}
