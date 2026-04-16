import { useState, useEffect } from "react";
import { supabase } from './supabaseClient';

const CPEXPO_SEQUENCE_ID = '2cc4658f-46f6-4425-8300-95bc9213b720';

function parseCSV(text) {
  var lines = text.trim().split('\n').filter(function(l) { return l.trim(); });
  if (lines.length < 2) return [];
  var headers = lines[0].split(',').map(function(h) { return h.trim().toLowerCase().replace(/[^a-z_]/g, '_').replace(/\s+/g, '_'); });
  return lines.slice(1).map(function(line) {
    var vals = [];
    var inQuote = false;
    var cur = '';
    for (var i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuote = !inQuote; }
      else if (line[i] === ',' && !inQuote) { vals.push(cur.trim()); cur = ''; }
      else { cur += line[i]; }
    }
    vals.push(cur.trim());
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = vals[i] || ''; });
    // Normalise common field names
    return {
      first_name: obj.first_name || obj.firstname || obj['first name'] || obj.fname || '',
      last_name: obj.last_name || obj.lastname || obj['last name'] || obj.lname || '',
      email: obj.email || obj['email address'] || obj['e-mail'] || '',
      phone: obj.phone || obj['phone number'] || obj.mobile || obj.cell || '',
      company: obj.company || obj['company name'] || obj.organization || obj.org || '',
      title: obj.title || obj['job title'] || obj.position || obj.role || '',
      notes: obj.notes || obj.note || obj.comments || '',
    };
  }).filter(function(r) { return r.email || r.first_name || r.company; });
}

const SP_TENANT_ID = (process.env.REACT_APP_SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387');

export default function ImportLeads({ C, demoMode = false }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', bg: '#080d1a', surface: '#0d1425', border: '#182440', text: '#E8F4FD', muted: '#6B8BAE' };

  var [csvText, setCsvText] = useState('');
  var [parsed, setParsed] = useState([]);
  var [sequences, setSequences] = useState([]);
  var [selectedSeq, setSelectedSeq] = useState(CPEXPO_SEQUENCE_ID);
  var [enrolling, setEnrolling] = useState(false);
  var [result, setResult] = useState(null);
  var [tab, setTab] = useState('paste'); // 'paste' | 'manual'
  var [selected, setSelected] = useState({});
  var [manualRows, setManualRows] = useState([
    { first_name: '', last_name: '', email: '', phone: '', company: '', title: '' }
  ]);

  useEffect(function() {
    if (demoMode) { setSequences([]); return; }
    fetch('/api/sequences?action=list&tenant_id=' + SP_TENANT_ID)
      .then(function(r) { return r.json(); })
      .then(function(d) { setSequences(d.sequences || []); })
      .catch(function() {});
  }, [demoMode]);

  function handleParse() {
    var rows = parseCSV(csvText);
    setParsed(rows);
    var sel = {};
    rows.forEach(function(_, i) { sel[i] = true; });
    setSelected(sel);
    setResult(null);
  }

  function toggleAll(val) {
    var sel = {};
    parsed.forEach(function(_, i) { sel[i] = val; });
    setSelected(sel);
  }

  async function handleEnrol() {
    var leads = tab === 'paste'
      ? parsed.filter(function(_, i) { return selected[i]; })
      : manualRows.filter(function(r) { return r.email || r.first_name || r.company; });

    if (!leads.length) return alert('No leads selected.');
    if (!selectedSeq) return alert('Select a sequence first.');
    if (demoMode) {
      setResult({ success: true, enrolled: leads.length, skipped: 0, errors: [] });
      return;
    }

    setEnrolling(true);
    setResult(null);
    try {
      var resp = await fetch('/api/sequences?action=bulk-enrol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence_id: selectedSeq, leads: leads, tenant_id: SP_TENANT_ID }),
      });
      var data = await resp.json();
      setResult(data);
    } catch(e) {
      setResult({ success: false, error: e.message });
    }
    setEnrolling(false);
  }

  function addManualRow() {
    setManualRows(function(prev) { return prev.concat([{ first_name: '', last_name: '', email: '', phone: '', company: '', title: '' }]); });
  }

  function updateManualRow(i, field, val) {
    setManualRows(function(prev) {
      var next = prev.slice();
      next[i] = Object.assign({}, next[i], { [field]: val });
      return next;
    });
  }

  function removeManualRow(i) {
    setManualRows(function(prev) { return prev.filter(function(_, j) { return j !== i; }); });
  }

  var inputStyle = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 10px', color: '#f1f5f9', fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
  var selectedCount = tab === 'paste' ? Object.values(selected).filter(Boolean).length : manualRows.filter(function(r) { return r.email || r.first_name || r.company; }).length;
  var seqName = (sequences.find(function(s) { return s.id === selectedSeq; }) || {}).name || 'Selected sequence';

  return (
    <div style={{ padding: '28px 32px', fontFamily: "'DM Sans', sans-serif", color: '#f1f5f9', maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>📥 Import Leads</h1>
        <p style={{ color: colors.muted, fontSize: 13, margin: 0 }}>Bulk upload contacts from CSV or add manually — then enrol in a sequence</p>
      </div>

      {/* Sequence selector */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Enrol in Sequence</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {sequences.length === 0
            ? <div style={{ color: colors.muted, fontSize: 13 }}>Loading sequences...</div>
            : sequences.map(function(s) {
              var isSelected = selectedSeq === s.id;
              return (
                <button key={s.id} onClick={function() { setSelectedSeq(s.id); }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid ' + (isSelected ? colors.primary + '66' : 'rgba(255,255,255,0.1)'), background: isSelected ? colors.primary + '22' : 'rgba(255,255,255,0.04)', color: isSelected ? colors.primary : '#94a3b8', fontWeight: isSelected ? 700 : 400, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {s.name}
                  {s.id === CPEXPO_SEQUENCE_ID && <span style={{ marginLeft: 6, fontSize: 10, background: '#ef444422', color: '#ef4444', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>CPExpo</span>}
                </button>
              );
            })}
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 3, width: 'fit-content' }}>
        {[{ id: 'paste', label: '📋 Paste CSV' }, { id: 'manual', label: '✏️ Manual Entry' }].map(function(t) {
          return (
            <button key={t.id} onClick={function() { setTab(t.id); setResult(null); }} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: tab === t.id ? 700 : 400, fontFamily: 'inherit', background: tab === t.id ? colors.primary + '22' : 'transparent', color: tab === t.id ? colors.primary : 'rgba(255,255,255,0.4)' }}>{t.label}</button>
          );
        })}
      </div>

      {/* CSV Paste tab */}
      {tab === 'paste' && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: colors.muted, marginBottom: 6 }}>Paste CSV below. First row must be headers. Recognised columns: <code style={{ color: colors.primary }}>first_name, last_name, email, phone, company, title, notes</code></div>
            <textarea
              value={csvText}
              onChange={function(e) { setCsvText(e.target.value); setParsed([]); setResult(null); }}
              placeholder={"first_name,last_name,email,company,phone\nJane,Smith,jane@acme.com,Acme Corp,+1 555 0001\nJohn,Doe,john@corp.com,Corp Inc,+1 555 0002"}
              rows={8}
              style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 1.5, padding: '10px 12px', fontSize: 12 }}
            />
            <button onClick={handleParse} disabled={!csvText.trim()} style={{ marginTop: 8, padding: '8px 20px', borderRadius: 7, border: 'none', background: colors.primary, color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: csvText.trim() ? 1 : 0.5 }}>Parse CSV →</button>
          </div>

          {parsed.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{parsed.length} contacts parsed — {Object.values(selected).filter(Boolean).length} selected</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={function() { toggleAll(true); }} style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Select All</button>
                  <button onClick={function() { toggleAll(false); }} style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Deselect All</button>
                </div>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: colors.muted, fontWeight: 600, width: 32 }}></th>
                      {['Name', 'Email', 'Company', 'Phone', 'Title'].map(function(h) {
                        return <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: colors.muted, fontWeight: 600 }}>{h}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map(function(row, i) {
                      var isSelected = selected[i];
                      return (
                        <tr key={i} onClick={function() { setSelected(function(prev) { return Object.assign({}, prev, { [i]: !prev[i] }); }); }} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', background: isSelected ? 'rgba(0,201,255,0.05)' : 'transparent' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <input type="checkbox" checked={!!isSelected} onChange={function() {}} style={{ accentColor: colors.primary, cursor: 'pointer' }} />
                          </td>
                          <td style={{ padding: '8px 12px', color: '#f1f5f9', fontWeight: 600 }}>{[row.first_name, row.last_name].filter(Boolean).join(' ') || '—'}</td>
                          <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{row.email || '—'}</td>
                          <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{row.company || '—'}</td>
                          <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{row.phone || '—'}</td>
                          <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{row.title || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual entry tab */}
      {tab === 'manual' && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                  {['First Name', 'Last Name', 'Email', 'Company', 'Phone', 'Title', ''].map(function(h) {
                    return <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: colors.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {manualRows.map(function(row, i) {
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      {['first_name', 'last_name', 'email', 'company', 'phone', 'title'].map(function(field) {
                        return (
                          <td key={field} style={{ padding: '6px 8px' }}>
                            <input
                              value={row[field]}
                              onChange={function(e) { updateManualRow(i, field, e.target.value); }}
                              style={{ ...inputStyle, width: '100%' }}
                              placeholder={field.replace('_', ' ')}
                            />
                          </td>
                        );
                      })}
                      <td style={{ padding: '6px 8px' }}>
                        <button onClick={function() { removeManualRow(i); }} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 5, color: '#ef4444', cursor: 'pointer', padding: '4px 8px', fontSize: 11, fontFamily: 'inherit' }}>✕</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={addManualRow} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add Row</button>
          </div>
        </div>
      )}

      {/* Enrol button */}
      {(tab === 'manual' || parsed.length > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            onClick={handleEnrol}
            disabled={enrolling || !selectedSeq || selectedCount === 0}
            style={{ padding: '11px 28px', borderRadius: 9, border: 'none', background: enrolling || !selectedSeq || selectedCount === 0 ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg, ' + colors.primary + ', ' + colors.accent + ')', color: enrolling || !selectedSeq || selectedCount === 0 ? 'rgba(255,255,255,0.3)' : '#000', fontWeight: 800, fontSize: 14, cursor: enrolling || !selectedSeq || selectedCount === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}
          >
            {enrolling ? 'Enrolling...' : 'Enrol ' + selectedCount + ' leads in ' + seqName + ' →'}
          </button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ marginTop: 16, padding: '16px 20px', borderRadius: 10, background: result.success ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: '1px solid ' + (result.success ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)') }}>
          {result.success ? (
            <div>
              <div style={{ color: '#10b981', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>✅ Done!</div>
              <div style={{ color: '#94a3b8', fontSize: 13 }}>
                <span style={{ color: '#10b981', fontWeight: 700 }}>{result.enrolled}</span> leads enrolled in <strong>{seqName}</strong>
                {result.skipped > 0 && <span style={{ marginLeft: 12, color: '#f59e0b' }}>{result.skipped} skipped (already enrolled)</span>}
                {result.errors && result.errors.length > 0 && <div style={{ marginTop: 8, color: '#ef4444', fontSize: 11 }}>{result.errors.length} errors: {result.errors.slice(0, 3).join(', ')}</div>}
              </div>
            </div>
          ) : (
            <div style={{ color: '#ef4444', fontSize: 13 }}>❌ Error: {result.error}</div>
          )}
        </div>
      )}
    </div>
  );
}
