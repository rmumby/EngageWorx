import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { sampleMessages, optInConfirmation, helpMessage, stopMessage } from '../../tcrTemplates';
import StepBrand from './steps/StepBrand';
import StepVetting from './steps/StepVetting';
import StepCampaign from './steps/StepCampaign';
import StepConsent from './steps/StepConsent';
import StepReview from './steps/StepReview';
import StepStatus from './steps/StepStatus';

var STEPS = [
  { id: 'brand', label: 'Brand', icon: '🏢' },
  { id: 'vetting', label: 'Vetting', icon: '🔍' },
  { id: 'campaign', label: 'Campaign', icon: '📱' },
  { id: 'consent', label: 'Consent', icon: '🔗' },
  { id: 'review', label: 'Review', icon: '✅' },
  { id: 'status', label: 'Status', icon: '📊' },
];

export default function TCRWizardInline({ tenantId, sessionId: resumeSessionId, C, onCancel, onComplete }) {
  var [step, setStep] = useState(0);
  var [sessionId, setSessionId] = useState(resumeSessionId || null);
  var [saving, setSaving] = useState(false);

  var [brand, setBrand] = useState({
    displayName: '', companyName: '', ein: '', vertical: '', entityType: '',
    street: '', city: '', state: '', postalCode: '', country: 'US',
    phone: '', email: '', website: '', stockSymbol: '', stockExchange: '',
  });

  var [campaign, setCampaign] = useState({
    use_case: 'ACCOUNT_NOTIFICATION', description: '',
    sample_messages: ['', '', '', '', ''],
    opt_in_keywords: 'START', help_message: '', stop_message: '',
    embeddedLink: true, embeddedPhone: false, ageGated: false, directLending: false,
  });

  var [consent, setConsent] = useState({
    opt_in_url: '', privacy_url: '', sms_terms_url: '',
    opt_in_description: '', confirmation_message: '',
  });

  var [bundleModal, setBundleModal] = useState(false);
  var [bundle, setBundle] = useState(null);

  // Scroll to top on mount and step transitions — target both window and parent scroll container
  var wizardRef = useRef(null);
  useEffect(function() {
    window.scrollTo(0, 0);
    if (wizardRef.current) wizardRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
    // Also try scrolling the nearest scrollable parent
    var el = wizardRef.current;
    while (el && el.parentElement) {
      el = el.parentElement;
      if (el.scrollTop > 0) { el.scrollTop = 0; break; }
    }
  }, [step]);

  // Load tenant name for template pre-fill
  useEffect(function() {
    if (!tenantId) return;
    supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle().then(function(r) {
      if (r.data && r.data.name) {
        var name = r.data.name;
        setCampaign(function(c) { return Object.assign({}, c, {
          sample_messages: sampleMessages(name),
          help_message: helpMessage(name),
          stop_message: stopMessage(name),
        }); });
        setConsent(function(cn) { return Object.assign({}, cn, {
          confirmation_message: optInConfirmation(name),
        }); });
        setBrand(function(b) { return Object.assign({}, b, { displayName: b.displayName || name }); });
      }
    });
  }, [tenantId]);

  // Resume session if sessionId provided
  useEffect(function() {
    if (!resumeSessionId) return;
    fetch('/api/tcr-wizard?action=status&session_id=' + resumeSessionId).then(function(r) { return r.json(); }).then(function(data) {
      if (data.session) {
        var s = data.session;
        if (s.brand_data) setBrand(Object.assign({}, brand, s.brand_data));
        if (s.campaign_data) setCampaign(Object.assign({}, campaign, s.campaign_data));
        if (s.campaign_data && s.campaign_data.consent) setConsent(Object.assign({}, consent, s.campaign_data.consent));
        var stepMap = { brand: 0, vetting: 1, campaign: 2, consent: 3, review: 4, status: 5, submitted: 5 };
        setStep(stepMap[s.current_step] || 0);
      }
    }).catch(function() {});
  }, [resumeSessionId]);

  // Start or save session
  async function startSession() {
    if (sessionId) return sessionId;
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      var res = await fetch('/api/tcr-wizard', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'start', tenant_id: tenantId }),
      });
      var data = await res.json();
      if (data.session_id) { setSessionId(data.session_id); return data.session_id; }
    } catch (e) { console.warn('[TCRWizard] start error:', e.message); }
    return null;
  }

  async function saveStep(stepName, data) {
    var sid = sessionId || await startSession();
    if (!sid) return;
    setSaving(true);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      await fetch('/api/tcr-wizard', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'save_step', session_id: sid, step: stepName, data: data }),
      });
    } catch (e) { console.warn('[TCRWizard] save error:', e.message); }
    setSaving(false);
  }

  function goNext() {
    var stepName = STEPS[step].id;
    if (step === 0) saveStep('brand', brand);
    if (step === 2) saveStep('campaign', campaign);
    if (step === 3) saveStep('consent', consent);
    setStep(step + 1);
  }

  function goBack() { setStep(Math.max(0, step - 1)); }

  async function handleGenerateBundle() {
    var sid = sessionId || await startSession();
    if (!sid) return;
    setBundleModal(true);
    setBundle(null);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      var res = await fetch('/api/tcr-wizard', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'generate_bundle', tenant_id: tenantId, session_id: sid }),
      });
      var data = await res.json();
      setBundle(data);
    } catch (e) { console.warn('[TCRWizard] bundle error:', e.message); }
  }

  function applyBundle(b) {
    if (!b || !b.form_fields) return;
    if (b.form_fields.brand) setBrand(function(prev) { return Object.assign({}, prev, b.form_fields.brand); });
    if (b.form_fields.campaign) setCampaign(function(prev) { return Object.assign({}, prev, b.form_fields.campaign); });
    if (b.form_fields.consent) setConsent(function(prev) { return Object.assign({}, prev, b.form_fields.consent); });
    setBundleModal(false);
  }

  // Progress bar
  var progress = (
    <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
      {STEPS.map(function(s, i) {
        var active = i === step;
        var done = i < step;
        return (
          <div key={s.id} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: 4, borderRadius: 2, background: done ? 'linear-gradient(90deg, #00BFFF, #A855F7)' : active ? '#00BFFF' : 'rgba(255,255,255,0.06)', marginBottom: 8, transition: 'background 0.3s' }} />
            <div style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? '#fff' : done ? '#00BFFF' : 'rgba(255,255,255,0.3)' }}>{s.icon} {s.label}</div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div ref={wizardRef} style={{ maxWidth: 780, margin: '0 auto', padding: '0 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>
          {resumeSessionId ? 'Resume Registration' : 'New 10DLC Registration'}
          {saving && <span style={{ color: C.muted, fontSize: 12, fontWeight: 400, marginLeft: 12 }}>Saving...</span>}
        </h2>
        <button onClick={onCancel} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 14px', color: C.muted, cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
      </div>
      {progress}

      {step === 0 && <StepBrand brand={brand} onUpdate={setBrand} onNext={goNext} onGenerateBundle={handleGenerateBundle} sessionId={sessionId} C={C} />}
      {step === 1 && <StepVetting onNext={goNext} onBack={goBack} C={C} />}
      {step === 2 && <StepCampaign campaign={campaign} onUpdate={setCampaign} onNext={goNext} onBack={goBack} sessionId={sessionId} C={C} />}
      {step === 3 && <StepConsent consent={consent} onUpdate={setConsent} onNext={goNext} onBack={goBack} tenantId={tenantId} C={C} />}
      {step === 4 && <StepReview brand={brand} campaign={campaign} consent={consent} sessionId={sessionId} tenantId={tenantId} onBack={goBack} onSubmit={function() { setStep(5); }} C={C} />}
      {step === 5 && <StepStatus sessionId={sessionId} onDone={onComplete} C={C} />}

      {/* Compliance Bundle Modal — placeholder until Phase 6 */}
      {bundleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={function() { setBundleModal(false); }}>
          <div style={{ background: '#1A1D2E', borderRadius: 16, padding: 32, maxWidth: 700, width: '90%', maxHeight: '85vh', overflowY: 'auto' }} onClick={function(e) { e.stopPropagation(); }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ color: '#fff', margin: 0, fontSize: 18 }}>✨ Compliance Bundle</h3>
              <button onClick={function() { setBundleModal(false); }} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>
            {!bundle ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
                Generating your compliance bundle...
              </div>
            ) : bundle.error ? (
              <div style={{ color: '#EF4444', padding: 20 }}>{bundle.error}</div>
            ) : (
              <div>
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, color: '#F59E0B', fontSize: 12, lineHeight: 1.5 }}>
                  These templates are structurally correct but reflect a generic business. You MUST edit fields to reflect your actual business before submitting. Carrier review will reject submissions that don't accurately describe your business.
                </div>
                <button onClick={function() { applyBundle(bundle); }} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>Fill form fields from bundle</button>
                {bundle.privacy_policy_section && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Privacy Policy SMS Section</div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 16, color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{bundle.privacy_policy_section}</div>
                    <button onClick={function() { navigator.clipboard.writeText(bundle.privacy_policy_section); }} style={{ marginTop: 6, background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 12px', color: C.muted, fontSize: 11, cursor: 'pointer' }}>Copy</button>
                  </div>
                )}
                {bundle.sms_terms_page_html && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>SMS Terms Page Content</div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 16, color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 1.5, maxHeight: 200, overflowY: 'auto' }}>{bundle.sms_terms_page_html}</div>
                    <button onClick={function() { navigator.clipboard.writeText(bundle.sms_terms_page_html); }} style={{ marginTop: 6, background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 12px', color: C.muted, fontSize: 11, cursor: 'pointer' }}>Copy</button>
                  </div>
                )}
                {bundle.optin_form_html && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Opt-in Form HTML</div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 16, color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 1.5, maxHeight: 200, overflowY: 'auto', fontFamily: 'monospace' }}>{bundle.optin_form_html}</div>
                    <button onClick={function() { navigator.clipboard.writeText(bundle.optin_form_html); }} style={{ marginTop: 6, background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 12px', color: C.muted, fontSize: 11, cursor: 'pointer' }}>Copy</button>
                  </div>
                )}
                {bundle.implementation_checklist && (
                  <div>
                    <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Implementation Checklist</div>
                    {bundle.implementation_checklist.map(function(item, i) {
                      return <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}><span>☐</span>{item}</div>;
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
