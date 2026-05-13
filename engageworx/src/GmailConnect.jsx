// src/GmailConnect.jsx — Gmail Drafts integration connect/disconnect UI
// Rendered in Settings. Per-user OAuth (not per-tenant).

import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function GmailConnect({ C }) {
  var [status, setStatus] = useState('loading'); // loading | disconnected | connected
  var [email, setEmail] = useState('');
  var [connecting, setConnecting] = useState(false);
  var [disconnecting, setDisconnecting] = useState(false);
  var [error, setError] = useState(null);

  useEffect(function() {
    (async function() {
      try {
        var { data: userData } = await supabase.auth.getUser();
        if (!userData || !userData.user) { setStatus('disconnected'); return; }
        var { data } = await supabase.from('user_gmail_tokens')
          .select('email_address, refresh_token')
          .eq('user_id', userData.user.id)
          .maybeSingle();
        if (data && data.refresh_token && data.refresh_token !== '__pending_oauth__') {
          setEmail(data.email_address || '');
          setStatus('connected');
        } else {
          setStatus('disconnected');
        }
      } catch (e) { setStatus('disconnected'); }
    })();

    // Check for OAuth return params
    var params = new URLSearchParams(window.location.search);
    var gmailConnect = params.get('gmail_connect');
    if (gmailConnect === 'success') {
      setStatus('connected');
      setEmail(params.get('email') || '');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (gmailConnect === 'error') {
      setError('Gmail connection failed: ' + (params.get('reason') || 'unknown'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      var res = await fetch('/api/gmail-oauth-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      });
      var data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to start Gmail connection');
        setConnecting(false);
      }
    } catch (e) {
      setError('Connection error: ' + e.message);
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      var res = await fetch('/api/gmail-disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      });
      var data = await res.json();
      if (data.ok) {
        setStatus('disconnected');
        setEmail('');
      } else {
        setError(data.error || 'Disconnect failed');
      }
    } catch (e) { setError('Disconnect error: ' + e.message); }
    setDisconnecting(false);
  }

  var colors = C || { primary: '#00BFFF', muted: '#6B7280', text: '#E8F4FD' };

  if (status === 'loading') {
    return <div style={{ color: colors.muted, fontSize: 13, padding: '12px 0' }}>Checking Gmail connection...</div>;
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>📧</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Gmail Drafts Integration</div>
          <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
            {status === 'connected'
              ? 'Connected as ' + email
              : 'Connect your Gmail to send Action Board drafts to your inbox'}
          </div>
        </div>
        {status === 'connected' ? (
          <button onClick={handleDisconnect} disabled={disconnecting}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,82,82,0.3)', background: 'rgba(255,82,82,0.06)', color: '#FF5252', fontSize: 12, fontWeight: 600, cursor: disconnecting ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <button onClick={handleConnect} disabled={connecting}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: connecting ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: connecting ? 0.6 : 1 }}>
            {connecting ? 'Connecting...' : 'Connect Gmail'}
          </button>
        )}
      </div>
      {error && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
