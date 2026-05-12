import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import TCRWizardInline from './TCRWizardInline';
import MNOStatusBadges from './MNOStatusBadges';

var STATUS_COLORS = {
  in_progress: { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B', label: 'IN PROGRESS' },
  draft:       { bg: 'rgba(100,116,139,0.12)', color: '#64748b', label: 'DRAFT' },
  submitted:   { bg: 'rgba(59,130,246,0.12)', color: '#3B82F6', label: 'SUBMITTED' },
  approved:    { bg: 'rgba(16,185,129,0.12)', color: '#10b981', label: 'APPROVED' },
  rejected:    { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'REJECTED' },
  abandoned:   { bg: 'rgba(100,116,139,0.12)', color: '#64748b', label: 'ABANDONED' },
};

var DELETABLE = ['in_progress', 'draft'];

function StatusBadge({ status }) {
  var sc = STATUS_COLORS[status] || STATUS_COLORS.in_progress;
  return (
    <span style={{ background: sc.bg, color: sc.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, border: '1px solid ' + sc.color + '33' }}>{sc.label}</span>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TCRTab({ tenantId, C }) {
  var [view, setView] = useState('list');
  var [sessions, setSessions] = useState([]);
  var [loading, setLoading] = useState(true);
  var [activeSessionId, setActiveSessionId] = useState(null);
  var [tenant, setTenant] = useState(null);
  var [deleteTarget, setDeleteTarget] = useState(null);
  var [deleting, setDeleting] = useState(false);

  useEffect(function() {
    if (!tenantId) return;
    loadTenant();
    loadSessions();
  }, [tenantId]);

  async function loadTenant() {
    var { data } = await supabase.from('tenants').select('id, name, phone_supplier, industry').eq('id', tenantId).maybeSingle();
    setTenant(data);
  }

  async function loadSessions() {
    setLoading(true);
    var { data } = await supabase.from('tcr_wizard_sessions').select('*').eq('tenant_id', tenantId).in('status', ['in_progress', 'draft', 'submitted', 'approved', 'rejected']).order('created_at', { ascending: false });
    setSessions(data || []);
    setLoading(false);
  }

  function handleNewRegistration() {
    setActiveSessionId(null);
    setView('wizard');
  }

  function handleResumeSession(id) {
    setActiveSessionId(id);
    setView('wizard');
  }

  function handleWizardClose() {
    setActiveSessionId(null);
    setView('list');
    loadSessions();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      var res = await fetch('/api/tcr-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'delete', session_id: deleteTarget }),
      });
      var data = await res.json();
      if (data.success) {
        loadSessions();
      } else {
        alert(data.error || 'Failed to delete');
      }
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
    setDeleting(false);
    setDeleteTarget(null);
  }

  if (view === 'wizard') {
    return <TCRWizardInline tenantId={tenantId} sessionId={activeSessionId} C={C} onCancel={handleWizardClose} onComplete={handleWizardClose} />;
  }

  var isTwilio = tenant && tenant.phone_supplier === 'twilio';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>10DLC / TCR Registrations</div>
          <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Register your brand and campaigns to send SMS to US carriers.</div>
        </div>
        <button onClick={handleNewRegistration} disabled={isTwilio} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: isTwilio ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #00BFFF, #A855F7)', color: isTwilio ? 'rgba(255,255,255,0.3)' : '#fff', fontWeight: 700, fontSize: 13, cursor: isTwilio ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif" }}>+ New Registration</button>
      </div>

      {isTwilio && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <div style={{ color: '#F59E0B', fontSize: 13 }}>Self-service TCR registration coming soon for your carrier configuration. Contact support for assistance.</div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Loading registrations...</div>
      ) : sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ color: '#fff', fontWeight: 600, fontSize: 16, marginBottom: 6 }}>No registrations yet</div>
          <div style={{ color: C.muted, fontSize: 13, maxWidth: 400, margin: '0 auto' }}>Start a new 10DLC registration to enable SMS messaging in the US. The wizard guides you through brand verification, campaign setup, and compliance review.</div>
        </div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['Brand', 'Campaign', 'Status', 'Carriers', 'Updated', ''].map(function(h) {
                  return <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {sessions.map(function(s) {
                var brandName = (s.brand_data && (s.brand_data.displayName || s.brand_data.legal_name)) || '—';
                var campaignDesc = (s.campaign_data && s.campaign_data.description) ? s.campaign_data.description.substring(0, 50) + (s.campaign_data.description.length > 50 ? '...' : '') : '—';
                var btnLabel = s.status === 'in_progress' ? 'Continue' : s.status === 'rejected' ? 'Resubmit' : 'View';
                var canDelete = DELETABLE.indexOf(s.status) !== -1;
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '12px 14px', color: '#fff', fontSize: 14, fontWeight: 500 }}>{brandName}</td>
                    <td style={{ padding: '12px 14px', color: C.muted, fontSize: 13 }}>{campaignDesc}</td>
                    <td style={{ padding: '12px 14px' }}><StatusBadge status={s.status} /></td>
                    <td style={{ padding: '12px 14px' }}>
                      {(s.status === 'submitted' || s.status === 'approved') && s.mno_status && <MNOStatusBadges mnoStatus={s.mno_status} />}
                    </td>
                    <td style={{ padding: '12px 14px', color: C.muted, fontSize: 12 }}>{formatDate(s.updated_at)}</td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button onClick={function() { handleResumeSession(s.id); }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#00BFFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>{btnLabel} →</button>
                      <button
                        onClick={canDelete ? function() { setDeleteTarget(s.id); } : undefined}
                        disabled={!canDelete}
                        title={canDelete ? 'Delete this registration' : 'Cannot delete after submission. Contact support to archive.'}
                        style={{ marginLeft: 8, padding: '6px 8px', borderRadius: 6, border: '1px solid ' + (canDelete ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)'), background: 'none', color: canDelete ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)', fontSize: 12, cursor: canDelete ? 'pointer' : 'not-allowed', fontFamily: "'DM Sans', sans-serif", transition: 'color 0.15s, border-color 0.15s' }}
                        onMouseEnter={canDelete ? function(e) { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; } : undefined}
                        onMouseLeave={canDelete ? function(e) { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; } : undefined}
                      >🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={function() { if (!deleting) setDeleteTarget(null); }}>
          <div onClick={function(e) { e.stopPropagation(); }} style={{ background: '#0d1425', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '28px 32px', maxWidth: 400, width: '90%' }}>
            <div style={{ fontSize: 20, marginBottom: 12 }}>🗑</div>
            <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Delete this registration?</div>
            <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>This will permanently delete the in-progress registration and all entered data. This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={function() { setDeleteTarget(null); }} disabled={deleting} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#fff', cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 700, cursor: deleting ? 'wait' : 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif", opacity: deleting ? 0.6 : 1 }}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
