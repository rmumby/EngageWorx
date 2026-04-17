import { useState } from 'react';

export default function CreateSandbox({ C, onCreated }) {
  var showState = useState(false);
  var show = showState[0];
  var setShow = showState[1];

  var formState = useState({ fullName: '', email: '', companyName: '', plan: 'growth', password: '', isDemo: false });
  var form = formState[0];
  var setForm = formState[1];

  var loadingState = useState(false);
  var loading = loadingState[0];
  var setLoading = loadingState[1];

  var resultState = useState(null);
  var result = resultState[0];
  var setResult = resultState[1];

  var errorState = useState(null);
  var error = errorState[0];
  var setError = errorState[1];

  function generatePassword(company) {
    var base = company.replace(/[^a-zA-Z]/g, '');
    if (base.length < 3) base = 'Trial';
    return base.charAt(0).toUpperCase() + base.slice(1, 6) + '2026!';
  }

  function updateCompany(val) {
    setForm(Object.assign({}, form, { companyName: val, password: generatePassword(val) }));
  }

  async function handleCreate() {
    if (!form.email || !form.companyName) {
      setError('Email and Company Name are required');
      return;
    }
    if (!form.password) {
      setError('Password is required');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      var resp = await fetch('/api/create-sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          fullName: form.fullName.trim(),
          companyName: form.companyName.trim(),
          plan: form.plan,
          is_demo: form.isDemo,
        }),
      });
      var data = await resp.json();
      if (data.success) {
        setResult(data);
        if (onCreated) onCreated(data);
      } else {
        setError(data.error || 'Failed to create sandbox');
      }
    } catch (e) {
      setError('Network error: ' + e.message);
    }
    setLoading(false);
  }

  function reset() {
    setForm({ fullName: '', email: '', companyName: '', plan: 'growth', password: '', isDemo: false });
    setResult(null);
    setError(null);
  }

  var inputStyle = {
    width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 14,
    fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none',
  };
  var labelStyle = {
    color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 6, display: 'block', fontWeight: 700,
  };
  var btnPrimary = {
    background: 'linear-gradient(135deg, ' + (C.primary || '#00C9FF') + ', ' + (C.accent || '#E040FB') + ')',
    border: 'none', borderRadius: 10, padding: '10px 20px', color: '#000',
    fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
  };
  var btnSec = {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 600,
    cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
  };

  if (!show) {
    return (
      <button onClick={function() { setShow(true); reset(); }} style={btnPrimary}>
        + Create Sandbox
      </button>
    );
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid ' + (C.primary || '#00C9FF') + '33',
      borderRadius: 14, padding: 24, marginBottom: 20,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: 16, fontWeight: 700 }}>Create Sandbox Account</h3>
        <button onClick={function() { setShow(false); reset(); }} style={Object.assign({}, btnSec, { padding: '6px 14px' })}>Cancel</button>
      </div>

      {result ? (
        <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.3)', borderRadius: 10, padding: 20 }}>
          <div style={{ color: '#00E676', fontWeight: 700, fontSize: 15, marginBottom: 12 }}>✓ Sandbox Created Successfully</div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, fontSize: 13 }}>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Company:</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{result.tenantName}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Email:</span>
            <span style={{ color: '#fff' }}>{result.email}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Password:</span>
            <span style={{ color: C.primary || '#00C9FF', fontFamily: 'monospace' }}>{form.password}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Plan:</span>
            <span style={{ color: '#fff' }}>{result.plan}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Tenant ID:</span>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', fontSize: 11 }}>{result.tenantId}</span>
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>Portal URL:</span>
            <span style={{ color: C.primary || '#00C9FF' }}>portal.engwx.com</span>
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button onClick={function() {
              var text = 'Portal: portal.engwx.com\nEmail: ' + result.email + '\nPassword: ' + form.password + '\nPlan: ' + result.plan;
              navigator.clipboard.writeText(text);
            }} style={btnPrimary}>Copy Credentials</button>
            <button onClick={function() { reset(); }} style={btnSec}>Create Another</button>
            <button onClick={function() { setShow(false); reset(); }} style={btnSec}>Close</button>
          </div>
          <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
            Next: Assign a phone number in Supabase → phone_numbers table, then configure Twilio webhook.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Contact Name</label>
              <input value={form.fullName} onChange={function(e) { setForm(Object.assign({}, form, { fullName: e.target.value })); }} placeholder="Jane Smith" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Company Name *</label>
              <input value={form.companyName} onChange={function(e) { updateCompany(e.target.value); }} placeholder="Acme Telecom" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Email *</label>
              <input value={form.email} onChange={function(e) { setForm(Object.assign({}, form, { email: e.target.value })); }} placeholder="jane@company.com" type="email" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Temporary Password *</label>
              <input value={form.password} onChange={function(e) { setForm(Object.assign({}, form, { password: e.target.value })); }} placeholder="Auto-generated" style={Object.assign({}, inputStyle, { fontFamily: 'monospace' })} />
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Plan</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {['starter', 'growth', 'pro'].map(function(p) {
                var selected = form.plan === p;
                return (
                  <button key={p} onClick={function() { setForm(Object.assign({}, form, { plan: p })); }}
                    style={{
                      background: selected ? (C.primary || '#00C9FF') + '22' : 'rgba(255,255,255,0.03)',
                      border: '1px solid ' + (selected ? (C.primary || '#00C9FF') + '66' : 'rgba(255,255,255,0.08)'),
                      borderRadius: 8, padding: '8px 20px', color: selected ? (C.primary || '#00C9FF') : '#fff',
                      fontWeight: selected ? 700 : 500, cursor: 'pointer', fontSize: 13,
                      fontFamily: "'DM Sans', sans-serif", textTransform: 'capitalize',
                    }}>{p}</button>
                );
              })}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 16px', marginBottom: 16, background: form.isDemo ? 'rgba(224,64,251,0.08)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (form.isDemo ? 'rgba(224,64,251,0.35)' : 'rgba(255,255,255,0.08)'), borderRadius: 10, transition: 'all 0.2s' }}>
            <input type="checkbox" checked={form.isDemo} onChange={function(e) { setForm(Object.assign({}, form, { isDemo: e.target.checked })); }} style={{ accentColor: '#E040FB' }} />
            <div>
              <div style={{ color: form.isDemo ? '#E040FB' : '#fff', fontWeight: 700, fontSize: 13 }}>🎭 Demo Account</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 }}>{form.isDemo ? 'Skips onboarding wizard. User lands directly in the portal.' : 'Check to skip onboarding and pre-load demo fixtures.'}</div>
            </div>
          </label>

          {error && (
            <div style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#FF3B30', fontSize: 13 }}>
              {error}
            </div>
          )}

          <button onClick={handleCreate} disabled={loading} style={Object.assign({}, btnPrimary, { opacity: loading ? 0.6 : 1, width: '100%', padding: '12px 20px', fontSize: 14 })}>
            {loading ? 'Creating Account...' : (form.isDemo ? '🎭 Create Demo Account' : '🧪 Create Sandbox Account')}
          </button>

          <div style={{ marginTop: 12, color: 'rgba(255,255,255,0.25)', fontSize: 11, lineHeight: 1.5 }}>
            {form.isDemo
              ? 'Creates an account with onboarding pre-completed. User logs in and sees the portal immediately with sample data.'
              : 'Creates a real account. User goes through the onboarding wizard on first login to configure branding, email, and AI.'}
          </div>
        </>
      )}
    </div>
  );
}
