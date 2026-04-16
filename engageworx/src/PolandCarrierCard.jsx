import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// Tenant-facing labels hide the underlying transport. SP Admin sees the real names.
var CARRIER_TYPES_TENANT = [
  { id: 'http_webhook', label: 'API Connection' },
  { id: 'twilio_sip',   label: 'Cloud Gateway' },
  { id: 'direct_smpp',  label: 'Direct Connection' },
  { id: 'direct_sip',   label: 'SIP Connection' },
];
var CARRIER_TYPES_SP = [
  { id: 'http_webhook', label: 'API Connection (HTTP Webhook / REST)' },
  { id: 'twilio_sip',   label: 'Cloud Gateway (Twilio SIP Trunk)' },
  { id: 'direct_smpp',  label: 'Direct Connection (SMPP)' },
  { id: 'direct_sip',   label: 'SIP Connection (Direct SIP)' },
];

export default function PolandCarrierCard({ tenantId, C, isSPAdmin }) {
  var colors = C || { primary: '#dc2626', muted: '#6B8BAE' };
  var [cfg, setCfg] = useState(null);
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);
  var [testResult, setTestResult] = useState(null);
  var [form, setForm] = useState({
    carrier_name: '', phone_number: '', country_code: '+48', carrier_type: 'http_webhook',
    outbound_endpoint: '', api_key: '', api_secret: '', username: '', password: '', enabled: false,
  });

  useEffect(function() {
    if (!tenantId) return;
    (async function() {
      try {
        var r = await supabase.from('poland_carrier_configs').select('*').eq('tenant_id', tenantId).limit(1).maybeSingle();
        if (r.data) {
          setCfg(r.data);
          setForm({
            carrier_name: r.data.carrier_name || '',
            phone_number: r.data.phone_number || '',
            country_code: r.data.country_code || '+48',
            carrier_type: r.data.carrier_type || 'http_webhook',
            outbound_endpoint: r.data.outbound_endpoint || '',
            api_key: r.data.api_key || '',
            api_secret: r.data.api_secret || '',
            username: r.data.username || '',
            password: r.data.password || '',
            enabled: !!r.data.enabled,
          });
        }
      } catch (e) {}
      setLoading(false);
    })();
  }, [tenantId]);

  var portalBase = (typeof window !== 'undefined' ? window.location.origin : '') + '/api/poland-carrier?action=sms-inbound';

  async function save() {
    if (!form.phone_number.trim()) { alert('Phone number is required.'); return; }
    setSaving(true);
    try {
      var payload = Object.assign({}, form, {
        tenant_id: tenantId,
        webhook_url: portalBase,
      });
      if (cfg && cfg.id) {
        await supabase.from('poland_carrier_configs').update(payload).eq('id', cfg.id).eq('tenant_id', tenantId);
      } else {
        var ins = await supabase.from('poland_carrier_configs').insert(payload).select('*').single();
        setCfg(ins.data);
      }
    } catch (e) { alert('Save failed: ' + e.message); }
    setSaving(false);
  }

  async function testConnection() {
    setTestResult({ tone: 'pending', msg: 'Testing…' });
    try {
      var r = await fetch('/api/poland-carrier?action=test-connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      var d = await r.json();
      setTestResult({
        tone: d.ok ? 'ok' : 'err',
        msg: d.msg || (d.ok ? 'Connection looks good' : 'Test failed'),
        http_status: d.http_status,
        response_body: d.response_body,
        request_summary: d.request_summary,
      });
    } catch (e) { setTestResult({ tone: 'err', msg: e.message }); }
  }

  function copyWebhook() { try { navigator.clipboard.writeText(portalBase); alert('Webhook URL copied — paste this in your carrier portal.'); } catch (e) {} }

  var card = { background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: 16, marginBottom: 14 };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };
  var label = { color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4 };
  var btnPrimary = { background: 'linear-gradient(135deg,#dc2626,#fff)', border: 'none', borderRadius: 8, padding: '10px 18px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 14px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' };

  if (loading) return <div style={card}>Loading Poland carrier config…</div>;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22 }}>🇵🇱</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Poland — direct carrier integration</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>Inbound + outbound SMS and Polish-language voice (IVR with Polly.Ewa-Neural).</div>
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: form.enabled ? '#10b981' : colors.muted, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.enabled} onChange={function(e) { setForm(Object.assign({}, form, { enabled: e.target.checked })); }} />
          {form.enabled ? '● Enabled' : '○ Disabled'}
        </label>
      </div>

      {(function() {
        var carrierTypes = isSPAdmin ? CARRIER_TYPES_SP : CARRIER_TYPES_TENANT;
        var connectionLabel = isSPAdmin ? 'Connection ID (API Key)' : 'Connection ID';
        var secretLabel = isSPAdmin ? 'Connection Secret (API Secret)' : 'Connection Secret';
        var endpointLabel = isSPAdmin ? 'Gateway Endpoint (Outbound API URL)' : 'Gateway Endpoint';
        var typeLabel = isSPAdmin ? 'Connection type (carrier_type)' : 'Connection type';
        // Twilio SIP path uses Twilio's standard Messages API endpoint — no custom URL needed.
        var showEndpoint = form.carrier_type !== 'twilio_sip';
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={label}>Carrier name</label><input value={form.carrier_name} onChange={function(e) { setForm(Object.assign({}, form, { carrier_name: e.target.value })); }} placeholder="Orange Polska, Plus, Play, T-Mobile…" style={inputStyle} /></div>
            <div><label style={label}>Phone number (E.164)</label><input value={form.phone_number} onChange={function(e) { setForm(Object.assign({}, form, { phone_number: e.target.value })); }} placeholder="+48732080851" style={inputStyle} /></div>
            <div><label style={label}>Country code</label><input value={form.country_code} onChange={function(e) { setForm(Object.assign({}, form, { country_code: e.target.value })); }} style={inputStyle} /></div>
            <div><label style={label}>{typeLabel}</label><select value={form.carrier_type} onChange={function(e) { setForm(Object.assign({}, form, { carrier_type: e.target.value })); }} style={inputStyle}>{carrierTypes.map(function(c) { return <option key={c.id} value={c.id}>{c.label}</option>; })}</select></div>
            {showEndpoint && (
              <div style={{ gridColumn: 'span 2' }}><label style={label}>{endpointLabel}</label><input value={form.outbound_endpoint} onChange={function(e) { setForm(Object.assign({}, form, { outbound_endpoint: e.target.value })); }} placeholder="https://carrier-api.example.pl/sms" style={inputStyle} /></div>
            )}
            <div><label style={label}>{connectionLabel}</label><input type="password" value={form.api_key} onChange={function(e) { setForm(Object.assign({}, form, { api_key: e.target.value })); }} style={inputStyle} /></div>
            <div><label style={label}>{secretLabel}</label><input type="password" value={form.api_secret} onChange={function(e) { setForm(Object.assign({}, form, { api_secret: e.target.value })); }} style={inputStyle} /></div>
            <div><label style={label}>Username</label><input value={form.username} onChange={function(e) { setForm(Object.assign({}, form, { username: e.target.value })); }} style={inputStyle} /></div>
            <div><label style={label}>Password</label><input type="password" value={form.password} onChange={function(e) { setForm(Object.assign({}, form, { password: e.target.value })); }} style={inputStyle} /></div>
          </div>
        );
      })()}

      <div style={{ marginTop: 14, padding: 12, background: 'rgba(0,0,0,0.25)', borderRadius: 8 }}>
        <div style={{ color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>📥 Inbound webhook URL — paste this in your carrier portal</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <code style={{ flex: 1, fontSize: 12, color: '#dc2626', wordBreak: 'break-all', fontFamily: 'monospace' }}>{portalBase}</code>
          <button onClick={copyWebhook} style={btnSec}>Copy</button>
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save configuration'}</button>
        <button onClick={testConnection} style={btnSec}>Test connection</button>
        {testResult && <span style={{ color: testResult.tone === 'ok' ? '#10b981' : testResult.tone === 'err' ? '#dc2626' : colors.muted, fontSize: 12 }}>{testResult.msg}</span>}
      </div>
      {testResult && testResult.response_body && (
        <div style={{ marginTop: 10, padding: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
          <div style={{ color: colors.muted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Carrier response · HTTP {testResult.http_status}</div>
          <pre style={{ color: '#cbd5e1', fontSize: 11, fontFamily: 'monospace', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto' }}>{typeof testResult.response_body === 'string' ? testResult.response_body : JSON.stringify(testResult.response_body, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
