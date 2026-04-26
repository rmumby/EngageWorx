// src/AUPModal.jsx — Full-screen AUP modal gated by scroll-to-bottom.
// Rendered in App.jsx whenever the authenticated user's tenant has
// aup_accepted=false.

import { useState, useRef, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function AUPModal({ tenantId, onAccepted, onSignOut }) {
  var [scrolledToEnd, setScrolledToEnd] = useState(false);
  var [saving, setSaving] = useState(false);
  var [error, setError] = useState(null);
  var scrollRef = useRef(null);

  useEffect(function() {
    // If the content is short enough to not be scrollable, enable button immediately
    var el = scrollRef.current;
    if (el && el.scrollHeight <= el.clientHeight + 2) setScrolledToEnd(true);
  }, []);

  function onScroll(e) {
    var el = e.target;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) setScrolledToEnd(true);
  }

  async function accept() {
    if (!tenantId) { setError('No tenant in session.'); return; }
    setSaving(true);
    try {
      var r = await supabase.from('tenants').update({
        aup_accepted: true,
        aup_accepted_at: new Date().toISOString(),
      }).eq('id', tenantId);
      if (r.error) throw r.error;
      if (onAccepted) onAccepted();
    } catch (e) { setError(e.message); }
    setSaving(false);
  }

  async function decline() {
    if (!window.confirm('You must accept the Acceptable Use Policy to use EngageWorx. Sign out instead?')) return;
    try { await supabase.auth.signOut(); } catch (e) {}
    if (onSignOut) onSignOut();
    window.location.href = '/';
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,8,16,0.95)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h1 style={{ color: '#fff', margin: 0, fontSize: 20, fontWeight: 800 }}>📜 Acceptable Use Policy</h1>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>Please read in full. Scroll to the bottom to enable the Accept button.</p>
        </div>

        <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', color: '#cbd5e1', fontSize: 14, lineHeight: 1.7 }}>
          <p><b>1. Business Use Only.</b> EngageWorx is a B2B communications platform. Accounts are for legitimate business messaging and outreach only. Personal use, individual consumer accounts, and non-business use are strictly prohibited.</p>

          <p><b>2. Consent Required for All Messaging.</b> You may only send messages to recipients who have given explicit, verifiable opt-in consent. Opt-in records (source, timestamp, IP, disclosure language shown) must be maintained and produced on request. Unsolicited outreach — including cold SMS and cold calls — is not permitted through this platform.</p>

          <p><b>3. No Spam.</b> Unsolicited bulk or commercial messaging is prohibited. Messages must be relevant to the recipient's prior engagement with your business. Accounts that generate excessive spam complaints, opt-out rates above 3%, or carrier violation reports will be suspended immediately.</p>

          <p><b>4. TCR / 10DLC Compliance (SMS).</b> SMS outbound requires an approved TCR brand and campaign registration. SMS sending is blocked at the platform level (via <code>sms_enabled=false</code>) until your registration is verified and approved by the US carriers. Attempting to bypass this gate violates this policy and federal CTIA guidelines.</p>

          <p><b>5. Prohibited Content.</b> You may not send messages related to: firearms, illegal drugs or paraphernalia, gambling, adult content, payday/high-risk loans, multi-level-marketing recruitment, cryptocurrency ICOs, debt collection (without proper licensing), or any content prohibited by the CTIA SMS guidelines or WhatsApp Business policy.</p>

          <p><b>6. Identity Verification.</b> Certain features (Lead Scan, SMS at scale) require identity verification via Stripe Identity. You must provide accurate, truthful information. Impersonation, use of fraudulent documents, or signup on behalf of a business without authorization is grounds for immediate termination.</p>

          <p><b>7. Data Retention &amp; Privacy.</b> Your contacts, conversations, and pipeline data are yours. We process them under the subprocessor terms of our DPA. You are responsible for your end-users' consent and for honouring their data rights (deletion, export) under GDPR, CCPA, and similar laws. STOP / HELP keywords must resolve automatically (the platform handles this) and must not be overridden.</p>

          <p><b>8. Rate Limits &amp; Abuse.</b> Each plan has quotas. Attempting to circumvent rate limits, using multiple accounts to evade suspensions, or reselling EngageWorx API access without a written reseller agreement is prohibited.</p>

          <p><b>9. Suspension &amp; Termination.</b> We may suspend or terminate accounts that violate this policy without notice. Data will be preserved for 30 days after termination for retrieval on request, then deleted.</p>

          <p><b>10. Carrier &amp; Provider Rules.</b> You also agree to the downstream terms of our infrastructure and messaging providers. A violation of their rules is a violation of ours.</p>

          <p><b>11. Reporting.</b> To report abuse, policy concerns, or a compromised account, email <a href="mailto:support@engwx.com" style={{ color: '#00C9FF' }}>support@engwx.com</a>. Emergencies (credential compromise, suspected fraud) can also call +1 (786) 982-7800.</p>

          <p><b>12. Updates.</b> We may update this policy as carriers and regulations change. Material changes trigger a re-acceptance prompt at your next login.</p>

          <div style={{ marginTop: 20, padding: 14, background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.2)', borderRadius: 8 }}>
            <b style={{ color: '#fbbf24' }}>By clicking Accept</b>, you confirm you have read, understood, and agree to this Acceptable Use Policy on behalf of your organization.
          </div>
        </div>

        {error && <div style={{ padding: '10px 24px', color: '#ef4444', fontSize: 13 }}>❌ {error}</div>}

        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={decline} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 18px', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>Decline &amp; Sign Out</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {!scrolledToEnd && <span style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>⬆ Scroll to the bottom to enable</span>}
            <button onClick={accept} disabled={!scrolledToEnd || saving} style={{
              background: scrolledToEnd && !saving ? 'linear-gradient(135deg, #00C9FF, #E040FB)' : 'rgba(255,255,255,0.08)',
              border: 'none', borderRadius: 10, padding: '10px 28px',
              color: scrolledToEnd && !saving ? '#000' : '#64748b',
              fontWeight: 800, cursor: scrolledToEnd && !saving ? 'pointer' : 'not-allowed', fontSize: 14,
            }}>{saving ? 'Saving…' : '✓ Accept & Continue'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
