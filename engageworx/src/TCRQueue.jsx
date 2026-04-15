import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function TCRQueue({ C }) {
  var colors = C || { bg: '#080d1a', surface: '#0d1425', border: '#182440', primary: '#00C9FF', accent: '#E040FB', text: '#E8F4FD', muted: '#6B8BAE' };
  var [submissions, setSubmissions] = useState([]);
  var [loading, setLoading] = useState(true);
  var [selected, setSelected] = useState(null);
  var [submitting, setSubmitting] = useState(false);
  var [checking, setChecking] = useState(false);
  var [polling, setPolling] = useState(false);
  var [filterStatus, setFilterStatus] = useState('all');

  useEffect(function() { loadSubmissions(); }, []);

  async function loadSubmissions() {
    setLoading(true);
    try {
      var res = await supabase.from('tcr_submissions').select('*, tenants(id, name)').order('created_at', { ascending: false });
      setSubmissions(res.data || []);
    } catch (e) { console.error('[TCR Queue] Load error:', e.message); }
    setLoading(false);
  }

  async function handleSubmitToTCR(submissionId) {
    if (!window.confirm('Submit this registration to Twilio TCR? This cannot be undone.')) return;
    setSubmitting(true);
    try {
      var resp = await fetch('/api/tcr?action=submit-tcr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId }),
      });
      var data = await resp.json();
      if (data.success) {
        alert('Submitted to Twilio TCR. Brand SID: ' + (data.brand_sid || 'N/A'));
        setSelected(null);
        loadSubmissions();
      } else {
        alert('Submit failed: ' + (data.error || 'Unknown error'));
      }
    } catch (e) { alert('Submit error: ' + e.message); }
    setSubmitting(false);
  }

  async function handleCheckStatus(submissionId) {
    setChecking(true);
    try {
      var resp = await fetch('/api/tcr?action=check-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId }),
      });
      var data = await resp.json();
      if (data.error) {
        alert('Check failed: ' + data.error);
      } else {
        var msg = 'Brand status: ' + (data.brand_status || 'unknown');
        if (data.brand_score) msg += '\nBrand score: ' + data.brand_score;
        if (data.failure_reason) msg += '\nFailure: ' + data.failure_reason;
        if (data.changed) msg += '\n\n✓ Status updated to: ' + data.new_status;
        else msg += '\n\n(No status change)';
        alert(msg);
        if (data.changed) { setSelected(null); loadSubmissions(); }
      }
    } catch (e) { alert('Check error: ' + e.message); }
    setChecking(false);
  }

  async function handlePollAll() {
    if (!window.confirm('Poll Twilio for all pending submissions? This can take a moment.')) return;
    setPolling(true);
    try {
      var resp = await fetch('/api/tcr?action=poll-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      var data = await resp.json();
      alert('Polled ' + (data.checked || 0) + ' submission(s). ' + (data.changed || 0) + ' status change(s).');
      loadSubmissions();
    } catch (e) { alert('Poll error: ' + e.message); }
    setPolling(false);
  }

  var filtered = submissions.filter(function(s) {
    if (filterStatus === 'all') return true;
    return s.status === filterStatus;
  });

  var statusColors = {
    draft: '#6B8BAE',
    pending_review: '#FFD600',
    ai_review: '#00C9FF',
    submitted: '#00C9FF',
    brand_pending: '#FF6B35',
    brand_approved: '#00E676',
    campaign_pending: '#FF6B35',
    campaign_approved: '#00E676',
    completed: '#00E676',
    rejected: '#FF3B30',
  };

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 };
  var btnPrimary = { background: 'linear-gradient(135deg, ' + colors.primary + ', ' + colors.accent + ')', border: 'none', borderRadius: 8, padding: '10px 20px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 16px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif" };

  return (
    <div style={{ padding: '32px 40px', minHeight: '100vh', background: colors.bg, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>📋 TCR Queue</h1>
          <p style={{ color: colors.muted, marginTop: 4, fontSize: 14 }}>Pending A2P 10DLC registrations awaiting SP admin review + TCR submission</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handlePollAll} disabled={polling} style={Object.assign({}, btnSec, { opacity: polling ? 0.6 : 1 })}>
            {polling ? '⏳ Polling...' : '📡 Poll Twilio Now'}
          </button>
          <button onClick={loadSubmissions} style={btnSec}>🔄 Refresh</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total', value: submissions.length, color: colors.primary },
          { label: 'Pending Review', value: submissions.filter(function(s) { return s.status === 'pending_review'; }).length, color: '#FFD600' },
          { label: 'Submitted to TCR', value: submissions.filter(function(s) { return ['submitted','brand_pending','campaign_pending'].includes(s.status); }).length, color: '#00C9FF' },
          { label: 'Approved', value: submissions.filter(function(s) { return s.status === 'completed'; }).length, color: '#00E676' },
          { label: 'Rejected', value: submissions.filter(function(s) { return s.status === 'rejected'; }).length, color: '#FF3B30' },
        ].map(function(stat, i) {
          return (
            <div key={i} style={Object.assign({}, card, { textAlign: 'center', padding: 16 })}>
              <div style={{ fontSize: 24, fontWeight: 900, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: colors.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{stat.label}</div>
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'pending_review', 'submitted', 'brand_pending', 'completed', 'rejected'].map(function(s) {
          var active = filterStatus === s;
          return (
            <button key={s} onClick={function() { setFilterStatus(s); }} style={{
              background: active ? colors.primary + '22' : 'transparent',
              border: '1px solid ' + (active ? colors.primary + '44' : 'rgba(255,255,255,0.1)'),
              borderRadius: 8, padding: '6px 14px',
              color: active ? colors.primary : colors.muted,
              cursor: 'pointer', fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
            }}>{s.replace(/_/g, ' ')}</button>
          );
        })}
      </div>

      {/* Table */}
      <div style={card}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>Loading submissions...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>No submissions</div>
            <div style={{ color: colors.muted, fontSize: 13, marginTop: 6 }}>TCR registrations from tenants will appear here.</div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px 120px', gap: 12, padding: '8px 14px', fontSize: 11, color: colors.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>Tenant</div>
              <div>Use Case</div>
              <div>Volume</div>
              <div>Status</div>
              <div style={{ textAlign: 'center' }}>AI Score</div>
              <div style={{ textAlign: 'right' }}>Actions</div>
            </div>
            {filtered.map(function(s) {
              var aiScore = s.ai_review_result && s.ai_review_result.score ? s.ai_review_result.score : null;
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px 120px', gap: 12, alignItems: 'center', padding: '14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{s.legal_name || (s.tenants && s.tenants.name) || 'Unknown'}</div>
                    <div style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>{s.contact_email || '—'}</div>
                  </div>
                  <div style={{ color: colors.text, fontSize: 13 }}>{s.use_case || '—'}</div>
                  <div style={{ color: colors.text, fontSize: 13 }}>{s.message_volume || '—'}</div>
                  <div>
                    <span style={{
                      background: (statusColors[s.status] || colors.muted) + '22',
                      color: statusColors[s.status] || colors.muted,
                      border: '1px solid ' + (statusColors[s.status] || colors.muted) + '44',
                      borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700,
                    }}>{(s.status || 'draft').replace(/_/g, ' ')}</span>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {aiScore !== null ? (
                      <span style={{ color: aiScore >= 80 ? '#00E676' : aiScore >= 60 ? '#FFD600' : '#FF3B30', fontWeight: 700, fontSize: 14 }}>{aiScore}</span>
                    ) : <span style={{ color: colors.muted }}>—</span>}
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {s.status === 'completed' && (
                      <button title="Mark as featured template (Claude few-shot)" onClick={async function() {
                        try {
                          var r = await supabase.from('tcr_approved_templates').select('id').eq('source_submission_id', s.id).maybeSingle();
                          if (r.data && r.data.id) {
                            await supabase.from('tcr_approved_templates').update({ is_featured: true }).eq('id', r.data.id);
                          } else {
                            await supabase.from('tcr_approved_templates').insert({
                              source_submission_id: s.id, tenant_id: s.tenant_id,
                              use_case: s.use_case || null,
                              campaign_description: s.use_case_description || null,
                              sample_messages: s.sample_messages || null,
                              opt_in_description: s.opt_in_description || null,
                              is_featured: true,
                            });
                          }
                          alert('⭐ Marked as featured template — Claude will now prioritise this in few-shot examples.');
                        } catch (e) { alert('Error: ' + e.message); }
                      }} style={Object.assign({}, btnSec, { background: 'rgba(245,158,11,0.15)', borderColor: 'rgba(245,158,11,0.4)', color: '#fcd34d' })}>⭐ Template</button>
                    )}
                    <button onClick={function() { setSelected(s); }} style={btnSec}>Review</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selected && (
        <div onClick={function(e) { if (e.target === e.currentTarget) setSelected(null); }} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 14, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ color: '#fff', fontSize: 22, fontWeight: 900 }}>{selected.legal_name || 'Unknown'}</div>
                <div style={{ color: colors.muted, fontSize: 13, marginTop: 2 }}>{selected.contact_email}</div>
              </div>
              <button onClick={function() { setSelected(null); }} style={{ background: 'transparent', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>

            {selected.ai_review_result && selected.ai_review_result.score !== undefined && (
              <div style={{ background: 'rgba(0,201,255,0.08)', border: '1px solid rgba(0,201,255,0.22)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', border: '3px solid ' + (selected.ai_review_result.score >= 80 ? '#00E676' : '#FF6B35'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: selected.ai_review_result.score >= 80 ? '#00E676' : '#FF6B35', fontWeight: 900, fontSize: 20 }}>{selected.ai_review_result.score}</span>
                  </div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>AI Compliance Score</div>
                    <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                      {selected.ai_review_result.issues && selected.ai_review_result.issues.length > 0
                        ? selected.ai_review_result.issues.length + ' issue(s) flagged'
                        : 'No issues detected'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              {[
                { label: 'DBA', value: selected.dba },
                { label: 'Entity Type', value: selected.entity_type },
                { label: 'EIN', value: selected.ein },
                { label: 'Industry', value: selected.vertical },
                { label: 'Website', value: selected.website },
                { label: 'Phone', value: selected.contact_phone },
                { label: 'Use Case', value: selected.use_case },
                { label: 'Volume', value: selected.message_volume },
              ].map(function(item, i) {
                return (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ color: colors.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{item.label}</div>
                    <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{item.value || '—'}</div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Campaign Description</div>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 14, color: colors.text, fontSize: 13, lineHeight: 1.6 }}>{selected.use_case_description || '—'}</div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Sample Messages ({(selected.sample_messages || []).length})</div>
              {(selected.sample_messages || []).map(function(m, i) {
                return (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px', marginBottom: 6, color: colors.text, fontSize: 13 }}>
                    <span style={{ color: colors.muted, fontSize: 11, marginRight: 6 }}>{i + 1}.</span>{m}
                  </div>
                );
              })}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Opt-in Description</div>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 14, color: colors.text, fontSize: 13, lineHeight: 1.6 }}>{selected.opt_in_description || '—'}</div>
            </div>

            {selected.rejection_reason && (
              <div style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.22)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
                <div style={{ color: '#FF3B30', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Rejection Reason</div>
                <div style={{ color: colors.muted, fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{selected.rejection_reason}</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid ' + colors.border, paddingTop: 16 }}>
              <button onClick={function() { setSelected(null); }} style={btnSec}>Close</button>
              {selected.tcr_brand_id && ['submitted','brand_pending','campaign_pending'].includes(selected.status) && (
                <button onClick={function() { handleCheckStatus(selected.id); }} disabled={checking} style={Object.assign({}, btnSec, { opacity: checking ? 0.6 : 1 })}>
                  {checking ? '⏳ Checking...' : '📡 Check Status'}
                </button>
              )}
              {(selected.status === 'pending_review' || selected.status === 'rejected') && (
                <button onClick={function() { handleSubmitToTCR(selected.id); }} disabled={submitting} style={Object.assign({}, btnPrimary, { opacity: submitting ? 0.6 : 1 })}>
                  {submitting ? 'Submitting...' : '🚀 Submit to Twilio TCR'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
