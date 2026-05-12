import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../supabaseClient';
import MNOStatusBadges from '../MNOStatusBadges';

export default function StepStatus({ sessionId, tenantId, onDone, onBack, C }) {
  var [phase, setPhase] = useState('submitting_brand'); // submitting_brand | brand_complete | submitting_campaign | submitted | brand_failed | campaign_failed | polling | complete | rejected
  var [brandId, setBrandId] = useState(null);
  var [campaignId, setCampaignId] = useState(null);
  var [mnoStatus, setMnoStatus] = useState({});
  var [campaignStatus, setCampaignStatus] = useState('PENDING');
  var [error, setError] = useState(null);
  var [supplierMode, setSupplierMode] = useState(null);
  var pollRef = useRef(null);
  var submitted = useRef(false);

  // Phase 1: Submit on mount
  useEffect(function() {
    if (submitted.current || !sessionId) return;
    submitted.current = true;
    runSubmit();
  }, [sessionId]);

  async function runSubmit() {
    setPhase('submitting_brand');
    setError(null);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      var res = await fetch('/api/tcr-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'submit', session_id: sessionId }),
      });
      var data = await res.json();

      if (data.success) {
        setBrandId(data.supplier_brand_id);
        setCampaignId(data.supplier_campaign_id);
        setMnoStatus(data.mno_status || {});
        setCampaignStatus(data.campaign_status || 'PENDING');
        setSupplierMode(data.supplier_mode);
        // Animate through phases
        setPhase('brand_complete');
        setTimeout(function() {
          setPhase('submitting_campaign');
          setTimeout(function() {
            setPhase('submitted');
            setTimeout(function() { setPhase('polling'); }, 800);
          }, 600);
        }, 600);
      } else if (data.phase === 'brand') {
        setError(data.error);
        setPhase('brand_failed');
      } else if (data.phase === 'campaign') {
        setBrandId(data.supplier_brand_id);
        setError(data.error);
        setPhase('campaign_failed');
      } else {
        setError(data.error || 'Submission failed');
        setPhase('brand_failed');
      }
    } catch (e) {
      setError(e.message);
      setPhase('brand_failed');
    }
  }

  // Phase 2: Poll carrier status
  useEffect(function() {
    if (phase !== 'polling' || !sessionId) return;

    function poll() {
      fetch('/api/tcr-wizard?action=status&session_id=' + sessionId)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.session) {
            var s = data.session;
            setMnoStatus(s.mno_status || {});
            setCampaignStatus(s.campaign_status || 'PENDING');
            if (s.status === 'approved') {
              setPhase('complete');
            } else if (s.status === 'rejected') {
              setError(s.rejection_reason || null);
              setPhase('rejected');
            }
          }
        })
        .catch(function() {});
    }

    poll(); // immediate first poll
    pollRef.current = setInterval(poll, 10000);

    // Stop after 24 hours
    var maxTimer = setTimeout(function() {
      if (pollRef.current) clearInterval(pollRef.current);
    }, 86400000);

    return function() {
      if (pollRef.current) clearInterval(pollRef.current);
      clearTimeout(maxTimer);
    };
  }, [phase, sessionId]);

  // Stop polling on complete/rejected
  useEffect(function() {
    if ((phase === 'complete' || phase === 'rejected') && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [phase]);

  function handleRetry() {
    submitted.current = false;
    runSubmit();
  }

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '24px 28px', marginBottom: 20 };

  // Phase 1: Submission progress
  if (phase === 'submitting_brand' || phase === 'brand_complete' || phase === 'submitting_campaign' || phase === 'submitted') {
    var steps = [
      { id: 'brand', label: 'Submitting brand to carrier infrastructure...', doneLabel: 'Brand registered' + (brandId ? ' (ID: ' + brandId + ')' : '') },
      { id: 'campaign', label: 'Submitting campaign for carrier review...', doneLabel: 'Campaign registered' + (campaignId ? ' (ID: ' + campaignId + ')' : '') },
    ];
    var brandDone = phase !== 'submitting_brand';
    var campaignDone = phase === 'submitted';
    var campaignActive = phase === 'submitting_campaign';

    return (
      <div>
        <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Submitting Registration</h2>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>Registering your brand and campaign with the carrier network. This takes a few seconds.</div>
        <div style={card}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{brandDone ? '✅' : '⏳'}</span>
              <div>
                <div style={{ color: brandDone ? '#10b981' : '#fff', fontSize: 14, fontWeight: 600 }}>{brandDone ? steps[0].doneLabel : steps[0].label}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{campaignDone ? '✅' : campaignActive ? '⏳' : '○'}</span>
              <div>
                <div style={{ color: campaignDone ? '#10b981' : campaignActive ? '#fff' : 'rgba(255,255,255,0.25)', fontSize: 14, fontWeight: campaignActive || campaignDone ? 600 : 400 }}>{campaignDone ? steps[1].doneLabel : campaignActive ? steps[1].label : 'Campaign registration'}</div>
              </div>
            </div>
          </div>
          {supplierMode === 'mock' && (
            <div style={{ marginTop: 16, padding: '8px 12px', background: 'rgba(245,158,11,0.08)', borderRadius: 6, color: '#F59E0B', fontSize: 11 }}>Mock mode — no real carrier submission. T-Mobile activates in ~5s, all carriers in ~15s.</div>
          )}
        </div>
      </div>
    );
  }

  // Phase 1: Brand failed
  if (phase === 'brand_failed') {
    return (
      <div>
        <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Submission Failed</h2>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>Brand registration could not be completed.</div>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 18 }}>❌</span>
            <div>
              <div style={{ color: '#EF4444', fontSize: 14, fontWeight: 600 }}>Brand registration failed</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{error}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleRetry} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Try Again</button>
            <button onClick={onBack} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Edit Registration</button>
          </div>
        </div>
      </div>
    );
  }

  // Phase 1: Campaign failed (brand succeeded)
  if (phase === 'campaign_failed') {
    return (
      <div>
        <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Partial Submission</h2>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>Brand registered but campaign registration failed.</div>
        <div style={card}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div style={{ color: '#10b981', fontSize: 14, fontWeight: 600 }}>Brand registered{brandId ? ' (ID: ' + brandId + ')' : ''}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>❌</span>
              <div>
                <div style={{ color: '#EF4444', fontSize: 14, fontWeight: 600 }}>Campaign registration failed</div>
                <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{error}</div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 8, color: '#F59E0B', fontSize: 12, lineHeight: 1.5 }}>
            Your brand is registered with the carrier network. Campaign registration needs support intervention to resolve.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={handleRetry} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Try Again</button>
            <button onClick={onDone} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Contact Support</button>
          </div>
        </div>
      </div>
    );
  }

  // Phase 2: Polling carrier status
  if (phase === 'polling') {
    return (
      <div>
        <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Tracking Carrier Approvals</h2>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>Submission complete. Waiting for carrier provisioning.</div>
        <div style={card}>
          <div style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div style={{ color: '#10b981', fontSize: 14, fontWeight: 600 }}>Brand registered{brandId ? ' (' + brandId + ')' : ''}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div style={{ color: '#10b981', fontSize: 14, fontWeight: 600 }}>Campaign submitted{campaignId ? ' (' + campaignId + ')' : ''}</div>
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, fontWeight: 700 }}>Carrier Status</div>
            <MNOStatusBadges mnoStatus={mnoStatus} mode="full" />
          </div>
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.6 }}>
            T-Mobile typically approves in 0–24 hours. AT&T and Verizon in 1–3 business days. US Cellular varies. This page updates automatically every 10 seconds.
          </div>
          {supplierMode === 'mock' && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(245,158,11,0.08)', borderRadius: 6, color: '#F59E0B', fontSize: 11 }}>Mock mode — T-Mobile activates in ~5s, all carriers in ~15s.</div>
          )}
        </div>
        <button onClick={onDone} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>← Back to Registrations</button>
      </div>
    );
  }

  // Phase 3: Complete — all carriers approved
  if (phase === 'complete') {
    return (
      <div>
        <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Registration Complete</h2>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>All carriers have approved your campaign.</div>
        <div style={Object.assign({}, card, { border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.04)', textAlign: 'center', padding: '40px 28px' })}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <div style={{ color: '#10b981', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>All Carriers Approved</div>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Your 10DLC registration is active. You can now send SMS to US numbers.</div>
          <MNOStatusBadges mnoStatus={mnoStatus} mode="full" />
        </div>
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button onClick={onDone} style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #00BFFF, #A855F7)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Done</button>
        </div>
      </div>
    );
  }

  // Phase 3: Rejected
  if (phase === 'rejected') {
    return (
      <div>
        <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Registration Rejected</h2>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>One or more carriers rejected your campaign.</div>
        <div style={Object.assign({}, card, { border: '1px solid rgba(239,68,68,0.2)' })}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, fontWeight: 700 }}>Carrier Status</div>
            <MNOStatusBadges mnoStatus={mnoStatus} mode="full" />
          </div>
          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, color: '#EF4444', fontSize: 12, lineHeight: 1.5, marginBottom: 16 }}>{error}</div>
          )}
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
            Review the rejection reason above. You may need to adjust your campaign content, sample messages, or compliance URLs and resubmit.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onDone} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>← Back to Registrations</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
