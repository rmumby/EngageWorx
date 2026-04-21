import { useState, useEffect } from "react";
import { supabase } from './supabaseClient';

function daysSince(d) {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function statusColor(status) {
  if (status === 'active') return '#10b981';
  if (status === 'completed') return '#6366f1';
  if (status === 'paused') return '#f59e0b';
  if (status === 'cancelled') return '#ef4444';
  return '#64748b';
}

export default function SequenceRoster({ C, currentTenantId }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', bg: '#080d1a', surface: '#0d1425', border: '#182440', text: '#E8F4FD', muted: '#6B8BAE' };

  var [sequences, setSequences] = useState([]);
  var [selectedSeq, setSelectedSeq] = useState(null);
  var [enrolments, setEnrolments] = useState([]);
  var [loading, setLoading] = useState(false);
  var [seqLoading, setSeqLoading] = useState(true);
  var [filter, setFilter] = useState('all');
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

  useEffect(function() {
    if (!selectedSeq) return;
    setLoading(true);
    fetch('/api/sequences?action=roster&sequence_id=' + selectedSeq)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        setEnrolments(d.enrolments || []);
        setLoading(false);
      })
      .catch(function() { setLoading(false); });
  }, [selectedSeq]);

  var filtered = enrolments.filter(function(e) {
    if (filter !== 'all' && e.status !== filter) return false;
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

  var stats = {
    active: enrolments.filter(function(e) { return e.status === 'active'; }).length,
    completed: enrolments.filter(function(e) { return e.status === 'completed'; }).length,
    paused: enrolments.filter(function(e) { return e.status === 'paused'; }).length,
    cancelled: enrolments.filter(function(e) { return e.status === 'cancelled'; }).length,
  };

  var inputStyle = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px', color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', outline: 'none' };

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", color: '#f1f5f9', minHeight: '100vh', background: colors.bg }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Sequence Roster</h1>
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>See who is enrolled in each sequence and where they are in the flow</p>
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
                  <button onClick={async function(e) {
                    e.stopPropagation();
                    try {
                      var activeCheck = await supabase.from('lead_sequences').select('id', { count: 'exact', head: true }).eq('sequence_id', s.id).eq('status', 'active');
                      var activeCount = activeCheck.count || 0;
                      if (activeCount > 0) {
                        alert('Cannot delete "' + s.name + '" — ' + activeCount + ' contact(s) are actively enrolled. Pause or complete their enrolments first.');
                        return;
                      }
                    } catch (checkErr) {}
                    if (!window.confirm('Delete "' + s.name + '"? This will remove all steps and unenroll all contacts.')) return;
                    try {
                      await supabase.from('lead_sequences').delete().eq('sequence_id', s.id);
                      await supabase.from('sequence_steps').delete().eq('sequence_id', s.id);
                      await supabase.from('sequences').delete().eq('id', s.id);
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
                    { label: 'Cancelled', value: stats.cancelled, color: '#ef4444' },
                    { label: 'Total', value: enrolments.length, color: colors.primary },
                  ].map(function(s) {
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
                    {['all', 'active', 'completed', 'paused', 'cancelled'].map(function(f) {
                      return (
                        <button key={f} onClick={function() { setFilter(f); }} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: filter === f ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)', color: filter === f ? '#a5b4fc' : '#475569', fontSize: 11, fontWeight: filter === f ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>{f}</button>
                      );
                    })}
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: 12, color: colors.muted }}>{filtered.length} contacts</div>
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
                          {['Contact', 'Step', 'Status', 'Enrolled', 'Next Step', 'Days In'].map(function(h) {
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
                                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: statusColor(e.status) + '22', color: statusColor(e.status), border: '1px solid ' + statusColor(e.status) + '44', textTransform: 'capitalize' }}>{e.status}</span>
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
    </div>
  );
}
