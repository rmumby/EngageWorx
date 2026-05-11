// src/AuthCallback.jsx — Handles auth callback redirects (password recovery)
// Renders set-password form INLINE instead of redirecting to portal root.
// Detects type=recovery from URL hash, shows password form, calls updateUser on submit.

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

var inputStyle = {
  width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10, padding: '12px 16px', color: '#fff', fontSize: 14,
  fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none',
};

export default function AuthCallback() {
  var [phase, setPhase] = useState('loading'); // loading | set_password | success | error
  var [newPassword, setNewPassword] = useState('');
  var [confirmPassword, setConfirmPassword] = useState('');
  var [message, setMessage] = useState(null);
  var [submitting, setSubmitting] = useState(false);

  useEffect(function() {
    // Parse the hash fragment for token type
    var hash = window.location.hash;
    var params = new URLSearchParams(hash.replace('#', ''));
    var type = params.get('type');

    if (type === 'recovery') {
      // Recovery flow — session is established from the hash tokens automatically.
      // Wait for session to be ready, then show the password form.
      supabase.auth.getSession().then(function(result) {
        if (result.data && result.data.session) {
          setPhase('set_password');
        } else {
          setMessage('This reset link has expired or is invalid. Please request a new one.');
          setPhase('error');
        }
      }).catch(function() {
        setMessage('An error occurred processing the reset link.');
        setPhase('error');
      });
    } else {
      // Not a recovery callback — might be a magic link or other auth flow.
      // Redirect to portal root and let the normal auth flow handle it.
      supabase.auth.getSession().then(function() {
        window.location.href = '/';
      });
    }
  }, []);

  async function handleSetPassword() {
    if (!newPassword || newPassword.length < 6) {
      setMessage('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      var { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setMessage(error.message);
      } else {
        setPhase('success');
      }
    } catch (e) {
      setMessage(e.message || 'Failed to update password');
    }
    setSubmitting(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0E1A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: 420, padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff' }}>
            Engage<span style={{ color: '#00BFFF' }}>Worx</span>
          </div>
        </div>

        {phase === 'loading' && (
          <div style={{ background: '#0d1425', border: '1px solid #182440', borderRadius: 16, padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, color: '#fff', fontWeight: 600, marginBottom: 8 }}>Processing...</div>
            <div style={{ color: '#6B7280', fontSize: 14 }}>Verifying your reset link</div>
          </div>
        )}

        {phase === 'set_password' && (
          <div style={{ background: '#0d1425', border: '1px solid #182440', borderRadius: 16, padding: '36px 32px' }}>
            <h2 style={{ color: '#fff', margin: '0 0 8px', textAlign: 'center', fontSize: 20 }}>Set New Password</h2>
            <p style={{ color: '#6B7280', textAlign: 'center', marginBottom: 24, fontSize: 13 }}>Enter your new password below</p>

            {message && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#EF4444', fontSize: 13 }}>
                {message}
              </div>
            )}

            <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 4, fontWeight: 700 }}>New Password</label>
                <input type="password" value={newPassword} onChange={function(e) { setNewPassword(e.target.value); }} placeholder="Min 6 characters" style={inputStyle} />
              </div>
              <div>
                <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 4, fontWeight: 700 }}>Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={function(e) { setConfirmPassword(e.target.value); }} placeholder="Repeat password" style={inputStyle} />
              </div>
            </div>

            <button
              onClick={handleSetPassword}
              disabled={submitting}
              style={{ width: '100%', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', border: 'none', borderRadius: 10, padding: '14px', color: '#fff', fontWeight: 700, fontSize: 15, cursor: submitting ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        )}

        {phase === 'success' && (
          <div style={{ background: '#0d1425', border: '1px solid #182440', borderRadius: 16, padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>✅</div>
            <h2 style={{ color: '#fff', margin: '0 0 8px', fontSize: 20 }}>Password Updated</h2>
            <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 24 }}>Your password has been changed successfully.</p>
            <a href="/" style={{ display: 'inline-block', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', color: '#fff', padding: '12px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              Go to Portal
            </a>
          </div>
        )}

        {phase === 'error' && (
          <div style={{ background: '#0d1425', border: '1px solid #182440', borderRadius: 16, padding: '48px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ color: '#EF4444', margin: '0 0 8px', fontSize: 20 }}>Link Invalid</h2>
            <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>{message || 'This link has expired or is invalid.'}</p>
            <a href="/" style={{ display: 'inline-block', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', color: '#fff', padding: '12px 28px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>
              Back to Login
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
