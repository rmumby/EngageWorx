import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { sampleMessages as templateSamples, helpMessage as templateHelp, stopMessage as templateStop, optInConfirmation as templateOptIn, campaignDescription as templateDescription, optInDescription as templateOptInDesc } from '../../tcrTemplates';
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
    phone: '', email: '', website: '', stockSymbol: '', stockExchange: '', phoneCountry: '+1',
  });

  var [campaign, setCampaign] = useState({
    use_case: '', description: '',
    sample_messages: ['', '', '', '', ''],
    opt_in_keywords: 'START', help_message: '', stop_message: '',
    embeddedLink: true, embeddedPhone: false, ageGated: false, directLending: false,
  });

  var [consent, setConsent] = useState({
    opt_in_url: '', privacy_url: '', sms_terms_url: '', terms_url: '',
    opt_in_description: '', confirmation_message: '',
  });

  // URL verification results — lifted from StepConsent so StepReview can read them
  var [urlResults, setUrlResults] = useState({});

  // Scroll to top on mount and step transitions
  var wizardRef = useRef(null);
  useEffect(function() {
    setTimeout(function() {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (wizardRef.current) {
        wizardRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
        var el = wizardRef.current.parentElement;
        while (el) {
          if (el.scrollHeight > el.clientHeight) { el.scrollTop = 0; }
          el = el.parentElement;
        }
      }
    }, 50);
  }, [step]);

  // Pre-fill templates for NEW sessions only (skip when resuming)
  useEffect(function() {
    if (!tenantId || resumeSessionId) return;
    supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle().then(function(r) {
      if (r.data && r.data.name) {
        var name = r.data.name;
        setBrand(function(b) { return Object.assign({}, b, { displayName: b.displayName || name }); });
        setCampaign(function(c) {
          if (c.sample_messages.some(function(m) { return m; })) return c;
          return Object.assign({}, c, {
            description: c.description || templateDescription(name),
            sample_messages: templateSamples(name),
            help_message: c.help_message || templateHelp(name),
            stop_message: c.stop_message || templateStop(name),
          });
        });
        setConsent(function(cn) { return Object.assign({}, cn, {
          confirmation_message: cn.confirmation_message || templateOptIn(name),
          opt_in_description: cn.opt_in_description || templateOptInDesc(name),
        }); });
      }
    });
  }, [tenantId, resumeSessionId]);

  // Resume: hydrate state from saved session data
  useEffect(function() {
    if (!resumeSessionId) return;
    fetch('/api/tcr-wizard?action=status&session_id=' + resumeSessionId).then(function(r) { return r.json(); }).then(function(data) {
      if (!data.session) return;
      var s = data.session;

      // Hydrate brand state
      if (s.brand_data && Object.keys(s.brand_data).length > 0) {
        setBrand(function(b) { return Object.assign({}, b, s.brand_data); });
      }

      // Hydrate campaign state (campaign fields only)
      if (s.campaign_data) {
        setCampaign(function(c) { return Object.assign({}, c, {
          use_case: s.campaign_data.use_case || c.use_case,
          description: s.campaign_data.description || c.description,
          sample_messages: s.campaign_data.sample_messages || c.sample_messages,
          opt_in_keywords: s.campaign_data.opt_in_keywords || c.opt_in_keywords,
          help_message: s.campaign_data.help_message || c.help_message,
          stop_message: s.campaign_data.stop_message || c.stop_message,
          embeddedLink: s.campaign_data.embeddedLink !== undefined ? s.campaign_data.embeddedLink : c.embeddedLink,
          embeddedPhone: s.campaign_data.embeddedPhone !== undefined ? s.campaign_data.embeddedPhone : c.embeddedPhone,
          ageGated: s.campaign_data.ageGated !== undefined ? s.campaign_data.ageGated : c.ageGated,
          directLending: s.campaign_data.directLending !== undefined ? s.campaign_data.directLending : c.directLending,
        }); });

        // Hydrate consent state (consent fields stored flat in campaign_data)
        setConsent(function(cn) { return Object.assign({}, cn, {
          opt_in_url: s.campaign_data.opt_in_url || cn.opt_in_url,
          privacy_url: s.campaign_data.privacy_url || cn.privacy_url,
          sms_terms_url: s.campaign_data.sms_terms_url || cn.sms_terms_url,
          terms_url: s.campaign_data.terms_url || cn.terms_url,
          opt_in_description: s.campaign_data.opt_in_description || cn.opt_in_description,
          confirmation_message: s.campaign_data.confirmation_message || cn.confirmation_message,
        }); });
      }

      // Route to correct step based on session status + data completeness
      var status = s.status || 'in_progress';
      if (status === 'submitted' || status === 'approved' || status === 'rejected' || status === 'brand_failed' || status === 'campaign_failed') {
        setStep(5); // Status view
      } else {
        // in_progress: find furthest completed step
        var bd = s.brand_data || {};
        var cd = s.campaign_data || {};
        if (!bd.displayName || !bd.ein || !bd.vertical || !bd.entityType) {
          setStep(0); // Brand incomplete
        } else if (!cd.use_case || !cd.description) {
          setStep(2); // Campaign incomplete
        } else if (!cd.opt_in_url || !cd.privacy_url) {
          setStep(3); // Consent incomplete
        } else {
          setStep(4); // All data present — go to Review
        }
      }
    }).catch(function(e) { console.warn('[TCRWizard] resume error:', e.message); });
  }, [resumeSessionId]);

  // Start or get session
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
    if (!sid) { console.warn('[TCRWizard] saveStep: no session ID'); return; }
    setSaving(true);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      var res = await fetch('/api/tcr-wizard', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'save_step', session_id: sid, step: stepName, data: data }),
      });
      var result = await res.json();
      console.log('[TCRWizard] saveStep', stepName, 'sid:', sid, 'status:', res.status, 'success:', result.success, 'error:', result.error || null);
    } catch (e) { console.warn('[TCRWizard] save error:', e.message); }
    setSaving(false);
  }

  async function goNext() {
    if (step === 0) await saveStep('brand', brand);
    if (step === 2) await saveStep('campaign', campaign);
    if (step === 3) await saveStep('consent', consent);
    setStep(step + 1);
  }

  function goBack() { setStep(Math.max(0, step - 1)); }

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

      {step === 0 && <StepBrand brand={brand} onUpdate={setBrand} onNext={goNext} C={C} />}
      {step === 1 && <StepVetting onNext={goNext} onBack={goBack} C={C} />}
      {step === 2 && <StepCampaign campaign={campaign} onUpdate={setCampaign} onNext={goNext} onBack={goBack} C={C} />}
      {step === 3 && <StepConsent consent={consent} onUpdate={setConsent} onNext={goNext} onBack={goBack} tenantId={tenantId} C={C} urlResults={urlResults} onUrlResults={setUrlResults} />}
      {step === 4 && <StepReview brand={brand} campaign={campaign} consent={consent} sessionId={sessionId} tenantId={tenantId} onBack={goBack} onSubmit={function() { setStep(5); }} C={C} urlResults={urlResults} onGoToStep={setStep} />}
      {step === 5 && <StepStatus sessionId={sessionId} tenantId={tenantId} onDone={onComplete} onBack={goBack} C={C} />}
    </div>
  );
}
