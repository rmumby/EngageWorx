import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import TCRRegistration from './TCRRegistration';

var STATUS_BADGE = {
  approved:   { color: '#10b981', label: '✅ Approved' },
  pending:    { color: '#d97706', label: '⏳ Pending' },
  submitted:  { color: '#0ea5e9', label: '📤 Submitted' },
  rejected:   { color: '#dc2626', label: '🔴 Rejected' },
  not_started:{ color: '#94a3b8', label: '○ Not Started' },
};

export default function CSPSMSRegistration({ cspTenantId, C }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', muted: '#6B8BAE' };
  var [tab, setTab] = useState('our');
  var [csp, setCsp] = useState(null);
  var [tenants, setTenants] = useState([]);
  var [tenantStatuses, setTenantStatuses] = useState({});
  var [loading, setLoading] = useState(true);
  var [reminderBusy, setReminderBusy] = useState(false);
  var [guide, setGuide] = useState({ industry: '', generated: '', loading: false });

  useEffect(function() {
    if (!cspTenantId) return;
    (async function() {
      setLoading(true);
      try {
        var c = await supabase.from('tenants').select('id, name, msp_enabled, letter_of_agency').eq('id', cspTenantId).maybeSingle();
        if (c.data) setCsp(c.data);
        var ts = await supabase.from('tenants').select('id, name, plan, tcr_status, sms_enabled, status').or('parent_tenant_id.eq.' + cspTenantId + ',parent_entity_id.eq.' + cspTenantId).neq('id', cspTenantId);
        setTenants(ts.data || []);
        // Pull each child tenant's most recent submission status
        var ids = (ts.data || []).map(function(t) { return t.id; });
        if (ids.length > 0) {
          var subs = await supabase.from('tcr_submissions').select('tenant_id, status, tcr_brand_id, tcr_campaign_id, created_at').in('tenant_id', ids).order('created_at', { ascending: false });
          var map = {};
          (subs.data || []).forEach(function(s) {
            if (!map[s.tenant_id]) map[s.tenant_id] = s;
          });
          setTenantStatuses(map);
        }
      } catch (e) { console.warn('[CSP-SMS] load:', e.message); }
      setLoading(false);
    })();
  }, [cspTenantId]);

  function statusOf(t) {
    var sub = tenantStatuses[t.id];
    if (!sub) return 'not_started';
    if (['approved', 'completed'].includes(sub.status)) return 'approved';
    if (['rejected', 'failed'].includes(sub.status)) return 'rejected';
    if (['pending', 'in_progress'].includes(sub.status)) return 'pending';
    return 'submitted';
  }

  async function sendReminders() {
    var notStarted = tenants.filter(function(t) { return statusOf(t) === 'not_started'; });
    if (notStarted.length === 0) { alert('No tenants need a reminder.'); return; }
    if (!window.confirm('Send a registration reminder email to ' + notStarted.length + ' tenant' + (notStarted.length === 1 ? '' : 's') + '?')) return;
    setReminderBusy(true);
    try {
      var res = await fetch('/api/csp-tcr-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csp_tenant_id: cspTenantId, tenant_ids: notStarted.map(function(t) { return t.id; }) }),
      });
      if (!res.ok) throw new Error('Reminder API returned ' + res.status);
      alert('Reminders queued for ' + notStarted.length + ' tenant' + (notStarted.length === 1 ? '' : 's') + '.');
    } catch (e) { alert('Reminder failed: ' + e.message); }
    setReminderBusy(false);
  }

  async function generateGuide() {
    setGuide(function(g) { return Object.assign({}, g, { loading: true }); });
    try {
      var industry = guide.industry.trim() || 'general business';
      var res = await fetch('/api/tcr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'guide_faq', industry: industry, tenant_id: cspTenantId }),
      });
      var data = await res.json();
      setGuide({ industry: industry, generated: data.text || '(Claude returned no content — try again with more detail.)', loading: false });
    } catch (e) {
      setGuide(function(g) { return Object.assign({}, g, { loading: false, generated: 'Error: ' + e.message }); });
    }
  }

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 14px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' };
  var btnPrimary = { background: 'linear-gradient(135deg,' + colors.primary + ',' + colors.accent + ')', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' };
  var mspEnabled = !!(csp && csp.msp_enabled && csp.letter_of_agency);

  return (
    <div style={{ padding: '32px 40px' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>📋 SMS Registration</h1>
        <p style={{ color: colors.muted, marginTop: 4, fontSize: 14 }}>Manage your A2P 10DLC registration plus your tenants' SMS readiness.</p>
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
        {[
          { id: 'our',     label: 'Our Registration' },
          { id: 'tenants', label: 'Our Tenants (' + tenants.length + ')' },
          { id: 'guide',   label: 'Registration Guide' },
        ].map(function(t) {
          var active = tab === t.id;
          return <button key={t.id} onClick={function() { setTab(t.id); }} style={{ background: 'transparent', border: 'none', padding: '12px 22px', color: active ? colors.primary : colors.muted, cursor: 'pointer', fontWeight: active ? 700 : 500, fontSize: 13, fontFamily: 'inherit', borderBottom: active ? '2px solid ' + colors.primary : '2px solid transparent', marginBottom: -1 }}>{t.label}</button>;
        })}
      </div>

      {tab === 'our' && <TCRRegistration tenantId={cspTenantId} C={colors} />}

      {tab === 'tenants' && (
        <div>
          {!mspEnabled && (
            <div style={Object.assign({}, card, { marginBottom: 18, borderLeft: '4px solid ' + colors.muted, color: colors.muted, fontSize: 13 })}>
              ℹ️ MSP mode is not enabled for your account. Each tenant manages their own SMS registration. To register on a tenant's behalf, request MSP enablement and submit a Letter of Agency to your account manager.
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ color: colors.muted, fontSize: 12 }}>{tenants.filter(function(t) { return statusOf(t) === 'not_started'; }).length} tenant(s) have not started</div>
            <button onClick={sendReminders} disabled={reminderBusy} style={btnSec}>{reminderBusy ? 'Sending…' : '📣 Send registration reminder'}</button>
          </div>

          {loading ? (
            <div style={Object.assign({}, card, { textAlign: 'center', padding: 40, color: colors.muted })}>Loading tenants…</div>
          ) : tenants.length === 0 ? (
            <div style={Object.assign({}, card, { textAlign: 'center', padding: 40, color: colors.muted })}>No tenants under this account yet.</div>
          ) : (
            <div style={Object.assign({}, card, { padding: 0, overflow: 'hidden' })}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {['Tenant', 'Plan', 'TCR status', 'SMS', 'Action'].map(function(h) { return <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: colors.muted, fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.6, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>; })}
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(function(t) {
                    var s = statusOf(t);
                    var badge = STATUS_BADGE[s];
                    var sub = tenantStatuses[t.id];
                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 14px', color: '#fff', fontWeight: 600 }}>{t.name}</td>
                        <td style={{ padding: '10px 14px', color: colors.muted }}>{t.plan || '—'}</td>
                        <td style={{ padding: '10px 14px' }}><span style={{ background: badge.color + '18', color: badge.color, border: '1px solid ' + badge.color + '55', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{badge.label}</span>{sub && sub.tcr_brand_id && <div style={{ color: colors.muted, fontSize: 10, marginTop: 4, fontFamily: 'monospace' }}>{sub.tcr_brand_id}</div>}</td>
                        <td style={{ padding: '10px 14px', color: t.sms_enabled ? '#10b981' : colors.muted, fontSize: 11, fontWeight: 700 }}>{t.sms_enabled ? '● Enabled' : '○ Disabled'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {mspEnabled ? (
                            <button onClick={function() { window.location.href = '/?tenant=' + t.id + '&page=sms-registration&csp_assisted=1'; }} style={btnSec}>{s === 'not_started' ? 'Register on their behalf →' : 'Open registration →'}</button>
                          ) : (
                            <span style={{ color: colors.muted, fontSize: 11 }}>Tenant manages their own</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'guide' && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={card}>
            <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: 15 }}>What is TCR?</h3>
            <p style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.7, margin: 0 }}>The Campaign Registry (TCR) is the U.S. carrier-mandated registration system for application-to-person (A2P) SMS. Without TCR registration, your messages get blocked or heavily rate-limited. Registration takes ~10 days end-to-end and requires a verified business identity plus a documented use case for each campaign.</p>
          </div>
          <div style={card}>
            <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: 15 }}>What makes a successful registration</h3>
            <ul style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
              <li><strong>Use case:</strong> specific (e.g. "appointment reminders for dental patients") not generic ("notifications").</li>
              <li><strong>Sample messages:</strong> 2–5 examples that clearly show value and end with STOP/HELP guidance.</li>
              <li><strong>Opt-in flow:</strong> exact wording of how customers consent to receive messages, plus where (web form / paper / verbal).</li>
              <li><strong>Privacy policy + Terms:</strong> publicly accessible URLs that mention SMS messaging.</li>
            </ul>
          </div>
          <div style={card}>
            <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: 15 }}>Common rejection reasons</h3>
            <ul style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.8, paddingLeft: 18, margin: 0 }}>
              <li>Vague use case ("we send messages to customers")</li>
              <li>Sample messages missing STOP / HELP</li>
              <li>Opt-in language that doesn't match the actual signup screen</li>
              <li>Privacy policy URL doesn't mention SMS</li>
              <li>Mismatch between EIN business name and brand name on the registration</li>
            </ul>
          </div>
          <div style={card}>
            <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: 15 }}>FAQ — generate for your industry</h3>
            <p style={{ color: colors.muted, fontSize: 12, marginBottom: 10 }}>Aria will write industry-specific guidance using approved template patterns from past tenants.</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input value={guide.industry} onChange={function(e) { setGuide(Object.assign({}, guide, { industry: e.target.value })); }} placeholder="e.g. dental practice, real estate brokerage, gym" style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
              <button onClick={generateGuide} disabled={guide.loading} style={btnPrimary}>{guide.loading ? 'Thinking…' : 'Generate FAQ'}</button>
            </div>
            {guide.generated && <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 8, padding: 14, color: '#cbd5e1', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{guide.generated}</div>}
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button onClick={function() { setTab('our'); }} style={Object.assign({}, btnPrimary, { padding: '12px 28px', fontSize: 13 })}>Start My Registration →</button>
          </div>
        </div>
      )}
    </div>
  );
}
