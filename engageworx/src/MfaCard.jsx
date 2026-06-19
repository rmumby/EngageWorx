// src/MfaCard.jsx — Per-user two-factor authentication enrollment (Account security).
// Enrolls the SIGNED-IN user in MFA via Supabase Auth: authenticator app (TOTP) and,
// where the installed SDK supports it, a passkey (WebAuthn). Lists enrolled factors and
// allows removal. Opt-in: a user with no factor is never forced. Single shared client
// (supabaseClient) — never createClient here.
//
// Styling: brand-derived (C.primary + WCAG contrastText), no gradients/hardcoded hex,
// matching the no-hardcoded-color rule while fitting Settings' C-themed inline aesthetic.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { contrastText } from './components/ui/Button';

export default function MfaCard({ C }) {
  var [factors, setFactors] = useState({ totp: [], webauthn: [] });
  var [loading, setLoading] = useState(true);
  var [enrolling, setEnrolling] = useState(null); // { factorId, qr, secret } during TOTP setup
  var [code, setCode] = useState('');
  var [busy, setBusy] = useState(false);
  var [error, setError] = useState(null);
  var [notice, setNotice] = useState(null);

  // Does the installed SDK expose WebAuthn passkey enrollment? Capability-gate the
  // passkey button so older SDKs degrade to TOTP-only with no broken control.
  var passkeySupported = typeof navigator !== 'undefined' && !!(navigator.credentials && navigator.credentials.create);

  var loadFactors = useCallback(async function () {
    setLoading(true);
    try {
      var res = await supabase.auth.mfa.listFactors();
      if (res.error) throw res.error;
      var data = res.data || {};
      var allFactors = data.all || [];
      setFactors({
        totp: (data.totp || []).filter(function (f) { return f.status === 'verified'; }),
        webauthn: allFactors.filter(function (f) { return f.factor_type === 'webauthn' && f.status === 'verified'; }),
      });
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(function () { loadFactors(); }, [loadFactors]);

  async function startTotpEnroll() {
    setError(null); setNotice(null); setBusy(true);
    try {
      var res = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (res.error) throw res.error;
      var t = res.data && res.data.totp ? res.data.totp : {};
      setEnrolling({ factorId: res.data.id, qr: t.qr_code, secret: t.secret });
      setCode('');
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function confirmTotpEnroll() {
    setError(null); setBusy(true);
    try {
      var ch = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId });
      if (ch.error) throw ch.error;
      var v = await supabase.auth.mfa.verify({ factorId: enrolling.factorId, challengeId: ch.data.id, code: code.trim() });
      if (v.error) throw v.error;
      setEnrolling(null); setCode('');
      setNotice('Authenticator app enabled. You will be asked for a code at your next sign-in.');
      await loadFactors();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  async function cancelEnroll() {
    // Remove the half-finished (unverified) factor so it doesn't linger in listFactors.
    if (enrolling && enrolling.factorId) {
      try { await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId }); } catch (e) {}
    }
    setEnrolling(null); setCode(''); setError(null);
  }

  async function startPasskeyEnroll() {
    setError(null); setNotice(null); setBusy(true);
    var newFactorId = null;
    try {
      var enr = await supabase.auth.mfa.enroll({ factorType: 'webauthn', friendlyName: 'Passkey ' + new Date().toLocaleDateString() });
      if (enr.error) throw enr.error;
      newFactorId = enr.data.id;
      var ch = await supabase.auth.mfa.challenge({ factorId: newFactorId });
      if (ch.error) throw ch.error;
      // challenge() returns browser-ready PublicKeyCredentialCreationOptions; run the
      // WebAuthn ceremony, then hand the credential back to verify() (SDK serializes it).
      var publicKey = ch.data && ch.data.webauthn && ch.data.webauthn.credential_options ? ch.data.webauthn.credential_options.publicKey : null;
      if (!publicKey) throw new Error('This account is not configured for passkeys.');
      var credential = await navigator.credentials.create({ publicKey: publicKey });
      var v = await supabase.auth.mfa.verify({ factorId: newFactorId, challengeId: ch.data.id, webauthn: { type: 'create', credential_response: credential } });
      if (v.error) throw v.error;
      newFactorId = null; // verified — don't clean up
      setNotice('Passkey added. You can use it as your second step at sign-in.');
      await loadFactors();
    } catch (e) {
      // User cancelled the browser prompt or it failed — remove the dangling unverified factor.
      if (newFactorId) { try { await supabase.auth.mfa.unenroll({ factorId: newFactorId }); } catch (ce) {} }
      setError(e.name === 'NotAllowedError' ? 'Passkey setup was cancelled.' : e.message);
    }
    setBusy(false);
  }

  async function removeFactor(factorId) {
    if (!window.confirm('Remove this two-factor method? You will no longer be prompted for it at sign-in.')) return;
    setError(null); setBusy(true);
    try {
      var res = await supabase.auth.mfa.unenroll({ factorId: factorId });
      if (res.error) throw res.error;
      setNotice('Two-factor method removed.');
      await loadFactors();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  var primaryBtn = {
    background: C.primary, color: contrastText(C.primary || '#000'), border: 'none',
    borderRadius: 10, padding: '10px 18px', fontWeight: 700, fontSize: 13,
    fontFamily: "'DM Sans', sans-serif", cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
  };
  var ghostBtn = {
    background: 'transparent', color: C.muted, border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, padding: '10px 18px', fontWeight: 600, fontSize: 13,
    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
  };
  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 22 };
  var hasAnyFactor = (factors.totp.length + factors.webauthn.length) > 0;

  return (
    <div style={card}>
      <h3 style={{ color: C.text, margin: '0 0 4px', fontSize: 15 }}>Two-factor authentication</h3>
      <div style={{ color: C.muted, fontSize: 12, marginBottom: 16 }}>
        Add a second step at sign-in. {hasAnyFactor ? 'Enabled on your account.' : 'Not yet set up — optional, but recommended.'}
      </div>

      {error && <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', color: '#FF6B6B', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {notice && <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.3)', color: '#7ee2a8', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 12 }}>{notice}</div>}

      {loading ? (
        <div style={{ color: C.muted, fontSize: 13, padding: '8px 0' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {/* Enrolled factors */}
          {factors.totp.map(function (f) {
            return (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div><div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>🔐 Authenticator app</div><div style={{ color: C.muted, fontSize: 12 }}>{f.friendly_name || 'TOTP'} · added</div></div>
                <button onClick={function () { removeFactor(f.id); }} disabled={busy} style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.25)', color: '#FF6B6B', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Remove</button>
              </div>
            );
          })}

          {factors.webauthn.map(function (f) {
            return (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div><div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>🔑 Passkey</div><div style={{ color: C.muted, fontSize: 12 }}>{f.friendly_name || 'WebAuthn'}</div></div>
                <button onClick={function () { removeFactor(f.id); }} disabled={busy} style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.25)', color: '#FF6B6B', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Remove</button>
              </div>
            );
          })}

          {/* TOTP enroll flow */}
          {enrolling ? (
            <div style={{ display: 'grid', gap: 12, paddingTop: 4 }}>
              <div style={{ color: C.text, fontSize: 13 }}>1. Scan this QR code with your authenticator app (or enter the key manually).</div>
              {enrolling.qr && <div style={{ background: '#fff', padding: 12, borderRadius: 10, width: 'fit-content' }} dangerouslySetInnerHTML={{ __html: enrolling.qr }} />}
              {enrolling.secret && (
                <div style={{ fontSize: 12, color: C.muted }}>Manual key: <code style={{ color: C.text, background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, letterSpacing: 1 }}>{enrolling.secret}</code></div>
              )}
              <div style={{ color: C.text, fontSize: 13 }}>2. Enter the 6-digit code it shows:</div>
              <input value={code} onChange={function (e) { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); }} inputMode="numeric" placeholder="000000" autoFocus
                style={{ width: 140, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px', color: C.text, fontSize: 18, letterSpacing: 4, fontFamily: 'monospace', outline: 'none' }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={confirmTotpEnroll} disabled={busy || code.length !== 6} style={Object.assign({}, primaryBtn, { opacity: (busy || code.length !== 6) ? 0.6 : 1, cursor: (busy || code.length !== 6) ? 'not-allowed' : 'pointer' })}>{busy ? 'Verifying…' : 'Verify & enable'}</button>
                <button onClick={cancelEnroll} disabled={busy} style={ghostBtn}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
              <button onClick={startTotpEnroll} disabled={busy} style={primaryBtn}>{factors.totp.length ? '+ Add another authenticator' : 'Enable authenticator app'}</button>
              {passkeySupported && (
                <button onClick={startPasskeyEnroll} disabled={busy} style={ghostBtn}>{factors.webauthn.length ? '+ Add another passkey' : 'Add a passkey'}</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
