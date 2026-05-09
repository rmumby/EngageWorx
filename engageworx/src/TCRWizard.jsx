// src/TCRWizard.jsx — TCR registration wizard for platform-connectivity tenants
// Four steps: Brand → Campaign → URL Pre-flight → Review/Submit
// Gated to tenant.phone_supplier === 'telnyx'. BYOC/Path B out of scope.

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { USE_CASES, VERTICALS, ENTITY_TYPES, sampleMessages, optInConfirmation, helpMessage, stopMessage, URL_KEYWORDS } from './tcrTemplates';
import { validateBrand, validateCampaign, validateUrls, validateAll } from './tcrValidators';

var STEPS = [
  { id: 'brand', label: 'Brand Details', icon: '🏢' },
  { id: 'campaign', label: 'Campaign', icon: '📱' },
  { id: 'urls', label: 'URL Pre-flight', icon: '🔗' },
  { id: 'review', label: 'Review & Submit', icon: '✅' },
];

function Field({ label, required, error, children, hint }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0D1117', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#EC4899', marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && !error && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{hint}</div>}
      {error && <div style={{ fontSize: 12, color: '#EC4899', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

var inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E8EAF0', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', color: '#0D1117', background: '#fff' };
var selectStyle = Object.assign({}, inputStyle, { appearance: 'auto' });
var btnPrimary = { padding: '12px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" };
var btnSecondary = { padding: '12px 28px', borderRadius: 10, border: '1px solid #E8EAF0', background: '#fff', color: '#0D1117', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" };
var card = { background: '#fff', border: '1px solid #E8EAF0', borderRadius: 14, padding: '28px 32px', marginBottom: 20 };

export default function TCRWizard({ tenantId, C, fallbackComponent }) {
  var [tenant, setTenant] = useState(null);
  var [loading, setLoading] = useState(true);
  var [step, setStep] = useState(0);
  var [submitted, setSubmitted] = useState(false);
  var [submitting, setSubmitting] = useState(false);
  var [submitResult, setSubmitResult] = useState(null);
  var [errors, setErrors] = useState({});

  var [brand, setBrand] = useState({
    legal_name: '', dba: '', ein: '', vertical: '', street: '', city: '', state: '', zip: '', country: 'US',
    phone: '', email: '', website: '', entity_type: '', sole_proprietor: false, stock_symbol: '', reference_name: '',
  });

  var [campaign, setCampaign] = useState({
    use_case: 'ACCOUNT_NOTIFICATION',
    sample_messages: ['', '', '', '', ''],
    optin_confirmation: '', optin_keywords: 'START',
    help_message: '', stop_message: '',
    embed_links: true, embed_phone: false, direct_lending: false, age_gated: false,
  });

  var [urls, setUrls] = useState({ consent: '', privacy: '', smsTerms: '', terms: '' });
  var [urlResults, setUrlResults] = useState({});
  var [verifying, setVerifying] = useState({});

  // Load tenant
  useEffect(function() {
    if (!tenantId) { setLoading(false); return; }
    supabase.from('tenants').select('id, name, phone_supplier, plan, slug, custom_domain').eq('id', tenantId).maybeSingle().then(function(r) {
      setTenant(r.data || null);
      if (r.data && r.data.name) {
        setCampaign(function(c) { return Object.assign({}, c, {
          sample_messages: sampleMessages(r.data.name),
          optin_confirmation: optInConfirmation(r.data.name),
          help_message: helpMessage(r.data.name),
          stop_message: stopMessage(r.data.name),
        }); });
        setBrand(function(b) { return Object.assign({}, b, { legal_name: r.data.name }); });
      }
      setLoading(false);
    });
  }, [tenantId]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#6B7280' }}>Loading...</div>;

  // Eligibility gates
  if (!tenant) return <div style={card}><p style={{ color: '#6B7280' }}>Tenant not found.</p></div>;
  if (tenant.phone_supplier !== 'telnyx') {
    // Non-telnyx tenants use the legacy TCR registration flow
    if (fallbackComponent) return fallbackComponent;
    return (
      <div style={card}>
        <h2 style={{ color: '#0D1117', fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>TCR Registration</h2>
        <p style={{ color: '#6B7280', lineHeight: 1.6 }}>TCR registration via the wizard is currently available for tenants on platform connectivity. Contact support if you need help with your SMS registration.</p>
      </div>
    );
  }
  if (tenant.plan === 'enterprise') {
    return (
      <div style={card}>
        <h2 style={{ color: '#0D1117', fontSize: 20, fontWeight: 700, margin: '0 0 12px' }}>TCR Registration</h2>
        <p style={{ color: '#6B7280', lineHeight: 1.6 }}>Enterprise tenants with their own carrier connectivity are responsible for their own TCR compliance. The wizard does not submit on your behalf.</p>
        <a href="https://www.campaignregistry.com" target="_blank" rel="noopener noreferrer" style={{ color: '#00BFFF', fontSize: 13 }}>TCR documentation →</a>
      </div>
    );
  }

  // Submitted state
  if (submitted && submitResult) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px' }}>
        <div style={Object.assign({}, card, { textAlign: 'center', padding: '48px 32px' })}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h2 style={{ color: '#0D1117', fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>Registration Submitted</h2>
          <p style={{ color: '#6B7280', lineHeight: 1.6, maxWidth: 420, margin: '0 auto 24px' }}>{submitResult.message}</p>
          <div style={{ display: 'grid', gap: 8, maxWidth: 360, margin: '0 auto', textAlign: 'left' }}>
            <div style={{ fontSize: 13, color: '#6B7280' }}>Brand ID: <code style={{ color: '#0D1117' }}>{submitResult.brand_id}</code></div>
            <div style={{ fontSize: 13, color: '#6B7280' }}>Campaign ID: <code style={{ color: '#0D1117' }}>{submitResult.campaign_id}</code></div>
            <div style={{ fontSize: 13, color: '#6B7280' }}>Status: <span style={{ color: '#F59E0B', fontWeight: 700 }}>{submitResult.status}</span></div>
          </div>
        </div>
      </div>
    );
  }

  function updateBrand(field, value) { setBrand(function(b) { return Object.assign({}, b, (typeof field === 'string' ? (function() { var o = {}; o[field] = value; return o; })() : field)); }); }
  function updateCampaign(field, value) { setCampaign(function(c) { return Object.assign({}, c, (typeof field === 'string' ? (function() { var o = {}; o[field] = value; return o; })() : field)); }); }
  function updateUrl(field, value) { setUrls(function(u) { return Object.assign({}, u, (function() { var o = {}; o[field] = value; return o; })()); }); }
  function updateSample(idx, value) {
    setCampaign(function(c) {
      var msgs = c.sample_messages.slice();
      msgs[idx] = value;
      return Object.assign({}, c, { sample_messages: msgs });
    });
  }

  async function verifyUrl(field) {
    var url = urls[field];
    if (!url) return;
    var v = Object.assign({}, verifying); v[field] = true; setVerifying(v);
    try {
      var res = await fetch('/api/tcr-verify-url', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, keywords: URL_KEYWORDS[field] || [], tenant_id: tenantId }),
      });
      var data = await res.json();
      setUrlResults(function(r) { var n = Object.assign({}, r); n[field] = data; return n; });
    } catch (e) {
      setUrlResults(function(r) { var n = Object.assign({}, r); n[field] = { ok: false, error: e.message, missing_keywords: [] }; return n; });
    }
    var v2 = Object.assign({}, verifying); v2[field] = false; setVerifying(v2);
  }

  function canProceed() {
    if (step === 0) return validateBrand(brand).length === 0;
    if (step === 1) return validateCampaign(campaign, brand.legal_name).length === 0;
    if (step === 2) return validateUrls(urlResults).length === 0;
    return true;
  }

  function nextStep() {
    var v;
    if (step === 0) { v = validateBrand(brand); if (v.length > 0) { var e = {}; v.forEach(function(x) { e[x.field] = x.msg; }); setErrors(e); return; } }
    if (step === 1) { v = validateCampaign(campaign, brand.legal_name); if (v.length > 0) { var e2 = {}; v.forEach(function(x) { e2[x.field] = x.msg; }); setErrors(e2); return; } }
    if (step === 2) { v = validateUrls(urlResults); if (v.length > 0) { var e3 = {}; v.forEach(function(x) { e3[x.field] = x.msg; }); setErrors(e3); return; } }
    setErrors({});
    setStep(step + 1);
  }

  async function handleSubmit() {
    var all = validateAll(brand, campaign, urlResults);
    var allErrors = all.brand.concat(all.campaign).concat(all.urls);
    if (allErrors.length > 0) { var e = {}; allErrors.forEach(function(x) { e[x.field] = x.msg; }); setErrors(e); return; }
    setSubmitting(true);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      var res = await fetch('/api/tcr-submit-telnyx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ tenant_id: tenantId, brand: brand, campaign: campaign, urls: urls }),
      });
      var data = await res.json();
      if (data.ok) { setSubmitResult(data); setSubmitted(true); }
      else { setErrors({ submit: data.error || 'Submission failed' }); }
    } catch (e) { setErrors({ submit: e.message }); }
    setSubmitting(false);
  }

  // Progress bar
  var progress = (
    <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
      {STEPS.map(function(s, i) {
        var active = i === step;
        var done = i < step;
        return (
          <div key={s.id} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: 4, borderRadius: 2, background: done ? 'linear-gradient(90deg, #00BFFF, #A855F7)' : active ? '#00BFFF' : '#E8EAF0', marginBottom: 8, transition: 'background 0.3s' }} />
            <div style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? '#0D1117' : done ? '#00BFFF' : '#9CA3AF' }}>{s.icon} {s.label}</div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0D1117', margin: '0 0 4px' }}>SMS Registration (A2P 10DLC)</h1>
        <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>Register your brand and campaign to send SMS messages in the US</p>
      </div>
      <div style={{ marginBottom: 16, fontSize: 12, color: '#9CA3AF' }}>
        Have your own TCR brand? <span style={{ color: '#A855F7', cursor: 'default' }}>Bring my own TCR brand — coming soon</span>
      </div>

      {progress}

      {/* STEP 1 — Brand */}
      {step === 0 && (
        <div style={card}>
          <h2 style={{ color: '#0D1117', fontSize: 18, fontWeight: 700, margin: '0 0 20px' }}>Brand Details</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <Field label="Legal Business Name" required error={errors.legal_name}><input style={inputStyle} value={brand.legal_name} onChange={function(e) { updateBrand('legal_name', e.target.value); }} /></Field>
            <Field label="DBA (Doing Business As)"><input style={inputStyle} value={brand.dba} onChange={function(e) { updateBrand('dba', e.target.value); }} /></Field>
            <Field label="EIN" required error={errors.ein} hint="XX-XXXXXXX"><input style={inputStyle} value={brand.ein} onChange={function(e) { updateBrand('ein', e.target.value); }} placeholder="12-3456789" /></Field>
            <Field label="Entity Type" required error={errors.entity_type}><select style={selectStyle} value={brand.entity_type} onChange={function(e) { updateBrand('entity_type', e.target.value); }}><option value="">Select...</option>{ENTITY_TYPES.map(function(t) { return <option key={t.value} value={t.value}>{t.label}</option>; })}</select></Field>
            <Field label="Vertical" required error={errors.vertical}><select style={selectStyle} value={brand.vertical} onChange={function(e) { updateBrand('vertical', e.target.value); }}><option value="">Select...</option>{VERTICALS.map(function(v) { return <option key={v} value={v}>{v}</option>; })}</select></Field>
            <Field label="Website"><input style={inputStyle} value={brand.website} onChange={function(e) { updateBrand('website', e.target.value); }} placeholder="https://" /></Field>
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0D1117', margin: '24px 0 16px' }}>Address</h3>
          <Field label="Street" required error={errors.street}><input style={inputStyle} value={brand.street} onChange={function(e) { updateBrand('street', e.target.value); }} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0 16px' }}>
            <Field label="City" required error={errors.city}><input style={inputStyle} value={brand.city} onChange={function(e) { updateBrand('city', e.target.value); }} /></Field>
            <Field label="State" required error={errors.state}><input style={inputStyle} value={brand.state} onChange={function(e) { updateBrand('state', e.target.value); }} maxLength={2} placeholder="FL" /></Field>
            <Field label="ZIP" required error={errors.zip}><input style={inputStyle} value={brand.zip} onChange={function(e) { updateBrand('zip', e.target.value); }} /></Field>
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0D1117', margin: '24px 0 16px' }}>Contact</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <Field label="Business Phone" required error={errors.phone}><input style={inputStyle} value={brand.phone} onChange={function(e) { updateBrand('phone', e.target.value); }} /></Field>
            <Field label="Business Email" required error={errors.email}><input style={inputStyle} type="email" value={brand.email} onChange={function(e) { updateBrand('email', e.target.value); }} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <Field label="Stock Symbol (optional)"><input style={inputStyle} value={brand.stock_symbol} onChange={function(e) { updateBrand('stock_symbol', e.target.value); }} /></Field>
            <Field label="Reference Name (optional)"><input style={inputStyle} value={brand.reference_name} onChange={function(e) { updateBrand('reference_name', e.target.value); }} /></Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#0D1117', marginTop: 16 }}>
            <input type="checkbox" checked={brand.sole_proprietor} onChange={function(e) { updateBrand('sole_proprietor', e.target.checked); }} /> Sole proprietor
          </label>
          {brand.sole_proprietor && <div style={{ color: '#EC4899', fontSize: 13, marginTop: 8 }}>Sole proprietor registrations are not supported in this wizard at this time.</div>}
        </div>
      )}

      {/* STEP 2 — Campaign */}
      {step === 1 && (
        <div style={card}>
          <h2 style={{ color: '#0D1117', fontSize: 18, fontWeight: 700, margin: '0 0 20px' }}>Campaign Details</h2>
          <Field label="Use Case" required error={errors.use_case}>
            <select style={selectStyle} value={campaign.use_case} onChange={function(e) { updateCampaign('use_case', e.target.value); }}>
              {USE_CASES.map(function(uc) { return <option key={uc.value} value={uc.value}>{uc.label}</option>; })}
            </select>
            {USE_CASES.find(function(uc) { return uc.value === campaign.use_case; }) && (
              <div style={{ fontSize: 12, color: USE_CASES.find(function(uc) { return uc.value === campaign.use_case; }).warn ? '#F59E0B' : '#6B7280', marginTop: 6 }}>
                {USE_CASES.find(function(uc) { return uc.value === campaign.use_case; }).desc}
              </div>
            )}
          </Field>

          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0D1117', margin: '24px 0 12px' }}>Sample Messages (5 recommended, 2 minimum)</h3>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 16px' }}>Each message should include "Reply HELP for help or STOP to opt out" at least once across all samples.</p>
          {campaign.sample_messages.map(function(msg, i) {
            return (
              <Field key={i} label={'Sample ' + (i + 1)} required={i < 2} error={errors.sample_messages && i === 0 ? errors.sample_messages : null}>
                <textarea style={Object.assign({}, inputStyle, { resize: 'vertical', minHeight: 60 })} value={msg} onChange={function(e) { updateSample(i, e.target.value); }} placeholder={'Sample message ' + (i + 1) + '...'} />
                <div style={{ fontSize: 11, color: msg.length > 160 ? '#EC4899' : '#9CA3AF', textAlign: 'right' }}>{msg.length} / 160</div>
              </Field>
            );
          })}

          <Field label="Opt-in Confirmation Message" required error={errors.optin_confirmation} hint="This must match what your consent page says users will receive.">
            <textarea style={Object.assign({}, inputStyle, { resize: 'vertical', minHeight: 60 })} value={campaign.optin_confirmation} onChange={function(e) { updateCampaign('optin_confirmation', e.target.value); }} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
            <Field label="HELP Response" required error={errors.help_message}><textarea style={Object.assign({}, inputStyle, { resize: 'vertical', minHeight: 50 })} value={campaign.help_message} onChange={function(e) { updateCampaign('help_message', e.target.value); }} /></Field>
            <Field label="STOP Response" required error={errors.stop_message}><textarea style={Object.assign({}, inputStyle, { resize: 'vertical', minHeight: 50 })} value={campaign.stop_message} onChange={function(e) { updateCampaign('stop_message', e.target.value); }} /></Field>
          </div>
          <Field label="Opt-in Keywords" hint="Default: START. Up to 4 additional, separated by commas.">
            <input style={inputStyle} value={campaign.optin_keywords} onChange={function(e) { updateCampaign('optin_keywords', e.target.value); }} />
          </Field>
          <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" checked={campaign.embed_links} onChange={function(e) { updateCampaign('embed_links', e.target.checked); }} /> Embed links</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" checked={campaign.embed_phone} onChange={function(e) { updateCampaign('embed_phone', e.target.checked); }} /> Phone numbers</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" checked={campaign.direct_lending} onChange={function(e) { updateCampaign('direct_lending', e.target.checked); }} /> Direct lending</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" checked={campaign.age_gated} onChange={function(e) { updateCampaign('age_gated', e.target.checked); }} /> Age-gated</label>
          </div>
        </div>
      )}

      {/* STEP 3 — URL Pre-flight */}
      {step === 2 && (
        <div style={card}>
          <h2 style={{ color: '#0D1117', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>URL Pre-flight Check</h2>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 24px' }}>Each URL must return HTTP 200 and contain required compliance keywords. All four must pass before you can submit.</p>
          {/* TODO: Add "Use platform-hosted templates" toggle that pre-fills URLs like https://[tenant-slug].engwx.com/consent. Hosting not yet wired. */}
          {[
            { key: 'consent', label: 'Consent / Opt-in Page', keywords: URL_KEYWORDS.consent },
            { key: 'privacy', label: 'Privacy Policy', keywords: URL_KEYWORDS.privacy },
            { key: 'smsTerms', label: 'SMS Terms', keywords: URL_KEYWORDS.smsTerms },
            { key: 'terms', label: 'Terms & Conditions', keywords: URL_KEYWORDS.terms },
          ].map(function(u) {
            var result = urlResults[u.key];
            return (
              <Field key={u.key} label={u.label} required error={errors[u.key]}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={Object.assign({}, inputStyle, { flex: 1 })} value={urls[u.key]} onChange={function(e) { updateUrl(u.key, e.target.value); }} placeholder="https://..." />
                  <button onClick={function() { verifyUrl(u.key); }} disabled={!urls[u.key] || verifying[u.key]} style={Object.assign({}, btnSecondary, { whiteSpace: 'nowrap', opacity: verifying[u.key] ? 0.6 : 1 })}>
                    {verifying[u.key] ? 'Checking...' : 'Verify'}
                  </button>
                </div>
                {result && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12, background: result.ok ? 'rgba(16,185,129,0.08)' : 'rgba(236,72,153,0.08)', color: result.ok ? '#10b981' : '#EC4899', border: '1px solid ' + (result.ok ? 'rgba(16,185,129,0.2)' : 'rgba(236,72,153,0.2)') }}>
                    {result.ok ? '✓ Verified (HTTP ' + result.status + ')' : '✕ ' + (result.error || 'Missing keywords: ' + (result.missing_keywords || []).join(', '))}
                  </div>
                )}
              </Field>
            );
          })}
        </div>
      )}

      {/* STEP 4 — Review */}
      {step === 3 && (
        <div style={card}>
          <h2 style={{ color: '#0D1117', fontSize: 18, fontWeight: 700, margin: '0 0 20px' }}>Review & Submit</h2>

          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0D1117', margin: '0 0 12px' }}>Brand</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 13, color: '#6B7280' }}>
              <div>Legal name: <strong style={{ color: '#0D1117' }}>{brand.legal_name}</strong></div>
              <div>DBA: <strong style={{ color: '#0D1117' }}>{brand.dba || '—'}</strong></div>
              <div>EIN: <strong style={{ color: '#0D1117' }}>{brand.ein}</strong></div>
              <div>Entity: <strong style={{ color: '#0D1117' }}>{brand.entity_type}</strong></div>
              <div>Vertical: <strong style={{ color: '#0D1117' }}>{brand.vertical}</strong></div>
              <div>Email: <strong style={{ color: '#0D1117' }}>{brand.email}</strong></div>
            </div>
          </div>

          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0D1117', margin: '0 0 12px' }}>Campaign</h3>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }}>Use case: <strong style={{ color: '#0D1117' }}>{campaign.use_case}</strong>
              {campaign.use_case === 'MIXED' && <span style={{ color: '#F59E0B', marginLeft: 8, fontSize: 11, fontWeight: 700 }}>⚠ Mixed — approval may take longer</span>}
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Sample messages:</div>
            {campaign.sample_messages.filter(function(m) { return m.trim(); }).map(function(m, i) {
              return <div key={i} style={{ fontSize: 12, color: '#0D1117', padding: '4px 0', borderBottom: '1px solid #E8EAF0' }}>"{m}"</div>;
            })}
          </div>

          <div style={{ background: '#F9FAFB', borderRadius: 10, padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0D1117', margin: '0 0 12px' }}>URLs</h3>
            {['consent', 'privacy', 'smsTerms', 'terms'].map(function(k) {
              var r = urlResults[k];
              return (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}>
                  <span style={{ color: '#6B7280' }}>{k}:</span>
                  <span style={{ color: r && r.ok ? '#10b981' : '#EC4899', fontWeight: 600 }}>{r && r.ok ? '✓ Verified' : '✕ Not verified'}</span>
                </div>
              );
            })}
          </div>

          {errors.submit && <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(236,72,153,0.08)', color: '#EC4899', fontSize: 13, marginBottom: 16 }}>{errors.submit}</div>}
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <div>
          {step > 0 && <button onClick={function() { setStep(step - 1); setErrors({}); }} style={btnSecondary}>← Back</button>}
        </div>
        <div>
          {step < 3 && <button onClick={nextStep} disabled={brand.sole_proprietor && step === 0} style={Object.assign({}, btnPrimary, { opacity: brand.sole_proprietor && step === 0 ? 0.5 : 1 })}>Continue →</button>}
          {step === 3 && <button onClick={handleSubmit} disabled={submitting} style={Object.assign({}, btnPrimary, { opacity: submitting ? 0.6 : 1 })}>{submitting ? 'Submitting...' : 'Submit to TCR'}</button>}
        </div>
      </div>
    </div>
  );
}
