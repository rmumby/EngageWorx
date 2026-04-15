import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

var META_SDK = 'https://connect.facebook.net/en_US/sdk.js';
var META_SCOPES = 'whatsapp_business_management,whatsapp_business_messaging,business_management';

function loadFbSdk(appId) {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise(function(resolve, reject) {
    window.fbAsyncInit = function() {
      window.FB.init({ appId: appId, autoLogAppEvents: true, xfbml: true, version: 'v18.0' });
      resolve(window.FB);
    };
    var s = document.createElement('script');
    s.src = META_SDK;
    s.async = true;
    s.defer = true;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function WhatsAppEmbeddedSignup({ tenantId, C, appId, onConnected }) {
  var colors = C || { primary: '#25D366', muted: '#6B8BAE' };
  var [status, setStatus] = useState({ state: 'idle' }); // idle | loading | connected | error
  var [cfg, setCfg] = useState(null);
  var [manualMode, setManualMode] = useState(false);

  useEffect(function() {
    if (!tenantId) return;
    (async function() {
      try {
        var r = await supabase.from('channel_configs').select('config_encrypted, enabled, status').eq('tenant_id', tenantId).eq('channel', 'whatsapp').maybeSingle();
        if (r.data && r.data.config_encrypted) {
          setCfg(r.data.config_encrypted);
          if (r.data.config_encrypted.waba_id && r.data.config_encrypted.access_token) {
            setStatus({ state: 'connected', phone: r.data.config_encrypted.phone_number_display });
          }
        }
      } catch (e) {}
    })();
  }, [tenantId]);

  async function startSignup() {
    if (!appId) { alert('FACEBOOK_APP_ID not configured — add it to Vercel env vars first.'); return; }
    setStatus({ state: 'loading' });
    try {
      var FB = await loadFbSdk(appId);
      FB.login(function(response) {
        if (!response.authResponse || !response.authResponse.code) {
          setStatus({ state: 'error', msg: 'Meta signup cancelled or denied.' });
          return;
        }
        (async function() {
          try {
            var r = await fetch('/api/whatsapp-signup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: response.authResponse.code, tenant_id: tenantId }),
            });
            var data = await r.json();
            if (!r.ok || !data.success) throw new Error(data.error || 'Signup failed');
            setStatus({ state: 'connected', phone: data.phone_number });
            if (onConnected) onConnected(data);
          } catch (e) { setStatus({ state: 'error', msg: e.message }); }
        })();
      }, { config_id: undefined, response_type: 'code', override_default_response_type: true, scope: META_SCOPES });
    } catch (e) { setStatus({ state: 'error', msg: e.message }); }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect WhatsApp? Your number stays on Meta — this just removes it from the portal.')) return;
    try {
      await supabase.from('channel_configs').update({ enabled: false, status: 'disconnected', config_encrypted: {} }).eq('tenant_id', tenantId).eq('channel', 'whatsapp');
      setStatus({ state: 'idle' });
      setCfg(null);
    } catch (e) { alert('Error: ' + e.message); }
  }

  var card = { background: 'rgba(37,211,102,0.04)', border: '1px solid rgba(37,211,102,0.3)', borderRadius: 10, padding: 16, marginBottom: 14 };
  var btnPrimary = { background: '#25D366', border: 'none', borderRadius: 8, padding: '10px 20px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 14px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' };

  if (status.state === 'connected') {
    return (
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#25D366', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>● Connected</div>
            <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>{status.phone || 'WhatsApp number linked'}</div>
            {cfg && cfg.verified_name && <div style={{ color: colors.muted, fontSize: 12 }}>{cfg.verified_name}</div>}
          </div>
          <button onClick={disconnect} style={Object.assign({}, btnSec, { color: '#FF6B6B', borderColor: 'rgba(255,107,107,0.35)' })}>Disconnect</button>
        </div>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 22 }}>📱</span>
        <div>
          <div style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>Connect WhatsApp Business</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>Use Meta's Embedded Signup — we handle the API keys automatically.</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={startSignup} disabled={status.state === 'loading' || !appId} style={Object.assign({}, btnPrimary, { opacity: status.state === 'loading' ? 0.5 : 1 })}>
          {status.state === 'loading' ? 'Connecting…' : '💬 Connect WhatsApp'}
        </button>
        <button onClick={function() { setManualMode(!manualMode); }} style={btnSec}>{manualMode ? 'Hide manual setup' : 'Enter credentials manually →'}</button>
        {status.state === 'error' && <span style={{ color: '#FF6B6B', fontSize: 12 }}>{status.msg}</span>}
      </div>
      {!appId && <div style={{ marginTop: 10, color: '#d97706', fontSize: 11 }}>⚠️ FACEBOOK_APP_ID not set on Vercel — Embedded Signup is disabled. Use manual setup for now.</div>}
      {manualMode && (
        <div style={{ marginTop: 14, padding: 12, background: 'rgba(0,0,0,0.25)', borderRadius: 8, color: colors.muted, fontSize: 12 }}>
          Manual fields appear in the channel card below (Phone Number ID, Business Account ID, Access Token). Fill those in if you already have Meta Graph API credentials.
        </div>
      )}
    </div>
  );
}
