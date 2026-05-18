import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export default function LeadPickerModal({ sequenceId, sequenceName, tenantId, C, onClose, onEnrolled }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', bg: '#080d1a', surface: '#0d1425', border: '#182440', text: '#E8F4FD', muted: '#6B8BAE' };

  var [leads, setLeads] = useState([]);
  var [loading, setLoading] = useState(true);
  var [search, setSearch] = useState('');
  var [selected, setSelected] = useState({});
  var [enrolledMap, setEnrolledMap] = useState({});
  var [enrolling, setEnrolling] = useState(false);
  var [result, setResult] = useState(null);
  var [allowReEnrol, setAllowReEnrol] = useState(false);
  var [activityFilter, setActivityFilter] = useState(null); // null, 30, 60, 90

  useEffect(function() {
    if (!tenantId || !sequenceId) return;
    setLoading(true);

    Promise.all([
      supabase.from('leads').select('id, name, email, company, phone, urgency, last_activity_at, pipeline_stage_id').eq('tenant_id', tenantId).eq('archived', false).order('last_activity_at', { ascending: false }).limit(500),
      supabase.from('lead_sequences').select('lead_id, status').eq('sequence_id', sequenceId),
    ]).then(function(results) {
      setLeads(results[0].data || []);
      var map = {};
      (results[1].data || []).forEach(function(e) { map[e.lead_id] = e.status; });
      setEnrolledMap(map);
      setLoading(false);
    });
  }, [tenantId, sequenceId]);

  var filtered = leads.filter(function(l) {
    if (search) {
      var q = search.toLowerCase();
      if (!((l.name || '').toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q) || (l.company || '').toLowerCase().includes(q))) return false;
    }
    if (activityFilter) {
      var cutoff = new Date(Date.now() - activityFilter * 86400000).toISOString();
      if (!l.last_activity_at || l.last_activity_at < cutoff) return false;
    }
    return true;
  });

  var selectableCount = filtered.filter(function(l) { return isSelectable(l); }).length;
  var selectedCount = Object.keys(selected).filter(function(k) { return selected[k]; }).length;

  // safeEnrolSequence allows overwrite of 'active' only.
  // Completed/cancelled/paused/replied/error are sticky unless re-enrol toggle is on.
  var STICKY_STATUSES = ['completed', 'cancelled', 'paused', 'replied', 'error'];
  var OVERWRITABLE_WHEN_REENROL = ['completed', 'cancelled'];

  function isSelectable(lead) {
    var status = enrolledMap[lead.id];
    if (!status) return true;
    if (status === 'active') return false; // always blocked
    if (allowReEnrol && OVERWRITABLE_WHEN_REENROL.includes(status)) return true;
    return false;
  }

  function getEnrolBadge(lead) {
    var status = enrolledMap[lead.id];
    if (!status) return null;
    return status;
  }

  function toggleSelect(leadId) {
    setSelected(function(prev) { var n = Object.assign({}, prev); n[leadId] = !n[leadId]; return n; });
  }

  function selectAllVisible() {
    var s = {};
    filtered.forEach(function(l) { if (isSelectable(l)) s[l.id] = true; });
    setSelected(s);
  }

  function clearSelection() { setSelected({}); }

  async function handleEnrol() {
    var selectedLeads = leads.filter(function(l) { return selected[l.id]; });
    if (selectedLeads.length === 0) return;
    setEnrolling(true);
    setResult(null);

    try {
      var resp = await fetch('/api/sequences?action=bulk-enrol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequence_id: sequenceId,
          tenant_id: tenantId,
          leads: selectedLeads.map(function(l) { return { id: l.id, email: l.email }; }),
        }),
      });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Enrollment failed');

      setResult(data);

      if (data.enrolled > 0 && onEnrolled) {
        onEnrolled(data.enrolled);
      }

      // Auto-close after success if no errors
      if (data.errors.length === 0) {
        setTimeout(function() { onClose(); }, 1200);
      }
    } catch (err) {
      setResult({ enrolled: 0, skipped: 0, errors: [err.message] });
    }
    setEnrolling(false);
  }

  var badge = function(color) { return { display: 'inline-block', background: color + '18', color: color, border: '1px solid ' + color + '44', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700 }; };
  var statusColor = function(s) {
    if (s === 'active') return '#10b981';
    if (s === 'completed') return '#6366f1';
    if (s === 'paused') return '#f59e0b';
    if (s === 'cancelled') return '#ef4444';
    return '#64748b';
  };

  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: colors.text, fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };
  var btnPrimary = { background: 'linear-gradient(135deg, ' + colors.primary + ', ' + (colors.accent || colors.primary) + ')', border: 'none', borderRadius: 8, padding: '10px 18px', color: '#000', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 14px', color: colors.text, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={function() { if (!enrolling) onClose(); }}>
      <div onClick={function(e) { e.stopPropagation(); }} style={{ background: colors.surface, border: '1px solid ' + colors.primary + '44', borderRadius: 14, padding: 24, maxWidth: 600, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
          <div>
            <h3 style={{ color: colors.text, margin: 0, fontSize: 16 }}>Add leads to sequence</h3>
            <div style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{sequenceName}</div>
          </div>
          <button onClick={onClose} disabled={enrolling} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {/* Search */}
        <input value={search} onChange={function(e) { setSearch(e.target.value); }} placeholder="Search by name, email, or company..." style={Object.assign({}, inputStyle, { marginBottom: 10, flexShrink: 0 })} />

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, flexShrink: 0 }}>
          {[{ label: 'All', val: null }, { label: '30 days', val: 30 }, { label: '60 days', val: 60 }, { label: '90 days', val: 90 }].map(function(f) {
            var active = activityFilter === f.val;
            return <button key={f.label} onClick={function() { setActivityFilter(f.val); }} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: active ? colors.primary + '22' : 'rgba(255,255,255,0.04)', color: active ? colors.primary : colors.muted, border: '1px solid ' + (active ? colors.primary + '44' : 'rgba(255,255,255,0.08)') }}>{f.val ? 'Active ' + f.label : 'All leads'}</button>;
          })}
          <div style={{ flex: 1 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.muted, cursor: 'pointer' }}>
            <input type="checkbox" checked={allowReEnrol} onChange={function() { setAllowReEnrol(!allowReEnrol); }} style={{ accentColor: colors.primary }} />
            Re-enrol completed/cancelled
          </label>
        </div>

        {/* Select controls */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={selectAllVisible} style={{ background: 'none', border: 'none', color: colors.primary, fontSize: 11, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', padding: 0 }}>Select all ({selectableCount})</button>
          <span style={{ color: colors.muted, fontSize: 11 }}>·</span>
          <button onClick={clearSelection} style={{ background: 'none', border: 'none', color: colors.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Clear</button>
          <div style={{ flex: 1 }} />
          <span style={{ color: colors.muted, fontSize: 11 }}>{selectedCount} selected</span>
        </div>

        {/* Lead list */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, background: 'rgba(0,0,0,0.15)' }}>
          {loading ? (
            <div style={{ color: colors.muted, textAlign: 'center', padding: 40 }}>Loading leads...</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: colors.muted, textAlign: 'center', padding: 40 }}>No leads match your search.</div>
          ) : filtered.map(function(l) {
            var canSelect = isSelectable(l);
            var enrollStatus = getEnrolBadge(l);
            var isChecked = selected[l.id] || false;
            return (
              <div key={l.id} onClick={canSelect ? function() { toggleSelect(l.id); } : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: canSelect ? 'pointer' : 'default', background: isChecked ? colors.primary + '10' : 'transparent', opacity: canSelect ? 1 : 0.5, transition: 'background 0.15s' }}>
                <input type="checkbox" checked={isChecked} disabled={!canSelect} onChange={function() {}} style={{ accentColor: colors.primary, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: colors.text, fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name || l.email || '(unnamed)'}</div>
                  <div style={{ color: colors.muted, fontSize: 11 }}>{[l.email, l.company].filter(Boolean).join(' · ')}</div>
                </div>
                {enrollStatus && <span style={badge(statusColor(enrollStatus))}>{enrollStatus}</span>}
              </div>
            );
          })}
        </div>

        {/* Result banner */}
        {result && (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: result.enrolled > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: '1px solid ' + (result.enrolled > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'), flexShrink: 0 }}>
            {result.enrolled > 0 && <div style={{ color: '#10b981', fontWeight: 700, fontSize: 12 }}>Enrolled {result.enrolled} lead{result.enrolled !== 1 ? 's' : ''}</div>}
            {result.skipped > 0 && <div style={{ color: '#f59e0b', fontSize: 11, marginTop: 2 }}>Skipped {result.skipped} (already enrolled or invalid)</div>}
            {result.errors.length > 0 && result.errors.map(function(err, i) { return <div key={i} style={{ color: '#ef4444', fontSize: 11, marginTop: 2 }}>{err}</div>; })}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} disabled={enrolling} style={btnSec}>Cancel</button>
          <button onClick={handleEnrol} disabled={selectedCount === 0 || enrolling} style={Object.assign({}, btnPrimary, { opacity: (selectedCount === 0 || enrolling) ? 0.5 : 1 })}>
            {enrolling ? 'Enrolling...' : 'Enrol ' + selectedCount + ' lead' + (selectedCount !== 1 ? 's' : '')}
          </button>
        </div>
      </div>
    </div>
  );
}
