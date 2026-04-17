import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import EmailTrackingInstructions from './EmailTrackingInstructions';

var STEPS = [
  { id: 1, label: 'Welcome' },
  { id: 2, label: 'Branding' },
  { id: 3, label: 'Email' },
  { id: 4, label: 'AI Assistant' },
  { id: 5, label: 'WhatsApp' },
  { id: 6, label: 'Done' },
];

export default function OnboardingWizard({ tenantId, onComplete }) {
  var [step, setStep] = useState(1);
  var [tenant, setTenant] = useState(null);
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);
  var [error, setError] = useState('');
  var [emailTestResult, setEmailTestResult] = useState(null);

  // Step 2 (Branding)
  var [displayName, setDisplayName] = useState('');
  var [portalName, setPortalName] = useState('');
  var [logoUrl, setLogoUrl] = useState('');
  var [primaryColor, setPrimaryColor] = useState('#00C9FF');
  var [accentColor, setAccentColor] = useState('#E040FB');
  var [websiteUrl, setWebsiteUrl] = useState('');

  // Step 3 (Email)
  var [fromEmail, setFromEmail] = useState('');
  var [fromName, setFromName] = useState('');
  var [sendgridKey, setSendgridKey] = useState('');
  var [skipEmail, setSkipEmail] = useState(false);

  // Step 4 (AI)
  var [agentName, setAgentName] = useState('Aria');
  var [businessDescription, setBusinessDescription] = useState('');
  var [faqs, setFaqs] = useState([{ q: '', a: '' }, { q: '', a: '' }, { q: '', a: '' }]);
  var [skipAI, setSkipAI] = useState(false);

  // Step 5 (WhatsApp)
  var [waPhoneId, setWaPhoneId] = useState('');
  var [waAccountId, setWaAccountId] = useState('');
  var [waToken, setWaToken] = useState('');
  var [skipWa, setSkipWa] = useState(true);

  useEffect(function() {
    if (!tenantId) { setLoading(false); return; }
    // Reset all fields immediately so stale values from a prior tenant don't flash.
    // The async fetch below overwrites these with the current tenant's actual data.
    setTenant(null);
    setStep(1);
    setDisplayName('');
    setPortalName('');
    setLogoUrl('');
    setPrimaryColor('#00C9FF');
    setAccentColor('#E040FB');
    setWebsiteUrl('');
    setFromEmail('');
    setFromName('');
    setSendgridKey('');
    setSkipEmail(false);
    setAgentName('Aria');
    setBusinessDescription('');
    setFaqs([{ q: '', a: '' }, { q: '', a: '' }, { q: '', a: '' }]);
    setSkipAI(false);
    setWaPhoneId('');
    setWaAccountId('');
    setWaToken('');
    setSkipWa(true);

    (async function() {
      try {
        var t = await supabase.from('tenants').select('id, name, brand_name, plan, portal_name, brand_logo_url, brand_primary, brand_secondary, website_url, onboarding_step').eq('id', tenantId).maybeSingle();
        console.log('[Onboarding] tenant fetch for', tenantId, '→', t.data ? { name: t.data.name, brand_name: t.data.brand_name, portal_name: t.data.portal_name } : 'no data');
        if (t.data) {
          setTenant(t.data);
          setStep(Math.max(1, Math.min(6, t.data.onboarding_step || 1)));
          setDisplayName(t.data.brand_name || t.data.name || '');
          setPortalName(t.data.portal_name || '');
          setLogoUrl(t.data.brand_logo_url || '');
          if (t.data.brand_primary) setPrimaryColor(t.data.brand_primary);
          if (t.data.brand_secondary) setAccentColor(t.data.brand_secondary);
          setWebsiteUrl(t.data.website_url || '');
        }
        var ec = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'email').maybeSingle();
        console.log('[Onboarding] email config for', tenantId, '→', ec.data ? { from_email: ec.data.config_encrypted?.from_email, from_name: ec.data.config_encrypted?.from_name } : 'no config');
        if (ec.data && ec.data.config_encrypted) {
          if (ec.data.config_encrypted.from_email) setFromEmail(ec.data.config_encrypted.from_email);
          if (ec.data.config_encrypted.from_name) setFromName(ec.data.config_encrypted.from_name);
        }
        var cb = await supabase.from('chatbot_configs').select('bot_name, knowledge_base').eq('tenant_id', tenantId).maybeSingle();
        if (cb.data) {
          if (cb.data.bot_name) setAgentName(cb.data.bot_name);
          if (cb.data.knowledge_base) setBusinessDescription(cb.data.knowledge_base);
        }
      } catch (e) { console.warn('[Onboarding] load:', e.message); }
      setLoading(false);
    })();
  }, [tenantId]);

  async function persistStep(nextStep) {
    setSaving(true);
    setError('');
    try {
      if (step === 2) {
        var brandingPatch = {
          brand_name: displayName.trim() || null,
          portal_name: portalName.trim() || null,
          logo_url: logoUrl.trim() || null,
          brand_primary: primaryColor || null,
          brand_secondary: accentColor || null,
          website_url: websiteUrl.trim() || null,
        };
        await supabase.from('tenants').update(brandingPatch).eq('id', tenantId);
      } else if (step === 3 && !skipEmail) {
        var existing = await supabase.from('channel_configs').select('id, config_encrypted').eq('tenant_id', tenantId).eq('channel', 'email').maybeSingle();
        var emailCfg = Object.assign({}, (existing.data && existing.data.config_encrypted) || {}, {
          from_email: fromEmail.trim() || null,
          from_name: fromName.trim() || null,
        });
        if (sendgridKey.trim()) emailCfg.api_key = sendgridKey.trim();
        var emailPayload = { tenant_id: tenantId, channel: 'email', enabled: true, status: 'connected', config_encrypted: emailCfg, updated_at: new Date().toISOString() };
        if (existing.data && existing.data.id) await supabase.from('channel_configs').update(emailPayload).eq('id', existing.data.id).eq('tenant_id', tenantId);
        else await supabase.from('channel_configs').insert(emailPayload);
      } else if (step === 4 && !skipAI) {
        var faqText = faqs.filter(function(f) { return f.q.trim() && f.a.trim(); }).map(function(f) { return 'Q: ' + f.q.trim() + '\nA: ' + f.a.trim(); }).join('\n\n');
        var kb = (businessDescription.trim() ? businessDescription.trim() + '\n\n' : '') + (faqText ? '=== FAQs ===\n' + faqText : '');
        await supabase.from('chatbot_configs').upsert({ tenant_id: tenantId, bot_name: agentName.trim() || 'Aria', knowledge_base: kb || null }, { onConflict: 'tenant_id' });
      } else if (step === 5 && !skipWa) {
        var existingWa = await supabase.from('channel_configs').select('id, config_encrypted').eq('tenant_id', tenantId).eq('channel', 'whatsapp').maybeSingle();
        var waCfg = Object.assign({}, (existingWa.data && existingWa.data.config_encrypted) || {}, {
          phone_number_id: waPhoneId.trim() || null,
          business_account_id: waAccountId.trim() || null,
          access_token: waToken.trim() || null,
        });
        var waPayload = { tenant_id: tenantId, channel: 'whatsapp', enabled: !!(waPhoneId.trim() && waToken.trim()), status: (waPhoneId.trim() && waToken.trim()) ? 'connected' : 'pending', config_encrypted: waCfg, updated_at: new Date().toISOString() };
        if (existingWa.data && existingWa.data.id) await supabase.from('channel_configs').update(waPayload).eq('id', existingWa.data.id).eq('tenant_id', tenantId);
        else await supabase.from('channel_configs').insert(waPayload);
      }

      var stepPatch = { onboarding_step: nextStep };
      if (nextStep > 6) { stepPatch.onboarding_step = 6; stepPatch.onboarding_completed = true; }
      await supabase.from('tenants').update(stepPatch).eq('id', tenantId);

      if (nextStep > 6) { if (onComplete) onComplete(); return; }
      setStep(nextStep);
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  var [detecting, setDetecting] = useState(false);
  var [detectResult, setDetectResult] = useState(null);

  async function autoDetectLogo() {
    if (!websiteUrl.trim()) { alert('Enter a website URL first.'); return; }
    var domain = websiteUrl.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    var fullUrl = websiteUrl.trim().indexOf('http') === 0 ? websiteUrl.trim() : ('https://' + domain);

    setDetecting(true);
    setDetectResult(null);

    // Save website_url immediately
    if (tenantId) {
      try { await supabase.from('tenants').update({ website_url: fullUrl }).eq('id', tenantId); } catch (e) {}
    }

    // Fast lightweight endpoint — no Claude, pure HTML parsing (~1-2s)
    try {
      var r = await fetch('/api/detect-branding?url=' + encodeURIComponent(fullUrl));
      if (r && r.ok) {
        var d = await r.json();
        if (d.primary_color) setPrimaryColor(d.primary_color);
        if (d.secondary_color) setAccentColor(d.secondary_color);
        if (d.logo_url) setLogoUrl(d.logo_url);
        else if (d.favicon_url) setLogoUrl(d.favicon_url);
        if (d.site_name && !displayName) setDisplayName(d.site_name);
        setDetectResult({
          primary: d.primary_color,
          secondary: d.secondary_color,
          logo: d.logo_url || d.favicon_url,
          name: d.site_name,
        });
        setDetecting(false);
        return;
      }
    } catch (e) {}

    // Fallback: Google S2 favicons (always works)
    setLogoUrl('https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128');
    setDetecting(false);
  }

  async function testEmailConnection() {
    setEmailTestResult({ status: 'testing', msg: 'Testing…' });
    try {
      if (!fromEmail.trim() || !sendgridKey.trim()) { setEmailTestResult({ status: 'error', msg: 'From email and API key are required.' }); return; }
      // Light validation — full SendGrid test requires server side; here we just sanity-check format.
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromEmail.trim())) { setEmailTestResult({ status: 'error', msg: 'From email format looks wrong.' }); return; }
      if (sendgridKey.trim().indexOf('SG.') !== 0) { setEmailTestResult({ status: 'warn', msg: 'API key does not start with "SG." — double-check it' }); return; }
      setEmailTestResult({ status: 'ok', msg: 'Format looks good. Final delivery test will run on first send.' });
    } catch (e) { setEmailTestResult({ status: 'error', msg: e.message }); }
  }

  if (loading) {
    return <div style={{ position: 'fixed', inset: 0, background: '#080d1a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", zIndex: 9999 }}>Loading onboarding…</div>;
  }
  if (!tenant) return null;

  var portalLabel = portalName || displayName || tenant.name || 'your portal';
  var planLabel = tenant.plan || 'Trial';

  var card = { background: '#0d1425', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 24 };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };
  var label = { color: '#6B8BAE', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4 };
  var btnPrimary = { background: 'linear-gradient(135deg,' + primaryColor + ',' + accentColor + ')', border: 'none', borderRadius: 10, padding: '12px 26px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 18px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' };
  var btnGhost = { background: 'transparent', border: 'none', color: '#6B8BAE', cursor: 'pointer', fontSize: 12 };

  function renderStep1() {
    var planFeatures = {
      Starter: ['1,000 SMS / month', 'AI chatbot', 'Live Inbox', '1 phone number'],
      Growth: ['5,000 SMS / month', 'Full multi-channel', 'Sequences + Campaigns', '3 phone numbers'],
      Pro: ['20,000 SMS / month', 'White-label branding', 'Voice + Calendly', '10 phone numbers'],
      Enterprise: ['Unlimited everything', 'Dedicated CSM', 'Custom integrations'],
      Trial: ['Full feature access', '14-day trial', 'No credit card needed'],
    };
    var features = planFeatures[planLabel] || planFeatures.Trial;
    return (
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 }}>👋 Welcome to {portalLabel}!</div>
        <p style={{ color: '#cbd5e1', fontSize: 15, lineHeight: 1.6, marginBottom: 24 }}>Let's get you set up in under 5 minutes. We'll configure your branding, email, AI assistant, and (optionally) WhatsApp — then you're live.</p>
        <div style={Object.assign({}, card, { borderLeft: '4px solid ' + primaryColor })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{planLabel} plan</div>
            <span style={{ background: primaryColor + '22', color: primaryColor, border: '1px solid ' + primaryColor + '55', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>● Active</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 13, lineHeight: 1.8 }}>
            {features.map(function(f, i) { return <li key={i}>{f}</li>; })}
          </ul>
        </div>
      </div>
    );
  }

  function renderStep2() {
    return (
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>🎨 Make it yours</div>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 18 }}>Your brand colors and logo apply across the portal and outbound emails.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={label}>Display name</label>
            <input value={displayName} onChange={function(e) { setDisplayName(e.target.value); }} placeholder="Conecta Cloud" style={inputStyle} />
          </div>
          <div>
            <label style={label}>Portal name</label>
            <input value={portalName} onChange={function(e) { setPortalName(e.target.value); }} placeholder="Conecta Cloud Portal" style={inputStyle} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={label}>Website URL</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={websiteUrl} onChange={function(e) { setWebsiteUrl(e.target.value); }} placeholder="conectacloud.com" style={Object.assign({}, inputStyle, { flex: 1 })} />
              <button onClick={autoDetectLogo} disabled={detecting} style={Object.assign({}, btnSec, { opacity: detecting ? 0.5 : 1 })}>{detecting ? '⏳ Detecting…' : '🔍 Auto-detect brand'}</button>
            </div>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={label}>Logo URL</label>
            <input value={logoUrl} onChange={function(e) { setLogoUrl(e.target.value); }} placeholder="https://…/logo.png" style={inputStyle} />
          </div>
          <div>
            <label style={label}>Primary color</label>
            <div style={{ display: 'flex', gap: 6 }}><input type="color" value={primaryColor} onChange={function(e) { setPrimaryColor(e.target.value); }} style={{ width: 50, height: 38, border: 'none', background: 'transparent', cursor: 'pointer' }} /><input value={primaryColor} onChange={function(e) { setPrimaryColor(e.target.value); }} style={Object.assign({}, inputStyle, { flex: 1 })} /></div>
          </div>
          <div>
            <label style={label}>Accent color</label>
            <div style={{ display: 'flex', gap: 6 }}><input type="color" value={accentColor} onChange={function(e) { setAccentColor(e.target.value); }} style={{ width: 50, height: 38, border: 'none', background: 'transparent', cursor: 'pointer' }} /><input value={accentColor} onChange={function(e) { setAccentColor(e.target.value); }} style={Object.assign({}, inputStyle, { flex: 1 })} /></div>
          </div>
        </div>
        <div style={{ marginTop: 18, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>Live preview</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'linear-gradient(135deg,' + primaryColor + '22,' + accentColor + '22)', borderRadius: 8, border: '1px solid ' + primaryColor + '44' }}>
            {logoUrl && <img src={logoUrl} alt="logo" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} onError={function(e) { e.target.style.display = 'none'; }} />}
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>{displayName || 'Your business'}</div>
              <div style={{ color: '#cbd5e1', fontSize: 12 }}>{portalName || 'Portal name'}</div>
            </div>
          </div>
        </div>
        {detectResult && (
          <div style={{ marginTop: 14, padding: 12, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8 }}>
            <div style={{ color: '#10b981', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>✅ Detected from {websiteUrl.trim()}</div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              {detectResult.name && <div style={{ color: '#cbd5e1', fontSize: 13 }}>Name: <strong style={{ color: '#fff' }}>{detectResult.name}</strong></div>}
              {detectResult.primary && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 16, height: 16, borderRadius: 4, background: detectResult.primary, border: '1px solid rgba(255,255,255,0.2)' }} /><span style={{ color: '#cbd5e1', fontSize: 12 }}>Primary: <code style={{ color: '#fff' }}>{detectResult.primary}</code></span></div>}
              {detectResult.secondary && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 16, height: 16, borderRadius: 4, background: detectResult.secondary, border: '1px solid rgba(255,255,255,0.2)' }} /><span style={{ color: '#cbd5e1', fontSize: 12 }}>Accent: <code style={{ color: '#fff' }}>{detectResult.secondary}</code></span></div>}
              {detectResult.logo && <div style={{ color: '#cbd5e1', fontSize: 12 }}>Logo: ✓</div>}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderStep3() {
    return (
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>📧 Email channel</div>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 18 }}>Aria sends customer replies, sequence emails, and notifications from this address. <a href="https://sendgrid.com" target="_blank" rel="noreferrer" style={{ color: primaryColor }}>Get a SendGrid API key →</a></p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><label style={label}>From email</label><input value={fromEmail} onChange={function(e) { setFromEmail(e.target.value); }} placeholder="hello@yourdomain.com" style={inputStyle} /></div>
          <div><label style={label}>From name</label><input value={fromName} onChange={function(e) { setFromName(e.target.value); }} placeholder="Conecta Cloud" style={inputStyle} /></div>
          <div style={{ gridColumn: 'span 2' }}><label style={label}>SendGrid API key</label><input type="password" value={sendgridKey} onChange={function(e) { setSendgridKey(e.target.value); }} placeholder="SG.xxx…" style={inputStyle} /></div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={testEmailConnection} style={btnSec}>Test connection</button>
          {emailTestResult && <span style={{ color: emailTestResult.status === 'ok' ? '#10b981' : emailTestResult.status === 'warn' ? '#d97706' : emailTestResult.status === 'error' ? '#dc2626' : '#94a3b8', fontSize: 12 }}>{emailTestResult.msg}</span>}
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#94a3b8', fontSize: 12, marginTop: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={skipEmail} onChange={function(e) { setSkipEmail(e.target.checked); }} />
          Skip for now
        </label>
        {skipEmail && <div style={{ marginTop: 8, padding: 10, background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 8, color: '#d97706', fontSize: 12 }}>⚠️ Email auto-reply won't work until you configure this in Settings → Channels → Email.</div>}

        <div style={{ marginTop: 22, padding: 16, background: 'rgba(0,201,255,0.04)', border: '1px solid rgba(0,201,255,0.25)', borderRadius: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>📧 Outbound email tracking (optional)</div>
            <span style={{ color: primaryColor, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Power feature</span>
          </div>
          <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 12px', lineHeight: 1.6 }}>BCC your personal tracking address on any email you send from Gmail / Outlook / Apple Mail, and the thread shows up in Live Inbox so Aria can see the context when your contact replies. You can set this up now or later in Settings.</p>
          <EmailTrackingInstructions tenantId={tenantId} C={{ primary: primaryColor, accent: accentColor, muted: '#94a3b8' }} />
        </div>
      </div>
    );
  }

  var [aiGenerating, setAiGenerating] = useState(false);
  var [faqGenerating, setFaqGenerating] = useState(false);

  async function generateDescription() {
    setAiGenerating(true);
    try {
      var companyLabel = displayName || portalName || 'our business';
      var siteInfo = '';
      if (websiteUrl) {
        try {
          var br = await fetch('/api/detect-branding?url=' + encodeURIComponent(websiteUrl));
          var bd = await br.json();
          if (bd.site_name) siteInfo = ' (' + bd.site_name + ')';
        } catch (e) {}
      }
      var r = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: 200,
          messages: [{ role: 'user', content: 'Write a 2-3 sentence business description for "' + companyLabel + siteInfo + '". This will be used as an AI chatbot knowledge base so the AI can answer customer questions. Be specific and factual. Output only the description, no preamble.' }],
        }),
      });
      var d = await r.json();
      var txt = (d.content || []).find(function(b) { return b.type === 'text'; });
      if (txt && txt.text) setBusinessDescription(txt.text.trim());
    } catch (e) { alert('Generation failed: ' + e.message); }
    setAiGenerating(false);
  }

  async function suggestFaqs() {
    if (!businessDescription.trim()) { alert('Add a business description first — AI needs it to generate relevant FAQs.'); return; }
    setFaqGenerating(true);
    try {
      var r = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: 400,
          messages: [{ role: 'user', content: 'Based on this business description, generate exactly 3 customer FAQs as a JSON array of {q, a} objects. Each answer should be 1-2 sentences. Output ONLY the JSON array, no markdown.\n\nBusiness: ' + businessDescription.trim() }],
        }),
      });
      var d = await r.json();
      var txt = (d.content || []).find(function(b) { return b.type === 'text'; });
      if (txt && txt.text) {
        var m = txt.text.match(/\[[\s\S]*\]/);
        if (m) {
          var parsed = JSON.parse(m[0]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setFaqs(parsed.slice(0, 5).map(function(f) { return { q: f.q || f.question || '', a: f.a || f.answer || '' }; }));
          }
        }
      }
    } catch (e) { alert('FAQ generation failed: ' + e.message); }
    setFaqGenerating(false);
  }

  function renderStep4() {
    return (
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>🤖 Your AI assistant</div>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 18 }}>Aria reads inbound messages, answers customer questions, and routes anything she can't handle to your team.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          <div><label style={label}>AI agent name</label><input value={agentName} onChange={function(e) { setAgentName(e.target.value); }} placeholder="Aria" style={inputStyle} /></div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={label}>Business description (what does your business do?)</label>
              <button onClick={generateDescription} disabled={aiGenerating} style={{ background: 'linear-gradient(135deg,' + primaryColor + ',' + accentColor + ')', border: 'none', borderRadius: 6, padding: '5px 12px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 11, opacity: aiGenerating ? 0.5 : 1 }}>{aiGenerating ? '⏳ Generating…' : '✨ Generate with AI'}</button>
            </div>
            <textarea value={businessDescription} onChange={function(e) { setBusinessDescription(e.target.value); }} rows={4} placeholder="We're a US-based MSP helping mid-market healthcare clients with…" style={Object.assign({}, inputStyle, { resize: 'vertical' })} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={label}>Key FAQs (up to 5)</label>
              <button onClick={suggestFaqs} disabled={faqGenerating} style={{ background: 'linear-gradient(135deg,' + primaryColor + ',' + accentColor + ')', border: 'none', borderRadius: 6, padding: '5px 12px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 11, opacity: faqGenerating ? 0.5 : 1 }}>{faqGenerating ? '⏳ Generating…' : '✨ Suggest FAQs'}</button>
            </div>
            {faqs.slice(0, 5).map(function(f, idx) {
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 30px', gap: 6, marginBottom: 6 }}>
                  <input value={f.q} onChange={function(e) { var copy = faqs.slice(); copy[idx] = Object.assign({}, copy[idx], { q: e.target.value }); setFaqs(copy); }} placeholder="Question" style={inputStyle} />
                  <input value={f.a} onChange={function(e) { var copy = faqs.slice(); copy[idx] = Object.assign({}, copy[idx], { a: e.target.value }); setFaqs(copy); }} placeholder="Answer" style={inputStyle} />
                  <button onClick={function() { var copy = faqs.slice(); copy.splice(idx, 1); setFaqs(copy); }} style={Object.assign({}, btnGhost, { fontSize: 16 })}>✕</button>
                </div>
              );
            })}
            {faqs.length < 5 && <button onClick={function() { setFaqs(faqs.concat([{ q: '', a: '' }])); }} style={Object.assign({}, btnGhost, { fontSize: 12, marginTop: 4 })}>+ Add FAQ</button>}
          </div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#94a3b8', fontSize: 12, marginTop: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={skipAI} onChange={function(e) { setSkipAI(e.target.checked); }} />
          Skip for now
        </label>
        {skipAI && <div style={{ marginTop: 8, padding: 10, background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 8, color: '#d97706', fontSize: 12 }}>⚠️ AI won't be able to answer customer questions until you fill this in via Settings → Aria.</div>}
      </div>
    );
  }

  function renderStep5() {
    return (
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 6 }}>💬 WhatsApp <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 400 }}>(optional)</span></div>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 18 }}>Connect WhatsApp via Meta Business Cloud API. <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer" style={{ color: primaryColor }}>Setup guide →</a></p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          <div><label style={label}>WhatsApp Phone Number ID</label><input value={waPhoneId} onChange={function(e) { setWaPhoneId(e.target.value); }} placeholder="123456789012345" style={inputStyle} /></div>
          <div><label style={label}>WhatsApp Business Account ID</label><input value={waAccountId} onChange={function(e) { setWaAccountId(e.target.value); }} placeholder="123456789012345" style={inputStyle} /></div>
          <div><label style={label}>Access Token</label><input type="password" value={waToken} onChange={function(e) { setWaToken(e.target.value); }} placeholder="EAA…" style={inputStyle} /></div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#94a3b8', fontSize: 12, marginTop: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={skipWa} onChange={function(e) { setSkipWa(e.target.checked); }} />
          Skip — set up later
        </label>
      </div>
    );
  }

  function renderStep6() {
    var done = [];
    var pending = [];
    if (displayName || logoUrl) done.push('🎨 Branding'); else pending.push('Branding');
    if (!skipEmail && fromEmail) done.push('📧 Email channel'); else pending.push('Email');
    if (!skipAI && businessDescription.trim()) done.push('🤖 AI assistant'); else pending.push('AI assistant');
    if (!skipWa && waPhoneId) done.push('💬 WhatsApp');
    var aiReady = !skipEmail && fromEmail && !skipAI && businessDescription.trim();
    return (
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 }}>🎉 You're all set!</div>
        <p style={{ color: '#cbd5e1', fontSize: 14, marginBottom: 18 }}>{aiReady ? 'Your AI is ready to handle customer messages right now.' : 'You\'re live — but a few things still need to be configured for full automation.'}</p>
        <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
          {done.map(function(d, i) { return <div key={i} style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, color: '#10b981', fontSize: 13 }}>✅ {d}</div>; })}
          {pending.map(function(p, i) { return <div key={i} style={{ padding: '10px 14px', background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 8, color: '#d97706', fontSize: 13 }}>⚠️ {p} not configured — finish in Settings later.</div>; })}
        </div>
        <div style={{ padding: 16, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10 }}>
          <div style={{ color: '#a5b4fc', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>Recommended next steps</div>
          <div style={{ display: 'grid', gap: 6, color: '#cbd5e1', fontSize: 13 }}>
            <div>📥 <strong>Import contacts</strong> — Contacts → Import CSV</div>
            <div>📋 <strong>Set up SMS Registration</strong> if you want to send SMS in the US — Settings → SMS Registration</div>
            <div>📅 <strong>Book an onboarding call</strong> with our team — <a href="https://calendly.com/rob-engwx/30min" target="_blank" rel="noreferrer" style={{ color: primaryColor }}>calendly.com/rob-engwx</a></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,13,26,0.97)', zIndex: 9999, overflowY: 'auto', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>Step {step} of {STEPS.length} · {STEPS[step - 1].label}</div>
          <div style={{ color: '#6B8BAE', fontSize: 11 }}>Progress saved as you go</div>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ width: ((step / STEPS.length) * 100) + '%', height: '100%', background: 'linear-gradient(90deg,' + primaryColor + ',' + accentColor + ')', transition: 'width 0.3s' }} />
        </div>

        <div style={card}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
          {step === 6 && renderStep6()}

          {error && <div style={{ marginTop: 14, padding: 10, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 8, color: '#dc2626', fontSize: 12 }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 26, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={function() { if (step > 1) setStep(step - 1); }} disabled={step === 1 || saving} style={Object.assign({}, btnGhost, { opacity: step === 1 ? 0.3 : 1 })}>← Back</button>
            <button onClick={function() { persistStep(step + 1); }} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : (step === 6 ? 'Go to Dashboard →' : (step === 1 ? "Let's go" : 'Next →'))}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
