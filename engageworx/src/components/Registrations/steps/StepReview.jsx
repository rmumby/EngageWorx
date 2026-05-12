import React, { useState, useMemo } from 'react';
import ValidationChecklist from '../ValidationChecklist';

var URL_LABELS = {
  opt_in_url: 'Opt-in / Consent Page',
  privacy_url: 'Privacy Policy',
  sms_terms_url: 'SMS Program Terms',
  terms_url: 'Terms & Conditions',
};

function buildChecks(brand, campaign, consent, urlResults) {
  var checks = [];

  // Brand checks
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

  // Campaign checks
  if (campaign.use_case) {
    checks.push({ status: 'pass', check: 'Use case selected', message: campaign.use_case, step: 2 });
  } else {
    checks.push({ status: 'fail', check: 'No use case selected', message: 'A use case is required for carrier review.', step: 2 });
  }

  var filledSamples = (campaign.sample_messages || []).filter(function(m) { return m && m.trim(); });
  if (filledSamples.length >= 2) {
    checks.push({ status: 'pass', check: 'Sample messages (' + filledSamples.length + ')', message: 'Carriers require at least 2 sample messages.', step: 2 });
  } else {
    checks.push({ status: 'fail', check: 'Not enough sample messages', message: filledSamples.length + ' provided, minimum 2 required.', fix: 'Add at least 2 realistic sample messages.', step: 2 });
  }

  var desc = (campaign.description || '').trim();
  if (desc.length >= 40) {
    checks.push({ status: 'pass', check: 'Campaign description', message: desc.length + ' characters', step: 2 });
  } else {
    checks.push({ status: 'fail', check: 'Campaign description too short', message: desc.length + ' characters (minimum 40).', fix: 'Expand your campaign description.', step: 2 });
  }

  // HELP/STOP keyword checks
  var helpMsg = (campaign.help_message || '').trim();
  var stopMsg = (campaign.stop_message || '').trim();
  if (helpMsg && stopMsg) {
    checks.push({ status: 'pass', check: 'HELP & STOP messages configured', message: 'Required for TCR compliance.', step: 2 });
  } else {
    var kMissing = [];
    if (!helpMsg) kMissing.push('HELP');
    if (!stopMsg) kMissing.push('STOP');
    checks.push({ status: 'fail', check: 'Missing keyword responses', message: kMissing.join(' and ') + ' message not configured.', fix: 'Add responses for required keywords.', step: 2 });
  }

  // URL verification checks — read from lifted urlResults state
  var urlKeys = ['opt_in_url', 'privacy_url', 'sms_terms_url', 'terms_url'];
  urlKeys.forEach(function(key) {
    var url = consent[key];
    var label = URL_LABELS[key];
    var result = urlResults && urlResults[key];
    if (!url || !url.trim()) {
      checks.push({ status: 'fail', check: label + ' missing', message: 'URL not provided.', step: 3 });
    } else if (!result) {
      checks.push({ status: 'warn', check: label + ' not verified', message: url, fix: 'Go back to Step 4 and verify this URL.', step: 3 });
    } else if (result.ok) {
      checks.push({ status: 'pass', check: label + ' verified', message: 'HTTP ' + (result.status || '200') + ' — ' + url, step: 3 });
    } else if (result.warn) {
      // Page is live but missing keywords — warn, not fail
      var kwList = (result.missing_keywords || []).join(', ');
      checks.push({ status: 'warn', check: label + ' missing recommended language', message: 'Page is live (HTTP ' + (result.status || '200') + ') but missing: ' + kwList, fix: 'Add the missing language to your page, then re-verify.', step: 3 });
    } else {
      var detail = result.error || 'URL verification failed';
      checks.push({ status: 'fail', check: label + ' unreachable', message: detail, fix: 'Ensure the URL is live and accessible.', step: 3 });
    }
  });

  // Opt-in description
  var optDesc = (consent.opt_in_description || '').trim();
  if (optDesc.length >= 50) {
    if (optDesc.startsWith('EXAMPLE:')) {
      checks.push({ status: 'warn', check: 'Opt-in description uses template', message: 'Replace the EXAMPLE template with your actual opt-in flow description.', step: 3 });
    } else {
      checks.push({ status: 'pass', check: 'Opt-in description', message: optDesc.length + ' characters', step: 3 });
    }
  } else {
    checks.push({ status: 'fail', check: 'Opt-in description too short', message: optDesc.length + ' characters (minimum 50).', step: 3 });
  }

  // Confirmation message
  var confMsg = (consent.confirmation_message || '').trim();
  if (confMsg.length >= 30 && confMsg.length <= 158) {
    var hasHelp = /help/i.test(confMsg);
    var hasStop = /stop/i.test(confMsg);
    if (hasHelp && hasStop) {
      checks.push({ status: 'pass', check: 'Confirmation message', message: confMsg.length + ' characters, includes HELP & STOP', step: 3 });
    } else {
      var kw = [];
      if (!hasHelp) kw.push('HELP');
      if (!hasStop) kw.push('STOP');
      checks.push({ status: 'warn', check: 'Confirmation message missing keywords', message: 'Should include ' + kw.join(' and ') + ' instructions for compliance.', step: 3 });
    }
  } else {
    checks.push({ status: 'fail', check: 'Confirmation message length', message: confMsg.length + ' characters (must be 30-158).', step: 3 });
  }

  return checks;
}

export default function StepReview({ brand, campaign, consent, sessionId, tenantId, onBack, onSubmit, C, urlResults, onGoToStep }) {
  var [overrides, setOverrides] = useState({});
  var [submitting, setSubmitting] = useState(false);

  var checks = useMemo(function() {
    return buildChecks(brand, campaign, consent, urlResults || {});
  }, [brand, campaign, consent, urlResults]);

  function handleOverride(index) {
    setOverrides(function(prev) { var n = Object.assign({}, prev); n[index] = true; return n; });
  }

  var hasFails = checks.some(function(c) { return c.status === 'fail'; });
  var unoverriddenWarns = checks.some(function(c, i) { return c.status === 'warn' && !overrides[i]; });
  var canSubmit = !hasFails && !unoverriddenWarns;

  var failCount = checks.filter(function(c) { return c.status === 'fail'; }).length;
  var warnCount = checks.filter(function(c, i) { return c.status === 'warn' && !overrides[i]; }).length;
  var passCount = checks.filter(function(c) { return c.status === 'pass'; }).length + checks.filter(function(c, i) { return c.status === 'warn' && overrides[i]; }).length;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    // Phase 5.D will wire real submission here
    onSubmit();
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

      {/* Validation summary bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', fontSize: 12, fontWeight: 600 }}>✅ {passCount} passed</div>
        {warnCount > 0 && <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#F59E0B', fontSize: 12, fontWeight: 600 }}>⚠️ {warnCount} warnings</div>}
        {failCount > 0 && <div style={{ padding: '8px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', fontSize: 12, fontWeight: 600 }}>❌ {failCount} failed</div>}
      </div>

      {/* Validation checklist */}
      <div style={{ marginBottom: 24 }}>
        <div style={sectionTitle}>Validation Checks</div>
        <ValidationChecklist checks={checks} onGoToStep={onGoToStep} overrides={overrides} onOverride={handleOverride} C={C} />
      </div>

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
          {!canSubmit && (
            <span style={{ color: C.muted, fontSize: 12 }}>
              {hasFails ? 'Fix ' + failCount + ' issue' + (failCount > 1 ? 's' : '') + ' to continue' : 'Override ' + warnCount + ' warning' + (warnCount > 1 ? 's' : '') + ' to continue'}
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            style={{ padding: '12px 28px', borderRadius: 10, border: 'none', background: canSubmit ? 'linear-gradient(135deg, #00BFFF, #A855F7)' : 'rgba(255,255,255,0.06)', color: canSubmit ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 700, fontSize: 14, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Submitting...' : 'Submit Registration →'}
          </button>
        </div>
      </div>
    </div>
  );
}
