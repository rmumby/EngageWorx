import { useState, useEffect } from "react";
import { supabase } from './supabaseClient';

const CHANNELS = ['email', 'sms', 'whatsapp'];

export default function SequenceBuilder({ C, currentTenantId }) {
  var colors = C || { primary: '#00C9FF', accent: '#E040FB', bg: '#080d1a', surface: '#0d1425', border: '#182440', text: '#E8F4FD', muted: '#6B8BAE' };

  var [sequences, setSequences] = useState([]);
  var [selectedSeq, setSelectedSeq] = useState(null);
  var [editingId, setEditingId] = useState(null);
  var [editingName, setEditingName] = useState('');
  var [renameSaving, setRenameSaving] = useState(false);
  var [steps, setSteps] = useState([]);
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);
  var [aiLoading, setAiLoading] = useState(false);
  var [aiGoal, setAiGoal] = useState('');
  var [showAI, setShowAI] = useState(false);
  var [showNew, setShowNew] = useState(false);
  var [newName, setNewName] = useState('');
  var [saveMsg, setSaveMsg] = useState('');

  var inputStyle = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#f1f5f9', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box' };

  function loadSequences() {
    if (!currentTenantId) { setSequences([]); setLoading(false); return; }
    setLoading(true);
    fetch('/api/sequences?action=list&tenant_id=' + currentTenantId)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        setSequences(d.sequences || []);
        setLoading(false);
      })
      .catch(function() { setLoading(false); });
  }

  useEffect(function() { loadSequences(); }, [currentTenantId]);

  function startRename(seq, e) {
    if (e) { e.stopPropagation(); }
    setEditingId(seq.id);
    setEditingName(seq.name || '');
  }
  function cancelRename() {
    setEditingId(null);
    setEditingName('');
  }
  async function saveRename(seq) {
    var trimmed = (editingName || '').trim();
    if (!trimmed) { alert('Sequence name cannot be empty.'); return; }
    if (trimmed === seq.name) { cancelRename(); return; }
    var dupe = sequences.find(function(s) {
      return s.id !== seq.id && (s.name || '').trim().toLowerCase() === trimmed.toLowerCase();
    });
    if (dupe) { alert('Another sequence in this tenant is already named "' + trimmed + '".'); return; }
    setRenameSaving(true);
    try {
      var { error } = await supabase.from('sequences').update({ name: trimmed }).eq('id', seq.id).eq('tenant_id', currentTenantId);
      if (error) throw error;
      setSequences(function(prev) { return prev.map(function(s) { return s.id === seq.id ? Object.assign({}, s, { name: trimmed }) : s; }); });
      if (selectedSeq && selectedSeq.id === seq.id) setSelectedSeq(Object.assign({}, selectedSeq, { name: trimmed }));
      cancelRename();
    } catch (e) { alert('Rename failed: ' + e.message); }
    setRenameSaving(false);
  }

  function selectSequence(seq) {
    setSelectedSeq(seq);
    var sorted = (seq.sequence_steps || []).slice().sort(function(a, b) { return a.step_number - b.step_number; });
    setSteps(sorted.map(function(s) { return Object.assign({}, s); }));
    setSaveMsg('');
  }

  function updateStep(idx, field, val) {
    setSteps(function(prev) {
      var next = prev.slice();
      next[idx] = Object.assign({}, next[idx], { [field]: val });
      return next;
    });
  }

  function addStep() {
    var maxStep = steps.length > 0 ? Math.max.apply(null, steps.map(function(s) { return s.step_number; })) : 0;
    setSteps(function(prev) {
      return prev.concat([{
        id: null,
        sequence_id: selectedSeq ? selectedSeq.id : null,
        step_number: maxStep + 1,
        delay_days: 2,
        channel: 'email',
        subject: '',
        body_template: '',
        ai_personalise: true,
        _new: true,
      }]);
    });
  }

  function removeStep(idx) {
    setSteps(function(prev) { return prev.filter(function(_, i) { return i !== idx; }); });
  }

  async function saveSteps() {
    if (!selectedSeq) return;
    setSaving(true);
    setSaveMsg('');
    try {
      // Delete existing steps and reinsert
      await supabase.from('sequence_steps').delete().eq('sequence_id', selectedSeq.id);
      var inserts = steps.map(function(s, i) {
        return {
          sequence_id: selectedSeq.id,
          step_number: i + 1,
          delay_days: parseInt(s.delay_days) || 0,
          channel: s.channel || 'email',
          subject: s.subject || null,
          body_template: s.body_template || '',
          ai_personalise: s.ai_personalise !== false,
        };
      });
      var res = await supabase.from('sequence_steps').insert(inserts);
      if (res.error) throw res.error;
      setSaveMsg('Saved successfully');
      loadSequences();
      setTimeout(function() { setSaveMsg(''); }, 3000);
    } catch(e) {
      setSaveMsg('Error: ' + e.message);
    }
    setSaving(false);
  }

  async function buildWithAI() {
    if (!aiGoal.trim()) return;
    setAiLoading(true);
    try {
      var prompt = 'You are building an email/SMS outreach sequence for EngageWorx, a B2B communications platform. ' +
        'Goal: ' + aiGoal + '\n\n' +
        'Create a sequence of 5-7 steps mixing email and SMS. For each step provide:\n' +
        '- step_number (1, 2, 3...)\n' +
        '- delay_days (days after previous step, first step is 0)\n' +
        '- channel (email or sms)\n' +
        '- subject (email subject line, null for sms)\n' +
        '- body_template (the message body, use [FirstName], [Company] as placeholders)\n\n' +
        'Respond ONLY with a JSON array of steps, no other text. Example:\n' +
        '[{"step_number":1,"delay_days":0,"channel":"email","subject":"Quick intro","body_template":"Hi [FirstName]..."},...]';

      var resp = await fetch('/api/ai-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      var data = await resp.json();
      var text = (data.content || []).find(function(b) { return b.type === 'text'; });
      if (!text) throw new Error('No response from AI');

      var jsonStr = text.text.trim();
var fence = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
if (jsonStr.indexOf(fence) === 0) {
  jsonStr = jsonStr.split('\n').filter(function(l){ return l.indexOf(fence) !== 0; }).join('\n').trim();
}
var jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
if (!jsonMatch) throw new Error('Could not parse AI response');
var aiSteps = JSON.parse(jsonMatch[0]);

setSteps(aiSteps.map(function(s, i) {
        return {
          id: null,
          sequence_id: selectedSeq ? selectedSeq.id : null,
          step_number: s.step_number || (i + 1),
          delay_days: s.delay_days || 0,
          channel: s.channel || 'email',
          subject: s.subject || '',
          body_template: s.body_template || '',
          ai_personalise: true,
          _new: true,
        };
      }));
      setShowAI(false);
      setAiGoal('');
    } catch(e) {
      alert('AI error: ' + e.message);
    }
    setAiLoading(false);
  }

  async function createNewSequence() {
    if (!newName.trim()) return;
    if (!currentTenantId) { alert('No tenant selected.'); return; }
    setSaving(true);
    try {
      var res = await supabase.from('sequences').insert({
        tenant_id: currentTenantId,
        name: newName.trim(),
        type: 'outreach',
        status: 'active',
      }).select().single();
      if (res.error) throw res.error;
      setShowNew(false);
      setNewName('');
      loadSequences();
      setTimeout(function() {
        setSelectedSeq(Object.assign({}, res.data, { sequence_steps: [] }));
        setSteps([]);
      }, 500);
    } catch(e) {
      alert('Error: ' + e.message);
    }
    setSaving(false);
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: "'DM Sans', sans-serif", color: '#f1f5f9', background: colors.bg }}>
      <div style={{ width: 260, flexShrink: 0, background: colors.surface, borderRight: '1px solid rgba(255,255,255,0.07)', padding: '24px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sequences</div>
          <button onClick={function() { setShowNew(true); }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>+ New</button>
        </div>

        {showNew && (
          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <input value={newName} onChange={function(e) { setNewName(e.target.value); }} placeholder="Sequence name..." style={{ ...inputStyle, marginBottom: 8, fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={createNewSequence} disabled={saving} style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', background: colors.primary, color: '#000', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Create</button>
              <button onClick={function() { setShowNew(false); setNewName(''); }} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ color: colors.muted, fontSize: 13 }}>Loading...</div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sequences.map(function(s) {
              var isSelected = selectedSeq && selectedSeq.id === s.id;
              var isEditing = editingId === s.id;
              if (isEditing) {
                return (
                  <div key={s.id} style={{ marginBottom: 6, padding: '8px 10px', borderRadius: 8, border: '1px solid ' + colors.primary + '66', background: colors.primary + '12' }}>
                    <input
                      autoFocus
                      value={editingName}
                      onChange={function(e) { setEditingName(e.target.value); }}
                      onKeyDown={function(e) {
                        if (e.key === 'Enter') { e.preventDefault(); saveRename(s); }
                        if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                      }}
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 8px', color: '#fff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onClick={function() { saveRename(s); }} disabled={renameSaving} style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none', background: colors.primary, color: '#000', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', opacity: renameSaving ? 0.5 : 1 }}>{renameSaving ? '…' : 'Save'}</button>
                      <button onClick={cancelRename} disabled={renameSaving} style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={s.id} style={{ position: 'relative', marginBottom: 6 }}>
                  <button onClick={function() { selectSequence(s); }} style={{ width: '100%', textAlign: 'left', padding: '10px 30px 10px 12px', borderRadius: 8, border: '1px solid ' + (isSelected ? colors.primary + '44' : 'rgba(255,255,255,0.06)'), background: isSelected ? colors.primary + '15' : 'rgba(255,255,255,0.02)', color: isSelected ? colors.primary : '#94a3b8', fontWeight: isSelected ? 700 : 400, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', display: 'block' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>{(s.sequence_steps || []).length} steps</div>
                  </button>
                  <button
                    title="Rename sequence"
                    onClick={function(e) { startRename(s, e); }}
                    style={{ position: 'absolute', top: 8, right: 6, background: 'transparent', border: 'none', color: isSelected ? colors.primary : '#475569', cursor: 'pointer', fontSize: 13, padding: '4px 6px', borderRadius: 4 }}
                  >✏️</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        {!selectedSeq ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60%', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 48 }}>⚡</div>
            <div style={{ color: colors.muted, fontSize: 14 }}>Select a sequence or create a new one</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>{selectedSeq.name}</h1>
                <div style={{ color: colors.muted, fontSize: 13 }}>{steps.length} steps</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={function() { setShowAI(!showAI); }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(224,64,251,0.3)', background: showAI ? 'rgba(224,64,251,0.2)' : 'rgba(224,64,251,0.08)', color: '#e879f9', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Build with AI</button>
                <button onClick={addStep} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add Step</button>
                <button onClick={saveSteps} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: saving ? 'rgba(0,201,255,0.3)' : colors.primary, color: '#000', fontWeight: 800, fontSize: 12, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>

            {saveMsg && (
              <div style={{ padding: '10px 16px', borderRadius: 8, background: saveMsg.startsWith('Error') ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', border: '1px solid ' + (saveMsg.startsWith('Error') ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'), color: saveMsg.startsWith('Error') ? '#ef4444' : '#10b981', fontSize: 13, marginBottom: 16 }}>{saveMsg}</div>
            )}

            {showAI && (
              <div style={{ background: 'rgba(224,64,251,0.06)', border: '1px solid rgba(224,64,251,0.2)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e879f9', marginBottom: 12 }}>AI Sequence Builder</div>
                <div style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}>Describe your goal and AI will generate the full sequence with subject lines and message bodies.</div>
                <textarea value={aiGoal} onChange={function(e) { setAiGoal(e.target.value); }} placeholder="e.g. CPExpo trade show follow-up sequence for telecom resellers — 7 steps over 21 days mixing email and SMS, focusing on booking a demo call" rows={3} style={{ ...inputStyle, resize: 'vertical', marginBottom: 12, lineHeight: 1.5 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={buildWithAI} disabled={aiLoading || !aiGoal.trim()} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: aiLoading ? 'rgba(224,64,251,0.3)' : 'linear-gradient(135deg, #E040FB, #00C9FF)', color: '#000', fontWeight: 800, fontSize: 13, cursor: aiLoading ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: !aiGoal.trim() ? 0.5 : 1 }}>{aiLoading ? 'Generating...' : 'Generate Sequence'}</button>
                  <button onClick={function() { setShowAI(false); }} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                </div>
              </div>
            )}

            {steps.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: colors.muted, fontSize: 13 }}>
                No steps yet. Add a step or use AI to build the sequence.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {steps.map(function(step, idx) {
                  var channelColor = step.channel === 'email' ? '#6366f1' : step.channel === 'sms' ? '#10b981' : '#25D366';
                  return (
                    <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '3px solid ' + channelColor, borderRadius: 12, padding: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: channelColor + '22', border: '1px solid ' + channelColor + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: channelColor }}>{step.step_number || idx + 1}</div>
                          <select value={step.channel} onChange={function(e) { updateStep(idx, 'channel', e.target.value); }} style={{ ...inputStyle, width: 'auto', padding: '4px 8px', fontSize: 12, background: channelColor + '15', color: channelColor, border: '1px solid ' + channelColor + '44', fontWeight: 700 }}>
                            {CHANNELS.map(function(ch) { return <option key={ch} value={ch}>{ch.toUpperCase()}</option>; })}
                          </select>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: colors.muted }}>Day</span>
                            <input type="number" value={step.delay_days} onChange={function(e) { updateStep(idx, 'delay_days', e.target.value); }} style={{ ...inputStyle, width: 60, padding: '4px 8px', fontSize: 12, textAlign: 'center' }} min="0" />
                            <span style={{ fontSize: 11, color: colors.muted }}>after previous</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: colors.muted, cursor: 'pointer' }}>
                            <input type="checkbox" checked={step.ai_personalise !== false} onChange={function(e) { updateStep(idx, 'ai_personalise', e.target.checked); }} style={{ accentColor: colors.primary }} />
                            AI personalise
                          </label>
                          <button onClick={function() { removeStep(idx); }} style={{ padding: '4px 8px', borderRadius: 5, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                        </div>
                      </div>

                      {step.channel === 'email' && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Subject Line</div>
                          <input value={step.subject || ''} onChange={function(e) { updateStep(idx, 'subject', e.target.value); }} placeholder="e.g. Quick follow-up from CPExpo..." style={{ ...inputStyle, fontSize: 13 }} />
                        </div>
                      )}

                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: colors.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Message Body</div>
                        <textarea value={step.body_template || ''} onChange={function(e) { updateStep(idx, 'body_template', e.target.value); }} placeholder="Hi [FirstName], ..." rows={5} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, fontSize: 13 }} />
                        <div style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>Use [FirstName], [Company], [Platform] as placeholders — AI will personalise on send.</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
