// src/navMenu.js — Canonical main menu shared across all portal types
// Ordering and labels are authoritative. Portal-specific gating via `scope` field.
// scope: 'all' (every portal), 'admin' (SA + CSP only), 'sa' (SA only)

var NAV_MENU = [
  { id: 'dashboard',        label: 'Dashboard',             icon: '⊞',  scope: 'all' },
  { id: 'tenants',          label: 'Tenant Management',     icon: '🏢', scope: 'admin' },
  { id: 'hierarchy',        label: 'Hierarchy',             icon: '🌳', scope: 'sa' },
  { id: 'pipeline',         label: 'Pipeline',              icon: '📈', scope: 'all' },
  { id: 'sequenceroster',   label: 'Sequence Roster',       icon: '📋', scope: 'all' },
  { id: 'sequences',        label: 'Sequence Builder',      icon: '📝', scope: 'all' },
  { id: 'campaigns',        label: 'Campaigns',             icon: '🚀', scope: 'all' },
  { id: 'contacts',         label: 'Contacts',              icon: '👥', scope: 'all' },
  { id: 'inbox',            label: 'Live Inbox',            icon: '💬', scope: 'all' },
  { id: 'import',           label: 'Import Leads',          icon: '📥', scope: 'admin' },
  { id: 'lead-scan',        label: 'Lead Scan',             icon: '📲', scope: 'admin' },
  { id: 'chatbot',          label: 'AI Chatbot',            icon: '🤖', scope: 'all' },
  { id: 'flows',            label: 'Flow Builder',          icon: '⚡', scope: 'all' },
  { id: 'support',          label: 'Help Desk',             icon: '🎫', scope: 'all' },
  { id: 'registrations',    label: 'Registrations',         icon: '📋', scope: 'all' },
  { id: 'analytics',        label: 'Analytics',             icon: '📊', scope: 'all' },
  { id: 'integrations',     label: 'APIs & Integrations',   icon: '🔌', scope: 'all' },
  { id: 'branding',         label: 'Branding',              icon: '🎨', scope: 'all' },
  { id: 'settings',         label: 'Settings',              icon: '⚙️', scope: 'all' },
];

function getNavItems(portalScope) {
  // portalScope: 'sa', 'csp', 'tenant'
  return NAV_MENU.filter(function(item) {
    if (item.scope === 'all') return true;
    if (item.scope === 'admin') return portalScope === 'sa' || portalScope === 'csp';
    if (item.scope === 'sa') return portalScope === 'sa';
    return true;
  });
}

module.exports = { NAV_MENU: NAV_MENU, getNavItems: getNavItems };
