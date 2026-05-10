import React from 'react';

export default function StepVetting({ onNext, onBack, C }) {
  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '32px 28px', marginBottom: 20, textAlign: 'center' };

  return (
    <div>
      <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Brand Vetting (Optional)</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Enhanced vetting can improve your trust score and throughput limits</div>

      <div style={card}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
        <div style={{ color: '#fff', fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Enhanced Brand Vetting</div>
        <div style={{ color: C.muted, fontSize: 13, maxWidth: 440, margin: '0 auto 24px', lineHeight: 1.6 }}>
          Enhanced vetting verifies your business identity with carriers for higher throughput and trust scores. This is optional — you can submit without it and add vetting later if needed.
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={onNext} style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Skip for now →</button>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 12 }}>Enhanced vetting available as a future add-on</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <button onClick={onBack} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>← Back</button>
      </div>
    </div>
  );
}
