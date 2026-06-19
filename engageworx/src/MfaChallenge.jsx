// src/MfaChallenge.jsx — Second-factor gate (TOTP code or passkey assertion).
// Reused in two places: (1) the post-password login step-up (full-screen), and (2) the
// aal2 step-up before sensitive Settings surfaces (inline). Supports whichever factor the
// user enrolled: a TOTP code, a WebAuthn passkey, or both (so passkey-only users are never
// locked out). On success the shared client's session is upgraded to aal2 and onVerified()
// is called. Single shared client.

import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function MfaChallenge({ C, onVerified, onCancel, factorId: factorIdProp, title, subtitle, inline }) {
  var colors = C || { bg: '#080d1a', surface: '#0d1425', border: '#182440', primary: '#00C9FF', text: '#E8F4FD', muted: '#6B8BAE' };
  var [totpFactorId, setTotpFactorId] = useState(factorIdProp || null);
  var [webauthnFactorId, setWebauthnFactorId] = useState(null);
  var [code, setCode] = useState('');
  var [busy, setBusy] = useState(false);
  var [error, setError] = useState(null);
  var [resolving, setResolving] = useState(true);

  var passkeySupported = typeof navigator !== 'undefined' && !!(navigator.credentials && navigator.credentials.get);

  // Discover the user's verified factors so we can offer the right control(s).
  useEffect(function () {
    var cancelled = false;
    (async function () {
      try {
        var res = await supabase.auth.mfa.listFactors();
        var totp = res.data && res.data.totp ? res.data.totp.find(function (f) { return f.status === 'verified'; }) : null;
        var wa = res.data && res.data.webauthn ? res.data.webauthn.find(function (f) { return f.status === 'verified'; }) : null;
        if (!cancelled) {
          setTotpFactorId(factorIdProp || (totp ? totp.id : null));
          setWebauthnFactorId(wa ? wa.id : null);
          setResolving(false);
        }
      } catch (e) { if (!cancelled) { setError(e.message); setResolving(false); } }
    })();
    return function () { cancelled = true; };
  }, [factorIdProp]);

  async function submitTotp(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!totpFactorId) { setError('No authenticator code is set up on this account.'); return; }
    setBusy(true); setError(null);
    try {
      var ch = await supabase.auth.mfa.challenge({ factorId: totpFactorId });
      if (ch.error) throw ch.error;
      var v = await supabase.auth.mfa.verify({ factorId: totpFactorId, challengeId: ch.data.id, code: code.trim() });
      if (v.error) throw v.error;
      if (onVerified) await onVerified();
    } catch (err) {
      setError(err.message || 'Verification failed');
      setBusy(false);
    }
  }

  async function verifyPasskey() {
    if (!webauthnFactorId) { setError('No passkey is set up on this account.'); return; }
    setBusy(true); setError(null);
    try {
      var ch = await supabase.auth.mfa.challenge({ factorId: webauthnFactorId });
      if (ch.error) throw ch.error;
      var publicKey = ch.data && ch.data.webauthn && ch.data.webauthn.credential_options ? ch.data.webauthn.credential_options.publicKey : null;
      if (!publicKey) throw new Error('Could not start the passkey prompt.');
      var assertion = await navigator.credentials.get({ publicKey: publicKey });
      var v = await supabase.auth.mfa.verify({ factorId: webauthnFactorId, challengeId: ch.data.id, webauthn: { type: 'request', credential_response: assertion } });
      if (v.error) throw v.error;
      if (onVerified) await onVerified();
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'Passkey prompt was cancelled.' : (err.message || 'Passkey verification failed'));
      setBusy(false);
    }
  }

  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 16px', color: colors.text, fontSize: 22, letterSpacing: 8, textAlign: 'center', fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none' };
  var primaryBtn = { width: '100%', background: colors.primary, color: '#000', border: 'none', borderRadius: 10, padding: '12px 20px', fontWeight: 700, fontSize: 14, fontFamily: "'DM Sans', sans-serif", cursor: (busy || code.length !== 6) ? 'not-allowed' : 'pointer', opacity: (busy || code.length !== 6) ? 0.6 : 1 };
  var passkeyBtn = { width: '100%', background: 'transparent', color: colors.text, border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, padding: '12px 20px', fontWeight: 600, fontSize: 14, fontFamily: "'DM Sans', sans-serif", cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 };

  var hasTotp = !!totpFactorId;
  var hasPasskey = !!webauthnFactorId && passkeySupported;

  var cardInner = (
    <div>
      <h2 style={{ color: colors.text, margin: '0 0 8px', textAlign: 'center', fontSize: 20 }}>{title || 'Two-factor verification'}</h2>
      <p style={{ color: colors.muted, textAlign: 'center', marginBottom: 24, fontSize: 13 }}>{subtitle || 'Verify your second factor to continue.'}</p>
      {error && <div style={{ background: '#FF3B3018', border: '1px solid #FF3B3044', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#FF3B30', fontSize: 13 }}>{error}</div>}
      {resolving ? (
        <div style={{ color: colors.muted, textAlign: 'center', fontSize: 13, padding: '12px 0' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {hasTotp && (
            <form onSubmit={submitTotp} style={{ display: 'grid', gap: 14 }}>
              <input value={code} onChange={function (e) { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); }} inputMode="numeric" autoFocus placeholder="000000" style={inputStyle} />
              <button type="submit" disabled={busy || code.length !== 6} style={primaryBtn}>{busy ? 'Verifying…' : 'Verify code'}</button>
            </form>
          )}
          {hasPasskey && (
            <button type="button" onClick={verifyPasskey} disabled={busy} style={passkeyBtn}>🔑 Use a passkey</button>
          )}
          {!hasTotp && !hasPasskey && (
            <div style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>No second factor is available on this account.</div>
          )}
          {onCancel && <button type="button" onClick={onCancel} style={{ background: 'transparent', border: 'none', color: colors.muted, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>}
        </div>
      )}
    </div>
  );

  if (inline) {
    return <div style={{ background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 14, padding: 28, maxWidth: 420 }}>{cardInner}</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: 420 }}>
        <div style={{ background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 20, padding: 40 }}>{cardInner}</div>
      </div>
    </div>
  );
}
