import React, { useState, useRef, useCallback } from 'react';
import { URL_KEYWORDS } from '../../../tcrTemplates';

var inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' };
var labelStyle = { color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 6, fontWeight: 700 };

var URL_FIELDS = [
  { key: 'opt_in_url', label: 'Opt-in / Consent Page', kwKey: 'consent' },
  { key: 'privacy_url', label: 'Privacy Policy', kwKey: 'privacy' },
  { key: 'sms_terms_url', label: 'SMS Program Terms', kwKey: 'smsTerms' },
  { key: 'terms_url', label: 'Terms & Conditions', kwKey: 'terms' },
];

export default function StepConsent({ consent, onUpdate, onNext, onBack, tenantId, C }) {
  var [urlResults, setUrlResults] = useState({});
  var [verifying, setVerifying] = useState({});
  var [showErrors, setShowErrors] = useState(false);
  var [errors, setErrors] = useState({});
  var debounceTimers = useRef({});

  function set(field, value) {
    var patch = {};
    patch[field] = value;
    onUpdate(Object.assign({}, consent, patch));
  }

  var verifyUrl = useCallback(async function(fieldKey, url) {
    if (!url || !url.trim()) return;
    var v = Object.assign({}, verifying);
    v[fieldKey] = true;
    setVerifying(v);
    try {
      var res = await fetch('/api/tcr-verify-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), keywords: URL_KEYWORDS[URL_FIELDS.find(function(f) { return f.key === fieldKey; }).kwKey] || [], tenant_id: tenantId }),
      });
      var data = await res.json();
      setUrlResults(function(prev) { var n = Object.assign({}, prev); n[fieldKey] = data; return n; });
    } catch (e) {
      setUrlResults(function(prev) { var n = Object.assign({}, prev); n[fieldKey] = { ok: false, error: e.message, missing_keywords: [] }; return n; });
    }
    setVerifying(function(prev) { var n = Object.assign({}, prev); n[fieldKey] = false; return n; });
  }, [tenantId]);

  function handleBlur(fieldKey, url) {
    if (debounceTimers.current[fieldKey]) clearTimeout(debounceTimers.current[fieldKey]);
    debounceTimers.current[fieldKey] = setTimeout(function() {
      // Only auto-verify if URL changed from last verified URL
      var prev = urlResults[fieldKey];
      if (!prev || prev._url !== url) {
        verifyUrl(fieldKey, url);
      }
    }, 500);
  }

  function handleVerifyClick(fieldKey, url) {
    verifyUrl(fieldKey, url);
  }

  function validate() {
    var e = {};
    URL_FIELDS.forEach(function(f) {
      if (!consent[f.key] || !consent[f.key].trim()) e[f.key] = 'URL required';
      else if (!urlResults[f.key] || !urlResults[f.key].ok) e[f.key] = 'URL not verified';
    });
    var desc = (consent.opt_in_description || '').trim();
    if (desc.length < 50) e.opt_in_description = 'Min 50 characters (' + desc.length + ' entered)';
    if (desc.startsWith('EXAMPLE:')) e.opt_in_description = 'Replace the EXAMPLE template with your actual opt-in description';
    var conf = (consent.confirmation_message || '').trim();
    if (conf.length < 30 || conf.length > 158) e.confirmation_message = 'Must be 30-158 characters (' + conf.length + ' entered)';
    if (conf.startsWith('EXAMPLE:')) e.confirmation_message = 'Replace the EXAMPLE template with your actual confirmation message';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleNext() {
    if (validate()) { setShowErrors(false); onNext(); }
    else { setShowErrors(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '24px 28px', marginBottom: 20 };

  return (
    <div>
      <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Consent Flow & URLs</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Provide the URLs where users opt in and review your messaging policies. All 4 URLs must be live and contain required compliance language.</div>

      {showErrors && Object.keys(errors).length > 0 && (
        <div style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.25)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, color: '#EC4899', fontSize: 13 }}>
          Please fix the issues below before continuing.
        </div>
      )}

      <div style={card}>
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Compliance URLs</div>
        {URL_FIELDS.map(function(f) {
          var url = consent[f.key] || '';
          var result = urlResults[f.key];
          var isVerifying = verifying[f.key];
          var errMsg = showErrors && errors[f.key];
          return (
            <div key={f.key} style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{f.label} <span style={{ color: '#EC4899' }}>*</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={Object.assign({}, inputStyle, { flex: 1 })}
                  value={url}
                  onChange={function(e) { set(f.key, e.target.value); }}
                  onBlur={function() { handleBlur(f.key, url); }}
                  placeholder="https://..."
                />
                <button
                  onClick={function() { handleVerifyClick(f.key, url); }}
                  disabled={!url || isVerifying}
                  title="Check that this URL is live and contains required compliance language"
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: isVerifying ? C.muted : '#00BFFF', cursor: (!url || isVerifying) ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap', opacity: (!url || isVerifying) ? 0.5 : 1 }}
                >
                  {isVerifying ? '⏳' : 'Verify'}
                </button>
              </div>
              {result && (
                <div style={{ marginTop: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {result.ok ? (
                    <span style={{ color: '#10b981' }}>✓ Verified (HTTP {result.status})</span>
                  ) : (
                    <span style={{ color: '#EF4444' }}>✗ {result.error || ('Missing: ' + (result.missing_keywords || []).join(', '))}</span>
                  )}
                </div>
              )}
              {errMsg && !result && <div style={{ color: '#EF4444', fontSize: 11, marginTop: 4 }}>{errMsg}</div>}
            </div>
          );
        })}
      </div>

      <div style={card}>
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Message Flow</div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Opt-in Description <span style={{ color: '#EC4899' }}>*</span></label>
          <textarea
            style={Object.assign({}, inputStyle, { resize: 'vertical', minHeight: 80 })}
            value={consent.opt_in_description || ''}
            onChange={function(e) { set('opt_in_description', e.target.value); }}
            placeholder="Describe how users opt in to your messaging..."
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Describes the opt-in flow for carrier review (maps to Telnyx messageFlow)</div>
            <div style={{ fontSize: 10, color: (consent.opt_in_description || '').length < 50 ? '#F59E0B' : 'rgba(255,255,255,0.2)' }}>{(consent.opt_in_description || '').length} chars (min 50)</div>
          </div>
          {showErrors && errors.opt_in_description && <div style={{ color: '#EF4444', fontSize: 11, marginTop: 4 }}>{errors.opt_in_description}</div>}
        </div>
        <div>
          <label style={labelStyle}>Confirmation Message <span style={{ color: '#EC4899' }}>*</span></label>
          <textarea
            style={Object.assign({}, inputStyle, { resize: 'vertical', minHeight: 60 })}
            value={consent.confirmation_message || ''}
            onChange={function(e) { set('confirmation_message', e.target.value); }}
            placeholder="Message sent after user opts in..."
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Sent to user after opt-in. Must include HELP and STOP.</div>
            <div style={{ fontSize: 10, color: (consent.confirmation_message || '').length > 158 ? '#EF4444' : 'rgba(255,255,255,0.2)' }}>{(consent.confirmation_message || '').length} / 158</div>
          </div>
          {showErrors && errors.confirmation_message && <div style={{ color: '#EF4444', fontSize: 11, marginTop: 4 }}>{errors.confirmation_message}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>← Back</button>
        <button onClick={handleNext} style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Continue →</button>
      </div>
    </div>
  );
}
