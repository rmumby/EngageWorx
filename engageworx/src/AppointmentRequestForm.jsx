// src/AppointmentRequestForm.jsx — public appointment-REQUEST form (Phase 1, no AI/booking).
// Resolves its tenant server-side from the opaque formKey in the URL (/request/<formKey>). Posts to
// /api/appointment-request, which writes durably BEFORE notifying. Neutral/white-label styling —
// no operator branding hardcoded. This is a REQUEST, not a booking; the receipt says so.
import { useState } from 'react';

// The exact CASL disclosure shown to the patient — sent verbatim as consent_text so the server
// stores a real consent record (text + timestamp). Kept operator-neutral (server resolves the tenant).
var CONSENT_TEXT =
  'I consent to the dental office contacting me by email and phone about this appointment request. ' +
  'I understand this is a request, not a confirmed appointment, and that my information will be used ' +
  'to schedule and manage my care.';

var page = { minHeight: '100vh', background: '#f5f6f8', display: 'flex', justifyContent: 'center', padding: '32px 16px', fontFamily: "'DM Sans', Arial, sans-serif", boxSizing: 'border-box' };
var card = { width: '100%', maxWidth: 560, background: '#fff', border: '1px solid #e4e7ec', borderRadius: 14, padding: '28px 28px 32px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' };
var label = { display: 'block', fontSize: 12, fontWeight: 700, color: '#344054', marginBottom: 6, letterSpacing: 0.2 };
var input = { width: '100%', boxSizing: 'border-box', border: '1px solid #d0d5dd', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#101828', fontFamily: 'inherit', outline: 'none', marginBottom: 14 };
var row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };

export default function AppointmentRequestForm({ formKey }) {
  var s = useState({ full_name: '', email: '', phone: '', address: '', dob: '', student_id: '', insurance: '', preferred_windows: '', reason: '' });
  var form = s[0], setForm = s[1];
  var cs = useState(false); var consent = cs[0], setConsent = cs[1];
  var ls = useState(false); var loading = ls[0], setLoading = ls[1];
  var es = useState(null); var error = es[0], setError = es[1];
  var ds = useState(false); var done = ds[0], setDone = ds[1];

  function set(k, v) { setForm(Object.assign({}, form, { [k]: v })); }

  async function submit() {
    setError(null);
    // Client-side checks are UX only — the server validates authoritatively.
    if (!form.full_name.trim() || !form.email.trim() || !form.phone.trim() || !form.preferred_windows.trim() || !form.reason.trim()) {
      setError('Please complete your name, email, phone, preferred day/time, and reason for visit.'); return;
    }
    if (!consent) { setError('Please confirm the consent checkbox to submit your request.'); return; }
    setLoading(true);
    try {
      var resp = await fetch('/api/appointment-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, form, { form_key: formKey, consent: true, consent_text: CONSENT_TEXT })),
      });
      var data = await resp.json();
      if (resp.ok && data.ok) { setDone(true); }
      else { setError(data.error || "We couldn't submit your request. Please try again or contact the office."); }
    } catch (e) {
      setError("We couldn't reach the server. Please check your connection and try again.");
    }
    setLoading(false);
  }

  if (done) {
    return (
      <div style={page}><div style={card}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
        <h1 style={{ fontSize: 22, color: '#101828', margin: '0 0 8px' }}>Request received</h1>
        <p style={{ color: '#475467', fontSize: 15, lineHeight: 1.6 }}>Thank you — our team will review your request and confirm a time with you by email. This is a request, not a confirmed appointment yet.</p>
      </div></div>
    );
  }

  return (
    <div style={page}><div style={card}>
      <h1 style={{ fontSize: 22, color: '#101828', margin: '0 0 4px' }}>Request an appointment</h1>
      <p style={{ color: '#667085', fontSize: 13, margin: '0 0 22px', lineHeight: 1.5 }}>Tell us a bit about you and your preferred times. Our team reviews every request and confirms by email — this form does not book an appointment automatically.</p>

      <label style={label}>Full name *</label>
      <input style={input} value={form.full_name} onChange={function(e) { set('full_name', e.target.value); }} placeholder="First and last name" />

      <div style={row2}>
        <div><label style={label}>Email *</label><input style={input} type="email" value={form.email} onChange={function(e) { set('email', e.target.value); }} placeholder="you@email.com" /></div>
        <div><label style={label}>Phone *</label><input style={input} value={form.phone} onChange={function(e) { set('phone', e.target.value); }} placeholder="(519) 555-0100" /></div>
      </div>

      <label style={label}>Address</label>
      <input style={input} value={form.address} onChange={function(e) { set('address', e.target.value); }} placeholder="Street, city, postal code" />

      <div style={row2}>
        <div><label style={label}>Date of birth</label><input style={input} value={form.dob} onChange={function(e) { set('dob', e.target.value); }} placeholder="YYYY-MM-DD" /></div>
        <div><label style={label}>Student ID (if applicable)</label><input style={input} value={form.student_id} onChange={function(e) { set('student_id', e.target.value); }} placeholder="Optional" /></div>
      </div>

      <label style={label}>Insurance / student plan</label>
      <input style={input} value={form.insurance} onChange={function(e) { set('insurance', e.target.value); }} placeholder="Provider / plan (optional)" />

      <label style={label}>Preferred day(s) & time window(s) *</label>
      <input style={input} value={form.preferred_windows} onChange={function(e) { set('preferred_windows', e.target.value); }} placeholder="e.g. Mon or Wed mornings; Fri afternoon" />

      <label style={label}>Reason for visit *</label>
      <textarea style={Object.assign({}, input, { minHeight: 84, resize: 'vertical' })} value={form.reason} onChange={function(e) { set('reason', e.target.value); }} placeholder="e.g. new-patient cleaning and exam" />

      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', background: '#f9fafb', border: '1px solid #e4e7ec', borderRadius: 8, padding: '12px 14px', marginBottom: 18 }}>
        <input type="checkbox" checked={consent} onChange={function(e) { setConsent(e.target.checked); }} style={{ marginTop: 3 }} />
        <span style={{ fontSize: 12.5, color: '#475467', lineHeight: 1.5 }}>{CONSENT_TEXT}</span>
      </label>

      {error && <div style={{ background: '#fef3f2', border: '1px solid #fecdca', color: '#b42318', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <button onClick={submit} disabled={loading} style={{ width: '100%', background: loading ? '#98a2b3' : '#101828', color: '#fff', border: 'none', borderRadius: 8, padding: '13px', fontSize: 15, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
        {loading ? 'Submitting…' : 'Submit request'}
      </button>
    </div></div>
  );
}
