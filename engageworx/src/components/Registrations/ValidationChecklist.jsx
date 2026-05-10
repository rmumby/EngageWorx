import React from 'react';

var ICONS = { pass: '✅', warn: '⚠️', fail: '❌' };
var COLORS = { pass: '#10b981', warn: '#F59E0B', fail: '#EF4444' };

export default function ValidationChecklist({ checks, onGoToStep, C }) {
  if (!checks || checks.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {checks.map(function(c, i) {
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{ICONS[c.status] || '❓'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: COLORS[c.status] || '#6B7280', fontSize: 13, fontWeight: 600 }}>{c.check}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>{c.message}</div>
              {c.fix && <div style={{ color: '#A855F7', fontSize: 11, marginTop: 4 }}>{c.fix}</div>}
            </div>
            {c.status === 'fail' && onGoToStep && (
              <button onClick={function() { onGoToStep(c.step || 0); }} style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '3px 10px', color: '#EF4444', fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap' }}>Fix →</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
