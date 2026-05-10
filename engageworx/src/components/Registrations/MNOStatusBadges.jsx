import React from 'react';

var CARRIERS = [
  { key: 'tmobile', label: 'T-Mobile' },
  { key: 'att', label: 'AT&T' },
  { key: 'verizon', label: 'Verizon' },
  { key: 'uscc', label: 'US Cellular' },
];

var STATUS_COLORS = { ACTIVE: '#10b981', PENDING: '#F59E0B', REJECTED: '#EF4444' };

export default function MNOStatusBadges({ mnoStatus }) {
  if (!mnoStatus) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {CARRIERS.map(function(c) {
        var status = mnoStatus[c.key] || 'PENDING';
        var color = STATUS_COLORS[status] || '#6B7280';
        return (
          <span key={c.key} style={{ padding: '3px 10px', borderRadius: 20, background: color + '18', color: color, fontSize: 11, fontWeight: 700, border: '1px solid ' + color + '33' }}>
            {c.label}: {status}
          </span>
        );
      })}
    </div>
  );
}
