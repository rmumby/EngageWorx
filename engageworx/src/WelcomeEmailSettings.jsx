// ─── WelcomeEmailSettings.jsx ────────────────────────────────────────────────
// Drop into src/WelcomeEmailSettings.jsx
// Used in both SP portal (Settings) and CSP portal (Settings)
// Props: C (colors), tenantId (the tenant whose settings to save)

import { useState, useEffect } from "react";
import { supabase } from './supabaseClient';

export default function WelcomeEmailSettings({ C, tenantId }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', bg: '#080d1a', surface: '#0d1425', border: '#182440', text: '#E8F4FD', muted: '#6B8BAE' };

  var [settings, setSettings] = useState({
    welcome_email_enabled: true,
    welcome_email_from: '',
    welcome_email_from_name: '',
    welcome_email_ai_prompt: '',
    welcome_email_onboarding_link: '',
    welcome_email_steps: '',
  });
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);
  var [saved, setSaved] = useState(false);
  var [error, setError] = useState(null);
  var [previewLoading, setPreviewLoading] = useState(false);
  var [previewHtml, setPreviewHtml] = useState(null);
  var [testEmail, setTestEmail] = useState('');
  var [testSending, setTestSending] = useState(false);
  var [testMsg, setTestMsg] = useState('');

  var inputStyle = {
    width: '100%',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#f1f5f9',
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    outline: 'none',
    boxSizing: 'border-box',
  };
  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 22, marginBottom: 20 };
  var labelStyle = { color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block', fontWeight: 700 };

  useEffect(function() {
    if (!tenantId) { setLoading(false); return; }
    supabase.from('tenants')
      .select('welcome_email_enabled, welcome_email_from, welcome_email_from_name, welcome_email_ai_prompt, welcome_email_onboarding_link, welcome_email_steps')
      .eq('id', tenantId)
      .single()
      .then(function(res) {
        if (res.data) {
          setSettings({
            welcome_email_enabled: res.data.welcome_email_enabled !== false,
            welcome_email_from: res.data.welcome_email_from || '',
            welcome_email_from_name: res.data.welcome_email_from_name || '',
            welcome_email_ai_prompt: res.data.welcome_email_ai_prompt || '',
            welcome_email_onboarding_link: res.data.welcome_email_onboarding_link || '',
            welcome_email_steps: res.data.welcome_email_steps || '',
          });
        }
        setLoading(false);
      });
  }, [tenantId]);

  function update(field, val) {
    setSettings(function(prev) { return Object.assign({}, prev, { [field]: val }); });
  }

  async function save() {
    if (!tenantId) return;
    setSaving(true);
    setError(null);
    var res = await supabase.from('tenants').update({
      welcome_email_enabled: settings.welcome_email_enabled,
      welcome_email_from: settings.welcome_email_from || null,
      welcome_email_from_name: settings.welcome_email_from_name || null,
      welcome_email_ai_prompt: settings.welcome_email_ai_prompt || null,
      welcome_email_onboarding_link: settings.welcome_email_onboarding_link || null,
      welcome_email_steps: settings.welcome_email_steps || null,
    }).eq('id', tenantId);
    if (res.error) { setError(res.error.message); }
    else { setSaved(true); setTimeout(function() { setSaved(false); }, 3000); }
    setSaving(false);
  }

  async function sendTest() {
    if (!testEmail.trim()) return;
    setTestSending(true);
    setTestMsg('');
    try {
      var res = await fetch('/api/csp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_welcome_email',
          csp_tenant_id: tenantId,
          email: testEmail.trim(),
          company_name: 'Test Company',
          plan: 'starter',
        }),
      });
      var data = await res.json();
      if (data.error) throw new Error(data.error);
      setTestMsg('✓ Test email sent to ' + testEmail);
    } catch (err) {
      setTestMsg('✕ ' + err.message);
    }
    setTestSending(false);
  }

  if (loading) return <div style={{ color: colors.muted, padding: 40, textAlign: 'center' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 700, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 800, margin: '0 0 6px' }}>Welcome Email</h2>
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Automatically sent to new tenants when their account is created. Personalised by AI using their company name and plan.</p>
      </div>

      {/* Enable / Disable */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Welcome Email</div>
            <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Send automatically when a new tenant account is created</div>
          </div>
          <div onClick={function() { update('welcome_email_enabled', !settings.welcome_email_enabled); }} style={{ width: 44, height: 24, borderRadius: 12, background: settings.welcome_email_enabled ? colors.primary : 'rgba(255,255,255,0.15)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
            <div style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', position: 'absolute', top: 2, left: settings.welcome_email_enabled ? 22 : 2, transition: 'left 0.2s' }} />
          </div>
        </div>
      </div>

      {settings.welcome_email_enabled && (
        <>
          {/* Sender */}
          <div style={card}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Sender Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>From Name</label>
                <input value={settings.welcome_email_from_name} onChange={function(e) { update('welcome_email_from_name', e.target.value); }} placeholder="e.g. Rob at EngageWorx" style={inputStyle} />
                <div style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Appears as the sender name</div>
              </div>
              <div>
                <label style={labelStyle}>From Email</label>
                <input value={settings.welcome_email_from} onChange={function(e) { update('welcome_email_from', e.target.value); }} placeholder="e.g. hello@engwx.com" style={inputStyle} />
                <div style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Must be a verified SendGrid sender</div>
              </div>
            </div>
          </div>

          {/* AI Message */}
          <div style={card}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>AI Personalisation</div>
            <div style={{ color: colors.muted, fontSize: 12, marginBottom: 16 }}>Claude writes a personalised 2-paragraph message for each new signup using their company name and plan. Customise the instructions below or leave blank to use the default.</div>
            <label style={labelStyle}>AI Instructions (optional)</label>
            <textarea value={settings.welcome_email_ai_prompt} onChange={function(e) { update('welcome_email_ai_prompt', e.target.value); }} placeholder={"Default: Write a warm, personal welcome message referencing their company name and plan. Invite them to book a call. 2 short paragraphs, no URLs, no sign-off."} rows={4} style={Object.assign({}, inputStyle, { resize: 'vertical', lineHeight: 1.6 })} />
            <div style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>Leave blank to use the default AI instructions. The AI always receives the new tenant's company name, plan, and email automatically.</div>
          </div>

          {/* Onboarding Steps */}
          <div style={card}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Getting Started Steps</div>
            <div style={{ color: colors.muted, fontSize: 12, marginBottom: 16 }}>The "3 Things to Do First" section shown in the email. One step per line. Leave blank for default steps.</div>
            <textarea value={settings.welcome_email_steps} onChange={function(e) { update('welcome_email_steps', e.target.value); }} placeholder={"1. Set up your phone number — Settings → Channels → SMS\n2. Import your contacts — Contacts → Import\n3. Configure your AI Chatbot — AI Chatbot in the sidebar"} rows={5} style={Object.assign({}, inputStyle, { resize: 'vertical', lineHeight: 1.8, fontFamily: 'monospace', fontSize: 12 })} />
          </div>

          {/* Onboarding Link */}
          <div style={card}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginBottom: 16 }}>Onboarding Call Link</div>
            <label style={labelStyle}>Calendly or Booking URL</label>
            <input value={settings.welcome_email_onboarding_link} onChange={function(e) { update('welcome_email_onboarding_link', e.target.value); }} placeholder="https://calendly.com/yourname/onboarding" style={inputStyle} />
            <div style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Shown as "Book Onboarding Call →" button in the email</div>
          </div>

          {/* Test Email */}
          <div style={card}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Send Test Email</div>
            <div style={{ color: colors.muted, fontSize: 12, marginBottom: 16 }}>Send a preview to yourself to see what new tenants will receive. Uses current saved settings.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={testEmail} onChange={function(e) { setTestEmail(e.target.value); }} placeholder="your@email.com" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={sendTest} disabled={!testEmail.trim() || testSending} style={{ background: testEmail.trim() ? `linear-gradient(135deg, ${colors.primary}, ${colors.accent})` : 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8, padding: '10px 20px', color: testEmail.trim() ? '#000' : 'rgba(255,255,255,0.2)', fontWeight: 700, cursor: testEmail.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}>{testSending ? 'Sending...' : '📧 Send Test'}</button>
            </div>
            {testMsg && <div style={{ marginTop: 8, fontSize: 12, color: testMsg.startsWith('✓') ? '#00E676' : '#FF3B30' }}>{testMsg}</div>}
          </div>
        </>
      )}

      {/* Save */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={save} disabled={saving} style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`, border: 'none', borderRadius: 10, padding: '12px 28px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>{saving ? 'Saving...' : '💾 Save Welcome Email Settings'}</button>
        {saved && <span style={{ color: '#00E676', fontSize: 13, fontWeight: 600 }}>✓ Saved</span>}
        {error && <span style={{ color: '#FF3B30', fontSize: 13 }}>{error}</span>}
      </div>
    </div>
  );
}
