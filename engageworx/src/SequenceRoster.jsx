import { useState, useEffect } from "react";
import { supabase } from './supabaseClient';
import LeadPickerModal from './components/LeadPickerModal';

function daysSince(d) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

// Normalize raw forensic status strings to display categories.
// Raw values like 'cancelled_round3', 'cancelled_round5_safeenrol_bug' are
// preserved in the DB as audit trail — only the UI display is normalized.
function normalizeStatus(raw) {
  if (!raw) return { display: 'unknown', color: '#64748b' };
  if (raw === 'paused_emergency') return { display: 'Paused (emergency)', color: '#b91c1c' };
  if (raw.startsWith('cancelled')) return { display: 'Cancelled', color: '#ef4444' };
  if (raw.startsWith('paused')) return { display: 'Paused', color: '#f59e0b' };
  if (raw === 'active') return { display: 'Active', color: '#10b981' };
  if (raw === 'completed') return { display: 'Completed', color: '#6366f1' };
  if (raw === 'error') return { display: 'Error', color: '#dc2626' };
  if (raw === 'replied') return { display: 'Replied', color: '#06b6d4' };
  return { display: raw, color: '#64748b' };
}

function statusColor(status) {
  return normalizeStatus(status).color;
}

var STATUS_TOOLTIPS = {
  active: 'Sequence is running — next step will send on schedule',
  completed: 'All steps sent — sequence finished',
  paused: 'Paused — rate limit, missing data, or manual pause',
  paused_emergency: 'Emergency kill-switch — all processing halted by admin',
  cancelled: 'Cancelled — will not send further steps',
  error: 'Step failed — click to see error details',
  replied: 'Contact replied — sequence stopped automatically',
};

export default function SequenceRoster({ C, currentTenantId }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', bg: '#080d1a', surface: '#0d1425', border: '#182440', text: '#E8F4FD', muted: '#6B8BAE' };

  var [sequences, setSequences] = useState([]);
  var [selectedSeq, setSelectedSeq] = useState(null);
  var [enrolments, setEnrolments] = useState([]);
  var [loading, setLoading] = useState(false);
  var [seqLoading, setSeqLoading] = useState(true);
  var [filter, setFilter] = useState('all');
  var [showLeadPicker, setShowLeadPicker] = useState(false);
  var [search, setSearch] = useState('');

  useEffect(function() {
    if (!currentTenantId) { setSequences([]); setSeqLoading(false); return; }
    setSeqLoading(true);
    fetch('/api/sequences?action=list&tenant_id=' + currentTenantId)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        setSequences(d.sequences || []);
        if (d.sequences && d.sequences.length > 0) {
          setSelectedSeq(d.sequences[0].id);
        }
        setSeqLoading(false);
      })
      .catch(function() { setSeqLoading(false); });
  }, [currentTenantId]);

  function loadRoster() {
    if (!selectedSeq) return;
    setLoading(true);
    fetch('/api/sequences?action=roster&sequence_id=' + selectedSeq)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        setEnrolments(d.enrolments || []);
        setLoading(false);
      })
      .catch(function() { setLoading(false); });
  }

  useEffect(function() { loadRoster(); }, [selectedSeq]);

  var filtered = enrolments.filter(function(e) {
    if (filter !== 'all') {
      var norm = normalizeStatus(e.status).display.toLowerCase().split(' ')[0];
      if (norm !== filter) return false;
    }
    if (search) {
      var q = search.toLowerCase();
      var lead = e.leads || e.lead_data || {};
      return (lead.company || '').toLowerCase().includes(q) ||
             (lead.name || '').toLowerCase().includes(q) ||
             (lead.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  var selectedSequence = sequences.find(function(s) { return s.id === selectedSeq; });
  var stepCount = selectedSequence && selectedSequence.sequence_steps ? selectedSequence.sequence_steps.length : 0;

  var stats = { active: 0, completed: 0, paused: 0, cancelled: 0, error: 0, replied: 0 };
  enrolments.forEach(function(e) {
    var norm = normalizeStatus(e.status).display.toLowerCase().split(' ')[0]; // 'paused (emergency)' → 'paused'
    if (norm === 'active') stats.active++;
    else if (norm === 'completed') stats.completed++;
    else if (norm === 'paused') stats.paused++;
    else if (norm === 'cancelled') stats.cancelled++;
    else if (norm === 'error') stats.error++;
    else if (norm === 'replied') stats.replied++;
  });

  var inputStyle = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px', color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', outline: 'none' };

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", color: '#f1f5f9', minHeight: '100vh', background: colors.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Sequence Roster</h1>
          <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>See who is enrolled in each sequence and where they are in the flow</p>
        </div>
        {selectedSeq && <button onClick={function() { setShowLeadPicker(true); }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#10b981', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>Add Leads</button>}
      </div>

      {seqLoading ? (
        <div style={{ color: colors.muted, fontSize: 13 }}>Loading sequences...</div>
      ) : sequences.length === 0 ? (
        <div style={{ color: colors.muted, fontSize: 13 }}>No sequences found.</div>
      ) : (
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ width: 240, flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Sequences</div>
            {sequences.map(function(s) {
              var isSelected = selectedSeq === s.id;
              return (
                <div key={s.id} style={{ position: 'relative', marginBottom: 6 }}>
                  <button onClick={function() { setSelectedSeq(s.id); setFilter('all'); setSearch(''); }} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', paddingRight: 36, borderRadius: 9, border: '1px solid ' + (isSelected ? colors.primary + '44' : 'rgba(255,255,255,0.07)'), background: isSelected ? colors.primary + '15' : 'rgba(255,255,255,0.03)', color: isSelected ? colors.primary : '#94a3b8', fontWeight: isSelected ? 700 : 400, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', display: 'block', boxSizing: 'border-box' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>{s.sequence_steps ? s.sequence_steps.length : 0} steps</div>
                  </button>
                  <button type="button" onMouseDown={async function(e) {
                    e.stopPropagation();
                    try {
                      var activeCheck = await supabase.from('lead_sequences').select('id', { count: 'exact', head: true }).eq('sequence_id', s.id).eq('status', 'active');
                      var activeCount = activeCheck.count || 0;
                      if (activeCount > 0) {
                        alert('Cannot delete "' + s.name + '" — ' + activeCount + ' contact(s) are actively enrolled. Pause or complete their enrolments first.');
                        return;
                      }
                    } catch (checkErr) {}
                    if (!window.confirm('Delete "' + s.name + '"? Active enrolments will be cancelled. Historical records preserved.')) return;
                    try {
                      var dr = await fetch('/api/sequences?action=delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sequence_id: s.id, tenant_id: s.tenant_id }) });
                      if (!dr.ok) { var dd = await dr.json(); throw new Error(dd.error || 'Delete failed'); }
                      if (selectedSeq === s.id) setSelectedSeq(null);
                      setSequences(function(prev) { return prev.filter(function(seq) { return seq.id !== s.id; }); });
                    } catch(err) { alert('Delete failed: ' + err.message); }
                  }} title="Delete sequence" style={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '4px 7px', color: '#ef4444', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', lineHeight: 1 }}>🗑️</button>
                </div>
              );
            })}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {selectedSequence && (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                  {[
                    { label: 'Active', value: stats.active, color: '#10b981' },
                    { label: 'Completed', value: stats.completed, color: '#6366f1' },
                    { label: 'Paused', value: stats.paused, color: '#f59e0b' },
                    { label: 'Error', value: stats.error, color: '#dc2626' },
                    { label: 'Replied', value: stats.replied, color: '#06b6d4' },
                    { label: 'Total', value: enrolments.length, color: colors.primary },
                  ].filter(function(s) { return s.value > 0 || s.label === 'Total' || s.label === 'Active'; }).map(function(s) {
                    return (
                      <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 16px', textAlign: 'center', minWidth: 80 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{s.label}</div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                  <input placeholder="Search contacts..." value={search} onChange={function(e) { setSearch(e.target.value); }} style={{ ...inputStyle, width: 200 }} />
                  <div style={{ display: 'flex', gap: 4 }}>
                    {['all', 'active', 'completed', 'paused', 'cancelled', 'error', 'replied'].map(function(f) {
                      return (
                        <button key={f} onClick={function() { setFilter(f); }} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: filter === f ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', color: filter === f ? '#a5b4fc' : '#475569', fontSize: 11, fontWeight: filter === f ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>{f}</button>
                      );
                    })}
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: 11, color: colors.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{filtered.length} contacts</span>
                    <span title="Hover any status badge to see details. Variant statuses (e.g. cancelled_round3) are forensic markers preserved for audit — the badge shows the normalized category." style={{ cursor: 'help', opacity: 0.5 }}>ⓘ</span>
                  </div>
                </div>

                {loading ? (
                  <div style={{ color: colors.muted, fontSize: 13, padding: 40, textAlign: 'center' }}>Loading roster...</div>
                ) : filtered.length === 0 ? (
                  <div style={{ color: colors.muted, fontSize: 13, padding: 40, textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                    {enrolments.length === 0 ? 'No one enrolled in this sequence yet.' : 'No contacts match your filter.'}
                  </div>
                ) : (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                          {['Contact', 'Step', 'Status', 'Enrolled', 'Next Step', 'Days In', ''].map(function(h) {
                            return <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: colors.muted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>;
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(function(e) {
                          var lead = e.leads || e.lead_data || {};
                          var stepProgress = stepCount > 0 ? 'Step ' + e.current_step + ' / ' + stepCount : 'Step ' + e.current_step;
                          var pct = stepCount > 0 ? Math.round((e.current_step / stepCount) * 100) : 0;
                          var daysIn = daysSince(e.enrolled_at);
                          var nextDate = e.next_step_at ? new Date(e.next_step_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                          var isOverdue = e.next_step_at && new Date(e.next_step_at) < new Date() && e.status === 'active';

                          return (
                            <tr key={e.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{lead.company || lead.name || 'Unknown'}</div>
                                <div style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>{lead.email || lead.phone || ''}</div>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                <div style={{ fontSize: 12, color: '#f1f5f9', marginBottom: 4 }}>{stepProgress}</div>
                                <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, width: 80 }}>
                                  <div style={{ height: '100%', width: pct + '%', background: e.status === 'completed' ? '#6366f1' : colors.primary, borderRadius: 2 }} />
                                </div>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                {(function() {
                                  var norm = normalizeStatus(e.status);
                                  var tooltipBase = STATUS_TOOLTIPS[e.status] || STATUS_TOOLTIPS[e.status.split('_')[0]] || '';
                                  var tooltip = e.status !== norm.display.toLowerCase() ? (tooltipBase ? tooltipBase + '\n' : '') + 'Raw: ' + e.status : tooltipBase;
                                  return (
                                    <span
                                      title={tooltip}
                                      onClick={e.last_error ? function() { alert('Error: ' + e.last_error + (e.last_error_at ? '\n\nAt: ' + new Date(e.last_error_at).toLocaleString() : '') + '\n\nAttempts: ' + (e.send_attempts || 0)); } : undefined}
                                      style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: norm.color + '22', color: norm.color, border: '1px solid ' + norm.color + '44', cursor: e.last_error ? 'pointer' : 'default' }}>{norm.display}{e.last_error ? ' ⚠' : ''}</span>
                                  );
                                })()}
                              </td>
                              <td style={{ padding: '10px 14px', color: colors.muted, fontSize: 12 }}>
                                {e.enrolled_at ? new Date(e.enrolled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', fontSize: 12, color: isOverdue ? '#ef4444' : colors.muted, fontWeight: isOverdue ? 700 : 400 }}>
                                {nextDate}{isOverdue ? ' !' : ''}
                              </td>
                              <td style={{ padding: '10px 14px', color: colors.muted, fontSize: 12 }}>
                                {daysIn !== null ? daysIn + 'd' : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                {(e.status === 'active' || e.status.startsWith('paused')) ? (
                                  <button onClick={async function() {
                                    var name = lead.company || lead.name || lead.email || 'this contact';
                                    var seqName = (sequences.find(function(s) { return s.id === selectedSeq; }) || {}).name || 'this sequence';
                                    if (!window.confirm('Cancel enrollment for ' + name + ' from ' + seqName + '?')) return;
                                    await supabase.from('lead_sequences').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', e.id);
                                    loadRoster();
                                  }} style={{ background: 'none', border: 'none', color: colors.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 8px', borderRadius: 4, transition: 'color 0.15s' }} onMouseEnter={function(ev) { ev.target.style.color = '#ef4444'; }} onMouseLeave={function(ev) { ev.target.style.color = colors.muted; }} title="Cancel enrollment">Cancel</button>
                                ) : (
                                  <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: 11 }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {showLeadPicker && selectedSeq && (
        <LeadPickerModal
          sequenceId={selectedSeq}
          sequenceName={(sequences.find(function(s) { return s.id === selectedSeq; }) || {}).name || 'Sequence'}
          tenantId={currentTenantId}
          C={C}
          onClose={function() { setShowLeadPicker(false); }}
          onEnrolled={function() { setShowLeadPicker(false); loadRoster(); }}
        />
      )}
    </div>
  );
}
