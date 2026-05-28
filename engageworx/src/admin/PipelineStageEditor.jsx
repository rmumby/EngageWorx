import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

var STAGE_TYPES = [
  { id: 'lead', label: 'Lead (entry)', color: '#6366f1' },
  { id: 'active', label: 'Active', color: '#f59e0b' },
  { id: 'closed_won', label: 'Won', color: '#10b981' },
  { id: 'closed_lost', label: 'Lost', color: '#ef4444' },
];

function stageTypeColor(type) {
  var t = STAGE_TYPES.find(function(s) { return s.id === type; });
  return t ? t.color : '#6b7280';
}

export default function PipelineStageEditor({ tenantId, C }) {
  var colors = C || { bg: '#0f172a', surface: '#1e293b', border: '#334155', text: '#f1f5f9', muted: '#94a3b8', primary: '#6366f1' };
  var [stages, setStages] = useState([]);
  var [loading, setLoading] = useState(true);
  var [saving, setSaving] = useState(false);
  var [errors, setErrors] = useState([]);
  var [blockedStages, setBlockedStages] = useState([]);
  var [dirty, setDirty] = useState(false);

  var loadStages = useCallback(async function() {
    if (!tenantId) return;
    try {
      var { data } = await supabase.from('pipeline_stages')
        .select('id, stage_key, display_name, stage_type, sub_stage, display_order, auto_advance')
        .eq('tenant_id', tenantId)
        .order('display_order', { ascending: true });
      setStages(data || []);
      setDirty(false);
      setErrors([]);
      setBlockedStages([]);
    } catch (e) { console.warn('[PipelineStageEditor] Load error:', e.message); }
    setLoading(false);
  }, [tenantId]);

  useEffect(function() { loadStages(); }, [loadStages]);

  function updateStage(idx, field, value) {
    setStages(function(prev) {
      var next = prev.slice();
      next[idx] = Object.assign({}, next[idx], { [field]: value });
      return next;
    });
    setDirty(true);
    setErrors([]);
    setBlockedStages([]);
  }

  function addStage() {
    var order = stages.length + 1;
    setStages(function(prev) {
      return prev.concat([{
        stage_key: 'new_stage_' + order,
        display_name: 'New Stage',
        stage_type: 'active',
        sub_stage: null,
        display_order: order,
        auto_advance: false,
        _isNew: true,
      }]);
    });
    setDirty(true);
  }

  function removeStage(idx) {
    setStages(function(prev) { return prev.filter(function(_, i) { return i !== idx; }); });
    setDirty(true);
    setErrors([]);
    setBlockedStages([]);
  }

  function moveStage(idx, direction) {
    var targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= stages.length) return;
    setStages(function(prev) {
      var next = prev.slice();
      var temp = next[idx];
      next[idx] = next[targetIdx];
      next[targetIdx] = temp;
      return next;
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setErrors([]);
    setBlockedStages([]);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data?.session?.access_token || '';
      var payload = stages.map(function(s, i) {
        return {
          stage_key: s.stage_key,
          display_name: s.display_name,
          stage_type: s.stage_type,
          sub_stage: s.sub_stage || null,
          display_order: i + 1,
          auto_advance: !!s.auto_advance,
        };
      });
      var resp = await fetch('/api/pipeline-stages/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ tenant_id: tenantId, stages: payload }),
      });
      var data = await resp.json();
      if (resp.status === 409 && data.blocked_stages) {
        setBlockedStages(data.blocked_stages);
      } else if (resp.status === 400 && data.errors) {
        setErrors(data.errors);
      } else if (!resp.ok) {
        setErrors([data.error || 'Save failed']);
      } else {
        setStages(data.stages || []);
        setDirty(false);
      }
    } catch (e) { setErrors([e.message]); }
    setSaving(false);
  }

  var inputStyle = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '7px 10px', color: colors.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
  var btnSec = { background: 'transparent', border: '1px solid ' + colors.border, borderRadius: 6, padding: '5px 10px', color: colors.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' };

  // Count stages by type for the invariant indicators
  var typeCounts = { lead: 0, active: 0, closed_won: 0, closed_lost: 0 };
  stages.forEach(function(s) { if (typeCounts[s.stage_type] !== undefined) typeCounts[s.stage_type]++; });

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ color: colors.text, fontSize: 16, fontWeight: 700, margin: 0 }}>Pipeline Stages</h3>
          <p style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Customize your pipeline stages. Drag to reorder, set type per stage.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={addStage} style={{ background: colors.primary + '22', border: '1px solid ' + colors.primary + '55', borderRadius: 8, padding: '6px 14px', color: colors.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>+ Add Stage</button>
          {dirty && <button onClick={handleSave} disabled={saving} style={{ background: colors.primary, border: 'none', borderRadius: 8, padding: '6px 14px', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : 'Save Changes'}</button>}
        </div>
      </div>

      {/* Invariant indicators */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {STAGE_TYPES.map(function(t) {
          var count = typeCounts[t.id] || 0;
          var required = t.id === 'lead' ? 1 : (t.id === 'active' ? 0 : 1);
          var ok = t.id === 'lead' ? count === 1 : count >= required;
          return <span key={t.id} style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: ok ? t.color + '15' : '#ef444415', color: ok ? t.color : '#ef4444', border: '1px solid ' + (ok ? t.color + '33' : '#ef444433') }}>
            {t.label}: {count}{t.id === 'lead' ? ' (exactly 1)' : t.id !== 'active' ? ' (min 1)' : ''}
          </span>;
        })}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div style={{ background: '#ef444410', border: '1px solid #ef444433', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          {errors.map(function(e, i) { return <div key={i} style={{ color: '#ef4444', fontSize: 12, marginBottom: i < errors.length - 1 ? 4 : 0 }}>{e}</div>; })}
        </div>
      )}

      {/* Blocked stages (409 — leads exist) */}
      {blockedStages.length > 0 && (
        <div style={{ background: '#f59e0b10', border: '1px solid #f59e0b33', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Cannot remove stages with leads:</div>
          {blockedStages.map(function(b, i) {
            return <div key={i} style={{ color: '#f59e0b', fontSize: 12, marginBottom: 4 }}>
              "{b.stage_key}" has {b.lead_count} lead{b.lead_count !== 1 ? 's' : ''}. Move leads to another stage in the Pipeline view, then try again.
            </div>;
          })}
        </div>
      )}

      {/* Stage list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>Loading...</div>
      ) : stages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
          <div style={{ color: colors.text, fontWeight: 600, marginBottom: 4 }}>No pipeline stages</div>
          <div style={{ fontSize: 12 }}>Click "+ Add Stage" to create your pipeline.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {stages.map(function(stage, idx) {
            var typeColor = stageTypeColor(stage.stage_type);
            return (
              <div key={stage.id || stage.stage_key + '_' + idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 10, padding: '8px 12px', borderLeft: '4px solid ' + typeColor }}>
                {/* Order controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                  <button onClick={function() { moveStage(idx, -1); }} disabled={idx === 0} style={{ background: 'none', border: 'none', color: idx === 0 ? 'rgba(255,255,255,0.1)' : colors.muted, cursor: idx === 0 ? 'default' : 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}>▲</button>
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10, textAlign: 'center' }}>{idx + 1}</span>
                  <button onClick={function() { moveStage(idx, 1); }} disabled={idx === stages.length - 1} style={{ background: 'none', border: 'none', color: idx === stages.length - 1 ? 'rgba(255,255,255,0.1)' : colors.muted, cursor: idx === stages.length - 1 ? 'default' : 'pointer', fontSize: 10, padding: 0, lineHeight: 1 }}>▼</button>
                </div>

                {/* Display name */}
                <input value={stage.display_name} onChange={function(e) { updateStage(idx, 'display_name', e.target.value); }} style={Object.assign({}, inputStyle, { flex: 1, minWidth: 120 })} />

                {/* Stage key (auto-generated from display_name for new stages, read-only for existing) */}
                <input value={stage.stage_key} onChange={function(e) { if (stage._isNew) updateStage(idx, 'stage_key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')); }} readOnly={!stage._isNew} style={Object.assign({}, inputStyle, { width: 140, fontSize: 11, fontFamily: 'monospace', opacity: stage._isNew ? 1 : 0.5 })} title={stage._isNew ? 'Set stage key (lowercase, underscores)' : 'Stage key is fixed after creation'} />

                {/* Stage type selector */}
                <select value={stage.stage_type} onChange={function(e) { updateStage(idx, 'stage_type', e.target.value); }} style={Object.assign({}, inputStyle, { width: 100, color: typeColor, fontWeight: 600 })}>
                  {STAGE_TYPES.map(function(t) { return <option key={t.id} value={t.id} style={{ color: '#000' }}>{t.label}</option>; })}
                </select>

                {/* Delete */}
                <button onClick={function() { removeStage(idx); }} style={Object.assign({}, btnSec, { color: '#ef4444', borderColor: '#ef444444', padding: '4px 8px', fontSize: 13 })} title="Remove stage">✕</button>
              </div>
            );
          })}
        </div>
      )}

      {dirty && <div style={{ color: colors.muted, fontSize: 11, marginTop: 8, fontStyle: 'italic' }}>Unsaved changes. Click "Save Changes" to apply.</div>}
    </div>
  );
}
