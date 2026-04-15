import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function EmailTrackingInstructions({ tenantId, C, compact }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', muted: '#6B8BAE' };
  var [slug, setSlug] = useState(null);
  var [tab, setTab] = useState('gmail');
  var [copied, setCopied] = useState(false);

  useEffect(function() {
    if (!tenantId) return;
    (async function() {
      try {
        var r = await supabase.from('tenants').select('email_tracking_slug').eq('id', tenantId).maybeSingle();
        var s = r.data && r.data.email_tracking_slug ? r.data.email_tracking_slug : null;
        if (!s) {
          // Generate a short deterministic slug if missing
          s = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 10);
          try { await supabase.from('tenants').update({ email_tracking_slug: s }).eq('id', tenantId); } catch (e) {}
        }
        setSlug(s);
      } catch (e) {}
    })();
  }, [tenantId]);

  var bcc = slug ? 'track+' + slug + '@engwx.com' : 'track+…@engwx.com';

  function copy() {
    try {
      navigator.clipboard.writeText(bcc);
      setCopied(true);
      setTimeout(function() { setCopied(false); }, 2000);
    } catch (e) {}
  }

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 };
  var tabs = [
    { id: 'gmail',   label: '📧 Gmail' },
    { id: 'outlook', label: '📨 Outlook' },
    { id: 'apple',   label: '🍎 Apple Mail' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <code style={{ flex: 1, minWidth: 240, padding: '10px 14px', background: 'rgba(0,0,0,0.3)', border: '1px solid ' + colors.primary + '44', borderRadius: 8, color: colors.primary, fontSize: 14, fontFamily: 'monospace' }}>{bcc}</code>
        <button onClick={copy} style={{ background: 'linear-gradient(135deg,' + colors.primary + ',' + (colors.accent || '#E040FB') + ')', border: 'none', borderRadius: 8, padding: '10px 16px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>{copied ? '✓ Copied' : 'Copy address'}</button>
      </div>
      {!compact && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {tabs.map(function(t) {
              var active = tab === t.id;
              return <button key={t.id} onClick={function() { setTab(t.id); }} style={{ background: active ? colors.primary + '22' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (active ? colors.primary + '55' : 'rgba(255,255,255,0.08)'), borderRadius: 6, padding: '6px 12px', color: active ? colors.primary : colors.muted, fontWeight: active ? 700 : 500, cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>{t.label}</button>;
            })}
          </div>
          <div style={card}>
            {tab === 'gmail' && (
              <ol style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 13, lineHeight: 1.7 }}>
                <li>Open Gmail → ⚙ Settings → <strong>Filters and Blocked Addresses</strong> → <em>Create a new filter</em>.</li>
                <li>In <strong>From</strong>, enter your own email address → <em>Create filter</em>.</li>
                <li>Check <strong>Forward it to</strong> and click <em>add forwarding address</em> → paste <code style={{ color: colors.primary }}>{bcc}</code> → confirm the verification email that SendGrid sends back.</li>
                <li>Alternative: install the <em>BccThis</em> / <em>Auto BCC for Gmail</em> Chrome extension and set a default BCC to the address above.</li>
                <li>Send a test email to yourself to confirm the BCC is arriving — you should see the message appear in Live Inbox within a minute.</li>
              </ol>
            )}
            {tab === 'outlook' && (
              <ol style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 13, lineHeight: 1.7 }}>
                <li>Outlook desktop → <strong>File</strong> → <em>Manage Rules &amp; Alerts</em> → <em>New Rule</em>.</li>
                <li>Select <em>"Apply rule on messages I send"</em> → Next.</li>
                <li>Leave conditions blank (applies to all sent mail) → Yes to confirm.</li>
                <li>Check <strong>CC the message to people or public group</strong> → enter <code style={{ color: colors.primary }}>{bcc}</code>.</li>
                <li>Finish. Outlook web users: Settings → <em>Rules</em> → <em>Add new rule</em> → Condition: <em>Applies to all messages</em> → Action: <em>CC to…</em>.</li>
              </ol>
            )}
            {tab === 'apple' && (
              <ol style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 13, lineHeight: 1.7 }}>
                <li>Apple Mail → <strong>Mail</strong> → <em>Settings</em> → <em>Composing</em>.</li>
                <li>Check <strong>Automatically BCC:</strong> and paste <code style={{ color: colors.primary }}>{bcc}</code>.</li>
                <li>Every new message and reply you send from Apple Mail will quietly BCC the tracker.</li>
                <li>iPhone / iPad: unfortunately Apple Mail on iOS doesn't support a global auto-BCC — add it manually when composing, or send from desktop.</li>
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}
