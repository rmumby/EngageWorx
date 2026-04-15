import { useState, useEffect } from 'react';

var STATUS_BADGE = {
  draft:     { color: '#94a3b8', label: '📝 Draft' },
  pending:   { color: '#d97706', label: '⏳ Pending' },
  approved:  { color: '#10b981', label: '✅ Approved' },
  rejected:  { color: '#dc2626', label: '🔴 Rejected' },
  paused:    { color: '#6366f1', label: '⏸ Paused' },
  disabled:  { color: '#475569', label: '○ Disabled' },
};

var USE_CASES = [
  { id: 'appointment_reminder', label: '📅 Appointment Reminder', category: 'UTILITY' },
  { id: 'order_confirmation',   label: '📦 Order Confirmation',   category: 'UTILITY' },
  { id: 'payment_reminder',     label: '💳 Payment Reminder',     category: 'UTILITY' },
  { id: 'customer_support',     label: '💬 Customer Support',     category: 'UTILITY' },
  { id: 'promotional',          label: '🎉 Promotional',          category: 'MARKETING' },
];

export default function WhatsAppTemplatesTab({ tenantId, C }) {
  var colors = C || { primary: '#25D366', muted: '#6B8BAE' };
  var [local, setLocal] = useState([]);
  var [metaList, setMetaList] = useState([]);
  var [connected, setConnected] = useState(false);
  var [loading, setLoading] = useState(true);
  var [syncing, setSyncing] = useState(false);
  var [wizardOpen, setWizardOpen] = useState(false);
  var [wizardUseCase, setWizardUseCase] = useState('customer_support');
  var [wizardDrafts, setWizardDrafts] = useState([]);
  var [wizardDrafting, setWizardDrafting] = useState(false);
  var [wizardPick, setWizardPick] = useState(null);
  var [wizardEdit, setWizardEdit] = useState(null);
  var [submitting, setSubmitting] = useState(false);
  var [flash, setFlash] = useState(null);

  async function load() {
    if (!tenantId) return;
    setLoading(true);
    try {
      var r = await fetch('/api/whatsapp-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', tenant_id: tenantId }),
      });
      var d = await r.json();
      setLocal(d.local || []);
      setMetaList(d.meta || []);
      setConnected(!!d.connected);
    } catch (e) {}
    setLoading(false);
  }
  useEffect(function() { load(); }, [tenantId]);

  async function sync() {
    setSyncing(true);
    try {
      await fetch('/api/whatsapp-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync', tenant_id: tenantId }) });
      setFlash({ tone: 'ok', msg: 'Synced with Meta — statuses refreshed.' });
    } catch (e) { setFlash({ tone: 'err', msg: e.message }); }
    setSyncing(false);
    await load();
    setTimeout(function() { setFlash(null); }, 3000);
  }

  async function draftTemplates() {
    setWizardDrafting(true);
    setWizardDrafts([]);
    setWizardPick(null);
    try {
      var r = await fetch('/api/whatsapp-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_draft', tenant_id: tenantId, use_case: USE_CASES.find(function(u) { return u.id === wizardUseCase; }).label }),
      });
      var d = await r.json();
      setWizardDrafts(d.templates || []);
    } catch (e) { setFlash({ tone: 'err', msg: 'AI draft failed: ' + e.message }); }
    setWizardDrafting(false);
  }

  async function submitTemplate() {
    if (!wizardEdit) return;
    setSubmitting(true);
    try {
      var r = await fetch('/api/whatsapp-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', tenant_id: tenantId, template: wizardEdit }),
      });
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Submit failed');
      setFlash({ tone: 'ok', msg: 'Submitted to Meta — status now Pending. Approval usually takes minutes to a few hours.' });
      closeWizard();
      await load();
    } catch (e) { setFlash({ tone: 'err', msg: e.message }); }
    setSubmitting(false);
    setTimeout(function() { setFlash(null); }, 5000);
  }

  function openWizard() { setWizardOpen(true); setWizardUseCase('customer_support'); setWizardDrafts([]); setWizardPick(null); setWizardEdit(null); }
  function closeWizard() { setWizardOpen(false); setWizardDrafts([]); setWizardPick(null); setWizardEdit(null); }

  function pickDraft(idx) {
    var t = wizardDrafts[idx];
    var uc = USE_CASES.find(function(u) { return u.id === wizardUseCase; });
    setWizardPick(idx);
    setWizardEdit({
      name: t.name,
      category: t.category || (uc && uc.category) || 'UTILITY',
      language: 'en_US',
      body_text: t.body_text,
      header_text: t.header_text || null,
      footer_text: t.footer_text || null,
      variables: t.variables || null,
    });
  }

  var card = { background: 'rgba(37,211,102,0.04)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: 10, padding: 16 };
  var inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };
  var btnPrimary = { background: '#25D366', border: 'none', borderRadius: 8, padding: '10px 18px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };
  var btnSec = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 14px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' };

  if (!connected && !loading) {
    return (
      <div style={Object.assign({}, card, { marginBottom: 14 })}>
        <div style={{ color: colors.muted, fontSize: 13 }}>Connect WhatsApp first (via Embedded Signup or manual credentials) before creating templates.</div>
      </div>
    );
  }

  return (
    <div style={Object.assign({}, card, { marginBottom: 14 })}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>💬 Message Templates</div>
          <div style={{ color: colors.muted, fontSize: 12 }}>Pre-approved message formats Meta requires for business-initiated WhatsApp sends.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={sync} disabled={syncing} style={btnSec}>{syncing ? 'Syncing…' : '🔄 Sync with Meta'}</button>
          <button onClick={openWizard} style={btnPrimary}>+ Create Template</button>
        </div>
      </div>
      {flash && <div style={{ marginBottom: 10, padding: 10, background: flash.tone === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(220,38,38,0.1)', border: '1px solid ' + (flash.tone === 'ok' ? 'rgba(16,185,129,0.35)' : 'rgba(220,38,38,0.35)'), borderRadius: 8, color: flash.tone === 'ok' ? '#10b981' : '#dc2626', fontSize: 12 }}>{flash.msg}</div>}

      {loading ? (
        <div style={{ color: colors.muted, padding: 20, textAlign: 'center', fontSize: 13 }}>Loading templates…</div>
      ) : local.length === 0 ? (
        <div style={{ color: colors.muted, padding: 20, textAlign: 'center', fontSize: 13 }}>No templates yet. Click <strong>Create Template</strong> to draft one with AI.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {local.map(function(t) {
            var badge = STATUS_BADGE[t.status] || STATUS_BADGE.draft;
            return (
              <div key={t.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{t.name}</div>
                    <div style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>{t.category} · {t.language || 'en_US'}{t.submitted_at ? ' · submitted ' + new Date(t.submitted_at).toLocaleDateString() : ''}</div>
                  </div>
                  <span style={{ background: badge.color + '22', color: badge.color, border: '1px solid ' + badge.color + '55', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{badge.label}</span>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 6, padding: 10, fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.body_text}</div>
                {t.rejection_reason && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 11 }}>⚠️ {t.rejection_reason}</div>}
              </div>
            );
          })}
        </div>
      )}

      {wizardOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={closeWizard}>
          <div onClick={function(e) { e.stopPropagation(); }} style={{ background: '#0d1425', border: '1px solid rgba(37,211,102,0.35)', borderRadius: 14, padding: 24, maxWidth: 760, width: '100%', maxHeight: '90vh', overflowY: 'auto', fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: '#fff', margin: 0, fontSize: 18 }}>💬 Create WhatsApp Template</h3>
              <button onClick={closeWizard} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            {!wizardEdit && (
              <>
                <label style={{ color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 6 }}>Use case</label>
                <select value={wizardUseCase} onChange={function(e) { setWizardUseCase(e.target.value); }} style={inputStyle}>
                  {USE_CASES.map(function(u) { return <option key={u.id} value={u.id}>{u.label}</option>; })}
                </select>
                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={draftTemplates} disabled={wizardDrafting} style={btnPrimary}>{wizardDrafting ? 'Thinking…' : '🪄 Generate 3 options'}</button>
                </div>
                {wizardDrafts.length > 0 && (
                  <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                    <div style={{ color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Pick one to edit and submit</div>
                    {wizardDrafts.map(function(t, idx) {
                      var score = typeof t.approval_score === 'number' ? t.approval_score : null;
                      var scoreColor = score === null ? colors.muted : score >= 85 ? '#10b981' : score >= 65 ? '#d97706' : '#dc2626';
                      return (
                        <div key={idx} onClick={function() { pickDraft(idx); }} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid ' + (wizardPick === idx ? '#25D366' : 'rgba(255,255,255,0.08)'), borderRadius: 8, padding: 12, cursor: 'pointer' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{t.name}</div>
                            {score !== null && <span style={{ color: scoreColor, fontSize: 11, fontWeight: 700 }}>{score}/100 approval likelihood</span>}
                          </div>
                          <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: 10, fontSize: 12, color: '#cbd5e1', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.body_text}</div>
                          {t.approval_reasoning && <div style={{ color: colors.muted, fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>{t.approval_reasoning}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {wizardEdit && (
              <div>
                <label style={{ color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Name (snake_case)</label>
                <input value={wizardEdit.name} onChange={function(e) { setWizardEdit(Object.assign({}, wizardEdit, { name: e.target.value })); }} style={inputStyle} />
                <label style={{ color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4, marginTop: 12 }}>Category</label>
                <select value={wizardEdit.category} onChange={function(e) { setWizardEdit(Object.assign({}, wizardEdit, { category: e.target.value })); }} style={inputStyle}>
                  {['UTILITY','MARKETING','AUTHENTICATION'].map(function(c) { return <option key={c} value={c}>{c}</option>; })}
                </select>
                <label style={{ color: colors.muted, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4, marginTop: 12 }}>Body text</label>
                <textarea value={wizardEdit.body_text} onChange={function(e) { setWizardEdit(Object.assign({}, wizardEdit, { body_text: e.target.value })); }} rows={6} style={Object.assign({}, inputStyle, { resize: 'vertical', fontFamily: 'monospace', fontSize: 12 })} />
                <div style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Use {'{{1}}, {{2}}'} for variables. Meta auto-rejects promotional content in UTILITY category.</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'space-between' }}>
                  <button onClick={function() { setWizardEdit(null); }} style={btnSec}>← Back to options</button>
                  <button onClick={submitTemplate} disabled={submitting || !wizardEdit.name || !wizardEdit.body_text} style={btnPrimary}>{submitting ? 'Submitting…' : 'Submit to Meta'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
