import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../ThemeContext';
import { DEMO_TICKETS } from '../../demoFixtures';
import { supabase } from '../../supabaseClient';

const STATUS_CONFIG = {
  open:      { label: 'Open',      color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  ai_active: { label: 'AI Active', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
  escalated: { label: 'Escalated', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  pending:   { label: 'Pending',   color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  resolved:  { label: 'Resolved',  color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  closed:    { label: 'Closed',    color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  spam:      { label: 'Spam',      color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

const PRIORITY_CONFIG = {
  low:      { label: 'Low',      color: '#64748b' },
  normal:   { label: 'Normal',   color: '#3b82f6' },
  high:     { label: 'High',     color: '#f59e0b' },
  urgent:   { label: 'Urgent',   color: '#ef4444' },
  critical: { label: 'Critical', color: '#dc2626' },
};

const CATEGORIES = ['general', 'billing', 'technical', 'account', 'feature', 'abuse'];

function getColors(theme) {
  var isDark = theme === 'dark';
  return {
    bg:        isDark ? '#0f172a'                  : '#f8fafc',
    surface:   isDark ? 'rgba(255,255,255,0.04)'   : '#ffffff',
    surface2:  isDark ? 'rgba(255,255,255,0.07)'   : '#f1f5f9',
    border:    isDark ? 'rgba(255,255,255,0.08)'   : 'rgba(0,0,0,0.08)',
    text:      isDark ? '#e2e8f0'                  : '#0f172a',
    textMuted: isDark ? '#64748b'                  : '#64748b',
  };
}

function btnStyle(bg, border, color, solid) {
  return {
    padding: '8px 16px', borderRadius: 8,
    border: '1px solid ' + (solid ? 'transparent' : border),
    background: bg, color: color,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    transition: 'opacity 0.15s',
  };
}

function inputStyle(surface, border, text) {
  return {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1px solid ' + border,
    background: surface, color: text,
    fontSize: 14, boxSizing: 'border-box',
  };
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Field({ label, required, children, style }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

// ── Ticket Detail ──────────────────────────────────────────────────────────
function TicketDetail({ ticket, messages, userId, userName, isSPAdmin, isAgent, colors, onBack, onUpdate }) {
  var { bg, surface, border, text, textMuted } = colors;
  var accent = '#6366f1';
  var [reply, setReply] = useState('');
  var [mode, setMode] = useState('reply');
  var [sending, setSending] = useState(false);
  var [localMessages, setLocalMessages] = useState(messages);
  var messagesEndRef = useRef(null);
  var canActAsAgent = isSPAdmin || isAgent;

  useEffect(function() { setLocalMessages(messages); }, [messages]);
  useEffect(function() {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [localMessages]);

  async function sendReply() {
    if (!reply.trim()) return;
    setSending(true);
    var role = canActAsAgent ? 'agent' : 'user';

    await fetch('/api/helpdesk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_message', ticket_id: ticket.id,
        content: reply, role: role,
        author_name: userName,
        author_type: isSPAdmin ? 'sp_admin' : isAgent ? 'agent' : 'tenant',
        is_internal: mode === 'internal',
        author_user_id: userId
      })
    });

    if (role === 'user') {
      await fetch('/api/helpdesk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_respond', ticket_id: ticket.id, message: reply })
      });
    }

    setReply('');
    var res = await fetch('/api/helpdesk?action=get_ticket&ticket_id=' + ticket.id);
    var data = await res.json();
    setLocalMessages(data.messages || []);
    onUpdate(data.ticket, data.messages || []);
    setSending(false);
  }

  async function changeStatus(status) {
    await fetch('/api/helpdesk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_status', ticket_id: ticket.id, status: status })
    });
    onBack();
  }

  var sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  var pc = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: bg, color: text, overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid ' + border, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <button onClick={onBack} style={btnStyle(surface, border, text)}>← Back</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ticket.subject}</div>
          <div style={{ fontSize: 12, color: textMuted, marginTop: 2 }}>
            {ticket.ticket_number} · {ticket.channel} · {ticket.submitter_name || ticket.submitter_email || 'Unknown'}
          </div>
        </div>
        <span style={{ padding: '4px 12px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{sc.label}</span>
        <span style={{ fontSize: 12, color: pc.color, fontWeight: 600 }}>{pc.label}</span>
        {canActAsAgent && (
          <div style={{ display: 'flex', gap: 6 }}>
            {ticket.status !== 'resolved' && (
              <button onClick={function() { changeStatus('resolved'); }} style={btnStyle('rgba(16,185,129,0.15)', 'rgba(16,185,129,0.3)', '#10b981')}>✓ Resolve</button>
            )}
            {ticket.status !== 'closed' && (
              <button onClick={function() { changeStatus('closed'); }} style={btnStyle(surface, border, textMuted)}>Close</button>
            )}
            {ticket.status !== 'spam' && (
              <button onClick={function() { changeStatus('spam'); }} style={btnStyle('rgba(239,68,68,0.1)', 'rgba(239,68,68,0.3)', '#ef4444')}>Spam</button>
            )}
          </div>
        )}
      </div>

      {ticket.status === 'escalated' && (
        <div style={{ padding: '10px 24px', background: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span>🚨</span>
          <div>
            <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: 13 }}>Escalated — human agent required</span>
            {ticket.escalation_reason && (
              <span style={{ fontSize: 12, color: textMuted, marginLeft: 8 }}>{ticket.escalation_reason.substring(0, 120)}</span>
            )}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {localMessages
          .filter(function(m) { return !m.is_internal || canActAsAgent; })
          .map(function(m) {
            var isUser = m.role === 'user';
            var isAI = m.role === 'ai';
            var isSystem = m.role === 'system';
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 4 }}>
                <div style={{ fontSize: 11, color: textMuted }}>
                  {m.is_internal && <span style={{ color: '#f59e0b', marginRight: 4 }}>🔒 Internal —</span>}
                  {m.author_name || m.role}
                  {isAI && <span style={{ color: '#06b6d4', marginLeft: 6 }}>🤖 AI</span>}
                  <span style={{ marginLeft: 6 }}>· {formatDate(m.created_at)}</span>
                </div>
                {!isSystem && (
                  <div style={{
                    maxWidth: '78%', padding: '12px 16px',
                    borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: isUser ? 'rgba(99,102,241,0.15)' : isAI ? 'rgba(6,182,212,0.1)' : m.is_internal ? 'rgba(245,158,11,0.1)' : surface,
                    border: '1px solid ' + (isUser ? 'rgba(99,102,241,0.3)' : isAI ? 'rgba(6,182,212,0.2)' : m.is_internal ? 'rgba(245,158,11,0.25)' : border),
                    fontSize: 14, color: text, lineHeight: 1.65, whiteSpace: 'pre-wrap'
                  }}>
                    {m.content}
                  </div>
                )}
                {isSystem && (
                  <div style={{ fontSize: 12, color: textMuted, fontStyle: 'italic' }}>{m.content}</div>
                )}
              </div>
            );
          })}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '16px 24px', borderTop: '1px solid ' + border, background: surface, flexShrink: 0 }}>
        {canActAsAgent && (
          <div style={{ display: 'flex', gap: 0, marginBottom: 10, border: '1px solid ' + border, borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
            {['reply', 'internal'].map(function(m) {
              return (
                <button key={m} onClick={function() { setMode(m); }}
                  style={{ padding: '6px 14px', fontSize: 12, background: mode === m ? accent : 'transparent', color: mode === m ? '#fff' : textMuted, border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                  {m === 'reply' ? '↩ Reply to customer' : '🔒 Internal note'}
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <textarea
            value={reply} onChange={function(e) { setReply(e.target.value); }}
            onKeyDown={function(e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply(); }}
            placeholder={mode === 'internal' ? 'Internal note — not visible to customer...' : 'Type your reply... (Cmd+Enter to send)'}
            rows={3}
            style={{ flex: 1, padding: '12px 14px', borderRadius: 8, border: '1px solid ' + border, background: bg, color: text, fontSize: 14, resize: 'none', fontFamily: 'inherit' }}
          />
          <button onClick={sendReply} disabled={sending || !reply.trim()}
            style={{ padding: '0 20px', borderRadius: 8, background: accent, color: '#fff', border: 'none', cursor: sending || !reply.trim() ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: sending || !reply.trim() ? 0.5 : 1 }}>
            {sending ? '...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Ticket Form ────────────────────────────────────────────────────────
function NewTicketForm({ tenantId, userId, userName, userEmail, submitterType, colors, onCancel, onCreated }) {
  var { bg, surface, border, text, textMuted } = colors;
  var accent = '#6366f1';
  var [form, setForm] = useState({ subject: '', description: '', category: 'general', priority: 'normal', channel: 'portal' });
  var [submitting, setSubmitting] = useState(false);
  var [error, setError] = useState('');

  function setField(key, val) { setForm(function(f) { var n = {}; Object.assign(n, f); n[key] = val; return n; }); }

  async function submit() {
    if (!form.subject.trim() || !form.description.trim()) return setError('Subject and description are required.');
    setSubmitting(true); setError('');
    try {
      var res = await fetch('/api/helpdesk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, form, {
          action: 'create_ticket',
          tenant_id: tenantId,
          submitter_tenant_id: tenantId,
          submitter_type: submitterType,
          submitter_name: userName,
          submitter_email: userEmail,
          submitter_user_id: userId
        }))
      });
      var data = await res.json();
      if (data.error) { setError(data.error); setSubmitting(false); return; }
      onCreated();
    } catch (e) { setError(e.message); setSubmitting(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: bg, color: text, overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid ' + border, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onCancel} style={btnStyle(surface, border, text)}>← Back</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: text }}>New Support Ticket</div>
          <div style={{ fontSize: 12, color: textMuted }}>AI responds immediately</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 700 }}>
        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>{error}</div>
        )}
        <Field label="Subject" required>
          <input value={form.subject} onChange={function(e) { setField('subject', e.target.value); }}
            placeholder="Brief description of the issue"
            style={inputStyle(surface, border, text)} />
        </Field>
        <Field label="Description" required>
          <textarea value={form.description} onChange={function(e) { setField('description', e.target.value); }}
            placeholder="Describe the issue in detail. The more context you provide, the better AI can help."
            rows={7} style={Object.assign({}, inputStyle(surface, border, text), { resize: 'vertical', fontFamily: 'inherit' })} />
        </Field>
        <div style={{ display: 'flex', gap: 14 }}>
          <Field label="Category" style={{ flex: 1 }}>
            <select value={form.category} onChange={function(e) { setField('category', e.target.value); }} style={inputStyle(surface, border, text)}>
              {CATEGORIES.map(function(c) { return <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>; })}
            </select>
          </Field>
          <Field label="Priority" style={{ flex: 1 }}>
            <select value={form.priority} onChange={function(e) { setField('priority', e.target.value); }} style={inputStyle(surface, border, text)}>
              {Object.entries(PRIORITY_CONFIG).map(function(e) { return <option key={e[0]} value={e[0]}>{e[1].label}</option>; })}
            </select>
          </Field>
          <Field label="Channel" style={{ flex: 1 }}>
            <select value={form.channel} onChange={function(e) { setField('channel', e.target.value); }} style={inputStyle(surface, border, text)}>
              {['portal','email','sms','whatsapp','voice','api'].map(function(c) { return <option key={c} value={c}>{c.toUpperCase()}</option>; })}
            </select>
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button onClick={onCancel} style={Object.assign({}, btnStyle(surface, border, textMuted), { flex: 1 })}>Cancel</button>
          <button onClick={submit} disabled={submitting}
            style={Object.assign({}, btnStyle(accent, 'transparent', '#fff', true), { flex: 2, opacity: submitting ? 0.6 : 1 })}>
            {submitting ? 'Submitting...' : 'Submit — AI responds immediately'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stats View ─────────────────────────────────────────────────────────────
function HelpDeskStats({ tickets, stats, colors, onBack }) {
  var { bg, surface, border, text, textMuted } = colors;

  var byStatus = Object.entries(STATUS_CONFIG).map(function(e) {
    return { label: e[1].label, count: tickets.filter(function(t) { return t.status === e[0]; }).length, color: e[1].color };
  });
  var byChannel = ['portal','sms','whatsapp','email','voice','api'].map(function(c) {
    return { label: c.toUpperCase(), count: tickets.filter(function(t) { return t.channel === c; }).length };
  }).filter(function(x) { return x.count > 0; });
  var maxStatus = Math.max.apply(null, byStatus.map(function(s) { return s.count; }).concat([1]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: bg, color: text, overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid ' + border, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={btnStyle(surface, border, text)}>← Back</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: text }}>Help Desk Statistics</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 700 }}>
        <div style={{ padding: 32, borderRadius: 12, background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', textAlign: 'center' }}>
          <div style={{ fontSize: 56, fontWeight: 800, color: '#06b6d4', lineHeight: 1 }}>{stats.resolution_rate || 0}%</div>
          <div style={{ fontSize: 15, color: textMuted, marginTop: 8 }}>AI Resolution Rate</div>
          <div style={{ fontSize: 12, color: textMuted, marginTop: 4 }}>Target: 90%+</div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { label: 'Total Tickets', value: stats.total || 0,       color: text },
            { label: 'Open',          value: stats.open || 0,        color: '#6366f1' },
            { label: 'Escalated',     value: stats.escalated || 0,   color: '#f59e0b' },
            { label: 'AI Resolved',   value: stats.ai_resolved || 0, color: '#10b981' },
          ].map(function(s) {
            return (
              <div key={s.label} style={{ flex: 1, padding: '16px 12px', borderRadius: 10, background: surface, border: '1px solid ' + border, textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: textMuted, marginTop: 4 }}>{s.label}</div>
              </div>
            );
          })}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: textMuted, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>By Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {byStatus.map(function(s) {
              return (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 76, fontSize: 13, color: textMuted }}>{s.label}</div>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: (s.count / maxStatus * 100) + '%', background: s.color, borderRadius: 4, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ width: 28, textAlign: 'right', fontSize: 13, fontWeight: 600, color: s.color }}>{s.count}</div>
                </div>
              );
            })}
          </div>
        </div>
        {byChannel.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: textMuted, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>By Channel</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {byChannel.map(function(c) {
                return (
                  <div key={c.label} style={{ padding: '12px 18px', borderRadius: 8, background: surface, border: '1px solid ' + border, textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: text }}>{c.count}</div>
                    <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{c.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Auto-Triage Panel (SP Admin only) ───────────────────────────────────────
function AutoTriagePanel({ colors, onBack }) {
  var [rows, setRows] = useState([]);
  var [loading, setLoading] = useState(true);
  var [filter, setFilter] = useState('all');

  useEffect(function() {
    (async function() {
      setLoading(true);
      try {
        var r = await supabase.from('support_triage').select('*, ticket:ticket_id(subject, status), tenant:tenant_id(name)').order('created_at', { ascending: false }).limit(200);
        setRows(r.data || []);
      } catch (e) { console.warn('[Triage panel] load:', e.message); }
      setLoading(false);
    })();
  }, []);

  var stats = {
    total: rows.length,
    auto_resolved: rows.filter(function(r) { return r.fix_applied; }).length,
    user_guidance: rows.filter(function(r) { return r.classification === 'USER_ERROR'; }).length,
    escalated: rows.filter(function(r) { return r.escalated_to_rob; }).length,
    config_issues: rows.filter(function(r) { return r.classification === 'CONFIG_ISSUE'; }).length,
  };
  var fixable = rows.filter(function(r) { return r.classification === 'CONFIG_ISSUE'; });
  var fixRate = fixable.length ? Math.round((fixable.filter(function(r) { return r.fix_applied; }).length / fixable.length) * 100) : 0;

  var filtered = rows.filter(function(r) {
    if (filter === 'all') return true;
    if (filter === 'resolved') return r.fix_applied || r.classification === 'USER_ERROR';
    if (filter === 'escalated') return r.escalated_to_rob;
    return r.classification === filter;
  });

  var CLASS_BADGE = {
    CONFIG_ISSUE: { color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)', label: '🔧 Config' },
    CODE_BUG:     { color: '#dc2626', bg: 'rgba(220,38,38,0.12)', label: '🐛 Code bug' },
    USER_ERROR:   { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: '💡 User guidance' },
    UNKNOWN:      { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', label: '❓ Unknown' },
  };

  var card = { background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 12, padding: 16 };
  var btn = { background: colors.surface, border: '1px solid ' + colors.border, borderRadius: 8, padding: '6px 12px', color: colors.text, cursor: 'pointer', fontSize: 12, fontWeight: 600 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: colors.bg, color: colors.text, overflow: 'auto' }}>
      <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid ' + colors.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>🤖 Auto-Triage</div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Claude-classified tickets + auto-fix outcomes</div>
        </div>
        <button onClick={onBack} style={btn}>← Back</button>
      </div>

      <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
        <div style={card}><div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Total</div><div style={{ fontSize: 24, fontWeight: 800, color: colors.text, marginTop: 6 }}>{stats.total}</div></div>
        <div style={card}><div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Auto-resolved</div><div style={{ fontSize: 24, fontWeight: 800, color: '#10b981', marginTop: 6 }}>{stats.auto_resolved}</div></div>
        <div style={card}><div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>User guidance</div><div style={{ fontSize: 24, fontWeight: 800, color: '#06b6d4', marginTop: 6 }}>{stats.user_guidance}</div></div>
        <div style={card}><div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Escalated</div><div style={{ fontSize: 24, fontWeight: 800, color: '#d97706', marginTop: 6 }}>{stats.escalated}</div></div>
        <div style={card}><div style={{ fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 }}>Fix success rate</div><div style={{ fontSize: 24, fontWeight: 800, color: '#a855f7', marginTop: 6 }}>{fixRate}%</div></div>
      </div>

      <div style={{ padding: '0 24px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['all','All'],['resolved','✅ Resolved'],['escalated','🚨 Escalated'],['CONFIG_ISSUE','🔧 Config'],['CODE_BUG','🐛 Code bug'],['USER_ERROR','💡 User'],['UNKNOWN','❓ Unknown']].map(function(f) {
          var active = filter === f[0];
          return <button key={f[0]} onClick={function() { setFilter(f[0]); }} style={Object.assign({}, btn, { background: active ? 'rgba(99,102,241,0.2)' : colors.surface, color: active ? '#a5b4fc' : colors.text, borderColor: active ? 'rgba(99,102,241,0.5)' : colors.border })}>{f[1]}</button>;
        })}
      </div>

      <div style={{ padding: '0 24px 24px' }}>
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: colors.textMuted }}>Loading…</div> : filtered.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: colors.textMuted }}>No triage rows match.</div> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {filtered.map(function(r) {
              var badge = CLASS_BADGE[r.classification] || CLASS_BADGE.UNKNOWN;
              return (
                <div key={r.id} style={Object.assign({}, card, { padding: 14 })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ background: badge.bg, color: badge.color, border: '1px solid ' + badge.color + '66', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{badge.label}</span>
                        {r.fix_applied && <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.5)', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>✓ Auto-fixed</span>}
                        {r.escalated_to_rob && <span style={{ background: 'rgba(217,119,6,0.15)', color: '#d97706', border: '1px solid rgba(217,119,6,0.5)', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>🚨 Escalated</span>}
                        {typeof r.confidence === 'number' && <span style={{ color: colors.textMuted, fontSize: 10 }}>confidence {Math.round(r.confidence * 100)}%</span>}
                      </div>
                      <div style={{ color: colors.text, fontWeight: 600, fontSize: 14, marginTop: 6 }}>{r.ticket && r.ticket.subject ? r.ticket.subject : '(ticket removed)'}</div>
                      <div style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{r.tenant && r.tenant.name ? r.tenant.name : '—'} · {new Date(r.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                  {r.reasoning && <div style={{ color: colors.text, fontSize: 12, marginTop: 10, padding: '8px 10px', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, fontStyle: 'italic', lineHeight: 1.5 }}>🤖 {r.reasoning}</div>}
                  {r.fix_details && r.fix_details.fixes && (
                    <div style={{ color: '#10b981', fontSize: 11, marginTop: 8, fontFamily: 'monospace' }}>Fixes applied: {r.fix_details.fixes.join(', ')}</div>
                  )}
                  {r.escalation_diagnosis && (
                    <div style={{ color: colors.text, fontSize: 12, marginTop: 8, padding: '8px 10px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.escalation_diagnosis}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Module ────────────────────────────────────────────────────────────
export default function HelpDeskModule({ tenantId, userRole, userId, userName, userEmail, C, isSPAdmin, isCSP, isAgent, demoMode }) {
  var { theme } = useTheme();
  var isDark = C ? C.bg === '#080d1a' || C.bg?.includes('0d') || C.text === '#E8F4FD' : theme === 'dark';
  var colors = getColors(isDark ? 'dark' : 'light');

  var [view, setView] = useState('list');
  var [tickets, setTickets] = useState([]);
  var [selectedTicket, setSelectedTicket] = useState(null);
  var [ticketMessages, setTicketMessages] = useState([]);
  var [loading, setLoading] = useState(true);
  var [filter, setFilter] = useState({ status: 'all', priority: 'all', search: '' });
  var [stats, setStats] = useState({});

  var { bg, surface, surface2, border, text, textMuted } = colors;
  var accent = '#6366f1';

  useEffect(function() { loadTickets(); }, [filter.status, filter.priority, filter.search, demoMode]);

  async function loadTickets() {
    if (demoMode) {
      var demoResolved = DEMO_TICKETS.filter(function(t) { return ['resolved','closed'].includes(t.status); });
      var demoAi = demoResolved.filter(function(t) { return t.ai_handled; });
      setTickets(DEMO_TICKETS);
      setStats({
        total: DEMO_TICKETS.length,
        open: DEMO_TICKETS.filter(function(t) { return t.status === 'open'; }).length,
        escalated: DEMO_TICKETS.filter(function(t) { return t.status === 'escalated'; }).length,
        ai_resolved: demoAi.length,
        resolution_rate: demoResolved.length ? Math.round(demoAi.length / demoResolved.length * 100) : 0,
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    var params = 'action=list_tickets&limit=200';
    if (tenantId && !isSPAdmin) params += '&tenant_id=' + tenantId;
    if (filter.status !== 'all') params += '&status=' + filter.status;
    if (filter.priority !== 'all') params += '&priority=' + filter.priority;
    if (filter.search) params += '&search=' + encodeURIComponent(filter.search);
    try {
      var res = await fetch('/api/helpdesk?' + params);
      var data = await res.json();
      var all = data.tickets || [];
      setTickets(all);
      var resolved = all.filter(function(t) { return ['resolved','closed'].includes(t.status); });
      var aiResolved = resolved.filter(function(t) { return t.ai_handled; });
      setStats({
        total: all.length,
        open: all.filter(function(t) { return t.status === 'open'; }).length,
        escalated: all.filter(function(t) { return t.status === 'escalated'; }).length,
        ai_resolved: aiResolved.length,
        resolution_rate: resolved.length ? Math.round(aiResolved.length / resolved.length * 100) : 0
      });
    } catch (e) { console.error('loadTickets error:', e); }
    setLoading(false);
  }

  async function openTicket(ticket) {
    setSelectedTicket(ticket);
    setView('detail');
    var res = await fetch('/api/helpdesk?action=get_ticket&ticket_id=' + ticket.id);
    var data = await res.json();
    setSelectedTicket(data.ticket);
    setTicketMessages(data.messages || []);
  }

  if (view === 'detail' && selectedTicket) return (
    <TicketDetail
      ticket={selectedTicket} messages={ticketMessages}
      userId={userId} userName={userName}
      isSPAdmin={isSPAdmin} isAgent={isAgent}
      colors={colors}
      onBack={function() { setView('list'); loadTickets(); }}
      onUpdate={function(t, m) { setSelectedTicket(t); setTicketMessages(m); }}
    />
  );

  if (view === 'new') return (
    <NewTicketForm
      tenantId={tenantId} userId={userId} userName={userName} userEmail={userEmail}
      submitterType={isSPAdmin ? 'sp_admin' : isCSP ? 'csp' : isAgent ? 'agent' : 'tenant'}
      colors={colors}
      onCancel={function() { setView('list'); }}
      onCreated={function() { setView('list'); loadTickets(); }}
    />
  );

  if (view === 'stats') return (
    <HelpDeskStats tickets={tickets} stats={stats} colors={colors} onBack={function() { setView('list'); }} />
  );

  if (view === 'triage') return (
    <AutoTriagePanel colors={colors} onBack={function() { setView('list'); }} />
  );

  // ── List View ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: bg, color: text, overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid ' + border, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: text }}>Help Desk</div>
          <div style={{ fontSize: 13, color: textMuted, marginTop: 2 }}>AI handles 90%+ of tickets automatically</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isSPAdmin && <button onClick={function() { setView('triage'); }} style={btnStyle(surface, border, text)}>🤖 Auto-Triage</button>}
          <button onClick={function() { setView('stats'); }} style={btnStyle(surface, border, text)}>📊 Stats</button>
          <button onClick={function() { setView('new'); }} style={btnStyle(accent, 'transparent', '#fff', true)}>+ New Ticket</button>
        </div>
      </div>

      <div style={{ padding: '12px 24px', borderBottom: '1px solid ' + border, display: 'flex', gap: 24, flexShrink: 0 }}>
        {[
          { label: 'Total',       value: stats.total || 0,                    color: text },
          { label: 'Open',        value: stats.open || 0,                     color: '#6366f1' },
          { label: 'Escalated',   value: stats.escalated || 0,                color: '#f59e0b' },
          { label: 'AI Resolved', value: stats.ai_resolved || 0,              color: '#10b981' },
          { label: 'AI Rate',     value: (stats.resolution_rate || 0) + '%',  color: '#06b6d4' },
        ].map(function(s) {
          return (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: textMuted }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '10px 24px', borderBottom: '1px solid ' + border, display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        <input value={filter.search}
          onChange={function(e) { setFilter(function(f) { return Object.assign({}, f, { search: e.target.value }); }); }}
          placeholder="Search tickets..."
          style={{ flex: 1, minWidth: 180, padding: '7px 12px', borderRadius: 6, border: '1px solid ' + border, background: surface, color: text, fontSize: 13 }} />
        <select value={filter.status}
          onChange={function(e) { setFilter(function(f) { return Object.assign({}, f, { status: e.target.value }); }); }}
          style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid ' + border, background: surface, color: text, fontSize: 13 }}>
          <option value="all">All Status</option>
          {Object.entries(STATUS_CONFIG).map(function(e) { return <option key={e[0]} value={e[0]}>{e[1].label}</option>; })}
        </select>
        <select value={filter.priority}
          onChange={function(e) { setFilter(function(f) { return Object.assign({}, f, { priority: e.target.value }); }); }}
          style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid ' + border, background: surface, color: text, fontSize: 13 }}>
          <option value="all">All Priority</option>
          {Object.keys(PRIORITY_CONFIG).map(function(k) { return <option key={k} value={k}>{PRIORITY_CONFIG[k].label}</option>; })}
        </select>
        <button onClick={loadTickets} style={btnStyle(surface, border, textMuted)}>↻ Refresh</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: textMuted }}>Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: textMuted }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎫</div>
            <div style={{ fontSize: 15, marginBottom: 6, color: text }}>No tickets yet</div>
            <div style={{ fontSize: 13 }}>Tickets submitted from any channel appear here</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: surface2, position: 'sticky', top: 0, zIndex: 1 }}>
                {['Ticket', 'Subject', 'Status', 'Priority', 'Channel', 'Submitter', 'Created'].map(function(h) {
                  return <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid ' + border, whiteSpace: 'nowrap' }}>{h}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {tickets.map(function(t) {
                var sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
                var pc = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.normal;
                return (
                  <tr key={t.id} onClick={function() { openTicket(t); }}
                    style={{ cursor: 'pointer', borderBottom: '1px solid ' + border, transition: 'background 0.12s' }}
                    onMouseEnter={function(e) { e.currentTarget.style.background = surface; }}
                    onMouseLeave={function(e) { e.currentTarget.style.background = 'transparent'; }}>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: textMuted, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{t.ticket_number}</td>
                    <td style={{ padding: '12px 14px', maxWidth: 260 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subject}</div>
                      {t.ai_handled && <span style={{ fontSize: 11, color: '#06b6d4' }}>🤖 AI handled</span>}
                    </td>
                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 12, fontWeight: 600 }}>{sc.label}</span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: pc.color, fontWeight: 500 }}>{pc.label}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: textMuted, textTransform: 'capitalize' }}>{t.channel}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: textMuted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.submitter_name || t.submitter_email || '—'}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: textMuted, whiteSpace: 'nowrap' }}>{formatDate(t.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
