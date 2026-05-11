import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';

export default function AIAssistButton({ sessionId, field, onResult, disabled, disabledTooltip, C }) {
  var [loading, setLoading] = useState(false);
  var [error, setError] = useState(null);

  async function handleClick() {
    if (disabled) return;
    if (!sessionId) { setError('Save step first'); return; }
    setLoading(true);
    setError(null);
    try {
      var session = await supabase.auth.getSession();
      var token = session.data && session.data.session ? session.data.session.access_token : '';
      var res = await fetch('/api/tcr-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'ai_pre_fill', session_id: sessionId, field: field }),
      });
      var data = await res.json();
      if (data.error) { setError(data.error); }
      else if (data.suggestion && onResult) { onResult(data.suggestion, data.reasoning); }
      else { setError('No suggestion returned'); }
    } catch (e) {
      console.warn('[AIAssist] error:', e.message);
      setError('Failed');
    }
    setLoading(false);
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={loading || disabled}
        title={disabled ? (disabledTooltip || 'Fill required fields first') : 'AI suggest'}
        style={{ background: (loading || disabled) ? 'rgba(168,85,247,0.1)' : '#A855F7', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: (loading || disabled) ? 'not-allowed' : 'pointer', fontSize: 12, color: '#fff', fontFamily: "'DM Sans', sans-serif", opacity: (loading || disabled) ? 0.4 : 1 }}>
        {loading ? '⏳' : '✨'}
      </button>
      {error && <span style={{ color: '#EF4444', fontSize: 10 }}>{error}</span>}
    </span>
  );
}
