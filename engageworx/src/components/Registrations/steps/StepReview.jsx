import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';
import ValidationChecklist from '../ValidationChecklist';

var URL_LABELS = {
  opt_in_url: 'Opt-in / Consent Page',
  privacy_url: 'Privacy Policy',
  sms_terms_url: 'SMS Program Terms',
  terms_url: 'Terms & Conditions',
};

// Fallback client-side checks when backend is unavailable
function buildFallbackChecks(brand, campaign, consent, urlResults) {
  var checks = [];

  if (brand.displayName && brand.companyName && brand.ein && brand.vertical && brand.entityType) {
    checks.push({ status: 'pass', check: 'Brand details complete', message: brand.displayName + ' (' + brand.entityType + ')', step: 0 });
  } else {
    var missing = [];
    if (!brand.displayName) missing.push('Display Name');
    if (!brand.companyName) missing.push('Legal Name');
    if (!brand.ein) missing.push('EIN');
    if (!brand.vertical) missing.push('Vertical');
    if (!brand.entityType) missing.push('Entity Type');
    checks.push({ status: 'fail', check: 'Brand details incomplete', message: 'Missing: ' + missing.join(', '), fix: 'Go back to Step 1 and fill in the required fields.', step: 0 });
  }

  if (campaign.use_case) {
    checks.push({ status: 'pass', check: 'Use case selected', message: campaign.use_case, step: 2 });
  } else {
    checks.push({ status: 'fail', check: 'No use case selected', message: 'A use case is required.', step: 2 });
  }

  var filledSamples = (campaign.sample_messages || []).filter(function(m) { return m && m.trim(); });
  if (filledSamples.length >= 2) {
    checks.push({ status: 'pass', check: 'Sample messages (' + filledSamples.length + ')', message: 'Minimum 2 required.', step: 2 });
  } else {
    checks.push({ status: 'fail', check: 'Not enough sample messages', message: filledSamples.length + ' provided, minimum 2 required.', step: 2 });
  }

  var urlKeys = ['opt_in_url', 'privacy_url', 'sms_terms_url', 'terms_url'];
  urlKeys.forEach(function(key) {
    var url = consent[key];
    var result = urlResults && urlResults[key];
    if (!url || !url.trim()) {
      checks.push({ status: 'fail', check: URL_LABELS[key] + ' missing', message: 'URL not provided.', step: 3 });
    } else if (!result) {
      checks.push({ status: 'warn', check: URL_LABELS[key] + ' not verified', message: url, step: 3 });
    } else if (result.ok) {
      checks.push({ status: 'pass', check: URL_LABELS[key] + ' verified', message: 'HTTP ' + (result.status || '200'), step: 3 });
    } else if (result.warn) {
      checks.push({ status: 'warn', check: URL_LABELS[key] + ' missing language', message: 'Missing: ' + (result.missing_keywords || []).join(', '), step: 3 });
    } else {
      checks.push({ status: 'fail', check: URL_LABELS[key] + ' unreachable', message: result.error || 'Verification failed', step: 3 });
    }
  });

  return checks;
}

export default function StepReview({ brand, campaign, consent, sessionId, tenantId, onBack, onSubmit, C, urlResults, onGoToStep }) {
  var [overrides, setOverrides] = useState({});
  var [submitting, setSubmitting] = useState(false);
  var [validating, setValidating] = useState(false);
  var [serverChecks, setServerChecks] = useState(null);
  var [validationError, setValidationError] = useState(null);
  var [showFeeConfirm, setShowFeeConfirm] = useState(false);
  var [fees, setFees] = useState(null);
  var [feesLoading, setFeesLoading] = useState(false);
  var [acceptNonRefundable, setAcceptNonRefundable] = useState(false);
  var [checkoutError, setCheckoutError] = useState(null);
  var [acceptAuthority, setAcceptAuthority] = useState(false);

  var fallbackChecks = useMemo(function() {
    return buildFallbackChecks(brand, campaign, consent, urlResults || {});
  }, [brand, campaign, consent, urlResults]);

  var runValidation = useCallback(async function() {
    if (!sessionId) return;
    setValidating(true);
    setValidationError(null);
    setOverrides({});
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      var res = await fetch('/api/tcr-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'ai_validate', session_id: sessionId }),
      });
      var data = await res.json();
      if (data.error) {
        setValidationError(data.error);
      } else if (data.items) {
        setServerChecks(data.items);
      } else {
        setValidationError('Unexpected response from validation service.');
      }
    } catch (e) {
      setValidationError('Validation service error: ' + e.message);
    }
    setValidating(false);
  }, [sessionId]);

  // Auto-run validation on mount
  useEffect(function() {
    runValidation();
  }, [runValidation]);

  // Use server checks if available, fall back to client-side
  var checks = serverChecks || fallbackChecks;
  var usingFallback = !serverChecks;

  function handleOverride(index) {
    setOverrides(function(prev) { var n = Object.assign({}, prev); n[index] = true; return n; });
  }

  var hasFails = checks.some(function(c) { return c.status === 'fail'; });
  var unoverriddenWarns = checks.some(function(c, i) { return c.status === 'warn' && !overrides[i]; });
  var canSubmit = !hasFails && !unoverriddenWarns && !validating;

  var failCount = checks.filter(function(c) { return c.status === 'fail'; }).length;
  var warnCount = checks.filter(function(c, i) { return c.status === 'warn' && !overrides[i]; }).length;
  var passCount = checks.filter(function(c) { return c.status === 'pass'; }).length + checks.filter(function(c, i) { return c.status === 'warn' && overrides[i]; }).length;

  async function handleSubmitClick() {
    if (!canSubmit) return;
    setFeesLoading(true);
    setShowFeeConfirm(true);
    setAcceptNonRefundable(false);
    setAcceptAuthority(false);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      var res = await fetch('/api/tcr-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'get_fees', session_id: sessionId }),
      });
      var data = await res.json();
      if (data.total !== undefined) {
        setFees(data);
      } else {
        setFees({ brand_fee: 400, campaign_fee: 1500, total: 1900, currency: 'USD', source: 'fallback' });
      }
    } catch (e) {
      setFees({ brand_fee: 400, campaign_fee: 1500, total: 1900, currency: 'USD', source: 'fallback' });
    }
    setFeesLoading(false);
  }

  async function handleConfirmSubmit() {
    setCheckoutError(null);
    setSubmitting(true);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      var res = await fetch('/api/tcr-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'create_checkout', session_id: sessionId }),
      });
      var data = await res.json();
      if (data.error) {
        setShowFeeConfirm(false);
        setSubmitting(false);
        setCheckoutError(data.error);
        return;
      }
      if (data.skip_payment) {
        // Mock mode — advance directly
        setShowFeeConfirm(false);
        onSubmit();
        return;
      }
      if (data.url) {
        // Live mode — redirect to Stripe Checkout
        window.location.href = data.url;
        return;
      }
      // Unexpected response
      setShowFeeConfirm(false);
      setSubmitting(false);
      setCheckoutError('Unexpected response from checkout service.');
    } catch (e) {
      setShowFeeConfirm(false);
      setSubmitting(false);
      setCheckoutError('Checkout error: ' + e.message);
    }
  }

  function handleCancelFee() {
    setShowFeeConfirm(false);
    setFees(null);
  }

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 };
  var sectionTitle = { color: '#fff', fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 };
  var fieldLabel = { color: 'rgba(255,255,255,0.4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 };
  var fieldValue = { color: '#fff', fontSize: 13, marginTop: 2 };
  var fieldBlock = { marginBottom: 10 };

  var filledSamples = (campaign.sample_messages || []).filter(function(m) { return m && m.trim(); });

  return (
    <div>
      <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Review & Submit</h2>
      <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Review your registration details below. Fix any issues before submitting to the carrier network.</div>

      {checkoutError && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#EF4444', fontSize: 12 }}>{checkoutError}</div>
      )}

      {/* Validation summary bar */}
      {validating ? (
        <div style={{ padding: '16px 20px', borderRadius: 10, background: 'rgba(0,191,255,0.06)', border: '1px solid rgba(0,191,255,0.15)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>⏳</span>
          <div>
            <div style={{ color: '#00BFFF', fontSize: 13, fontWeight: 600 }}>Running validation checks...</div>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Scanning URLs, verifying compliance language, checking use case alignment</div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', fontSize: 12, fontWeight: 600 }}>✅ {passCount} passed</div>
          {warnCount > 0 && <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#F59E0B', fontSize: 12, fontWeight: 600 }}>⚠️ {warnCount} warnings</div>}
          {failCount > 0 && <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', fontSize: 12, fontWeight: 600 }}>❌ {failCount} failed</div>}
          {usingFallback && <div style={{ color: C.muted, fontSize: 11 }}>(offline checks — server validation unavailable)</div>}
          <button onClick={runValidation} style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '5px 12px', color: C.muted, cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>Re-validate</button>
        </div>
      )}

      {/* Validation error */}
      {validationError && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#EF4444', fontSize: 12 }}>
          {validationError}
        </div>
      )}

      {/* Validation checklist */}
      {!validating && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionTitle}>Validation Checks</div>
          <ValidationChecklist checks={checks} onGoToStep={onGoToStep} overrides={overrides} onOverride={handleOverride} C={C} />
        </div>
      )}

      {/* Brand summary */}
      <div style={card}>
        <div style={sectionTitle}>Brand</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
          <div style={fieldBlock}><div style={fieldLabel}>Display Name</div><div style={fieldValue}>{brand.displayName || '—'}</div></div>
          <div style={fieldBlock}><div style={fieldLabel}>Legal Name</div><div style={fieldValue}>{brand.companyName || '—'}</div></div>
          <div style={fieldBlock}><div style={fieldLabel}>EIN</div><div style={fieldValue}>{brand.ein || '—'}</div></div>
          <div style={fieldBlock}><div style={fieldLabel}>Entity Type</div><div style={fieldValue}>{brand.entityType || '—'}</div></div>
          <div style={fieldBlock}><div style={fieldLabel}>Vertical</div><div style={fieldValue}>{brand.vertical || '—'}</div></div>
          <div style={fieldBlock}><div style={fieldLabel}>Country</div><div style={fieldValue}>{brand.country || '—'}</div></div>
        </div>
      </div>

      {/* Campaign summary */}
      <div style={card}>
        <div style={sectionTitle}>Campaign</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', marginBottom: 12 }}>
          <div style={fieldBlock}><div style={fieldLabel}>Use Case</div><div style={fieldValue}>{campaign.use_case || '—'}</div></div>
          <div style={fieldBlock}><div style={fieldLabel}>Content Flags</div><div style={fieldValue}>{[campaign.embeddedLink && 'Links', campaign.embeddedPhone && 'Phone #s', campaign.ageGated && 'Age-gated', campaign.directLending && 'Lending'].filter(Boolean).join(', ') || 'None'}</div></div>
        </div>
        <div style={fieldBlock}>
          <div style={fieldLabel}>Description</div>
          <div style={Object.assign({}, fieldValue, { fontSize: 12, lineHeight: 1.5 })}>{campaign.description || '—'}</div>
        </div>
        {filledSamples.length > 0 && (
          <div style={fieldBlock}>
            <div style={fieldLabel}>Sample Messages ({filledSamples.length})</div>
            {filledSamples.map(function(m, i) {
              return <div key={i} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, padding: '4px 0', borderBottom: i < filledSamples.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>"{m.length > 120 ? m.substring(0, 120) + '…' : m}"</div>;
            })}
          </div>
        )}
      </div>

      {/* Consent summary */}
      <div style={card}>
        <div style={sectionTitle}>Consent & URLs</div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {['opt_in_url', 'privacy_url', 'sms_terms_url', 'terms_url'].map(function(key) {
            var url = consent[key];
            var result = urlResults && urlResults[key];
            var verified = result && result.ok;
            return (
              <div key={key} style={fieldBlock}>
                <div style={fieldLabel}>{URL_LABELS[key]}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <div style={{ color: url ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: 12, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{url || '—'}</div>
                  {url && <span style={{ fontSize: 11, color: verified ? '#10b981' : result ? '#EF4444' : '#F59E0B', flexShrink: 0 }}>{verified ? '✓' : result ? '✗' : '?'}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={fieldBlock}>
          <div style={fieldLabel}>Opt-in Description</div>
          <div style={Object.assign({}, fieldValue, { fontSize: 12, lineHeight: 1.5 })}>{consent.opt_in_description || '—'}</div>
        </div>
        <div style={fieldBlock}>
          <div style={fieldLabel}>Confirmation Message</div>
          <div style={Object.assign({}, fieldValue, { fontSize: 12 })}>{consent.confirmation_message || '—'}</div>
        </div>
      </div>

      {/* Submit section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <button onClick={onBack} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!canSubmit && !validating && (
            <span style={{ color: C.muted, fontSize: 12 }}>
              {hasFails ? 'Fix ' + failCount + ' issue' + (failCount > 1 ? 's' : '') + ' to continue' : 'Override ' + warnCount + ' warning' + (warnCount > 1 ? 's' : '') + ' to continue'}
            </span>
          )}
          <button
            onClick={handleSubmitClick}
            disabled={!canSubmit || submitting}
            style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: canSubmit ? 'linear-gradient(135deg, #00BFFF, #A855F7)' : 'rgba(255,255,255,0.06)', color: canSubmit ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 700, fontSize: 14, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Submitting...' : 'Submit Registration →'}
          </button>
        </div>
      </div>

      {/* Fee confirmation modal */}
      {showFeeConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={handleCancelFee}>
          <div onClick={function(e) { e.stopPropagation(); }} style={{ background: '#0d1425', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '28px 32px', maxWidth: 460, width: '90%' }}>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Confirm registration submission</div>
            <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
              This will submit your registration to The Campaign Registry. Fees are charged on submission and are non-refundable, including if your registration is rejected.
            </div>

            {feesLoading ? (
              <div style={{ textAlign: 'center', padding: 20, color: C.muted, fontSize: 13 }}>Loading fees...</div>
            ) : fees ? (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Brand Registration</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{'$' + (fees.brand_fee / 100).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Campaign Registration</span>
                  <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{'$' + (fees.campaign_fee / 100).toFixed(2)}</span>
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>Total</span>
                  <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{'$' + (fees.total / 100).toFixed(2)}</span>
                </div>
                {fees.source === 'fallback' && (
                  <div style={{ marginTop: 8, color: '#F59E0B', fontSize: 11 }}>Estimated fees — final amount confirmed on submission.</div>
                )}
              </div>
            ) : null}

            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }} onClick={function() { setAcceptNonRefundable(!acceptNonRefundable); }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid ' + (acceptNonRefundable ? '#00BFFF' : 'rgba(255,255,255,0.15)'), background: acceptNonRefundable ? '#00BFFF' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all 0.15s' }}>
                  {acceptNonRefundable && <span style={{ color: '#000', fontSize: 12, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.5 }}>I understand the fees and accept they are non-refundable</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }} onClick={function() { setAcceptAuthority(!acceptAuthority); }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid ' + (acceptAuthority ? '#00BFFF' : 'rgba(255,255,255,0.15)'), background: acceptAuthority ? '#00BFFF' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all 0.15s' }}>
                  {acceptAuthority && <span style={{ color: '#000', fontSize: 12, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.5 }}>I have authority to register this brand on behalf of the business</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={handleCancelFee} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button
                onClick={handleConfirmSubmit}
                disabled={!acceptNonRefundable || !acceptAuthority || feesLoading}
                style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: (acceptNonRefundable && acceptAuthority) ? 'linear-gradient(135deg, #00BFFF, #A855F7)' : 'rgba(255,255,255,0.06)', color: (acceptNonRefundable && acceptAuthority) ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 700, cursor: (acceptNonRefundable && acceptAuthority) ? 'pointer' : 'not-allowed', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}
              >Submit Registration</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
