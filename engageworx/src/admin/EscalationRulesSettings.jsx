import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

var TRIGGER_TYPES = [
  { id: 'keyword', label: 'Keyword', desc: 'Matches keywords in the inbound message' },
  { id: 'explicit_ask', label: 'Explicit Ask', desc: 'Fires when someone asks to speak to a person' },
];

var ACTION_TYPES = [
  { id: 'notify', label: 'Notify someone', desc: 'Send email to team members' },
  { id: 'pause_concierge', label: 'Pause AI for this conversation', desc: 'A human takes over via LiveInbox' },
  { id: 'send_confirmation', label: 'Send confirmation reply', desc: 'Replaces the AI reply entirely', warning: true },
];

export default function EscalationRulesSettings({ tenantId, C }) {
  var colors = C || { bg: '#0f172a', surface: '#1e293b', border: '#334155', text: '#f1f5f9', muted: '#94a3b8', primary: '#6366f1' };
  var [rules, setRules] = useState([]);
  var [loading, setLoading] = useState(true);
  var [editRule, setEditRule] = useState(null); // null = list view, object = editing
  var [testRule, setTestRule] = useState(null);
  var [notifyMembers, setNotifyMembers] = useState([]);

  var loadRules = useCallback(async function() {
    if (!tenantId) return;
    var session = await supabase.auth.getSession();
    var token = session.data?.session?.access_token || '';
    var resp = await fetch('/api/escalation-rules?tenant_id=' + tenantId, {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    var data = await resp.json();
    setRules(data.rules || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(function() { loadRules(); }, [loadRules]);

  // Load notify-eligible members via service-role endpoint (RLS blocks cross-user reads on tenant_members)
  useEffect(function() {
    if (!tenantId) return;
    (async function() {
      try {
        var session = await supabase.auth.getSession();
        var token = session.data?.session?.access_token || '';
        var resp = await fetch('/api/team/list?tenant_id=' + tenantId, {
          headers: { 'Authorization': 'Bearer ' + token },
        });
        var data = await resp.json();
        var members = (data.members || []).filter(function(m) { return m.notify_email; }).map(function(m) {
          return { id: m.id, user_id: m.user_id, notify_email: m.notify_email, notify_on_escalation: m.notify_on_escalation, displayName: m.displayName || m.notify_email };
        });
        setNotifyMembers(members);
      } catch (e) {
        console.warn('[EscalationRulesSettings] Failed to load team members:', e.message);
      }
    })();
  }, [tenantId]);

  async function handleToggleActive(rule) {
    var session = await supabase.auth.getSession();
    var token = session.data?.session?.access_token || '';
    await fetch('/api/escalation-rules/' + rule.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ active: !rule.active }),
    });
    setRules(function(prev) { return prev.map(function(r) { return r.id === rule.id ? Object.assign({}, r, { active: !r.active }) : r; }); });
  }

  async function handleDelete(rule) {
    if (!window.confirm('Delete rule "' + rule.rule_name + '"?')) return;
    var session = await supabase.auth.getSession();
    var token = session.data?.session?.access_token || '';
    await fetch('/api/escalation-rules/' + rule.id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    });
    setRules(function(prev) { return prev.filter(function(r) { return r.id !== rule.id; }); });
  }

  var card = { background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 12, padding: 20 };
  var btnPrimary = { background: 'linear-gradient(135deg, ' + colors.primary + ', ' + (colors.accent || colors.primary) + ')', color: '#000', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' };
  var btnSec = { background: 'transparent', border: '1px solid ' + colors.border, borderRadius: 6, padding: '5px 10px', color: colors.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: colors.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };

  if (editRule) {
    return <RuleEditor rule={editRule} tenantId={tenantId} colors={colors} inputStyle={inputStyle} btnPrimary={btnPrimary} btnSec={btnSec} notifyMembers={notifyMembers} onSave={function() { setEditRule(null); loadRules(); }} onCancel={function() { setEditRule(null); }} />;
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ color: colors.text, fontSize: 16, fontWeight: 700, margin: 0 }}>Escalation Rules</h3>
          <p style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Rules fire before the AI responds. First matching rule wins. Lower priority number = higher priority.</p>
        </div>
        <button onClick={function() { setEditRule({ _isNew: true, rule_name: '', description: '', trigger_type: 'keyword', trigger_config: { keywords: [], match: 'any' }, actions: [{ type: 'notify', config: {} }], priority: 10, active: true }); }} style={btnPrimary}>+ New Rule</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: colors.muted }}>Loading...</div>
      ) : rules.length === 0 ? (
        <div style={Object.assign({}, card, { textAlign: 'center', padding: 40 })}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔇</div>
          <div style={{ color: colors.text, fontWeight: 600, marginBottom: 4 }}>No escalation rules yet</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>The AI will respond to all inbound messages normally.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {rules.map(function(rule) {
            var actions = (Array.isArray(rule.actions) && rule.actions.length > 0) ? rule.actions : [{ type: rule.action_type }];
            return (
              <div key={rule.id} style={Object.assign({}, card, { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', opacity: rule.active ? 1 : 0.5 })}>
                <button onClick={function() { handleToggleActive(rule); }} style={{ background: rule.active ? '#10b981' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, width: 36, height: 20, cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: rule.active ? 18 : 2, transition: 'left 0.2s' }} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: colors.text, fontWeight: 600, fontSize: 13 }}>{rule.rule_name}</div>
                  <div style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                    <span style={{ padding: '2px 6px', borderRadius: 4, background: colors.primary + '15', color: colors.primary, fontSize: 10, fontWeight: 600, marginRight: 6 }}>{rule.trigger_type}</span>
                    {actions.map(function(a, i) {
                      return <span key={i} style={{ padding: '2px 6px', borderRadius: 4, background: a.type === 'send_confirmation' ? '#ef444420' : 'rgba(255,255,255,0.06)', color: a.type === 'send_confirmation' ? '#ef4444' : colors.muted, fontSize: 10, fontWeight: 600, marginRight: 4 }}>{a.type}</span>;
                    })}
                    <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>priority {rule.priority}</span>
                  </div>
                </div>
                <button onClick={function() { setTestRule(rule); }} style={btnSec}>Test</button>
                <button onClick={function() { setEditRule(Object.assign({}, rule)); }} style={btnSec}>Edit</button>
                <button onClick={function() { handleDelete(rule); }} style={Object.assign({}, btnSec, { color: '#ef4444', borderColor: '#ef444444' })}>Delete</button>
              </div>
            );
          })}
        </div>
      )}

      {testRule && <TestModal rule={testRule} colors={colors} inputStyle={inputStyle} btnSec={btnSec} onClose={function() { setTestRule(null); }} />}
    </div>
  );
}

function RuleEditor({ rule, tenantId, colors, inputStyle, btnPrimary, btnSec, notifyMembers, onSave, onCancel }) {
  var [form, setForm] = useState({
    rule_name: rule.rule_name || '',
    description: rule.description || '',
    trigger_type: rule.trigger_type || 'keyword',
    trigger_config: rule.trigger_config || { keywords: [], match: 'any' },
    actions: (Array.isArray(rule.actions) && rule.actions.length > 0) ? rule.actions : [{ type: 'notify', config: {} }],
    priority: rule.priority || 10,
    active: rule.active !== false,
  });
  var [saving, setSaving] = useState(false);
  var [error, setError] = useState('');
  var [keywordsText, setKeywordsText] = useState((form.trigger_config.keywords || []).join('\n'));

  function update(key, val) { setForm(function(prev) { var u = {}; u[key] = val; return Object.assign({}, prev, u); }); }

  function hasAction(type) { return form.actions.some(function(a) { return a.type === type; }); }

  function toggleAction(type) {
    setForm(function(prev) {
      var existing = prev.actions.filter(function(a) { return a.type === type; });
      if (existing.length > 0) {
        var filtered = prev.actions.filter(function(a) { return a.type !== type; });
        return Object.assign({}, prev, { actions: filtered.length > 0 ? filtered : prev.actions });
      }
      var config = {};
      if (type === 'send_confirmation') config = { message: 'Thanks for reaching out — one of our team will be in touch with you shortly.' };
      if (type === 'notify') {
        var defaultRecipients = notifyMembers.filter(function(m) { return m.notify_on_escalation; }).map(function(m) { return m.notify_email; });
        config = { recipients: defaultRecipients };
      }
      return Object.assign({}, prev, { actions: prev.actions.concat([{ type: type, config: config }]) });
    });
  }

  function updateActionConfig(type, key, val) {
    setForm(function(prev) {
      return Object.assign({}, prev, {
        actions: prev.actions.map(function(a) {
          if (a.type !== type) return a;
          var newConfig = Object.assign({}, a.config || {});
          newConfig[key] = val;
          return Object.assign({}, a, { config: newConfig });
        }),
      });
    });
  }

  function getActionConfig(type) {
    var a = form.actions.find(function(x) { return x.type === type; });
    return a ? (a.config || {}) : {};
  }

  async function handleSave() {
    if (!form.rule_name.trim()) { setError('Rule name is required'); return; }
    if (form.actions.length === 0) { setError('At least one action is required'); return; }
    if (form.trigger_type === 'keyword') {
      var kw = keywordsText.split('\n').map(function(k) { return k.trim(); }).filter(Boolean);
      if (kw.length === 0) { setError('At least one keyword is required'); return; }
      form.trigger_config = { keywords: kw, match: form.trigger_config.match || 'any' };
    }
    setError('');
    setSaving(true);

    try {
      var session = await supabase.auth.getSession();
      var token = session.data?.session?.access_token || '';
      var payload = {
        tenant_id: tenantId,
        rule_name: form.rule_name.trim(),
        description: form.description.trim() || null,
        trigger_type: form.trigger_type,
        trigger_config: form.trigger_config,
        actions: form.actions,
        priority: parseInt(form.priority) || 10,
        active: form.active,
      };

      var url = rule._isNew ? '/api/escalation-rules' : '/api/escalation-rules/' + rule.id;
      var method = rule._isNew ? 'POST' : 'PUT';
      var resp = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(payload),
      });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Save failed');

      onSave();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  var labelStyle = { color: colors.muted, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 };
  var escNotifyMembers = notifyMembers.filter(function(m) { return m.notify_on_escalation; });

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>← Back</button>
        <h3 style={{ color: colors.text, fontSize: 16, fontWeight: 700, margin: 0 }}>{rule._isNew ? 'New Rule' : 'Edit Rule'}</h3>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {/* Name + Active */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
          <div><label style={labelStyle}>Rule Name *</label><input value={form.rule_name} onChange={function(e) { update('rule_name', e.target.value); }} placeholder="e.g. Cancellation mentions" style={inputStyle} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
            <label style={{ color: colors.muted, fontSize: 11 }}>Active</label>
            <button onClick={function() { update('active', !form.active); }} style={{ background: form.active ? '#10b981' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, width: 36, height: 20, cursor: 'pointer', position: 'relative' }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: form.active ? 18 : 2, transition: 'left 0.2s' }} />
            </button>
          </div>
        </div>

        {/* Description */}
        <div><label style={labelStyle}>Description</label><textarea value={form.description} onChange={function(e) { update('description', e.target.value); }} rows={2} placeholder="What this rule does..." style={Object.assign({}, inputStyle, { resize: 'vertical' })} /></div>

        {/* Priority */}
        <div><label style={labelStyle}>Priority (lower = fires first)</label><input type="number" value={form.priority} onChange={function(e) { update('priority', e.target.value); }} style={Object.assign({}, inputStyle, { width: 100 })} /></div>

        {/* Trigger type */}
        <div>
          <label style={labelStyle}>Trigger Type</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {TRIGGER_TYPES.map(function(t) {
              var active = form.trigger_type === t.id;
              return <button key={t.id} onClick={function() { update('trigger_type', t.id); }} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: active ? colors.primary + '20' : 'transparent', color: active ? colors.primary : colors.muted, border: '1px solid ' + (active ? colors.primary + '55' : colors.border) }}>{t.label}</button>;
            })}
          </div>
        </div>

        {/* Trigger config */}
        {form.trigger_type === 'keyword' && (
          <div style={{ padding: 14, background: 'rgba(0,0,0,0.15)', borderRadius: 10 }}>
            <label style={labelStyle}>Keywords (one per line) *</label>
            <textarea value={keywordsText} onChange={function(e) { setKeywordsText(e.target.value); }} rows={4} placeholder={'cancel\nrefund\ncancellation'} style={Object.assign({}, inputStyle, { resize: 'vertical', fontFamily: 'monospace', fontSize: 12 })} />
            <div style={{ marginTop: 8 }}>
              <label style={labelStyle}>Match Mode</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['any', 'all'].map(function(m) {
                  var active = (form.trigger_config.match || 'any') === m;
                  return <button key={m} onClick={function() { update('trigger_config', Object.assign({}, form.trigger_config, { match: m })); }} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: active ? colors.primary + '20' : 'transparent', color: active ? colors.primary : colors.muted, border: '1px solid ' + (active ? colors.primary + '55' : colors.border), textTransform: 'capitalize' }}>{m}</button>;
                })}
              </div>
            </div>
          </div>
        )}
        {form.trigger_type === 'explicit_ask' && (
          <div style={{ padding: 14, background: 'rgba(0,0,0,0.15)', borderRadius: 10, color: colors.muted, fontSize: 12, lineHeight: 1.6 }}>
            Fires when the inbound message contains phrases like "speak to someone", "need a human", "can I talk to the manager", etc. No configuration needed.
          </div>
        )}

        {/* Actions */}
        <div>
          <label style={labelStyle}>Actions (at least one required)</label>
          <div style={{ display: 'grid', gap: 8 }}>
            {ACTION_TYPES.map(function(at) {
              var checked = hasAction(at.id);
              return (
                <div key={at.id} style={{ padding: 12, background: checked ? 'rgba(0,0,0,0.15)' : 'transparent', border: '1px solid ' + (checked ? colors.primary + '33' : colors.border), borderRadius: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={checked} onChange={function() { toggleAction(at.id); }} />
                    <div>
                      <div style={{ color: colors.text, fontSize: 13, fontWeight: 600 }}>{at.label}</div>
                      <div style={{ color: colors.muted, fontSize: 11 }}>{at.desc}</div>
                    </div>
                  </label>

                  {/* Notify config */}
                  {checked && at.id === 'notify' && (
                    <div style={{ marginTop: 10, paddingLeft: 28 }}>
                      {escNotifyMembers.length === 0 ? (
                        <div style={{ color: '#f59e0b', fontSize: 11 }}>No one is set to receive escalations. Go to Settings → Team to enable for at least one member.</div>
                      ) : (
                        <div>
                          <div style={{ color: colors.muted, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>Recipients:</div>
                          {escNotifyMembers.map(function(m) {
                            var recipients = getActionConfig('notify').recipients || [];
                            var selected = recipients.indexOf(m.notify_email) !== -1;
                            return <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, cursor: 'pointer' }}>
                              <input type="checkbox" checked={selected} onChange={function() {
                                var current = getActionConfig('notify').recipients || [];
                                var updated = selected ? current.filter(function(e) { return e !== m.notify_email; }) : current.concat([m.notify_email]);
                                updateActionConfig('notify', 'recipients', updated);
                              }} />
                              <span style={{ color: colors.text, fontSize: 12 }}>{m.displayName && m.displayName !== m.notify_email ? m.displayName + ' — ' : ''}{m.notify_email}</span>
                            </label>;
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Send confirmation config */}
                  {checked && at.id === 'send_confirmation' && (
                    <div style={{ marginTop: 10, paddingLeft: 28 }}>
                      <textarea value={getActionConfig('send_confirmation').message || ''} onChange={function(e) { updateActionConfig('send_confirmation', 'message', e.target.value); }} rows={3} style={Object.assign({}, inputStyle, { resize: 'vertical', fontSize: 12 })} />
                      <div style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>If checked, the AI will not respond to this message.</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: 12, padding: '8px 12px', background: '#ef444410', borderRadius: 8 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleSave} disabled={saving} style={Object.assign({}, btnPrimary, { opacity: saving ? 0.6 : 1 })}>{saving ? 'Saving...' : 'Save Rule'}</button>
          <button onClick={onCancel} style={btnSec}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function TestModal({ rule, colors, inputStyle, btnSec, onClose }) {
  var [message, setMessage] = useState('');
  var [result, setResult] = useState(null);
  var [testing, setTesting] = useState(false);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data?.session?.access_token || '';
      var resp = await fetch('/api/escalation-rules/' + rule.id + '?action=test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ message: message }),
      });
      var data = await resp.json();
      setResult(data.result);
    } catch (e) {
      setResult({ matched: false, reason: e.message });
    }
    setTesting(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 16, padding: 24, width: 460 }} onClick={function(e) { e.stopPropagation(); }}>
        <h3 style={{ color: colors.text, margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>Test: {rule.rule_name}</h3>
        <textarea value={message} onChange={function(e) { setMessage(e.target.value); }} rows={4} placeholder="Paste a sample inbound message..." style={Object.assign({}, inputStyle, { resize: 'vertical', marginBottom: 12 })} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={handleTest} disabled={testing || !message.trim()} style={{ background: colors.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: testing ? 0.6 : 1 }}>{testing ? 'Testing...' : 'Run Test'}</button>
          <button onClick={onClose} style={btnSec}>Close</button>
        </div>
        {result && (
          <div style={{ padding: 12, borderRadius: 8, background: result.matched ? '#10b98115' : '#ef444415', border: '1px solid ' + (result.matched ? '#10b98133' : '#ef444433') }}>
            <div style={{ color: result.matched ? '#10b981' : '#ef4444', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
              {result.matched ? 'Rule WOULD fire' : 'Rule would NOT fire'}
            </div>
            {result.keywords_matched && <div style={{ color: colors.muted, fontSize: 12 }}>Keywords matched: {result.keywords_matched.join(', ')}</div>}
            {result.pattern_matched && <div style={{ color: colors.muted, fontSize: 12 }}>Pattern matched: "{result.pattern_matched}"</div>}
            {result.reason && !result.matched && <div style={{ color: colors.muted, fontSize: 12 }}>Reason: {result.reason}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
