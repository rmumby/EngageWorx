import { useState } from 'react';
import { supabase } from './supabaseClient';

var ISSUE_TYPES = [
  { id: 'voice',    label: '📞 Voice / calls' },
  { id: 'sms',      label: '📱 SMS' },
  { id: 'whatsapp', label: '💬 WhatsApp' },
  { id: 'email',    label: '📧 Email' },
  { id: 'billing',  label: '💳 Billing / subscription' },
  { id: 'tcr',      label: '📋 TCR / SMS registration' },
  { id: 'other',    label: '❓ Something else' },
];

export default function SupportRequestForm({ tenantId, userEmail, userName, C, onSubmitted }) {
  var colors = C || { primary: '#00C9FF', muted: '#6B8BAE' };
  var [type, setType] = useState('other');
  var [description, setDescription] = useState('');
  var [submitting, setSubmitting] = useState(false);
  var [status, setStatus] = useState(null); // 'triaging' | 'auto_fixed' | 'escalated' | 'error'
  var [statusMessage, setStatusMessage] = useState('');

  async function submit() {
    if (!description.trim()) { alert('Please describe the issue.'); return; }
    setSubmitting(true);
    setStatus('triaging');
    setStatusMessage('Submitting and running triage…');
    try {
      var ticketRes = await supabase.from('support_tickets').insert({
        tenant_id: tenantId || null,
        subject: (ISSUE_TYPES.find(function(t) { return t.id === type; }) || { label: 'Support' }).label + ' — ' + description.slice(0, 60),
        description: description.trim(),
        submitter_email: userEmail || null,
        submitter_name: userName || null,
        category: type,
        priority: 'normal',
        status: 'triaging',
        source_channel: 'portal',
      }).select('id').single();
      if (ticketRes.error) throw ticketRes.error;
      var ticketId = ticketRes.data.id;

      var triageRes = await fetch('/api/support-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, tenant_id: tenantId }),
      });
      var triage = await triageRes.json();

      if (triage.fix_applied) {
        setStatus('auto_fixed');
        setStatusMessage('✅ We found and fixed a configuration issue: ' + ((triage.fix_details && triage.fix_details.fixes) || []).join(', ') + '. Please re-test.');
      } else if (triage.classification === 'USER_ERROR') {
        setStatus('auto_fixed');
        setStatusMessage('Aria has replied to your ticket with step-by-step guidance. Check your email and the Help Desk.');
      } else if (triage.classification === 'CODE_BUG' || triage.classification === 'UNKNOWN') {
        setStatus('escalated');
        setStatusMessage('🎫 Ticket escalated to our team. We\'ll follow up within 24 hours.');
      } else {
        setStatus('escalated');
        setStatusMessage('Ticket submitted — our team will review shortly.');
      }
      if (onSubmitted) onSubmitted({ ticketId: ticketId, triage: triage });
    } catch (e) {
      setStatus('error');
      setStatusMessage('Submission failed: ' + e.message);
    }
    setSubmitting(false);
  }

  var card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
  var btnPrimary = { background: 'linear-gradient(135deg,#00C9FF,#E040FB)', border: 'none', borderRadius: 8, padding: '10px 20px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13 };

  return (
    <div style={Object.assign({}, card, { maxWidth: 640 })}>
      <h3 style={{ color: '#fff', margin: '0 0 6px', fontSize: 16 }}>🎫 Submit a Support Request</h3>
      <p style={{ color: colors.muted, fontSize: 12, margin: '0 0 14px' }}>Aria will read, triage, and auto-fix common issues within ~2 minutes. Complex issues get escalated to our team.</p>
      <label style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4, fontWeight: 700 }}>Issue type</label>
      <select value={type} onChange={function(e) { setType(e.target.value); }} style={inputStyle}>
        {ISSUE_TYPES.map(function(t) { return <option key={t.id} value={t.id}>{t.label}</option>; })}
      </select>
      <label style={{ color: colors.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4, marginTop: 12, fontWeight: 700 }}>Description</label>
      <textarea value={description} onChange={function(e) { setDescription(e.target.value); }} rows={5} placeholder="What's happening? Include any error messages, phone numbers, or steps to reproduce." style={Object.assign({}, inputStyle, { resize: 'vertical' })} />
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={submit} disabled={submitting || !description.trim()} style={Object.assign({}, btnPrimary, { opacity: (submitting || !description.trim()) ? 0.5 : 1 })}>{submitting ? 'Submitting…' : 'Submit Request'}</button>
        {status && (
          <span style={{ color: status === 'auto_fixed' ? '#10b981' : status === 'escalated' ? '#d97706' : status === 'error' ? '#dc2626' : colors.muted, fontSize: 12 }}>{statusMessage}</span>
        )}
      </div>
    </div>
  );
}
