// src/FeatureGate.jsx — Locked-feature placeholder + KYC start banner.
// Used to wrap Lead Scan, Sequences, Pipeline etc. and explain what the
// tenant needs to unlock the feature.

import { useState } from 'react';

export function FeatureGate({ featureName, requirements, children, C }) {
  // requirements: { aup: bool, kyc: 'approved' | null, sms: bool }
  var met = requirements.met === true;
  if (met) return children || null;

  var colors = C || { bg: '#0f172a', muted: '#94a3b8' };
  return (
    <div style={{ padding: '48px 32px', textAlign: 'center', maxWidth: 640, margin: '40px auto' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
      <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>{featureName} is locked</h2>
      <p style={{ color: colors.muted, fontSize: 14, marginBottom: 24 }}>Complete the steps below to unlock this feature.</p>
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, textAlign: 'left' }}>
        {requirements.steps.map(function(step, i) {
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < requirements.steps.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ fontSize: 20 }}>{step.done ? '✅' : '⏳'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{step.title}</div>
                <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{step.description}</div>
              </div>
              {!step.done && step.ctaHref && <a href={step.ctaHref} style={{ background: 'linear-gradient(135deg, #00C9FF, #E040FB)', color: '#000', padding: '6px 14px', borderRadius: 6, textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>{step.ctaLabel || 'Start'}</a>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function KycStartBanner({ tenantId, email, onStarted, C }) {
  var colors = C || { muted: '#94a3b8' };
  var [loading, setLoading] = useState(false);
  var [error, setError] = useState(null);

  async function start() {
    setLoading(true); setError(null);
    try {
      var resp = await fetch('/api/kyc?action=create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, email: email }),
      });
      var data = await resp.json();
      if (!resp.ok || !data.url) throw new Error(data.error || 'Could not start verification');
      if (onStarted) onStarted();
      window.location.href = data.url; // redirect to Stripe-hosted Identity flow
    } catch (e) { setError(e.message); setLoading(false); }
  }

  return (
    <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(224,64,251,0.08))', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 12, padding: '18px 22px', margin: '16px 0', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ fontSize: 28 }}>🪪</div>
      <div style={{ flex: 1 }}>
        <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Verify your identity to unlock Lead Scan &amp; high-volume SMS</div>
        <div style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Takes 2 minutes. Powered by Stripe Identity — ID + selfie only, no storage of documents on our servers.</div>
        {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 6 }}>{error}</div>}
      </div>
      <button onClick={start} disabled={loading} style={{
        background: loading ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, #6366f1, #E040FB)',
        border: 'none', borderRadius: 10, padding: '10px 20px',
        color: loading ? '#64748b' : '#fff',
        fontWeight: 800, cursor: loading ? 'wait' : 'pointer', fontSize: 13, whiteSpace: 'nowrap',
      }}>{loading ? 'Opening…' : 'Start Verification →'}</button>
    </div>
  );
}
