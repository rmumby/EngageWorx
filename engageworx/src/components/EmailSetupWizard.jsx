// src/components/EmailSetupWizard.jsx — Custom email domain setup wizard
// Step wizard: Domain → DNS Records → Verify → From Address → Test Send
import React, { useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const STEPS = ['Domain', 'DNS Records', 'Verify', 'From Address', 'Test'];

const DNS_PROVIDERS = [
  'Cloudflare', 'GoDaddy', 'Namecheap', 'Squarespace', 'Google Domains',
  'Route 53 (AWS)', 'DigitalOcean', 'Hover', 'Porkbun', 'Other',
];

export default function EmailSetupWizard({ C, tenantId, onComplete, onCancel, existingConfig }) {
  var [step, setStep] = useState(0);
  var [domain, setDomain] = useState((existingConfig && existingConfig.domain) || '');
  var [domainId, setDomainId] = useState((existingConfig && existingConfig.resend_domain_id) || null);
  var [records, setRecords] = useState([]);
  var [verifyStatus, setVerifyStatus] = useState(null);
  var [fromEmail, setFromEmail] = useState((existingConfig && existingConfig.from_email) || '');
  var [fromName, setFromName] = useState((existingConfig && existingConfig.from_name) || '');
  var [loading, setLoading] = useState(false);
  var [error, setError] = useState(null);
  var [testSent, setTestSent] = useState(false);
  var [dnsProvider, setDnsProvider] = useState('');
  var [dnsInstructions, setDnsInstructions] = useState('');
  var [loadingInstructions, setLoadingInstructions] = useState(false);

  var getToken = useCallback(async function() {
    var session = await supabase.auth.getSession();
    return session.data && session.data.session ? session.data.session.access_token : null;
  }, []);

  var apiCall = useCallback(async function(action, body) {
    var token = await getToken();
    if (!token) throw new Error('Not authenticated');
    var res = await fetch('/api/email-setup?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    var data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Request failed');
    return data;
  }, [getToken]);

  // Step 1: Create domain
  var handleCreateDomain = async function() {
    setLoading(true); setError(null);
    try {
      var result = await apiCall('create-domain', { domain: domain });
      setDomainId(result.domain_id);
      setRecords(result.records || []);
      setStep(1);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  // Step 2: Get AI-generated DNS instructions
  var handleGetInstructions = async function(provider) {
    setDnsProvider(provider);
    setLoadingInstructions(true);
    try {
      var result = await apiCall('dns-instructions', { provider: provider, records: records });
      setDnsInstructions(result.instructions || '');
    } catch (err) { setDnsInstructions('Add the DNS records shown above at your DNS provider.'); }
    setLoadingInstructions(false);
  };

  // Step 3: Check verification
  var handleVerify = async function() {
    setLoading(true); setError(null);
    try {
      var result = await apiCall('check-verification', { domain_id: domainId });
      setVerifyStatus(result.status);
      if (result.records) setRecords(result.records);
      if (result.status === 'verified' || result.status === 'active') {
        setFromEmail(fromEmail || ('hello@' + domain));
        setStep(3);
      }
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  // Step 4: Save config
  var handleSaveConfig = async function() {
    if (!fromEmail || !fromName) { setError('From email and name are required'); return; }
    setLoading(true); setError(null);
    try {
      await apiCall('save-config', {
        tenant_id: tenantId, from_email: fromEmail, from_name: fromName,
        domain: domain, domain_id: domainId,
      });
      setStep(4);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  // Step 5: Test send
  var handleTestSend = async function() {
    setLoading(true); setError(null);
    try {
      var session = await supabase.auth.getSession();
      var userEmail = session.data && session.data.session ? session.data.session.user.email : null;
      if (!userEmail) throw new Error('Could not determine your email');
      await apiCall('send-test', { tenant_id: tenantId, to: userEmail });
      setTestSent(true);
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  // ── Styles (match Settings.js theme) ────────────────────────────────────
  var primary = (C && C.primary) || '#00C9FF';
  var accent = (C && C.accent) || primary;
  var overlay = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' };
  var modal = { background: '#0d1117', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', maxWidth: 620, width: '90%', maxHeight: '85vh', overflow: 'auto', padding: '32px 28px' };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };
  var btnPrimary = { background: 'linear-gradient(135deg, ' + primary + ', ' + accent + ')', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" };

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={modal} onClick={function(e) { e.stopPropagation(); }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>Email Setup</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>Custom email domain</div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {STEPS.map(function(s, i) {
            var active = i === step;
            var done = i < step;
            return (
              <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: done ? primary : active ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)' }} />
            );
          })}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 }}>
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </div>

        {/* Error */}
        {error && <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: '#FF3B30', fontSize: 13 }}>{error}</div>}

        {/* Step 1: Domain */}
        {step === 0 && (
          <div>
            <div style={{ color: '#fff', fontSize: 15, marginBottom: 12, lineHeight: 1.6 }}>
              What domain do you send email from? This is the domain after the @ in your email address.
            </div>
            <input value={domain} onChange={function(e) { setDomain(e.target.value); setError(null); }}
              placeholder="yourbusiness.com" style={{ ...inputStyle, marginBottom: 16 }}
              onKeyDown={function(e) { if (e.key === 'Enter' && domain.trim()) handleCreateDomain(); }} />
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginBottom: 20 }}>
              Example: if you send from hello@acme.com, enter <strong style={{ color: 'rgba(255,255,255,0.6)' }}>acme.com</strong>
            </div>
            <button onClick={handleCreateDomain} disabled={loading || !domain.trim()} style={{ ...btnPrimary, opacity: loading || !domain.trim() ? 0.5 : 1 }}>
              {loading ? 'Setting up...' : 'Set up ' + (domain.trim() || 'domain')}
            </button>
          </div>
        )}

        {/* Step 2: DNS Records */}
        {step === 1 && (
          <div>
            <div style={{ color: '#fff', fontSize: 15, marginBottom: 12, lineHeight: 1.6 }}>
              Add these DNS records to verify ownership of <strong style={{ color: primary }}>{domain}</strong>.
            </div>

            {/* Records table */}
            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Type</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>Value</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>TTL</th>
                    <th style={{ padding: '8px 4px', width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(function(r, i) {
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '8px 10px', color: primary, fontWeight: 700, fontFamily: 'monospace' }}>{r.type}</td>
                        <td style={{ padding: '8px 10px', color: '#fff', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>{r.name || r.host || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#fff', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', maxWidth: 200 }}>{r.value || r.content || '—'}</td>
                        <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{r.ttl || 'Auto'}</td>
                        <td style={{ padding: '8px 4px' }}>
                          <button onClick={function() { navigator.clipboard.writeText(r.value || r.content || ''); }}
                            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 10 }}>Copy</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* DNS Provider selector */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8 }}>Where is your DNS managed?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DNS_PROVIDERS.map(function(p) {
                  var selected = dnsProvider === p;
                  return (
                    <button key={p} onClick={function() { handleGetInstructions(p); }}
                      style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                        background: selected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                        border: '1px solid ' + (selected ? primary : 'rgba(255,255,255,0.1)'),
                        color: selected ? primary : 'rgba(255,255,255,0.6)' }}>
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AI-generated instructions */}
            {loadingInstructions && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: 12 }}>Generating instructions for {dnsProvider}...</div>}
            {dnsInstructions && !loadingInstructions && (
              <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ color: '#a5b4fc', fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Instructions for {dnsProvider}</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{dnsInstructions}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={function() { setStep(2); }} style={btnPrimary}>I've added the records</button>
              <button onClick={function() { setStep(0); }} style={btnSec}>Back</button>
            </div>
          </div>
        )}

        {/* Step 3: Verify */}
        {step === 2 && (
          <div>
            <div style={{ color: '#fff', fontSize: 15, marginBottom: 16, lineHeight: 1.6 }}>
              Checking if <strong style={{ color: primary }}>{domain}</strong> is verified...
            </div>
            {verifyStatus === 'verified' || verifyStatus === 'active' ? (
              <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ color: '#10b981', fontWeight: 700, fontSize: 14 }}>Domain verified</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>{domain} is ready to send email.</div>
              </div>
            ) : verifyStatus === 'pending' || verifyStatus === 'not_started' ? (
              <div style={{ background: 'rgba(255,214,0,0.08)', border: '1px solid rgba(255,214,0,0.2)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ color: '#FFD600', fontWeight: 700, fontSize: 14 }}>DNS propagation in progress</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>
                  DNS changes can take up to 48 hours to propagate, but usually complete within 5-15 minutes.
                  Click "Check again" to retry.
                </div>
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleVerify} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.5 : 1 }}>
                {loading ? 'Checking...' : verifyStatus ? 'Check again' : 'Verify domain'}
              </button>
              <button onClick={function() { setStep(1); }} style={btnSec}>Back to DNS records</button>
            </div>
          </div>
        )}

        {/* Step 4: From Address */}
        {step === 3 && (
          <div>
            <div style={{ color: '#fff', fontSize: 15, marginBottom: 16, lineHeight: 1.6 }}>
              What name and email address should outbound emails come from?
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block', fontWeight: 700 }}>From Name</label>
              <input value={fromName} onChange={function(e) { setFromName(e.target.value); }} placeholder="Joe White" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block', fontWeight: 700 }}>From Email</label>
              <input value={fromEmail} onChange={function(e) { setFromEmail(e.target.value); }} placeholder={'hello@' + domain} style={inputStyle} />
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 4 }}>Must end with @{domain}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', marginBottom: 8 }}>Preview</div>
              <div style={{ color: '#fff', fontSize: 14 }}>From: <strong>{fromName || 'Your Name'}</strong> &lt;{fromEmail || 'hello@' + domain}&gt;</div>
            </div>
            <button onClick={handleSaveConfig} disabled={loading || !fromEmail || !fromName} style={{ ...btnPrimary, opacity: loading || !fromEmail || !fromName ? 0.5 : 1 }}>
              {loading ? 'Saving...' : 'Save & continue'}
            </button>
          </div>
        )}

        {/* Step 5: Test Send */}
        {step === 4 && (
          <div style={{ textAlign: 'center' }}>
            {testSent ? (
              <div>
                <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Email setup complete!</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 8 }}>
                  All outbound emails will now come from <strong style={{ color: primary }}>{fromEmail}</strong>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginBottom: 24 }}>Check your inbox for the test email.</div>
                <button onClick={onComplete} style={btnPrimary}>Done</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Configuration saved!</div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 24 }}>
                  Send a test email to verify everything works.
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <button onClick={handleTestSend} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.5 : 1 }}>
                    {loading ? 'Sending...' : 'Send test email'}
                  </button>
                  <button onClick={onComplete} style={btnSec}>Skip</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
