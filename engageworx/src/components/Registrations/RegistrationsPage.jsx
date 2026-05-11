import React, { useState, useEffect } from 'react';
import TCRTab from './TCRTab';

var TABS = [
  { id: 'tcr', label: '10DLC / TCR', active: true },
  { id: 'whatsapp', label: 'WhatsApp', active: false },
  { id: 'rcs', label: 'RCS', active: false },
];

export default function RegistrationsPage({ tenantId, C }) {
  var [activeTab, setActiveTab] = useState('tcr');
  var colors = C || { primary: '#00BFFF', accent: '#A855F7', muted: '#6B7280', text: '#E8F4FD', bg: '#080d1a', surface: '#0d1425', border: '#182440' };

  useEffect(function() {
    setTimeout(function() { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; }, 50);
  }, []);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", padding: '20px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Registrations</h1>
        <p style={{ color: colors.muted, fontSize: 14, margin: 0 }}>Register your channels for compliant messaging</p>
      </div>
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid ' + colors.border }}>
        {TABS.map(function(tab) {
          var isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={function() { if (tab.active) setActiveTab(tab.id); }}
              disabled={!tab.active}
              style={{
                padding: '10px 20px', border: 'none', borderBottom: isActive ? '2px solid ' + colors.primary : '2px solid transparent',
                background: 'none', color: isActive ? colors.primary : tab.active ? colors.muted : 'rgba(255,255,255,0.2)',
                fontWeight: isActive ? 700 : 500, fontSize: 14, cursor: tab.active ? 'pointer' : 'default',
                fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s',
              }}>
              {tab.label}{!tab.active && <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.5 }}>Coming soon</span>}
            </button>
          );
        })}
      </div>
      {activeTab === 'tcr' && <TCRTab tenantId={tenantId} C={colors} />}
      {activeTab === 'whatsapp' && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.muted }}>WhatsApp registration coming soon.</div>
      )}
      {activeTab === 'rcs' && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: colors.muted }}>RCS registration coming soon.</div>
      )}
    </div>
  );
}
