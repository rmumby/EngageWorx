import React from 'react';

var CARRIERS = [
  { key: 'tmobile', label: 'T-Mobile', brand: '#E20074', window: 'Typically 0–24 hours' },
  { key: 'att', label: 'AT&T', brand: '#00A8E0', window: 'Typically 1–3 business days' },
  { key: 'verizon', label: 'Verizon', brand: '#CD040B', window: 'Typically 1–3 business days' },
  { key: 'uscc', label: 'US Cellular', brand: '#003DA5', window: 'Varies' },
];

var STATUS_COLORS = { ACTIVE: '#10b981', PENDING: '#F59E0B', REJECTED: '#EF4444' };

// Compact mode — small pills for TCRTab list rows
function CompactBadges({ mnoStatus }) {
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

// Pulse animation injected once
var pulseInjected = false;
function ensurePulseAnimation() {
  if (pulseInjected || typeof document === 'undefined') return;
  var style = document.createElement('style');
  style.textContent = '@keyframes mnoPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }';
  document.head.appendChild(style);
  pulseInjected = true;
}

// Full mode — carrier cards for StepStatus
function FullCards({ mnoStatus }) {
  ensurePulseAnimation();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
      {CARRIERS.map(function(c) {
        var status = mnoStatus[c.key] || 'PENDING';
        var statusColor = STATUS_COLORS[status] || '#6B7280';
        var isPending = status === 'PENDING';
        return (
          <div key={c.key} style={{ background: '#fff', borderRadius: 12, padding: '16px 16px 16px 19px', border: '1px solid #E8EAF0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', borderLeft: '3px solid ' + statusColor, transition: 'border-color 0.3s ease', position: 'relative' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 3, height: 16, borderRadius: 2, background: c.brand, flexShrink: 0 }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0D1117' }}>{c.label}</div>
            </div>
            {/* Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, flexShrink: 0, animation: isPending ? 'mnoPulse 1.5s ease-in-out infinite' : 'none', transition: 'background 0.3s ease' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: statusColor, transition: 'color 0.3s ease' }}>{status}</div>
            </div>
            {/* Subtext */}
            <div style={{ fontSize: 11, color: '#9CA3AF', lineHeight: 1.4 }}>
              {isPending ? c.window : status === 'ACTIVE' ? 'Approved' : 'Review required'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MNOStatusBadges({ mnoStatus, mode }) {
  if (!mnoStatus) return null;
  if (mode === 'full') return <FullCards mnoStatus={mnoStatus} />;
  return <CompactBadges mnoStatus={mnoStatus} />;
}
