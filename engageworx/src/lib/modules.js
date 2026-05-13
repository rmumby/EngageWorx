// src/lib/modules.js — Canonical module registry
// Single source of truth for platform modules, nav items, and toggle state.
// All portals import from here. Phase 2 adds per-tenant toggle persistence.

export const MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊', route: 'dashboard', minTier: 'tenant', toggleable: false, category: 'core', description: 'Platform overview and key metrics' },
  { id: 'tenant_management', label: 'Tenant Management', icon: '🏢', route: 'tenants', minTier: 'csp', toggleable: false, category: 'admin', description: 'Manage sub-tenants and customers' },
  { id: 'hierarchy', label: 'Hierarchy', icon: '🌳', route: 'hierarchy', minTier: 'sa', toggleable: false, category: 'admin', description: 'Platform tenant tree' },
  { id: 'pipeline', label: 'Pipeline', icon: '📈', route: 'pipeline', minTier: 'tenant', toggleable: true, defaultEnabled: true, category: 'sales', description: 'Sales pipeline and deal tracking' },
  { id: 'sequence_roster', label: 'Sequence Roster', icon: '📋', route: 'sequence_roster', minTier: 'tenant', toggleable: true, defaultEnabled: true, category: 'sales', description: 'Active outreach sequences and recipients' },
  { id: 'sequence_builder', label: 'Sequence Builder', icon: '📝', route: 'sequence_builder', minTier: 'tenant', toggleable: true, defaultEnabled: true, category: 'sales', description: 'Design outreach sequences' },
  { id: 'campaigns', label: 'Campaigns', icon: '🚀', route: 'campaigns', minTier: 'tenant', toggleable: true, defaultEnabled: true, category: 'sales', description: 'Broadcast campaigns' },
  { id: 'contacts', label: 'Contacts', icon: '👥', route: 'contacts', minTier: 'tenant', toggleable: false, category: 'sales', description: 'Contact database' },
  { id: 'live_inbox', label: 'Live Inbox', icon: '💬', route: 'inbox', minTier: 'tenant', toggleable: false, category: 'sales', description: 'Real-time conversations across channels' },
  { id: 'import_leads', label: 'Import Leads', icon: '📥', route: 'import_leads', minTier: 'tenant', toggleable: true, defaultEnabled: true, category: 'sales', description: 'Bulk import contacts from CSV' },
  { id: 'lead_scan', label: 'Lead Scan', icon: '📇', route: 'lead_scan', minTier: 'tenant', toggleable: true, defaultEnabled: true, category: 'sales', description: 'Scan business cards into contacts' },
  { id: 'ai_chatbot', label: 'AI Chatbot', icon: '🤖', route: 'chatbot', minTier: 'tenant', toggleable: true, defaultEnabled: true, category: 'ai', description: 'Configure your AI assistant' },
  { id: 'flow_builder', label: 'Flow Builder', icon: '⚡', route: 'flows', minTier: 'tenant', toggleable: true, defaultEnabled: false, category: 'ai', description: 'Visual conversation flow editor' },
  { id: 'ai_omni_digest', label: 'AI Omnichannel Digest', icon: '📡', route: 'ai_digest', minTier: 'tenant', toggleable: true, defaultEnabled: false, category: 'ai', description: 'AI-curated summary of channel activity' },
  { id: 'action_board', label: 'Action Board', icon: '✅', route: 'action_board', minTier: 'tenant', toggleable: true, defaultEnabled: true, category: 'ai', description: 'AI-surfaced action items across the platform' },
  { id: 'registrations', label: 'Registrations', icon: '📋', route: 'registrations', minTier: 'tenant', toggleable: true, defaultEnabled: true, category: 'compliance', description: 'SMS/RCS/email sender registration' },
  { id: 'analytics', label: 'Analytics', icon: '📊', route: 'analytics', minTier: 'tenant', toggleable: true, defaultEnabled: true, category: 'analytics', description: 'Channel performance metrics' },
  { id: 'help_desk', label: 'Help Desk', icon: '🎫', route: 'help_desk', minTier: 'tenant', toggleable: true, defaultEnabled: true, category: 'integration', description: 'Submit and track support tickets' },
  { id: 'api_integrations', label: 'APIs & Integrations', icon: '🔌', route: 'integrations', minTier: 'tenant', toggleable: false, category: 'integration', description: 'Webhooks, API keys, third-party integrations' },
  { id: 'branding', label: 'Branding', icon: '🎨', route: 'branding', minTier: 'tenant', toggleable: false, category: 'integration', description: 'White-label branding and theme' },
  { id: 'settings', label: 'Settings', icon: '⚙️', route: 'settings', minTier: 'tenant', toggleable: false, category: 'core', description: 'Account, channels, team, modules' },
];

export const MODULE_CATEGORIES = {
  core: { label: 'Core', order: 1 },
  admin: { label: 'Administration', order: 2 },
  sales: { label: 'Sales & CRM', order: 3 },
  ai: { label: 'AI & Automation', order: 4 },
  compliance: { label: 'Compliance', order: 5 },
  analytics: { label: 'Analytics', order: 6 },
  integration: { label: 'Integration & Support', order: 7 },
};

const TIER_RANK = { tenant: 1, csp: 2, sa: 3 };

export function tierAllows(minTier, entityTier) {
  return (TIER_RANK[entityTier] || 1) >= (TIER_RANK[minTier] || 1);
}

export function getEnabledModules(entityTier, enabledModulesMap) {
  var tier = entityTier || 'tenant';
  var enabled = enabledModulesMap || {};
  return MODULES.filter(function(m) {
    if (!tierAllows(m.minTier, tier)) return false;
    if (!m.toggleable) return true;
    return enabled[m.id] !== undefined ? enabled[m.id] : m.defaultEnabled;
  });
}

export function getToggleableModules(entityTier) {
  var tier = entityTier || 'tenant';
  return MODULES.filter(function(m) { return m.toggleable && tierAllows(m.minTier, tier); });
}

export function getModuleById(id) {
  return MODULES.find(function(m) { return m.id === id; });
}
