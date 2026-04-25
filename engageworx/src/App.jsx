// ─── TENANT DATA ──────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback, useRef } from "react";
import { AuthProvider, useAuth } from './AuthContext';
import PipelineDashboard from './components/PipelineDashboard';
import { supabase } from './supabaseClient';
import SignupPage from './SignupPage';
import AdminTenants from './AdminTenants';
import AnalyticsDashboard from './AnalyticsDashboard';
import CampaignsModule from './CampaignsModule';
import ContactsModule from './ContactsModule';
import LiveInbox from './components/LiveInboxV2';
import AIChatbot from './AIChatbot';
import BlogAdmin from './BlogAdmin';
import ImportLeads from './ImportLeads';
import CreateSandbox from './CreateSandbox';
import CSPPortal from './CSPPortal';
import SequenceBuilder from './SequenceBuilder';
import AgentPortal from './AgentPortal';
import MasterAgentPortal from './MasterAgentPortal';
import HierarchyView from './HierarchyView';
import HelpDeskModule from './components/HelpDesk/HelpDeskModule';
import { ThemeProvider, useTheme, getThemedColors, ThemeToggle } from './ThemeContext';
import { useTranslation } from 'react-i18next';
import FlowBuilder from './FlowBuilder';
import Settings from './Settings';
import LeadScan from './LeadScan';
import MobileDemo from './MobileDemo';
import SequenceRoster from './SequenceRoster';
import TCRRegistration from './TCRRegistration';
import TCRQueue from './TCRQueue';
import BrandingEditor from './BrandingEditor';
import EmailDigest from './EmailDigest';
import CustomerSuccessDashboard from './CustomerSuccessDashboard';
import PlatformUpdates from './PlatformUpdates';
import PlatformUpdatesBell from './PlatformUpdatesBell';
import SupportRequestForm from './SupportRequestForm';
import OnboardingWizard from './OnboardingWizard';
import AutoDetectBrandBar from './AutoDetectBrandBar';
import SetupChecklist from './SetupChecklist';
import AUPModal from './AUPModal';
import { FeatureGate, KycStartBanner } from './FeatureGate';
import LandingPage from './components/LandingPage';
import { lazy, Suspense } from 'react';
const Blog = lazy(() => import('./Blog'));
const ApiDocs = lazy(() => import('./ApiDocs'));

// ─── LIVE DATA HOOK ──────────────────────────────────────────────────────────
function useLiveData(demoMode, isSPAdmin) {
  const [liveTenants, setLiveTenants] = useState([]);
  const [liveStats, setLiveStats] = useState({ totalMessages: 0, totalRevenue: 0, totalCampaigns: 0 });
  const [liveLoading, setLiveLoading] = useState(false);

  const fetchLiveData = useCallback(async () => {
    if (!isSPAdmin) { setLiveLoading(false); return; }
    setLiveLoading(true);
    try {
      const { data: tenants, error } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Count contacts directly assigned to each tenant
      const { data: contactCounts } = await supabase
        .from('contacts')
        .select('tenant_id')
        .neq('tenant_id', null);
      const countMap = {};
      (contactCounts || []).forEach(c => {
        countMap[c.tenant_id] = (countMap[c.tenant_id] || 0) + 1;
      });

      // Count Pipeline contacts under SP tenant by company name
      const { data: pipelineContacts } = await supabase
        .from('contacts')
        .select('company_name')
        .eq('tenant_id', (process.env.REACT_APP_SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387'));
      const companyCountMap = {};
      (pipelineContacts || []).forEach(c => {
        if (c.company_name) {
          var key = c.company_name.toLowerCase().trim();
          companyCountMap[key] = (companyCountMap[key] || 0) + 1;
        }
      });

      // Source of truth for active channels per tenant — channel_configs.enabled = true
      const { data: chRows } = await supabase
        .from('channel_configs')
        .select('tenant_id, channel, enabled')
        .eq('enabled', true);
      const channelMap = {};
      const CHANNEL_LABELS = { sms: 'SMS', email: 'Email', whatsapp: 'WhatsApp', voice: 'Voice', rcs: 'RCS', mms: 'MMS' };
      (chRows || []).forEach(function(r) {
        if (!r.tenant_id || !r.channel) return;
        if (!channelMap[r.tenant_id]) channelMap[r.tenant_id] = [];
        var label = CHANNEL_LABELS[String(r.channel).toLowerCase()] || r.channel.toUpperCase();
        if (channelMap[r.tenant_id].indexOf(label) === -1) channelMap[r.tenant_id].push(label);
      });
      // Poland carrier — separate table, add 🇵🇱 Poland badge for enabled configs
      try {
        const { data: plRows } = await supabase.from('poland_carrier_configs').select('tenant_id').eq('enabled', true);
        (plRows || []).forEach(function(r) {
          if (!r.tenant_id) return;
          if (!channelMap[r.tenant_id]) channelMap[r.tenant_id] = [];
          if (channelMap[r.tenant_id].indexOf('🇵🇱 Poland') === -1) channelMap[r.tenant_id].push('🇵🇱 Poland');
        });
      } catch (e) {}

      const formatted = (tenants || []).map(t => {
        var directCount = countMap[t.id] || 0;
        var companyKey = (t.brand_name || t.name || '').toLowerCase().trim();
        var pipelineCount = companyCountMap[companyKey] || 0;
        var totalContacts = directCount > 0 ? directCount : pipelineCount;
        return {
          id: t.id,
          name: t.name,
          logo: (t.brand_name || t.name || '??').substring(0, 2).toUpperCase(),
          role: "customer",
          brand: {
            primary: t.brand_primary || '#00C9FF',
            secondary: t.brand_secondary || '#E040FB',
            name: t.brand_name || t.name,
          },
          colors: {
            primary: t.brand_primary || '#00C9FF',
            accent: t.brand_secondary || '#E040FB',
            bg: "#080d1a", surface: "#0d1425", border: "#182440",
            text: "#E8F4FD", muted: "#6B8BAE",
          },
          stats: {
            messages: 0, revenue: 0, campaigns: 0,
            contacts: totalContacts, deliveryRate: 0, openRate: 0,
          },
          channels: channelMap[t.id] || [],
          plan: t.plan,
          status: t.status,
          slug: t.slug,
          tenant_type: t.tenant_type || 'business',
          parent_tenant_id: t.parent_tenant_id,
        };
      });

      // SP view: show CSPs but hide their sub-tenants
const filtered = formatted.filter(t => !t.parent_tenant_id);
setLiveTenants(filtered);
setLiveStats({
  totalMessages: 0,
  totalRevenue: 0,
  activeCustomers: filtered.filter(t => t.tenant_type !== 'csp').length,
  totalCampaigns: 0,
});
    } catch (err) {
      console.warn('Live data fetch error:', err.message);
    }
    setLiveLoading(false);
  }, []);

  // Only fetch for SP admin — non-SP users shouldn't query ALL tenants/contacts (fails with RLS)
  useEffect(() => {
    if (!demoMode && isSPAdmin) fetchLiveData();
  }, [demoMode, isSPAdmin, fetchLiveData]);
  return { liveTenants, liveStats, liveLoading, refreshLiveData: fetchLiveData };
}

const TENANTS = {
  serviceProvider: {
    id: "sp_root",
    name: "EngageWorx",
    logo: "EW",
    role: "superadmin",
    colors: { primary: "#00C9FF", accent: "#E040FB", bg: "#080d1a", surface: "#0d1425", border: "#182440", text: "#E8F4FD", muted: "#6B8BAE" },
    customers: ["acme", "retailco", "finserv"],
    stats: { totalMessages: 1284712, totalRevenue: 892450, activeCustomers: 3, totalCampaigns: 87 },
  },
  acme: {
    id: "acme",
    name: "Acme Corp",
    logo: "AC",
    role: "customer",
    brand: { primary: "#FF6B35", secondary: "#FF8C42", name: "AcmeEngage" },
    colors: { primary: "#FF6B35", accent: "#FF8C42", bg: "#0c0a10", surface: "#141018", border: "#2a1f30", text: "#FFF0E8", muted: "#8B6B55" },
    stats: { messages: 284712, revenue: 128450, campaigns: 24, contacts: 48200, deliveryRate: 95.3, openRate: 51.2 },
    channels: ["SMS", "Email", "WhatsApp"],
  },
  retailco: {
    id: "retailco",
    name: "RetailCo",
    logo: "RC",
    role: "customer",
    brand: { primary: "#00E676", secondary: "#00BFA5", name: "RetailReach" },
    colors: { primary: "#00E676", accent: "#00BFA5", bg: "#080d10", surface: "#0d1518", border: "#122a20", text: "#E8FFF2", muted: "#4B8B65" },
    stats: { messages: 612340, revenue: 441200, campaigns: 38, contacts: 124000, deliveryRate: 97.1, openRate: 44.8 },
    channels: ["SMS", "MMS", "Email", "RCS"],
  },
  finserv: {
    id: "finserv",
    name: "FinServ Group",
    logo: "FS",
    role: "customer",
    brand: { primary: "#7C4DFF", secondary: "#651FFF", name: "FinConnect" },
    colors: { primary: "#7C4DFF", accent: "#651FFF", bg: "#0a0810", surface: "#110e1c", border: "#1e1535", text: "#EDE8FF", muted: "#6B5B8B" },
    stats: { messages: 387660, revenue: 322800, campaigns: 25, contacts: 89300, deliveryRate: 98.2, openRate: 62.1 },
    channels: ["SMS", "Email", "Voice"],
  },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function Badge({ children, color, size = "sm" }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: size === "sm" ? "2px 8px" : "4px 12px",
      fontSize: size === "sm" ? 11 : 13, fontWeight: 700, letterSpacing: 0.5,
    }}>{children}</span>
  );
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid rgba(255,255,255,0.08)`, borderTop: `3px solid ${color}`, borderRadius: 12, padding: "20px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
        <span style={{ fontSize: 20 }}>{icon}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "10px 0 4px" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color }}>{sub}</div>}
    </div>
  );
}

// ─── SUPER ADMIN VIEW (Service Provider) ─────────────────────────────────────
function SuperAdminDashboard({ tenant, onDrillDown, C, demoMode, liveTenants, liveStats }) {
  const sp = TENANTS.serviceProvider;
  const customers = demoMode
    ? sp.customers.map(id => TENANTS[id])
    : liveTenants;
  const stats = demoMode ? sp.stats : liveStats;

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1400 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Badge color={C.primary} size="md">🌐 Service Provider View</Badge>
            <Badge color="#00E676" size="md">● All Systems Operational</Badge>
          </div>
        <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>API keys, integrations, channels, billing & team management</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginBottom: 32 }}>
        <StatCard label="Total Messages Sent" value={stats.totalMessages >= 1000000 ? (stats.totalMessages / 1000000).toFixed(2) + 'M' : stats.totalMessages.toLocaleString()} sub="Across all tenants" color={C.primary} icon="📨" />
        <StatCard label="Platform Revenue" value={`$${stats.totalRevenue.toLocaleString()}`} sub="+18.4% this month" color="#00E676" icon="💰" />
        <StatCard label="Active Customers" value={String(stats.activeCustomers || customers.length)} sub="All tenants healthy" color={C.accent} icon="🏢" />
        <StatCard label="Total Campaigns" value={String(stats.totalCampaigns)} sub={demoMode ? "32 currently live" : ""} color="#FF6B35" icon="🚀" />
      </div>

      <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Customer Tenants</h2>
      <div style={{ display: "grid", gap: 16, marginBottom: 32 }}>
        {customers.length === 0 && !demoMode && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No tenants yet</div>
            <div style={{ color: C.muted, fontSize: 14 }}>Tenants will appear here as customers sign up and complete payment.</div>
          </div>
        )}
        {customers.map(c => (
          <div key={c.id} style={{
            background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.08)`,
            borderLeft: `4px solid ${c.brand.primary}`, borderRadius: 12, padding: "22px 28px",
            display: "grid", gridTemplateColumns: "220px 1fr 1fr 1fr 1fr 1fr 140px",
            alignItems: "center", gap: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, background: `linear-gradient(135deg, ${c.brand.primary}, ${c.brand.secondary})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#000" }}>{c.logo}</div>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                <div style={{ color: c.brand.primary, fontSize: 12 }}>{c.brand.name}</div>
              </div>
            </div>
            {[
              { label: "Messages", val: c.stats.messages.toLocaleString() },
              { label: "Revenue", val: `$${c.stats.revenue.toLocaleString()}` },
              { label: "Campaigns", val: c.stats.campaigns },
              { label: "Contacts", val: c.stats.contacts.toLocaleString() },
              { label: "Delivery", val: `${c.stats.deliveryRate}%` },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{s.val}</div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{s.label}</div>
              </div>
            ))}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Badge color={c.status === 'suspended' ? '#FF3B30' : c.status === 'trial' ? '#F59E0B' : '#00E676'}>● {(c.status || 'active').charAt(0).toUpperCase() + (c.status || 'active').slice(1)}</Badge>
              <button onClick={() => onDrillDown(c.id)} style={{
                background: `${c.brand.primary}22`, border: `1px solid ${c.brand.primary}66`,
                borderRadius: 7, padding: "7px 10px", color: c.brand.primary,
                fontWeight: 700, cursor: "pointer", fontSize: 12,
              }}>Drill Down →</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>Channel Usage — Platform Wide</h3>
          {[
            { ch: "SMS", pct: 42, color: C.primary },
            { ch: "Email", pct: 24, color: "#FF6B35" },
            { ch: "WhatsApp", pct: 18, color: "#25D366" },
            { ch: "Voice", pct: 8, color: C.accent },
            { ch: "RCS", pct: 5, color: "#00E676" },
            { ch: "MMS", pct: 3, color: "#7C4DFF" },
          ].map(r => (
            <div key={r.ch} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{r.ch}</span>
                <span style={{ color: r.color, fontSize: 12, fontWeight: 700 }}>{r.pct}%</span>
              </div>
              <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${r.pct}%`, background: r.color, borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 14, padding: 24 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px", fontSize: 16 }}>Tenant Comparison</h3>
          {customers.map(c => {
            const maxRev = 500000;
            const pct = Math.round((c.stats.revenue / maxRev) * 100);
            return (
              <div key={c.id} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                  <span style={{ color: c.brand.primary, fontSize: 13, fontWeight: 700 }}>${c.stats.revenue.toLocaleString()}</span>
                </div>
                <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${c.brand.primary}, ${c.brand.secondary})`, borderRadius: 4 }} />
                </div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 3 }}>{c.stats.messages.toLocaleString()} messages · {c.stats.campaigns} campaigns</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── TENANT MANAGEMENT (White-label config) ───────────────────────────────────
function TenantManagement({ C, demoMode = false, onDrillDown, refreshLiveData, currentTenantId }) {
  const [activeTab, setActiveTab] = useState("tenants");
  const [showNew, setShowNew] = useState(false);
  const [showDemoForm, setShowDemoForm] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ tenant_name: '', admin_full_name: '', admin_email: '', industry: '', website: '', plan_slug: 'starter', customer_type: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [invitePlans, setInvitePlans] = useState([]);
  const [inviteIndustries, setInviteIndustries] = useState([]);
  const [inviteCustomerTypes, setInviteCustomerTypes] = useState([]);
  const [demoForm, setDemoForm] = useState({ email: "", password: "demo1234", companyName: "", brandColor: "#00C9FF", plan: "starter", expiresIn: "7" });
  const [demoCreating, setDemoCreating] = useState(false);
  const [demoResult, setDemoResult] = useState(null);
  const [editingBrand, setEditingBrand] = useState(null);
  const [brandForm, setBrandForm] = useState({ name: "", primary: "", secondary: "", logo: "" });
  const [configuringTenant, setConfiguringTenant] = useState(null);
  const [suspendedTenants, setSuspendedTenants] = useState({});
  const [confirmSuspend, setConfirmSuspend] = useState(null);
  const [liveTenants, setLiveTenants] = useState([]);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [newTenant, setNewTenant] = useState({ companyName: "", brandName: "", email: "", domain: "", color: "#00C9FF", plan: "starter", type: "direct" });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [configForm, setConfigForm] = useState({});
 async function handleSaveTenantConfig(tenant) {
    var planDefaults = {
      starter:    { message_limit: 5000,   contact_limit: 10000,   user_seats: 3 },
      growth:     { message_limit: 25000,  contact_limit: 50000,   user_seats: 10 },
      pro:        { message_limit: 50000,  contact_limit: 100000,  user_seats: 25 },
      enterprise: { message_limit: 250000, contact_limit: 500000,  user_seats: 100 },
      silver:     { message_limit: 10000,  contact_limit: 50000,   user_seats: 10 },
      gold:       { message_limit: 50000,  contact_limit: 200000,  user_seats: 50 },
      platinum:   { message_limit: 200000, contact_limit: 500000,  user_seats: 200 },
      diamond:    { message_limit: 500000, contact_limit: 1000000, user_seats: 500 },
    };
    var planVal = configForm.plan || tenant.plan;
    var defaults = planDefaults[planVal] || {};
    var result = await supabase.from('tenants').update({
      plan: planVal,
      message_limit: defaults.message_limit || tenant.message_limit,
      contact_limit: defaults.contact_limit || tenant.contact_limit,
      user_seats: defaults.user_seats || tenant.user_seats || 10,
    }).eq('id', tenant.id);
    console.log('[SaveTenant]', planVal, defaults);
    setConfiguringTenant(null);
    window.location.reload();
  }

  const handleCreateTenant = async () => {
    if (!newTenant.companyName || !newTenant.email) return alert("Company name and email are required");
    setCreateLoading(true);
    setCreateError(null);
    try {
      var slug = newTenant.companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
      var insertPayload = {
        name: newTenant.companyName,
        slug: slug,
        plan: newTenant.plan,
        status: 'trial',
        brand_primary: newTenant.color,
        brand_name: newTenant.brandName || newTenant.companyName,
        channels_enabled: ['sms', 'email'],
        tenant_type: newTenant.type,
        custom_domain: newTenant.domain || null,
      };
      if (currentTenantId) {
        insertPayload.parent_tenant_id = currentTenantId;
      }
      var tenantRes = await supabase.from('tenants').insert(insertPayload).select().single();
      if (tenantRes.error) throw new Error(tenantRes.error.message);
      // Link user as admin team member. If user doesn't exist, invite via Supabase auth.
      var userRes = await supabase.from('user_profiles').select('id').ilike('email', newTenant.email).maybeSingle();
      var userId = userRes.data ? userRes.data.id : null;

      if (!userId) {
        // New user — send Supabase magic-link invite
        try {
          var inv = await supabase.auth.admin.inviteUserByEmail(newTenant.email, {
            data: { tenant_id: tenantRes.data.id, role: 'admin' },
          });
          if (inv.data && inv.data.user) {
            userId = inv.data.user.id;
            await supabase.from('user_profiles').upsert({
              id: userId, email: newTenant.email, tenant_id: tenantRes.data.id,
              role: 'admin', company_name: newTenant.companyName,
            }, { onConflict: 'id' });
          }
        } catch (invErr) { console.warn('[CreateTenant] invite failed:', invErr.message); }
      } else {
        await supabase.from('user_profiles').update({ tenant_id: tenantRes.data.id, role: 'admin' }).eq('id', userId);
      }

      if (userId) {
        await supabase.from('tenant_members').upsert({
          tenant_id: tenantRes.data.id, user_id: userId, role: 'admin',
          status: 'active', joined_at: new Date().toISOString(),
          notify_on_escalation: true, notify_on_new_signup: false,
          notify_on_payment: true, notify_on_new_lead: false,
        }, { onConflict: 'user_id,tenant_id' });
      }

      // Send welcome email
      try {
        await fetch('/api/csp?action=test_welcome_email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            csp_tenant_id: (process.env.REACT_APP_SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387'),
            email: newTenant.email,
            company_name: newTenant.companyName,
            plan: newTenant.plan,
          }),
        });
      } catch (we) { console.log('[SP] Welcome email failed:', we.message); }
      // SP admin notification
      var notifyPayload = {
        subject: '🎉 New Tenant Created: ' + newTenant.companyName + ' (' + newTenant.plan + ')',
        text: 'New tenant manually created\n\nCompany: ' + newTenant.companyName + '\nEmail: ' + newTenant.email + '\nPlan: ' + newTenant.plan + '\nType: ' + newTenant.type,
      };
      console.log('[CreateTenant] Firing notify-admin with:', notifyPayload);
      try {
        var spNotifyRes = await fetch('/api/notify-admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(notifyPayload),
        });
        var spNotifyData = await spNotifyRes.json();
        console.log('[CreateTenant] notify-admin response:', spNotifyData);
      } catch(e) { console.error('[CreateTenant] notify-admin failed:', e.message); }

      setShowNew(false);
      setNewTenant({ companyName: "", brandName: "", email: "", domain: "", color: "#00C9FF", plan: "starter", type: "direct" });
      window.location.reload();
    } catch (e) {
      setCreateError(e.message);
      alert("Error creating tenant: " + e.message);
    }
    setCreateLoading(false);
  };
  {showNew && (
  <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.primary}44`, borderRadius: 14, padding: 28, marginBottom: 24 }}>
    <h3 style={{ color: "#fff", margin: "0 0 20px" }}>Onboard New Tenant</h3>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
      <div>
        <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Company Name *</label>
        <input value={newTenant.companyName} onChange={e => setNewTenant({...newTenant, companyName: e.target.value})} placeholder="e.g. TechCorp Ltd" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box", colorScheme: "dark" }} />
      </div>
      <div>
        <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>White-Label Brand Name</label>
        <input value={newTenant.brandName} onChange={e => setNewTenant({...newTenant, brandName: e.target.value})} placeholder="e.g. TechEngage" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box", colorScheme: "dark" }} />
      </div>
      <div>
        <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Admin Email *</label>
        <input value={newTenant.email} onChange={e => setNewTenant({...newTenant, email: e.target.value})} placeholder="admin@techcorp.com" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box", colorScheme: "dark" }} />
      </div>
      <div>
        <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Custom Domain</label>
        <input value={newTenant.domain} onChange={e => setNewTenant({...newTenant, domain: e.target.value})} placeholder="messaging.techcorp.com" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box", colorScheme: "dark" }} />
      </div>
      <div>
        <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Plan</label>
        <select value={newTenant.plan} onChange={e => setNewTenant({...newTenant, plan: e.target.value})} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box", colorScheme: "dark" }}>
          <option value="starter">Starter $99/mo</option>
<option value="growth">Growth $249/mo</option>
<option value="pro">Pro $499/mo</option>
<option value="enterprise">Enterprise</option>
<option disabled>── CSP Partners ──</option>
<option value="silver">Silver $499/mo</option>
<option value="gold">Gold $1,499/mo</option>
<option value="platinum">Platinum $3,999/mo</option>
<option value="diamond">Diamond $7,999/mo</option>
        </select>
      </div>
      <div>
        <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Tenant Type</label>
        <select value={newTenant.type} onChange={e => setNewTenant({...newTenant, type: e.target.value})} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box", colorScheme: "dark" }}>
          <option value="direct">Direct Business</option>
          <option value="csp">CSP / Reseller</option>
          <option value="agent">Agent</option>
        </select>
      </div>
    </div>
    {createError && <div style={{ color: "#FF3B30", fontSize: 13, marginTop: 12 }}>{createError}</div>}
    <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
      <button onClick={() => handleCreateTenant()} disabled={createLoading} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 8, padding: "10px 22px", color: "#000", fontWeight: 700, cursor: "pointer", opacity: createLoading ? 0.6 : 1 }}>{createLoading ? "Creating..." : "Create Tenant"}</button>
      <button onClick={() => { setShowNew(false); setCreateError(null); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 22px", color: C.muted, cursor: "pointer" }}>Cancel</button>
    </div>
  </div>
)}

{showInvite && (
  <div style={{ background: "rgba(255,255,255,0.04)", border: '1px solid #10b98144', borderRadius: 14, padding: 28, marginBottom: 24 }}>
    <h3 style={{ color: "#fff", margin: "0 0 20px" }}>🚀 Invite Tenant</h3>
    {inviteResult ? (
      <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, padding: 20 }}>
        <div style={{ color: '#10b981', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>✅ Tenant Created Successfully</div>
        <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.8 }}>
          <div><strong>Tenant ID:</strong> <code style={{ color: '#00C9FF' }}>{inviteResult.tenant_id}</code></div>
          <div><strong>Welcome email:</strong> {inviteResult.welcome_email_sent ? '✅ Sent' : '❌ Failed'}</div>
          <div><strong>Temp password:</strong> <code style={{ color: '#FFD600', fontFamily: 'monospace' }}>{inviteResult.temp_password_for_admin_display}</code></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {onDrillDown && <button onClick={function() { onDrillDown(inviteResult.tenant_id); setShowInvite(false); setInviteResult(null); }} style={{ background: 'linear-gradient(135deg, ' + C.primary + ', ' + (C.accent || C.primary) + ')', border: 'none', borderRadius: 8, padding: '10px 20px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Open Tenant Portal</button>}
          <button onClick={function() { setShowInvite(false); setInviteResult(null); setInviteForm({ tenant_name: '', admin_full_name: '', admin_email: '', industry: '', website: '', plan_slug: 'starter' }); window.location.reload(); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 20px', color: C.muted, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    ) : (
      <>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Company Name *</label>
            <input value={inviteForm.tenant_name} onChange={function(e) { setInviteForm(Object.assign({}, inviteForm, { tenant_name: e.target.value })); }} placeholder="Acme Corp" style={inputStyleTM} />
          </div>
          <div>
            <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Admin Full Name *</label>
            <input value={inviteForm.admin_full_name} onChange={function(e) { setInviteForm(Object.assign({}, inviteForm, { admin_full_name: e.target.value })); }} placeholder="Jane Smith" style={inputStyleTM} />
          </div>
          <div>
            <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Admin Email *</label>
            <input type="email" value={inviteForm.admin_email} onChange={function(e) { setInviteForm(Object.assign({}, inviteForm, { admin_email: e.target.value })); }} placeholder="jane@acme.com" style={inputStyleTM} />
          </div>
          <div>
            <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Website</label>
            <input value={inviteForm.website} onChange={function(e) { setInviteForm(Object.assign({}, inviteForm, { website: e.target.value })); }} placeholder="https://acme.com" style={inputStyleTM} />
          </div>
          <div>
            <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Customer Type *</label>
            {inviteCustomerTypes.length === 0 ? (
              <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: '8px 12px', color: '#eab308', fontSize: 11 }}>Customer Type Options not configured. Go to Platform Settings → Onboarding to define types.</div>
            ) : (
              <select value={inviteForm.customer_type} onChange={function(e) { setInviteForm(Object.assign({}, inviteForm, { customer_type: e.target.value, plan_slug: '' })); }} style={inputStyleTM}>
                <option value="">Select customer type...</option>
                {inviteCustomerTypes.map(function(ct) { var val = typeof ct === 'object' ? ct.value : ct; var lbl = typeof ct === 'object' ? ct.label : ct; return <option key={val} value={val}>{lbl}</option>; })}
              </select>
            )}
          </div>
          <div>
            <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Plan *</label>
            {(() => {
              var filteredPlans = invitePlans.filter(function(p) {
                if (!inviteForm.customer_type) return true;
                if (!p.customer_types || !Array.isArray(p.customer_types) || p.customer_types.length === 0) return true;
                return p.customer_types.indexOf(inviteForm.customer_type) !== -1;
              });
              if (inviteForm.customer_type && filteredPlans.length === 0) {
                return <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: '8px 12px', color: '#eab308', fontSize: 11 }}>No plans configured for this customer type. SP admin must add one in Platform Settings → Plans.</div>;
              }
              return (
                <select value={inviteForm.plan_slug} onChange={function(e) { setInviteForm(Object.assign({}, inviteForm, { plan_slug: e.target.value })); }} style={inputStyleTM}>
                  <option value="">Select plan...</option>
                  {filteredPlans.map(function(p) { return <option key={p.slug} value={p.slug}>{p.name}{p.monthly_price ? ' — $' + p.monthly_price + '/mo' : ' — Custom'}</option>; })}
                </select>
              );
            })()}
          </div>
          <div>
            <label style={{ color: C.muted, fontSize: 11, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Industry</label>
            <select value={inviteForm.industry} onChange={function(e) { setInviteForm(Object.assign({}, inviteForm, { industry: e.target.value })); }} style={inputStyleTM}>
              <option value="">— Select —</option>
              {inviteIndustries.map(function(ind) { return <option key={ind} value={ind}>{ind}</option>; })}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button onClick={async function() {
            if (!inviteForm.tenant_name || !inviteForm.admin_full_name || !inviteForm.admin_email) { alert('Company name, admin name, and admin email are required.'); return; }
            if (!inviteForm.customer_type) { alert('Customer type is required. If the dropdown is empty, SP admin must configure customer_type_options in Platform Settings.'); return; }
            if (!inviteForm.plan_slug) { alert('Plan is required. If no plans appear, SP admin must configure plans for this customer type in Platform Settings.'); return; }
            setInviteLoading(true);
            try {
              var r = await fetch('/api/invite-tenant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, inviteForm, { inviter_tenant_id: currentTenantId || null })) });
              var d = await r.json();
              if (!r.ok) throw new Error(d.error || 'Invite failed');
              setInviteResult(d);
            } catch (e) { alert('Error: ' + e.message); }
            setInviteLoading(false);
          }} disabled={inviteLoading} style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 8, padding: '10px 22px', color: '#000', fontWeight: 700, cursor: 'pointer', opacity: inviteLoading ? 0.6 : 1 }}>{inviteLoading ? 'Creating...' : '🚀 Invite & Send Welcome Email'}</button>
          <button onClick={function() { setShowInvite(false); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 22px', color: C.muted, cursor: 'pointer' }}>Cancel</button>
        </div>
      </>
    )}
  </div>
)}

  // Fetch live tenants from Supabase (skip in demo mode)
  useEffect(() => {
    if (demoMode) {
      setLiveTenants([
        { id: 'demo_1', name: 'Acme Corp', logo: 'AC', role: 'customer', brand: { primary: '#FF6B35', secondary: '#FF8C42', name: 'Acme Corp' }, colors: { primary: '#FF6B35', accent: '#FF8C42' }, plan: 'growth', status: 'active', channels: ['sms', 'email', 'whatsapp'], stats: { messages: 48200, revenue: 4820, campaigns: 12, contacts: 2400, deliveryRate: 97.2, openRate: 52.1 }, slug: 'acme-corp', created_at: '2026-01-15' },
        { id: 'demo_2', name: 'RetailCo', logo: 'RC', role: 'customer', brand: { primary: '#00E676', secondary: '#00BFA5', name: 'RetailCo' }, colors: { primary: '#00E676', accent: '#00BFA5' }, plan: 'pro', status: 'active', channels: ['sms', 'email', 'rcs'], stats: { messages: 124500, revenue: 12450, campaigns: 28, contacts: 8900, deliveryRate: 96.8, openRate: 48.5 }, slug: 'retailco', created_at: '2025-11-20' },
        { id: 'demo_3', name: 'FinServ Group', logo: 'FS', role: 'customer', brand: { primary: '#7C4DFF', secondary: '#651FFF', name: 'FinServ Group' }, colors: { primary: '#7C4DFF', accent: '#651FFF' }, plan: 'starter', status: 'active', channels: ['sms', 'email'], stats: { messages: 15200, revenue: 1520, campaigns: 5, contacts: 620, deliveryRate: 98.1, openRate: 61.3 }, slug: 'finserv', created_at: '2026-02-01' },
      ]);
      setTenantsLoading(false);
      return;
    }
    (async () => {
      try {
        const { supabase } = await import('./supabaseClient');
        var tenantQuery = supabase
          .from('tenants')
          .select('*')
          .order('created_at', { ascending: false });
        if (currentTenantId) {
          tenantQuery = tenantQuery.eq('parent_tenant_id', currentTenantId);
        }
        const { data, error } = await tenantQuery;
        if (!error && data) {
          const mapped = data.map(t => ({
            id: t.id,
            name: t.name,
            logo: (t.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
            role: 'customer',
            brand: {
              primary: t.brand_primary || '#00C9FF',
              secondary: t.brand_secondary || '#E040FB',
              name: t.brand_name || t.name,
            },
            colors: {
              primary: t.brand_primary || '#00C9FF',
              accent: t.brand_secondary || '#E040FB',
              bg: '#080d1a',
              surface: '#0d1425',
              border: '#182440',
              text: '#E8F4FD',
              muted: '#6B8BAE',
            },
            plan: t.plan || 'starter',
            status: t.status || 'active',
            channels: t.channels_enabled || ['sms', 'email'],
            stats: { messages: 0, revenue: 0, campaigns: 0, contacts: 0, deliveryRate: 0, openRate: 0 },
            slug: t.slug,
            created_at: t.created_at,
            tenant_type: t.tenant_type || 'business',
            parent_tenant_id: t.parent_tenant_id,
            entity_tier: t.entity_tier || 'tenant',
            parent_entity_id: t.parent_entity_id,
            referred_by: t.referred_by,
            msp_enabled: t.msp_enabled || false,
            letter_of_agency: t.letter_of_agency || false,
          }));
          setLiveTenants(mapped);
        }
      } catch (err) { console.error('Tenant fetch error:', err); }
      setTenantsLoading(false);
    })();
  }, [demoResult, demoMode, currentTenantId]); // Refetch after demo creation, mode change, or tenant switch

  const inputStyleTM = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };
  const themePresets = [
    { name: "Sunset", primary: "#FF6B35", secondary: "#FF8C42" },
    { name: "Emerald", primary: "#00E676", secondary: "#00BFA5" },
    { name: "Violet", primary: "#7C4DFF", secondary: "#651FFF" },
    { name: "Ocean", primary: "#00C9FF", secondary: "#0091EA" },
    { name: "Ruby", primary: "#FF3B30", secondary: "#FF6B6B" },
    { name: "Gold", primary: "#FFD600", secondary: "#FFAB00" },
    { name: "Coral", primary: "#E040FB", secondary: "#AA00FF" },
    { name: "Slate", primary: "#6B8BAE", secondary: "#4A6FA5" },
  ];

  const openBrandEditor = (tenant) => {
    setEditingBrand(tenant.id);
    setBrandForm({ name: tenant.brand.name, primary: tenant.brand.primary, secondary: tenant.brand.secondary, logo: "" });
  };

  const handleSaveBrand = async () => {
    var res = await supabase.from('tenants').update({
      brand_primary: brandForm.primary,
      brand_secondary: brandForm.secondary,
      brand_name: brandForm.name,
      brand_logo_url: brandForm.logo || null,
    }).eq('id', editingBrand);
    if (res.error) { alert('Save failed: ' + res.error.message); }
    else { setEditingBrand(null); window.location.reload(); }
  };

  return (
    <div style={{ padding: "32px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Tenant Management</h1>
          <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Manage white-label customers, branding & access</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <CreateSandbox C={C} onCreated={function() { window.location.reload(); }} />
          <button onClick={() => { setShowDemoForm(true); setShowNew(false); }} style={{ background: `${C.accent}22`, border: `1px solid ${C.accent}55`, borderRadius: 10, padding: "12px 20px", color: C.accent, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
            🎮 Create Demo Account
          </button>
          <button onClick={() => { setShowNew(true); setShowDemoForm(false); }} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 10, padding: "12px 24px", color: "#000", fontWeight: 700, cursor: "pointer" }}>
            + New Tenant
          </button>
          <button onClick={async function() { setShowInvite(true); setShowNew(false); setShowDemoForm(false); setInviteResult(null); try { var r = await fetch('/api/platform-config'); var d = await r.json(); if (d.plans) setInvitePlans(d.plans); if (d.industries) setInviteIndustries(d.industries); if (d.customer_type_options) setInviteCustomerTypes(d.customer_type_options); } catch(e) {} }} style={{ background: '#10b98122', border: '1px solid #10b98155', borderRadius: 10, padding: '12px 24px', color: '#10b981', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
            🚀 Invite Tenant
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "rgba(255,255,255,0.04)", padding: 4, borderRadius: 10, width: "fit-content" }}>
        {["tenants", "branding", "permissions", "billing"].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            background: activeTab === t ? C.primary : "transparent",
            border: "none", borderRadius: 7, padding: "8px 20px",
            color: activeTab === t ? "#000" : C.muted,
            fontWeight: activeTab === t ? 700 : 400,
            cursor: "pointer", fontSize: 13, textTransform: "capitalize", transition: "all 0.2s",
          }}>{t === "tenants" ? "🏢 Tenants" : t === "branding" ? "🎨 Branding" : t === "permissions" ? "🔐 Permissions" : "💳 Billing"}</button>
        ))}
      </div>

      {activeTab === "tenants" && (
        <div>
          {/* Demo Account Creator */}
          {showDemoForm && (
            <div style={{ background: `${C.accent}08`, border: `1px solid ${C.accent}33`, borderRadius: 14, padding: 28, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h3 style={{ color: "#fff", margin: "0 0 4px" }}>🎮 Create Demo Account</h3>
                  <p style={{ color: C.muted, margin: 0, fontSize: 12 }}>Generate credentials for a prospect to explore the platform with demo data</p>
                </div>
                <button onClick={() => { setShowDemoForm(false); setDemoResult(null); }} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 14px", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>✕ Close</button>
              </div>

              {demoResult ? (
                <div style={{ background: "#00E67612", border: "1px solid #00E67633", borderRadius: 12, padding: 24 }}>
                  <div style={{ color: "#00E676", fontWeight: 700, fontSize: 15, marginBottom: 12 }}>✓ Demo Account Created</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Login Email</div>
                      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "monospace" }}>{demoResult.email}</div>
                    </div>
                    <div>
                      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Password</div>
                      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "monospace" }}>{demoResult.password}</div>
                    </div>
                    <div>
                      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Portal URL</div>
                      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "monospace" }}>portal.engwx.com</div>
                    </div>
                    <div>
                      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Company</div>
                      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14 }}>{demoResult.company}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                    <button onClick={() => { navigator.clipboard.writeText(`Portal: portal.engwx.com\nEmail: ${demoResult.email}\nPassword: ${demoResult.password}`); }} style={{ background: `${C.primary}22`, border: `1px solid ${C.primary}44`, borderRadius: 8, padding: "8px 18px", color: C.primary, fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>📋 Copy Credentials</button>
                    <button onClick={() => { setDemoResult(null); setDemoForm({ email: "", password: "demo1234", companyName: "", brandColor: "#00C9FF", plan: "starter", expiresIn: "7" }); }} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 18px", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>+ Create Another</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Prospect Email</label>
                      <input value={demoForm.email} onChange={e => setDemoForm(p => ({ ...p, email: e.target.value }))} placeholder="prospect@company.com" style={inputStyleTM} />
                    </div>
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Password</label>
                      <input value={demoForm.password} onChange={e => setDemoForm(p => ({ ...p, password: e.target.value }))} placeholder="demo1234" style={inputStyleTM} />
                    </div>
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Company Name</label>
                      <input value={demoForm.companyName} onChange={e => setDemoForm(p => ({ ...p, companyName: e.target.value }))} placeholder="Prospect Corp" style={inputStyleTM} />
                    </div>
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Brand Color</label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="color" value={demoForm.brandColor} onChange={e => setDemoForm(p => ({ ...p, brandColor: e.target.value }))} style={{ width: 40, height: 36, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer", background: "transparent" }} />
                        <input value={demoForm.brandColor} onChange={e => setDemoForm(p => ({ ...p, brandColor: e.target.value }))} style={{ ...inputStyleTM, fontFamily: "monospace" }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Plan</label>
                      <select value={demoForm.plan} onChange={e => setDemoForm(p => ({ ...p, plan: e.target.value }))} style={{ ...inputStyleTM, cursor: "pointer" }}>
                        <option value="starter">Starter ($299/mo)</option>
                        <option value="growth">Growth ($799/mo)</option>
                        <option value="enterprise">Enterprise (Custom)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Access Duration</label>
                      <select value={demoForm.expiresIn} onChange={e => setDemoForm(p => ({ ...p, expiresIn: e.target.value }))} style={{ ...inputStyleTM, cursor: "pointer" }}>
                        <option value="3">3 days</option>
                        <option value="7">7 days</option>
                        <option value="14">14 days</option>
                        <option value="30">30 days</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                    <button onClick={async () => {
                      if (!demoForm.email || !demoForm.companyName) return;
                      setDemoCreating(true);
try {
  const slug = demoForm.companyName.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-demo-" + Date.now().toString(36).slice(-4);
  const resp = await fetch('/api/csp?action=create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      csp_tenant_id: (process.env.REACT_APP_SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387'),
      email: demoForm.email,
      password: demoForm.password,
      full_name: 'Demo User',
      company_name: demoForm.companyName,
      plan: demoForm.plan,
      is_demo: true,
    })
  });
  const data = await resp.json();
  if (!data.success) throw new Error(data.error || 'Failed to create demo account');
  const demoTenantId = data.tenant?.id;

// Auto-create pipeline lead
try {
  const { supabase } = await import('./supabaseClient');
  const existingLead = await supabase.from('leads').select('id').eq('email', demoForm.email).limit(1);
  if (!existingLead.data || existingLead.data.length === 0) {
    await supabase.from('leads').insert({
      name: demoForm.companyName,
      company: demoForm.companyName,
      email: demoForm.email,
      type: 'Direct Business',
      urgency: 'Warm',
      stage: 'demo_shared',
      source: 'Direct',
      notes: 'Demo account created. Plan: ' + demoForm.plan + '. Tenant ID: ' + demoTenantId,
      last_action_at: new Date().toISOString().split('T')[0],
      last_activity_at: new Date().toISOString(),
    });
  }
} catch(e) { console.log('Pipeline lead create failed:', e.message); }

setDemoResult({ email: demoForm.email, password: demoForm.password, company: demoForm.companyName, tenantId: demoTenantId });
} catch (err) { alert("Error: " + err.message); }
setDemoCreating(false);
                    }} disabled={demoCreating || !demoForm.email || !demoForm.companyName} style={{
                      background: `linear-gradient(135deg, ${C.accent}, ${C.primary})`, border: "none", borderRadius: 8, padding: "10px 22px",
                      color: "#000", fontWeight: 700, cursor: demoCreating ? "wait" : "pointer", fontSize: 13,
                      fontFamily: "'DM Sans', sans-serif", opacity: demoCreating ? 0.7 : 1,
                    }}>{demoCreating ? "Creating..." : "🎮 Create Demo Account"}</button>
                    <button onClick={() => setShowDemoForm(false)} style={{ background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 8, padding: "10px 22px", color: C.muted, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}

          {showNew && (
            <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.primary}44`, borderRadius: 14, padding: 28, marginBottom: 24 }}>
              <h3 style={{ color: "#fff", margin: "0 0 20px" }}>Onboard New Tenant</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div>
  <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Company Name *</label>
  <input value={newTenant.companyName} onChange={e => setNewTenant({...newTenant, companyName: e.target.value})} placeholder="e.g. TechCorp Ltd" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box" }} />
</div>
<div>
  <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>White-Label Brand Name</label>
  <input value={newTenant.brandName} onChange={e => setNewTenant({...newTenant, brandName: e.target.value})} placeholder="e.g. TechEngage" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box" }} />
</div>
<div>
  <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Admin Email *</label>
  <input value={newTenant.email} onChange={e => setNewTenant({...newTenant, email: e.target.value})} placeholder="admin@techcorp.com" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box" }} />
</div>
<div>
  <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Custom Domain</label>
  <input value={newTenant.domain} onChange={e => setNewTenant({...newTenant, domain: e.target.value})} placeholder="messaging.techcorp.com" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box" }} />
</div>
<div>
  <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Plan</label>
  <select value={newTenant.plan} onChange={e => setNewTenant({...newTenant, plan: e.target.value})} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box", colorScheme: "dark" }}>
    <option value="starter">Starter $99/mo</option>
    <option value="growth">Growth $249/mo</option>
    <option value="pro">Pro $499/mo</option>
    <option value="enterprise">Enterprise</option>
    <option disabled>── CSP Partners ──</option>
<option value="silver">Silver $499/mo</option>
<option value="gold">Gold $1,499/mo</option>
<option value="platinum">Platinum $3,999/mo</option>
<option value="diamond">Diamond $7,999/mo</option>
  </select>
</div>
<div>
  <label style={{ color: C.muted, fontSize: 11, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Tenant Type</label>
  <select value={newTenant.type} onChange={e => setNewTenant({...newTenant, type: e.target.value})} style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box", colorScheme: "dark" }}>
    <option value="direct">Direct Business</option>
    <option value="csp">CSP / Reseller</option>
    <option value="agent">Agent</option>
  </select>
</div>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button onClick={() => handleCreateTenant()} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 8, padding: "10px 22px", color: "#000", fontWeight: 700, cursor: "pointer" }}>Create Tenant</button>
                <button onClick={() => setShowNew(false)} style={{ background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 8, padding: "10px 22px", color: C.muted, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 12 }}>
            {tenantsLoading ? (
              <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 40 }}>Loading tenants...</div>
            ) : liveTenants.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 40 }}>No tenants yet. Create one above to get started.</div>
            ) : liveTenants.map(c => {
              const isSuspended = suspendedTenants[c.id] || c.status === 'suspended';
              const isConfiguring = configuringTenant === c.id;
              return (
              <div key={c.id}>
                <div style={{ background: isConfiguring ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.03)", border: `1px solid ${isConfiguring ? C.primary + "44" : "rgba(255,255,255,0.07)"}`, borderLeft: `4px solid ${isSuspended ? "#FF3B30" : c.brand.primary}`, borderRadius: 12, padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 280px", alignItems: "center", gap: 20, opacity: isSuspended ? 0.6 : 1, transition: "all 0.2s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, background: `linear-gradient(135deg, ${c.brand.primary}, ${c.brand.secondary})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000" }}>{c.logo}</div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#fff", fontWeight: 700 }}>{c.name}</span>
                      {c.entity_tier === "super_admin" && <span style={{ background: "#00C9FF22", color: "#00C9FF", border: "1px solid #00C9FF44", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>SUPER ADMIN</span>}
                      {c.entity_tier === "master_agent" && <span style={{ background: "#E040FB22", color: "#E040FB", border: "1px solid #E040FB44", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>MASTER AGENT</span>}
                      {c.entity_tier === "agent" && <span style={{ background: "#FF6B3522", color: "#FF6B35", border: "1px solid #FF6B3544", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>AGENT</span>}
                      {c.entity_tier === "csp" && <span style={{ background: "#7C4DFF22", color: "#7C4DFF", border: "1px solid #7C4DFF44", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>CSP</span>}
                      {c.msp_enabled && <span style={{ background: "#00E67622", color: "#00E676", border: "1px solid #00E67644", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>MSP</span>}
                      {c.parent_tenant_id && <span style={{ color: C.muted, fontSize: 10 }}>↳ tenant</span>}
                    </div>
                    <div style={{ color: c.brand.primary, fontSize: 12 }}>{c.brand.name}</div>
                  </div>
                </div>
                <div>
                  <div style={{ color: "#fff", fontSize: 13 }}>{c.channels.join(", ")}</div>
                  <div style={{ color: C.muted, fontSize: 11 }}>Active channels</div>
                </div>
                <div>
                  <div style={{ color: "#fff", fontSize: 13 }}>{c.stats.contacts.toLocaleString()} contacts</div>
                  <div style={{ color: C.muted, fontSize: 11 }}>{c.stats.campaigns} campaigns</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <Badge color={isSuspended ? "#FF3B30" : "#00E676"}>{isSuspended ? "⏸ Suspended" : "● Active"}</Badge>
                  <span style={{ fontSize: 10, color: c.tenant_type === "csp" ? "#7C4DFF" : c.tenant_type === "agent" ? "#FF6B35" : C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{c.tenant_type === "csp" ? "CSP Partner" : c.tenant_type === "agent" ? "Agent Partner" : c.parent_tenant_id ? "Tenant" : "Business"}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
  {onDrillDown && <button onClick={() => onDrillDown(c.id)} style={{ background: "#7C4DFF22", border: "1px solid #7C4DFF55", borderRadius: 7, padding: "7px 10px", color: "#7C4DFF", fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>View Portal</button>}
                  {c.status !== 'active' && (
  <button onClick={async function() {
    if (!window.confirm('Convert ' + c.name + ' to paid active account?')) return;
    var { error } = await supabase.from('tenants').update({
      status: 'active',
      plan: c.plan || 'starter',
    }).eq('id', c.id);
    if (error) { alert('Failed: ' + error.message); }
    else { alert(c.name + ' converted to paid!'); window.location.reload(); }
  }} style={{ background: "rgba(0,230,118,0.15)", border: "1px solid rgba(0,230,118,0.3)", borderRadius: 7, padding: "7px 10px", color: "#00E676", fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
    💳 Convert to Paid
  </button>
)}
<button onClick={async function() {
  if (!window.confirm('Permanently delete ' + c.name + '? This cannot be undone.')) return;
  var { error } = await supabase.from('tenants').delete().eq('id', c.id);
  if (error) { alert('Failed: ' + error.message); }
  else { window.location.reload(); }
}} style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.2)", borderRadius: 7, padding: "7px 10px", color: "#FF3B30", fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
  🗑 Delete
</button>
                  <button onClick={() => { setConfiguringTenant(isConfiguring ? null : c.id); if (!isConfiguring) setConfigForm({ plan: c.plan || 'growth', message_limit: c.message_limit || 10000, contact_limit: c.contact_limit || 50000, user_seats: c.user_seats || 10 }); }} style={{ background: isConfiguring ? C.primary : c.brand.primary + "22", border: "1px solid " + (isConfiguring ? C.primary : c.brand.primary + "55"), borderRadius: 7, padding: "7px 10px", color: isConfiguring ? "#000" : c.brand.primary, fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{isConfiguring ? "Close" : "Configure"}</button>
                  {confirmSuspend === c.id ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => { setSuspendedTenants(prev => ({ ...prev, [c.id]: !isSuspended })); setConfirmSuspend(null); }} style={{ background: isSuspended ? "#00E67622" : "#FF3B3022", border: `1px solid ${isSuspended ? "#00E67644" : "#FF3B3044"}`, borderRadius: 7, padding: "7px 10px", color: isSuspended ? "#00E676" : "#FF3B30", fontWeight: 700, cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>{isSuspended ? "Reactivate" : "Confirm"}</button>
                      <button onClick={() => setConfirmSuspend(null)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "7px 8px", color: C.muted, cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmSuspend(c.id)} style={{ background: "transparent", border: `1px solid ${isSuspended ? "#00E67644" : "rgba(255,255,255,0.1)"}`, borderRadius: 7, padding: "7px 10px", color: isSuspended ? "#00E676" : C.muted, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{isSuspended ? "Reactivate" : "Suspend"}</button>
                  )}
                </div>
                </div>

                {/* Inline Configure Panel */}
                {isConfiguring && (
                  <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.primary}33`, borderRadius: "0 0 12px 12px", borderTop: "none", padding: "20px 24px", marginTop: -1 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Tenant Name</div>
                        <input defaultValue={c.name} style={inputStyleTM} />
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Admin Email</div>
                        <input defaultValue={`admin@${c.name.toLowerCase().replace(/\s/g, "")}.com`} style={inputStyleTM} />
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Plan</div>
                        <select value={configForm.plan || c.plan || "growth"} onChange={function(e){ var p = e.target.value; var pd = {starter:{message_limit:5000,contact_limit:10000,user_seats:3},growth:{message_limit:25000,contact_limit:50000,user_seats:10},pro:{message_limit:50000,contact_limit:100000,user_seats:25},enterprise:{message_limit:250000,contact_limit:500000,user_seats:100},silver:{message_limit:10000,contact_limit:50000,user_seats:10},gold:{message_limit:50000,contact_limit:200000,user_seats:50},platinum:{message_limit:200000,contact_limit:500000,user_seats:200},diamond:{message_limit:500000,contact_limit:1000000,user_seats:500}}; var d = pd[p] || {}; setConfigForm(function(f){ return Object.assign({}, f, {plan: p, message_limit: d.message_limit || f.message_limit, contact_limit: d.contact_limit || f.contact_limit, user_seats: d.user_seats || f.user_seats}); }); }} data-field={"plan_" + c.id} style={inputStyleTM}><option value="starter">Starter ($299/mo)</option><option value="growth">Growth ($799/mo)</option><option value="pro">Pro ($499/mo)</option><option value="enterprise">Enterprise (Custom)</option><option disabled>── CSP Partners ──</option><option value="silver">Silver ($499/mo)</option><option value="gold">Gold ($1,499/mo)</option><option value="platinum">Platinum ($3,999/mo)</option><option value="diamond">Diamond ($7,999/mo)</option></select>
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Account Type</div>
                        <select defaultValue={c.tenant_type || "business"} onChange={async function(e) {
                          var newType = e.target.value;
                          try {
                            var { supabase: sb } = await import('./supabaseClient');
                            await sb.from('tenants').update({ tenant_type: newType }).eq('id', c.id);
                            c.tenant_type = newType;
                          } catch (err) { console.error('Type update error:', err); }
                        }} style={inputStyleTM}>
                          <option value="business">Business</option>
                          <option value="csp">CSP Partner</option>
                          <option value="agent">Agent Partner</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 700 }}>Active Channels</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {["SMS", "Email", "WhatsApp", "RCS", "MMS", "Voice", "🇵🇱 Poland"].map(ch => (
                          <label key={ch} style={{ display: "flex", alignItems: "center", gap: 4, background: c.channels.includes(ch) ? `${c.brand.primary}15` : "rgba(255,255,255,0.03)", border: `1px solid ${c.channels.includes(ch) ? c.brand.primary + "44" : "rgba(255,255,255,0.08)"}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, color: c.channels.includes(ch) ? c.brand.primary : "rgba(255,255,255,0.4)" }}>
                            <input type="checkbox" checked={c.channels.includes(ch)} onChange={async function(e) {
                              var enabled = e.target.checked;
                              var channelKey = ch.toLowerCase();
                              try {
                                if (ch === '🇵🇱 Poland') {
                                  // Poland uses its own table
                                  var plExisting = await supabase.from('poland_carrier_configs').select('id').eq('tenant_id', c.id).maybeSingle();
                                  if (plExisting.data && plExisting.data.id) {
                                    await supabase.from('poland_carrier_configs').update({ enabled: enabled }).eq('id', plExisting.data.id).eq('tenant_id', c.id);
                                  } else if (enabled) {
                                    await supabase.from('poland_carrier_configs').insert({ tenant_id: c.id, phone_number: '', carrier_type: 'http_webhook', enabled: true });
                                  }
                                } else {
                                  var existing = await supabase.from('channel_configs').select('id, config_encrypted').eq('tenant_id', c.id).eq('channel', channelKey).maybeSingle();
                                  if (existing.data && existing.data.id) {
                                    await supabase.from('channel_configs').update({ enabled: enabled, status: enabled ? 'connected' : 'disconnected', updated_at: new Date().toISOString() }).eq('id', existing.data.id).eq('tenant_id', c.id);
                                  } else {
                                    await supabase.from('channel_configs').insert({ tenant_id: c.id, channel: channelKey, enabled: enabled, status: enabled ? 'connected' : 'disconnected', config_encrypted: {} });
                                  }
                                }
                                if (refreshLiveData) refreshLiveData();
                              } catch (err) { alert('Channel toggle failed: ' + err.message); }
                            }} style={{ accentColor: c.brand.primary }} /> {ch}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Phase 2: Hierarchy + referral */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Entity Tier</div>
                        <select defaultValue={c.entity_tier || 'tenant'} onChange={async function(e) {
                          var newTier = e.target.value;
                          try {
                            var { supabase: sb } = await import('./supabaseClient');
                            await sb.from('tenants').update({ entity_tier: newTier }).eq('id', c.id);
                            c.entity_tier = newTier;
                          } catch (err) { console.error('Tier update error:', err); }
                        }} style={inputStyleTM}>
                          <option value="super_admin">Super Admin</option>
                          <option value="master_agent">Master Agent</option>
                          <option value="agent">Agent</option>
                          <option value="csp">CSP</option>
                          <option value="tenant">Tenant</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Referred By</div>
                        <select defaultValue={c.referred_by || ''} onChange={async function(e) {
                          var newRef = e.target.value || null;
                          try {
                            var { supabase: sb } = await import('./supabaseClient');
                            await sb.from('tenants').update({ referred_by: newRef }).eq('id', c.id);
                            c.referred_by = newRef;
                          } catch (err) { console.error('Referrer update error:', err); }
                        }} style={inputStyleTM}>
                          <option value="">— None —</option>
                          {liveTenants.filter(function(x) { return x.id !== c.id && (x.entity_tier === 'agent' || x.entity_tier === 'master_agent' || x.entity_tier === 'csp'); }).map(function(x) {
                            return <option key={x.id} value={x.id}>{x.name} ({x.entity_tier})</option>;
                          })}
                        </select>
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Parent Entity</div>
                        <select defaultValue={c.parent_entity_id || ''} onChange={async function(e) {
                          var newParent = e.target.value || null;
                          try {
                            var { supabase: sb } = await import('./supabaseClient');
                            await sb.from('tenants').update({ parent_entity_id: newParent }).eq('id', c.id);
                            c.parent_entity_id = newParent;
                          } catch (err) { console.error('Parent update error:', err); }
                        }} style={inputStyleTM}>
                          <option value="">— None (root) —</option>
                          {liveTenants.filter(function(x) { return x.id !== c.id && ['super_admin','master_agent','agent','csp'].includes(x.entity_tier); }).map(function(x) {
                            return <option key={x.id} value={x.id}>{x.name} ({x.entity_tier})</option>;
                          })}
                        </select>
                      </div>
                    </div>

                    {/* MSP toggle — only for Agent / Master Agent tenants */}
                    {(c.entity_tier === 'agent' || c.entity_tier === 'master_agent') && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, background: "rgba(0,230,118,0.04)", border: "1px solid rgba(0,230,118,0.15)", borderRadius: 10, padding: 14 }}>
                        <div>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                            <input type="checkbox" defaultChecked={c.letter_of_agency || false} onChange={async function(e) {
                              var val = e.target.checked;
                              try {
                                var { supabase: sb } = await import('./supabaseClient');
                                await sb.from('tenants').update({ letter_of_agency: val }).eq('id', c.id);
                                c.letter_of_agency = val;
                                if (!val && c.msp_enabled) {
                                  await sb.from('tenants').update({ msp_enabled: false }).eq('id', c.id);
                                  c.msp_enabled = false;
                                }
                              } catch (err) { console.error('LOA update error:', err); }
                            }} style={{ accentColor: '#00E676' }} />
                            <div>
                              <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>Letter of Agency on file</div>
                              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Required before enabling MSP access</div>
                            </div>
                          </label>
                        </div>
                        <div>
                          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: c.letter_of_agency ? "pointer" : "not-allowed", opacity: c.letter_of_agency ? 1 : 0.4 }}>
                            <input type="checkbox" defaultChecked={c.msp_enabled || false} disabled={!c.letter_of_agency} onChange={async function(e) {
                              var val = e.target.checked;
                              if (val && !c.letter_of_agency) { e.preventDefault(); alert('Letter of Agency must be on file first.'); return; }
                              try {
                                var { supabase: sb } = await import('./supabaseClient');
                                await sb.from('tenants').update({ msp_enabled: val }).eq('id', c.id);
                                c.msp_enabled = val;
                              } catch (err) { console.error('MSP toggle error:', err); }
                            }} style={{ accentColor: '#00E676' }} />
                            <div>
                              <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>MSP Access</div>
                              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Full drill-down into their assigned CSP/tenant portals</div>
                            </div>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Branding — SP admin can edit any tenant's branding inline */}
                    <div style={{ marginBottom: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, fontWeight: 700 }}>👥 Add Team Member</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="email" placeholder="member@example.com" data-field={"invite_email_" + c.id} style={Object.assign({}, inputStyleTM, { flex: 1, minWidth: 220 })} />
                        <select data-field={"invite_role_" + c.id} defaultValue="agent" style={Object.assign({}, inputStyleTM, { width: 120 })}>
                          <option value="admin">Admin</option>
                          <option value="agent">Agent</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button onClick={async function() {
                          var emailEl = document.querySelector('[data-field="invite_email_' + c.id + '"]');
                          var roleEl = document.querySelector('[data-field="invite_role_' + c.id + '"]');
                          var email = (emailEl && emailEl.value || '').trim();
                          var role = (roleEl && roleEl.value) || 'agent';
                          if (!email) { alert('Enter an email.'); return; }
                          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert('Invalid email format.'); return; }
                          try {
                            var r = await fetch('/api/invite-member', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ tenant_id: c.id, email: email, role: role }),
                            });
                            var d = await r.json();
                            if (!r.ok) throw new Error(d.error || 'Invite failed');
                            if (d.already_member) {
                              alert('ℹ️ ' + email + ' is already a member of ' + (d.tenant_name || 'this tenant') + '.');
                            } else if (d.invited) {
                              alert('✅ Team member added — invite email sent to ' + email + '. They will be added as ' + role + ' when they sign in.');
                            } else {
                              alert('✅ ' + email + ' added to ' + (d.tenant_name || 'this tenant') + ' as ' + role + ' successfully.');
                            }
                            if (emailEl) emailEl.value = '';
                          } catch (e) { alert('❌ Error: ' + e.message); }
                        }} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, border: 'none', borderRadius: 8, padding: '8px 18px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>+ Add Member</button>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 6 }}>Existing users are added immediately. New users receive an email invite and join the tenant on first sign-in.</div>
                    </div>

                    <div style={{ marginBottom: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12, fontWeight: 700 }}>🎨 Branding</div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>🌐 Website URL</div>
                          <input type="url" defaultValue={c.website_url || ''} placeholder="https://example.com" data-field={"website_url_" + c.id} style={inputStyleTM} />
                        </div>
                        <button onClick={async function() {
                          var el = document.querySelector('[data-field="website_url_' + c.id + '"]');
                          var url = (el && el.value || '').trim();
                          if (!url) { alert('Enter a website URL first.'); return; }
                          try {
                            var fullUrl = url.indexOf('http') === 0 ? url : 'https://' + url;
                            await supabase.from('tenants').update({ website_url: fullUrl }).eq('id', c.id);
                            var r = await fetch('/api/detect-branding?url=' + encodeURIComponent(fullUrl));
                            var d = await r.json();
                            var msg = [];
                            if (d.site_name) msg.push('Name: ' + d.site_name);
                            if (d.primary_color) msg.push('Primary: ' + d.primary_color);
                            if (d.secondary_color) msg.push('Accent: ' + d.secondary_color);
                            if (d.logo_url) msg.push('Logo: found');
                            // Auto-apply detected colors + logo to the tenant row
                            var patch = {};
                            if (d.primary_color) patch.brand_primary = d.primary_color;
                            if (d.secondary_color) patch.brand_secondary = d.secondary_color;
                            if (d.logo_url) patch.brand_logo_url = d.logo_url;
                            if (d.favicon_url) patch.brand_favicon_url = d.favicon_url;
                            if (d.site_name && !c.brand_name) patch.brand_name = d.site_name;
                            if (Object.keys(patch).length > 0) await supabase.from('tenants').update(patch).eq('id', c.id);
                            alert('✅ Website saved. ' + (msg.length ? 'Detected & applied: ' + msg.join(', ') + '.' : 'No brand signals detected — configure manually below.'));
                          } catch (e) { alert('Error: ' + e.message); }
                        }} style={{ background: "rgba(0,201,255,0.15)", border: "1px solid rgba(0,201,255,0.35)", borderRadius: 8, padding: "8px 14px", color: "#00C9FF", fontWeight: 700, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap", marginTop: 16 }}>Auto-detect</button>
                      </div>
                      <BrandingEditor
                        entityId={c.id}
                        actor={{ tenantId: null, entityTier: 'super_admin', isSuperAdmin: true, mspEnabled: true, loaOnFile: true }}
                        C={C}
                      />
                    </div>

                    {/* AI Digest recipient — SP admin overrides */}
                    <div style={{ marginBottom: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 700 }}>📧 Daily AI Digest Delivered To</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="email" defaultValue={c.digest_email || ''} placeholder="owner@tenant.com  (blank → tenant owner's email)" data-field={"digest_email_" + c.id} style={Object.assign({}, inputStyleTM, { flex: 1 })} />
                        <button onClick={async function(e) {
                          var val = (document.querySelector('[data-field="digest_email_' + c.id + '"]') || {}).value || '';
                          try {
                            var { supabase: sb } = await import('./supabaseClient');
                            var res = await sb.from('tenants').update({ digest_email: val.trim() || null }).eq('id', c.id);
                            if (res.error) alert('Error: ' + res.error.message);
                            else { c.digest_email = val.trim() || null; e.target.textContent = '✓ Saved'; setTimeout(function() { e.target.textContent = 'Save'; }, 1500); }
                          } catch (err) { alert('Error: ' + err.message); }
                        }} style={{ background: "rgba(0,201,255,0.15)", border: "1px solid rgba(0,201,255,0.35)", borderRadius: 8, padding: "0 14px", color: "#00C9FF", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Save</button>
                      </div>
                    </div>

                    {/* Calendly — per-tenant booking link (used in welcome emails + Claude drafts for this tenant) */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, fontWeight: 700 }}>📅 Onboarding Call Link (for tenant welcome emails)</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="url" defaultValue={c.calendly_url || ''} placeholder="https://calendly.com/.../30min  (appended to this tenant's welcome email)" data-field={"calendly_url_" + c.id} style={Object.assign({}, inputStyleTM, { flex: 1 })} />
                        <button onClick={async function(e) {
                          var val = (document.querySelector('[data-field="calendly_url_' + c.id + '"]') || {}).value || '';
                          try {
                            var { supabase: sb } = await import('./supabaseClient');
                            var res = await sb.from('tenants').update({ calendly_url: val.trim() || null }).eq('id', c.id);
                            if (res.error) alert('Error: ' + res.error.message);
                            else { c.calendly_url = val.trim() || null; e.target.textContent = '✓ Saved'; setTimeout(function() { e.target.textContent = 'Save'; }, 1500); }
                          } catch (err) { alert('Error: ' + err.message); }
                        }} style={{ background: "rgba(0,201,255,0.15)", border: "1px solid rgba(0,201,255,0.35)", borderRadius: 8, padding: "0 14px", color: "#00C9FF", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>Save</button>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Message Limit</div>
                        <input type="number" value={configForm.message_limit || c.message_limit || 10000} onChange={function(e){ setConfigForm(function(f){ return Object.assign({}, f, {message_limit: e.target.value}); }); }} data-field={"message_limit_" + c.id} style={inputStyleTM} />
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>Contact Limit</div>
                        <input type="number" value={configForm.contact_limit || c.contact_limit || 50000} onChange={function(e){ setConfigForm(function(f){ return Object.assign({}, f, {contact_limit: e.target.value}); }); }} data-field={"contact_limit_" + c.id} style={inputStyleTM} />
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>User Seats</div>
                        <input type="number" value={configForm.user_seats || c.user_seats || 10} onChange={function(e){ setConfigForm(function(f){ return Object.assign({}, f, {user_seats: e.target.value}); }); }} data-field={"user_seats_" + c.id} style={inputStyleTM} />
                      </div>
                      <div>
                        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontWeight: 700 }}>API Rate Limit</div>
                        <select style={inputStyleTM}><option>100 req/sec</option><option>50 req/sec</option><option>200 req/sec</option><option>Unlimited</option></select>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => handleSaveTenantConfig(c)} style={{ background: "linear-gradient(135deg, #00C9FF, #E040FB)", border: "none", borderRadius: 8, padding: "8px 18px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>Save Changes</button>
                      <button onClick={() => { openBrandEditor(c); setActiveTab("branding"); setConfiguringTenant(null); }} style={{ background: "rgba(124,77,255,0.13)", border: "1px solid rgba(124,77,255,0.27)", borderRadius: 8, padding: "8px 18px", color: "#7C4DFF", fontWeight: 600, cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>Edit Branding</button>
                      <button onClick={() => setConfiguringTenant(null)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 18px", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "branding" && (
        <div>
          {/* Brand Editor Panel */}
          {editingBrand && (
            <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.primary}44`, borderRadius: 14, padding: 28, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: 0, fontSize: 18 }}>Edit Brand — {Object.values(TENANTS).find(t => t.id === editingBrand)?.name}</h3>
                <button onClick={() => setEditingBrand(null)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 14px", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>✕ Close</button>
              </div>

              {/* Theme Presets */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, fontWeight: 700 }}>Theme Presets</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {themePresets.map(p => (
                    <button key={p.name} onClick={() => setBrandForm(prev => ({ ...prev, primary: p.primary, secondary: p.secondary }))} style={{
                      background: brandForm.primary === p.primary ? `${p.primary}22` : "rgba(255,255,255,0.03)",
                      border: `2px solid ${brandForm.primary === p.primary ? p.primary : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 10, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                      fontFamily: "'DM Sans', sans-serif",
                    }}>
                      <div style={{ display: "flex", gap: 3 }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, background: p.primary }} />
                        <div style={{ width: 18, height: 18, borderRadius: 4, background: p.secondary }} />
                      </div>
                      <span style={{ color: brandForm.primary === p.primary ? p.primary : "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600 }}>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Brand Name</div>
                  <input value={brandForm.name} onChange={e => setBrandForm(prev => ({ ...prev, name: e.target.value }))} style={inputStyleTM} />
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Primary Color</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="color" value={brandForm.primary} onChange={e => setBrandForm(prev => ({ ...prev, primary: e.target.value }))} style={{ width: 44, height: 44, borderRadius: 8, border: "2px solid rgba(255,255,255,0.2)", cursor: "pointer", padding: 2 }} />
                    <input value={brandForm.primary} onChange={e => setBrandForm(prev => ({ ...prev, primary: e.target.value }))} style={{ ...inputStyleTM, flex: 1, fontFamily: "monospace" }} />
                  </div>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Secondary Color</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input type="color" value={brandForm.secondary} onChange={e => setBrandForm(prev => ({ ...prev, secondary: e.target.value }))} style={{ width: 44, height: 44, borderRadius: 8, border: "2px solid rgba(255,255,255,0.2)", cursor: "pointer", padding: 2 }} />
                    <input value={brandForm.secondary} onChange={e => setBrandForm(prev => ({ ...prev, secondary: e.target.value }))} style={{ ...inputStyleTM, flex: 1, fontFamily: "monospace" }} />
                  </div>
                </div>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, fontWeight: 700 }}>Logo URL</div>
                  <input value={brandForm.logo || ''} onChange={e => setBrandForm(prev => ({ ...prev, logo: e.target.value }))} placeholder="https://yourdomain.com/logo.png" style={{ ...inputStyleTM, fontSize: 12 }} />
                </div>
              </div>

              {/* Live Preview */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, fontWeight: 700 }}>Live Preview</div>
                <div style={{ background: "#0a0a14", borderRadius: 12, padding: 20, border: `1px solid ${brandForm.primary}33` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    {brandForm.logo ? (
                      <img src={brandForm.logo} alt="Logo" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "contain", background: "rgba(255,255,255,0.06)" }} />
                    ) : (
                      <div style={{ width: 32, height: 32, background: `linear-gradient(135deg, ${brandForm.primary}, ${brandForm.secondary})`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: 12 }}>{brandForm.name.slice(0, 2).toUpperCase()}</div>
                    )}
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{brandForm.name || "Brand Name"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1, height: 6, background: brandForm.primary, borderRadius: 3 }} />
                    <div style={{ flex: 1, height: 6, background: brandForm.secondary, borderRadius: 3 }} />
                    <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3 }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <div style={{ background: brandForm.primary, borderRadius: 6, padding: "6px 16px", fontSize: 12, color: "#000", fontWeight: 700 }}>Primary Button</div>
                    <div style={{ background: "transparent", border: `1px solid ${brandForm.primary}`, borderRadius: 6, padding: "6px 16px", fontSize: 12, color: brandForm.primary, fontWeight: 600 }}>Secondary</div>
                    <div style={{ background: `${brandForm.primary}22`, borderRadius: 6, padding: "6px 16px", fontSize: 12, color: brandForm.primary }}>Ghost</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ background: `${brandForm.primary}18`, border: `1px solid ${brandForm.primary}33`, borderRadius: 8, padding: "8px 14px", flex: 1 }}>
                      <div style={{ color: brandForm.primary, fontSize: 11, fontWeight: 700 }}>Card Component</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 2 }}>With branded accent</div>
                    </div>
                    <div style={{ background: `${brandForm.secondary}18`, border: `1px solid ${brandForm.secondary}33`, borderRadius: 8, padding: "8px 14px", flex: 1 }}>
                      <div style={{ color: brandForm.secondary, fontSize: 11, fontWeight: 700 }}>Secondary Card</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 2 }}>With secondary accent</div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleSaveBrand} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: "none", borderRadius: 10, padding: "12px 24px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>💾 Save Branding</button>
                <button onClick={() => setEditingBrand(null)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "12px 24px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
              </div>
            </div>
          )}

          {/* Tenant Brand Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {Object.values(liveTenants).map(c => (
            <div key={c.id} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${editingBrand === c.id ? C.primary + "66" : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: 24, overflow: "hidden", transition: "border-color 0.2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, background: `linear-gradient(135deg, ${c.brand.primary}, ${c.brand.secondary})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#000", fontSize: 18 }}>{c.logo}</div>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{c.name}</div>
                  <div style={{ color: c.brand.primary, fontSize: 13 }}>{c.brand.name}</div>
                </div>
              </div>
              <div style={{ background: "#000", borderRadius: 10, padding: 16, marginBottom: 16, border: `1px solid ${c.brand.primary}33` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, background: c.brand.primary, borderRadius: 5 }} />
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{c.brand.name}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, height: 6, background: c.brand.primary, borderRadius: 3 }} />
                  <div style={{ flex: 1, height: 6, background: c.brand.secondary + "66", borderRadius: 3 }} />
                  <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3 }} />
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                  <div style={{ background: c.brand.primary, borderRadius: 5, padding: "4px 12px", fontSize: 11, color: "#000", fontWeight: 700 }}>Button</div>
                  <div style={{ background: "transparent", border: `1px solid ${c.brand.primary}`, borderRadius: 5, padding: "4px 12px", fontSize: 11, color: c.brand.primary }}>Outline</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "Primary", color: c.brand.primary },
                  { label: "Secondary", color: c.brand.secondary },
                ].map(sw => (
                  <div key={sw.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, background: sw.color, borderRadius: 6, border: "2px solid rgba(255,255,255,0.2)" }} />
                    <div>
                      <div style={{ color: "#fff", fontSize: 12 }}>{sw.label}</div>
                      <div style={{ color: C.muted, fontSize: 11 }}>{sw.color}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => openBrandEditor(c)} style={{ marginTop: 14, width: "100%", background: `${c.brand.primary}22`, border: `1px solid ${c.brand.primary}55`, borderRadius: 8, padding: "9px", color: c.brand.primary, fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Edit Brand Settings</button>
            </div>
          ))}
          </div>
        </div>
      )}

      {activeTab === "permissions" && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 14, padding: 28 }}>
          <h3 style={{ color: "#fff", margin: "0 0 20px" }}>Role & Permission Matrix</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ color: C.muted, fontSize: 12, textAlign: "left", padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.07)` }}>Feature</th>
                  {["Super Admin", "Tenant Admin", "Campaign Mgr", "Analyst", "Read Only"].map(r => (
                    <th key={r} style={{ color: C.primary, fontSize: 12, textAlign: "center", padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.07)` }}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["All Tenant Access", true, false, false, false, false],
                  ["Tenant Branding", true, true, false, false, false],
                  ["Create Campaigns", true, true, true, false, false],
                  ["View Analytics", true, true, true, true, true],
                  ["Manage Contacts", true, true, true, false, false],
                  ["Flow Builder", true, true, true, false, false],
                  ["API Keys", true, true, false, false, false],
                  ["Billing Access", true, true, false, false, false],
                  ["User Management", true, true, false, false, false],
                ].map(([feature, ...perms]) => (
                  <tr key={feature}>
                    <td style={{ color: "#fff", fontSize: 13, padding: "12px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>{feature}</td>
                    {perms.map((allowed, i) => (
                      <td key={i} style={{ textAlign: "center", padding: "12px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                        <span style={{ fontSize: 16 }}>{allowed ? "✅" : "—"}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "billing" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {[
            { plan: "Starter", price: "$299/mo", messages: "50,000", channels: 2, users: 3, color: "#6B8BAE" },
            { plan: "Growth", price: "$799/mo", messages: "250,000", channels: 4, users: 10, color: C.primary },
            { plan: "Enterprise", price: "Custom", messages: "Unlimited", channels: 6, users: "Unlimited", color: C.accent },
          ].map(p => (
            <div key={p.plan} style={{ background: "rgba(255,255,255,0.03)", border: `2px solid ${p.color}44`, borderRadius: 14, padding: 28, textAlign: "center" }}>
              <div style={{ color: p.color, fontWeight: 800, fontSize: 18, marginBottom: 8 }}>{p.plan}</div>
              <div style={{ color: "#fff", fontSize: 32, fontWeight: 800, marginBottom: 20 }}>{p.price}</div>
              {[`${p.messages} messages/mo`, `${p.channels} channels`, `${p.users} users`, "White-label portal", "Custom domain", p.plan === "Enterprise" ? "Dedicated support" : "Email support"].map(f => (
                <div key={f} style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, padding: "8px 0", borderBottom: `1px solid rgba(255,255,255,0.05)` }}>✓ {f}</div>
              ))}
              <button style={{ marginTop: 20, width: "100%", background: p.color, border: "none", borderRadius: 8, padding: "12px", color: "#000", fontWeight: 700, cursor: "pointer" }}>Assign to Tenant</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TENANT BRAND SETTINGS COMPONENT ─────────────────────────────────────────
function TenantBrandSettings({ tenantId, tenant, C }) {
  const [brand, setBrand] = useState({
    name: tenant.brand.name || '',
    primary: tenant.brand.primary || '#00C9FF',
    secondary: tenant.brand.secondary || '#E040FB',
    logoUrl: tenant.brand.logoUrl || '',
    websiteUrl: '',
    detecting: false,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const inputStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };
  const labelStyle = { color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, display: 'block', fontWeight: 700 };

  async function detectBrand() {
    if (!brand.websiteUrl) return;
    setBrand(b => ({ ...b, detecting: true }));
    try {
      const res = await fetch('/api/detect-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: brand.websiteUrl })
      });
      const data = await res.json();
      setBrand(b => ({
        ...b,
        detecting: false,
        ...(data.brand?.name && { name: data.brand.name }),
        ...(data.brand?.primary && { primary: data.brand.primary }),
        ...(data.brand?.secondary && { secondary: data.brand.secondary }),
        ...(data.brand?.logoUrl && { logoUrl: data.brand.logoUrl }),
      }));
    } catch(e) {
      setBrand(b => ({ ...b, detecting: false }));
    }
  }

  async function saveBranding() {
    setSaving(true);
    const res = await supabase.from('tenants').update({
      brand_name: brand.name,
      brand_primary: brand.primary,
      brand_secondary: brand.secondary,
      brand_logo_url: brand.logoUrl || null,
      website_url: brand.websiteUrl || null,
    }).eq('id', tenantId);
    setSaving(false);
    if (res.error) { alert('Save failed: ' + res.error.message); }
    else { setSaved(true); setTimeout(() => setSaved(false), 3000); }
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 24, maxWidth: 560 }}>
      <h3 style={{ color: C.text, margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>🎨 Brand Settings</h3>
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <label style={labelStyle}>Website URL</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={brand.websiteUrl} onChange={e => setBrand(b => ({ ...b, websiteUrl: e.target.value }))} placeholder="https://yourdomain.com" style={{ ...inputStyle, flex: 1 }} />
            <button onClick={detectBrand} disabled={!brand.websiteUrl || brand.detecting} style={{ background: brand.detecting ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #00C9FF, #7C4DFF)', border: 'none', borderRadius: 8, padding: '10px 14px', color: brand.detecting ? '#6B8BAE' : '#000', fontWeight: 700, cursor: brand.websiteUrl && !brand.detecting ? 'pointer' : 'not-allowed', fontSize: 13, whiteSpace: 'nowrap', fontFamily: "'DM Sans', sans-serif", opacity: !brand.websiteUrl ? 0.5 : 1 }}>
              {brand.detecting ? '⏳ Detecting…' : '✨ Auto-detect'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Auto-fills brand name, colors and logo from your website.</div>
        </div>
        <div>
          <label style={labelStyle}>Brand Name</label>
          <input value={brand.name} onChange={e => setBrand(b => ({ ...b, name: e.target.value }))} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Primary Color</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="color" value={brand.primary} onChange={e => setBrand(b => ({ ...b, primary: e.target.value }))} style={{ width: 44, height: 44, borderRadius: 8, border: '2px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: 2, background: 'transparent' }} />
            <input value={brand.primary} onChange={e => setBrand(b => ({ ...b, primary: e.target.value }))} style={{ ...inputStyle, fontFamily: 'monospace' }} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Secondary Color</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="color" value={brand.secondary} onChange={e => setBrand(b => ({ ...b, secondary: e.target.value }))} style={{ width: 44, height: 44, borderRadius: 8, border: '2px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: 2, background: 'transparent' }} />
            <input value={brand.secondary} onChange={e => setBrand(b => ({ ...b, secondary: e.target.value }))} style={{ ...inputStyle, fontFamily: 'monospace' }} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Logo URL (optional)</label>
          <input value={brand.logoUrl} onChange={e => setBrand(b => ({ ...b, logoUrl: e.target.value }))} placeholder="https://yourdomain.com/logo.png" style={inputStyle} />
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Right-click your logo → Copy image address.</div>
        </div>
        {saved && <div style={{ background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.25)', borderRadius: 8, padding: '10px 14px', color: '#00E676', fontSize: 13, fontWeight: 600 }}>✅ Branding saved!</div>}
        <button onClick={saveBranding} disabled={saving} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: 'none', borderRadius: 10, padding: '14px', color: '#000', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontFamily: "'DM Sans', sans-serif", width: '100%', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving...' : '💾 Save Branding'}
        </button>
      </div>
    </div>
  );
}

// ─── CUSTOMER TENANT PORTAL ───────────────────────────────────────────────────
function CustomerPortal({ tenantId, onBack, liveTenants, onLogout }) {
  const cpAuth = useAuth();
  const { t, i18n } = useTranslation();
  const [cpSidebarOpen, setCpSidebarOpen] = useState(false);
  const [cpIsMobile, setCpIsMobile] = useState(window.innerWidth < 768);
  const [cpSidebarCollapsed, setCpSidebarCollapsed] = useState(false);
  useEffect(() => { const h = () => setCpIsMobile(window.innerWidth < 768); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  const demoTenant = TENANTS[tenantId];
  const liveTenant = liveTenants?.find(t => t.id === tenantId);
  const tenant = demoTenant || liveTenant || {
    id: tenantId,
    name: "My Business",
    logo: "MB",
    role: "customer",
    brand: { primary: "#00C9FF", secondary: "#E040FB", name: "My Business" },
    colors: { primary: "#00C9FF", accent: "#E040FB", bg: "#080d1a", surface: "#0d1425", border: "#182440", text: "#E8F4FD", muted: "#6B8BAE" },
    stats: { messages: 0, revenue: 0, campaigns: 0, contacts: 0, deliveryRate: 0, openRate: 0 },
    channels: ["SMS", "Email"],
  };
  const cpTheme = useTheme();
  // When drilled in, liveTenant may have stale colors or use defaults. Fetch fresh from DB.
  const [dbColors, setDbColors] = useState(null);
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const { data } = await supabase.from('tenants').select('brand_primary, brand_secondary, brand_logo_url, brand_name, name').eq('id', tenantId).maybeSingle();
        console.log('[CustomerPortal] brand fetch for', tenantId, '→', data ? { primary: data.brand_primary, secondary: data.brand_secondary, name: data.brand_name || data.name } : 'no data');
        if (data && (data.brand_primary || data.brand_secondary)) {
          var c = {
            primary: data.brand_primary || tenant.colors.primary,
            accent: data.brand_secondary || tenant.colors.accent,
          };
          console.log('[CustomerPortal] applying brand colors:', c);
          setDbColors(c);
        }
      } catch (e) { console.warn('[CustomerPortal] brand fetch error:', e.message); }
    })();
  }, [tenantId]);
  const effectiveColors = dbColors ? Object.assign({}, tenant.colors, dbColors) : tenant.colors;
  const C = getThemedColors(effectiveColors, cpTheme.theme);
  const [page, setPage] = useState("dashboard");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [entityTier, setEntityTier] = useState('tenant');
  const [cspDrillTenant, setCspDrillTenant] = useState(null);
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const { data } = await supabase.from('tenants').select('aup_accepted, onboarding_completed, entity_tier').eq('id', tenantId).maybeSingle();
        if (data && data.entity_tier) setEntityTier(data.entity_tier);
        const isSuper = cpAuth && cpAuth.profile && cpAuth.profile.role === 'superadmin';
        if (!isSuper && data && data.aup_accepted && !data.onboarding_completed) setNeedsOnboarding(true);
      } catch (e) {}
      setOnboardingChecked(true);
    })();
  }, [tenantId, cpAuth]);
  const [agentName, setAgentName] = useState('Aria');
  const [brandingKey, setBrandingKey] = useState(0);
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const { data } = await supabase.from('chatbot_configs').select('bot_name').eq('tenant_id', tenantId).limit(1).maybeSingle();
        const n = data && data.bot_name ? String(data.bot_name).trim() : '';
        if (n) setAgentName(n);
      } catch (e) {}
    })();
  }, [tenantId]);
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      try {
        const { data } = await supabase.from('tenants').select('language').eq('id', tenantId).maybeSingle();
        if (data && data.language) {
          i18n.changeLanguage(data.language);
          localStorage.setItem('engwx_language', data.language);
        }
      } catch (e) {}
    })();
  }, [tenantId, i18n]);
  const navItems = [
    { id: "dashboard", label: t('nav.platformOverview'), icon: "⊞" },
    { id: "inbox", label: t('nav.liveInbox'), icon: "💬" },
    { id: "support", label: t('nav.helpDesk'), icon: "🎫" },
    { id: "contacts", label: t('nav.contacts'), icon: "👥" },
    entityTier === 'csp' ? { id: "pipeline", label: t('nav.pipeline'), icon: "📈" } : null,
    entityTier === 'csp' ? { id: "import", label: t('nav.importLeads'), icon: "📥" } : null,
    entityTier === 'csp' ? { id: "lead-scan", label: t('nav.leadScan'), icon: "📲" } : null,
    { id: "campaigns", label: t('nav.campaigns'), icon: "🚀" },
    { id: "flows", label: t('nav.flowBuilder'), icon: "⚡" },
    { id: "sequenceroster", label: t('nav.sequenceRoster'), icon: "📋" },
    { id: "sequences", label: t('nav.sequenceBuilder'), icon: "📝" },
    { id: "chatbot", label: "AI Chatbot", icon: "🤖" },
    { id: "email-digest", label: t('nav.aiDigest'), icon: "📡" },
    entityTier === 'csp' ? { id: "tenants", label: t('nav.tenantManagement'), icon: "🏢" } : null,
    entityTier === 'csp' ? { id: "platform-settings", label: "Platform Settings", icon: "🔧" } : null,
    entityTier === 'csp' ? { id: "hierarchy", label: t('nav.hierarchy'), icon: "🌳" } : null,
    entityTier === 'csp' ? { id: "analytics-global", label: t('nav.globalAnalytics'), icon: "📊" } : null,
    entityTier !== 'csp' ? { id: "analytics", label: t('nav.analytics'), icon: "📊" } : null,
    entityTier === 'csp' ? { id: "customer-success", label: t('nav.customerSuccess'), icon: "📈" } : null,
    entityTier === 'csp' ? { id: "tcr-queue", label: "TCR Queue", icon: "📋" } : null,
    { id: "branding", label: t('nav.branding'), icon: "🎨" },
    { id: "sms-registration", label: t('nav.smsRegistration'), icon: "📋" },
    { id: "settings", label: t('nav.settings'), icon: "⚙️" },
  ].filter(Boolean);

  if (needsOnboarding) {
    return <OnboardingWizard tenantId={tenantId} onComplete={() => setNeedsOnboarding(false)} />;
  }

  if (cspDrillTenant) {
    return <CustomerPortal tenantId={cspDrillTenant} onBack={function() { setCspDrillTenant(null); }} liveTenants={liveTenants} onLogout={onLogout} />;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif" }}>
      {cpIsMobile && !cpSidebarOpen && (
        <button onClick={() => setCpSidebarOpen(true)} style={{ position: "fixed", top: 12, left: 12, zIndex: 200, background: C.surface, border: "1px solid " + C.border, borderRadius: 8, padding: "8px 12px", color: "#fff", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>☰</button>
      )}
      {cpIsMobile && cpSidebarOpen && (
        <div onClick={() => setCpSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 99 }} />
      )}
      <div style={{ width: cpSidebarCollapsed ? 64 : 220, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: cpSidebarCollapsed ? "24px 8px" : "24px 16px", flexShrink: 0, position: cpIsMobile ? "fixed" : "relative", height: cpIsMobile ? "100vh" : "auto", zIndex: 100, transform: cpIsMobile && !cpSidebarOpen ? "translateX(-100%)" : "translateX(0)", transition: "all 0.25s ease", overflow: "hidden" }}>
        {onBack && (
          <div onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, cursor: "pointer", color: C.primary, fontSize: 12, fontWeight: 600, marginBottom: 12, background: C.primary + "10", border: "1px solid " + C.primary + "22", justifyContent: cpSidebarCollapsed ? "center" : "flex-start" }}>
            <span>←</span>
            {!cpSidebarCollapsed && <span>{t('nav.backToPlatform')}</span>}
          </div>
        )}
        <div style={{ marginBottom: 28, paddingLeft: cpSidebarCollapsed ? 0 : 8, textAlign: cpSidebarCollapsed ? "center" : "left" }}>
          {cpSidebarCollapsed ? (
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{(tenant.brand.name || "").substring(0, 2)}</div>
              <div style={{ marginTop: 8, textAlign: 'center' }}><PlatformUpdatesBell userId={cpAuth && cpAuth.user ? cpAuth.user.id : null} audience="tenant" /></div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{tenant.brand.name}</div>
                <PlatformUpdatesBell userId={cpAuth && cpAuth.user ? cpAuth.user.id : null} audience="tenant" />
              </div>
            </>
          )}
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => { setPage(item.id); if(cpIsMobile) setCpSidebarOpen(false); }} style={{
              width: "100%", display: "flex", alignItems: "center", gap: cpSidebarCollapsed ? 0 : 10,
              justifyContent: cpSidebarCollapsed ? "center" : "flex-start",
              padding: cpSidebarCollapsed ? "10px 0" : "10px 12px", borderRadius: 8, border: "none",
              background: page === item.id ? `${C.primary}22` : "transparent",
              color: page === item.id ? C.primary : C.muted,
              cursor: "pointer", fontSize: 13, fontWeight: page === item.id ? 700 : 400,
              marginBottom: 3, textAlign: "left",
              borderLeft: page === item.id ? `3px solid ${C.primary}` : "3px solid transparent",
            }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {!cpSidebarCollapsed && item.label}
            </button>
          ))}
        </nav>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {!cpSidebarCollapsed ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: 12, color: C.muted }}>🌙 Theme</span>
              <ThemeToggle />
            </div>
          ) : (
            <div style={{ textAlign: "center", marginBottom: 2 }}><ThemeToggle /></div>
          )}
          <button onClick={() => setCpSidebarCollapsed(!cpSidebarCollapsed)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, justifyContent: cpSidebarCollapsed ? "center" : "flex-start", padding: cpSidebarCollapsed ? "10px 0" : "10px 12px", borderRadius: 8, border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
            <span>{cpSidebarCollapsed ? "»" : "«"}</span>
            {!cpSidebarCollapsed && <span>Collapse</span>}
          </button>
          {onLogout && <button onClick={onLogout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, justifyContent: cpSidebarCollapsed ? "center" : "flex-start", padding: cpSidebarCollapsed ? "10px 0" : "10px 12px", borderRadius: 8, border: "none", background: "rgba(255,82,82,0.06)", color: "#FF5252", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>
            <span>⏻</span>
            {!cpSidebarCollapsed && <span>Sign Out</span>}
          </button>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: (page === "inbox" || page === "flows") ? "hidden" : "auto", height: (page === "inbox" || page === "flows") ? "100vh" : "auto", minWidth: 0 }}>
        {page === "dashboard" && (
          <div style={{ padding: cpIsMobile ? "20px 14px" : "32px 36px" }}>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: cpIsMobile ? 22 : 26, fontWeight: 800, color: C.text, margin: 0 }}>{tenant.brand.name} Dashboard</h1>
              <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Welcome back, {tenant.name} team</p>
            </div>
            <SetupChecklist tenantId={tenantId} C={C} onNavigate={setPage} />
            <div style={{ display: "grid", gridTemplateColumns: cpIsMobile ? "1fr" : "repeat(3, 1fr)", gap: cpIsMobile ? 12 : 18, marginBottom: 28 }}>
              <StatCard label="Messages Sent" value={tenant.stats.messages.toLocaleString()} sub={`Delivery: ${tenant.stats.deliveryRate}%`} color={C.primary} icon="📨" />
              <StatCard label="Revenue" value={`$${tenant.stats.revenue.toLocaleString()}`} sub="+22.7% this month" color="#00E676" icon="💰" />
              <StatCard label="Open Rate" value={`${tenant.stats.openRate}%`} sub="Industry avg: 38%" color={C.accent} icon="👁️" />
            </div>
            <div style={{ background: `${C.primary}11`, border: `1px solid ${C.primary}33`, borderRadius: 14, padding: cpIsMobile ? 16 : 24 }}>
              <h3 style={{ color: C.text, margin: "0 0 16px", fontSize: 16 }}>Active Channels</h3>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {tenant.channels.map(ch => (
                  <div key={ch} style={{ background: `${C.primary}22`, border: `1px solid ${C.primary}44`, borderRadius: 10, padding: "12px 20px", color: C.primary, fontWeight: 700, fontSize: 14 }}>● {ch}</div>
                ))}
              </div>
            </div>
          </div>
        )}
        {page === "campaigns" && <CampaignsModule C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} demoMode={false} />}
        {page === "analytics" && <AnalyticsDashboard C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} demoMode={false} />}
        {page === "contacts" && <ContactsModule C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} demoMode={false} onNavigate={setPage} />}
        {page === "inbox" && <LiveInbox key="live-inbox-tenant" C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} demoMode={false} supabase={supabase} userProfile={cpAuth && cpAuth.profile} />}
        {page === "chatbot" && <AIChatbot C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} demoMode={false} />}
        {page === "email-digest" && <EmailDigest C={C} currentTenantId={tenantId} />}
        {page === "flows" && <FlowBuilder C={C} tenants={TENANTS} viewLevel="tenant" currentTenantId={tenantId} demoMode={false} />}
        {page === "support" && (
          <HelpDeskModule tenantId={tenantId} userRole="tenant" C={C} demoMode={false} />
        )}
        {page === "sequences" && <SequenceBuilder C={C} currentTenantId={tenantId} demoMode={false} />}
        {page === "sequenceroster" && <SequenceRoster C={C} currentTenantId={tenantId} demoMode={false} />}
        {page === "billing" && <Settings C={C} currentTenantId={tenantId} viewLevel="tenant" demoMode={false} defaultTab="billing" allowedTabs={["billing"]} />}
        {page === "integrations" && <Settings C={C} currentTenantId={tenantId} viewLevel="tenant" demoMode={false} defaultTab="integrations" allowedTabs={["integrations", "api", "webhooks"]} />}
        {page === "settings" && (
          <Settings C={C} currentTenantId={tenantId} viewLevel="tenant" demoMode={false} defaultTab="channels" allowedTabs={["channels", "billing", "team", "notifications", "security", "modules"]} />
        )}
        {page === "sms-registration" && <TCRRegistration tenantId={tenantId} C={C} />}
        {page === "pipeline" && entityTier === 'csp' && (
          <PipelineDashboard C={C} tenantId={tenantId} demoMode={false} isSuperAdmin={false} />
        )}
        {page === "import" && entityTier === 'csp' && <ImportLeads C={C} currentTenantId={tenantId} demoMode={false} />}
        {page === "lead-scan" && entityTier === 'csp' && <LeadScan C={C} demoMode={false} />}
        {page === "tenants" && entityTier === 'csp' && <TenantManagement C={C} demoMode={false} onDrillDown={setCspDrillTenant} currentTenantId={tenantId} />}
        {page === "platform-settings" && entityTier === 'csp' && (() => {
          function CSPPlatformSettings() {
            var [cspPc, setCspPc] = useState(null);
            var [cspLoading, setCspLoading] = useState(true);
            var [cspLastSaved, setCspLastSaved] = useState(null);
            var [cspFieldSaved, setCspFieldSaved] = useState({});
            var cspSaveTimerRef = useRef({});
            useEffect(function() {
              fetch('/api/platform-config?full=1&tenant_id=' + tenantId).then(function(r) { return r.json(); }).then(function(d) { setCspPc(d); setCspLoading(false); }).catch(function() { setCspLoading(false); });
            }, []);
            function cspUpdateAndSave(key, val) {
              setCspPc(function(prev) { var n = Object.assign({}, prev); n[key] = val; return n; });
              if (cspSaveTimerRef.current[key]) clearTimeout(cspSaveTimerRef.current[key]);
              cspSaveTimerRef.current[key] = setTimeout(function() {
                var payload = {}; payload[key] = val;
                fetch('/api/platform-config?tenant_id=' + tenantId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function(r) {
                  if (r.ok) { setCspFieldSaved(function(p) { var n = Object.assign({}, p); n[key] = true; return n; }); setCspLastSaved(new Date()); setTimeout(function() { setCspFieldSaved(function(p) { var n = Object.assign({}, p); delete n[key]; return n; }); }, 2000); }
                }).catch(function() {});
              }, 1500);
            }
            if (cspLoading) return <div style={{ padding: 40, color: C.muted, textAlign: 'center' }}>Loading...</div>;
            if (!cspPc) return <div style={{ padding: 40, color: '#FF3B30' }}>Failed to load config</div>;
            var sStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 22, marginBottom: 16 };
            var lStyle = { color: C.muted, fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };
            var iStyle = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };
            return (
              <div style={{ padding: '32px 40px', maxWidth: 900 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <div><h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>🔧 Platform Settings</h1><p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Your overrides — empty fields inherit from platform defaults</p></div>
                  {cspLastSaved && <span style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>Last saved {cspLastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
                <div style={sStyle}>
                  <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>🏢 Brand</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div><label style={lStyle}>Platform Name</label><input value={cspPc.platform_name || ''} onChange={function(e) { cspUpdateAndSave('platform_name', e.target.value); }} placeholder="(inherited from platform)" style={iStyle} /></div>
                    <div><label style={lStyle}>Headquarters</label><input value={cspPc.headquarters || ''} onChange={function(e) { cspUpdateAndSave('headquarters', e.target.value); }} placeholder="(inherited)" style={iStyle} /></div>
                  </div>
                </div>
                <div style={sStyle}>
                  <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>📞 Contact</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div><label style={lStyle}>Support Email</label><input value={cspPc.support_email || ''} onChange={function(e) { cspUpdateAndSave('support_email', e.target.value); }} placeholder="(inherited)" style={iStyle} /></div>
                    <div><label style={lStyle}>Support Phone</label><input value={cspPc.support_phone || ''} onChange={function(e) { cspUpdateAndSave('support_phone', e.target.value); }} placeholder="(inherited)" style={iStyle} /></div>
                    <div><label style={lStyle}>Portal URL</label><input value={cspPc.portal_url || ''} onChange={function(e) { cspUpdateAndSave('portal_url', e.target.value); }} placeholder="(inherited)" style={iStyle} /></div>
                    <div><label style={lStyle}>Calendar URL</label><input value={cspPc.calendar_url || ''} onChange={function(e) { cspUpdateAndSave('calendar_url', e.target.value); }} placeholder="(inherited)" style={iStyle} /></div>
                  </div>
                </div>
                <div style={sStyle}>
                  <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>🚀 Onboarding</h3>
                  <div><label style={lStyle}>Welcome Email Subject Template</label><input value={cspPc.welcome_email_subject_template || ''} onChange={function(e) { cspUpdateAndSave('welcome_email_subject_template', e.target.value); }} placeholder="(inherited from platform)" style={iStyle} /></div>
                  <div style={{ marginTop: 12 }}><label style={lStyle}>Welcome Email HTML Template</label><textarea value={cspPc.welcome_email_html_template || ''} onChange={function(e) { cspUpdateAndSave('welcome_email_html_template', e.target.value); }} rows={8} placeholder="(inherited from platform)" style={Object.assign({}, iStyle, { fontFamily: 'monospace', fontSize: 11, resize: 'vertical' })} /></div>
                </div>
              </div>
            );
          }
          return <CSPPlatformSettings />;
        })()}
        {page === "hierarchy" && entityTier === 'csp' && <HierarchyView C={C} />}
        {page === "analytics-global" && entityTier === 'csp' && <AnalyticsDashboard C={C} tenants={TENANTS} viewLevel="sp" demoMode={false} />}
        {page === "customer-success" && entityTier === 'csp' && <CustomerSuccessDashboard C={C} />}
        {page === "tcr-queue" && entityTier === 'csp' && <TCRQueue C={C} />}
        {page === "branding" && (
          <div style={{ padding: "32px 36px", maxWidth: 900 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>Branding</h1>
            <p style={{ color: C.muted, fontSize: 14, marginBottom: 16 }}>Customize your portal branding</p>
            <AutoDetectBrandBar tenantId={tenantId} C={C} onDetected={function() { setBrandingKey(function(k) { return k + 1; }); }} />
            <BrandingEditor key={'brand-' + brandingKey} entityId={tenantId} actor={{ tenantId: tenantId, entityTier: 'tenant', isSuperAdmin: false, mspEnabled: false, loaOnFile: false }} C={C} />
          </div>
        )}
        {page !== "dashboard" && page !== "campaigns" && page !== "analytics" && page !== "contacts" && page !== "inbox" && page !== "chatbot" && page !== "flows" && page !== "settings" && page !== "registration" && page !== "support" && page !== "branding" && page !== "sequences" && page !== "sequenceroster" && page !== "billing" && page !== "integrations" && page !== "sms-registration" && (
          <div style={{ padding: "32px 36px" }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: "0 0 8px" }}>{navItems.find(n => n.id === page)?.label}</h1>
            <p style={{ color: C.muted, fontSize: 14 }}>Manage your {page} within {tenant.brand.name}</p>
            <div style={{ marginTop: 24, background: `${C.primary}08`, border: `1px solid ${C.primary}22`, borderRadius: 14, padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{navItems.find(n => n.id === page)?.icon}</div>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 18 }}>{navItems.find(n => n.id === page)?.label} Module</div>
              <div style={{ color: C.muted, marginTop: 8 }}>Fully white-labeled — branded as {tenant.brand.name}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
function AppInner() {
  const { user, profile, setProfile, loading, demoMode, toggleDemoMode, signIn, signUp, signOut, resetPassword, updatePassword, authError, isSuperAdmin, isCSP, cspTenantId, isAuthenticated, passwordRecovery } = useAuth();
  const { t: tSP } = useTranslation();
  
  // Default to production mode (demo off) on first load
  const [demoInitialized, setDemoInitialized] = useState(false);
  useEffect(() => {
    if (!demoInitialized && isSuperAdmin && demoMode) {
      toggleDemoMode(false);
      setDemoInitialized(true);
    } else {
      setDemoInitialized(true);
    }
  }, [isSuperAdmin, demoMode, demoInitialized]);
  const [view, setView] = useState("login");
  const [selectedRole, setSelectedRole] = useState(null);
  const [drillDownStack, setDrillDownStack] = useState([]);
  const drillDownTenant = drillDownStack.length > 0 ? drillDownStack[drillDownStack.length - 1] : null;
  const pushDrill = function(id) { setDrillDownStack(function(s) { return s.concat([id]); }); };
  const popDrill = function() { setDrillDownStack(function(s) { return s.slice(0, -1); }); };
  const jumpDrill = function(idx) { setDrillDownStack(function(s) { return s.slice(0, idx); }); };
  const [spPage, setSpPage] = useState("dashboard");
  const [spAgentName, setSpAgentName] = useState('Aria');
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('chatbot_configs').select('bot_name').eq('tenant_id', (process.env.REACT_APP_SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387')).limit(1).maybeSingle();
        const n = data && data.bot_name ? String(data.bot_name).trim() : '';
        if (n) setSpAgentName(n);
      } catch (e) {}
    })();
  }, []);
  const { liveTenants, liveStats, liveLoading, refreshLiveData } = useLiveData(demoMode, isSuperAdmin);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [resetMessage, setResetMessage] = useState(null);
  const [loginTab, setLoginTab] = useState("login"); // "login" | "signup" | "reset" | "demo"
  const [loginForm, setLoginForm] = useState({ email: "", password: "", fullName: "", companyName: "" });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginMessage, setLoginMessage] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // Handle return from Stripe checkout
    if (params.get("checkout") === "success" || params.get("signup") === "success") {
      const email = params.get("email") || "";
      window.history.replaceState({}, "", window.location.pathname);
      setLoginMessage({ type: "success", text: "🎉 Payment received! Your account is ready. Please sign in." });
      setLoginTab("login");
      if (email) setLoginForm(p => ({ ...p, email: decodeURIComponent(email) }));
    }
    
    // Handle direct signup link from landing page
    if (params.get("view") === "signup") {
      window.history.replaceState({}, "", window.location.pathname);
      setLoginTab("signup");
    }
  }, []);

  // Auto-route authenticated users directly to their portal
  useEffect(() => {
    if (isAuthenticated && profile && view === "login") {
      if (profile.role === "superadmin") {
        setView("sp");
      } else if (profile.entity_tier === "master_agent" && profile.tenant_id) {
        setView("master_agent_" + profile.tenant_id);
      } else if (isCSP && profile.tenant_id) {
        setView("csp_" + profile.tenant_id);
      } else if (profile.tenant_type === "agent" && profile.tenant_id) {
        setView("agent_" + profile.tenant_id);
      } else if (profile.tenant_id) {
        setView("tenant_" + profile.tenant_id);
      } else {
        setView("no_tenant");
      }
    }
  }, [isAuthenticated, profile, view]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginMessage(null);
    const { error } = await signIn({ email: loginForm.email, password: loginForm.password });
    if (error) setLoginMessage({ type: "error", text: error });
    setLoginLoading(false);
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginMessage(null);
    const { error } = await signUp({
      email: loginForm.email,
      password: loginForm.password,
      fullName: loginForm.fullName,
      companyName: loginForm.companyName,
    });
    if (error) {
      setLoginMessage({ type: "error", text: error });
    } else {
      setLoginMessage({ type: "success", text: "Account created! Check your email for a confirmation link. Once confirmed, you'll be taken directly to your portal." });
      setLoginTab("login");
    }
    setLoginLoading(false);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginMessage(null);
    const { error } = await resetPassword(loginForm.email);
    if (error) {
      setLoginMessage({ type: "error", text: error });
    } else {
      setLoginMessage({ type: "success", text: "Password reset email sent!" });
    }
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    toggleDemoMode(false);
    await signOut();
    setView("login");
    setLoginTab("login");
    setSpPage("dashboard");
  };

  const { theme, isDark } = useTheme();
  const C = getThemedColors(TENANTS.serviceProvider.colors, theme);

var spNavBase = [
    { id: "dashboard",        label: tSP('nav.platformOverview'),  icon: "⊞" },
    { id: "tenants",          label: tSP('nav.tenantManagement'),  icon: "🏢" },
    { id: "hierarchy",        label: tSP('nav.hierarchy'),         icon: "🌳" },
    { id: "pipeline",         label: tSP('nav.pipeline'),          icon: "📈" },
    { id: "import",           label: tSP('nav.importLeads'),       icon: "📥" },
    { id: "lead-scan",        label: tSP('nav.leadScan'),          icon: "📲" },
    { id: "sequences",        label: tSP('nav.sequenceRoster'),    icon: "📋" },
    { id: "sequence-builder", label: tSP('nav.sequenceBuilder'),   icon: "📝" },
    { id: "campaigns",        label: tSP('nav.campaigns'),         icon: "🚀" },
    { id: "contacts",         label: tSP('nav.contacts'),          icon: "👥" },
    { id: "inbox",            label: tSP('nav.liveInbox'),         icon: "💬" },
    { id: "helpdesk",         label: tSP('nav.helpDesk'),          icon: "🎫" },
    { id: "chatbot",          label: "AI Chatbot",                      icon: "🤖" },
    { id: "flows",            label: tSP('nav.flowBuilder'),       icon: "⚡" },
    { id: "analytics",        label: tSP('nav.globalAnalytics'),   icon: "📊" },
    { id: "customer-success", label: tSP('nav.customerSuccess'),   icon: "📊", superadminOnly: true },
    { id: "platform-updates", label: tSP('nav.platformUpdates'),   icon: "📢", superadminOnly: true },
    { id: "tcr-queue",        label: tSP('nav.tcrQueue'),          icon: "📋", superadminOnly: true },
    { id: "demo",             label: tSP('nav.demoMode'),          icon: "🎯" },
    { id: "blog",             label: tSP('nav.blogManager'),       icon: "📝", superadminOnly: true },
    { id: "api",              label: tSP('nav.apisIntegrations'),  icon: "🔌" },
    { id: "platform-settings", label: "Platform Settings",         icon: "🔧", superadminOnly: true },
    { id: "settings",         label: tSP('nav.settings'),          icon: "⚙️" },
  ];
  var spNavItems = spNavBase.filter(function(i) { return isSuperAdmin || !i.superadminOnly; });
  if (isSuperAdmin) {
    var settingsIdx = spNavItems.findIndex(function(n) { return n.id === 'settings'; });
    if (settingsIdx > -1) spNavItems.splice(settingsIdx, 0, { id: 'email-digest', label: tSP('nav.aiDigest'), icon: '📡' });
    else spNavItems.push({ id: 'email-digest', label: tSP('nav.aiDigest'), icon: '📡' });
  }

  const hostname = window.location.hostname;
  const isPortal = hostname.startsWith("portal.") || hostname === "localhost" || hostname === "127.0.0.1";

  if (!isPortal) {
    if (window.location.pathname === '/blog' || window.location.pathname.startsWith('/blog/')) {
      return <Suspense fallback={<div style={{background:'#050810',color:'#E8F4FD',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Outfit',sans-serif"}}>Loading...</div>}><Blog onBack={function() { window.location.href = '/'; }} /></Suspense>;
    }
    if (window.location.pathname === '/api-docs') {
      return <Suspense fallback={<div style={{background:'#0a0d14',color:'#e8f0f8',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',sans-serif"}}>Loading...</div>}><ApiDocs onBack={function() { window.location.href = '/'; }} /></Suspense>;
    }
    return <LandingPage />;
  }

  // Signup page should NEVER be interrupted by loading state
  if (view === "signup") {
    return <SignupPage onBack={() => setView("login")} />;
  }

  // User signed up but didn't complete payment
  if (view === "no_tenant") {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 440, padding: "0 20px" }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>💳</div>
          <h1 style={{ color: "#e2e8f0", fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Complete Your Subscription</h1>
          <p style={{ color: "#94a3b8", fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
            Your account has been created but your subscription is not yet active. Complete the checkout to activate your EngageWorx portal.
          </p>
          <button onClick={async () => {
            try {
              const meta = user?.user_metadata || {};
              const plan = meta.plan || "starter";
              const plans = { starter: "price_1T4OeIPEs1sluBAUuRIaD8Cq", growth: "price_1T4OefPEs1sluBAUuZVAaBJ3", pro: "price_1T4Of6PEs1sluBAURFjaViRv" };
              const res = await fetch("/api/create-checkout-session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  priceId: plans[plan] || plans.starter,
                  email: user?.email,
                  plan: plan,
                  tenantName: meta.company_name || meta.business_name || "My Business",
                  successUrl: window.location.origin + "?signup=success",
                }),
              });
              const { url } = await res.json();
              window.location.href = url;
            } catch (err) {
              alert("Error: " + err.message);
            }
          }} style={{ width: "100%", background: "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "#fff", border: "none", borderRadius: 10, padding: "14px 28px", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginBottom: 16 }}>
            Complete Checkout
          </button>
          <button onClick={() => signOut()} style={{ width: "100%", background: "transparent", color: "#64748b", border: "1px solid #334155", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Sign Out
          </button>
          <p style={{ color: "#475569", fontSize: 12, marginTop: 24 }}>
            Need help? Contact us at <a href="mailto:support@engwx.com" style={{ color: "#0ea5e9", textDecoration: "none" }}>support@engwx.com</a> or call <a href="tel:+17869827800" style={{ color: "#0ea5e9", textDecoration: "none" }}>+1 (786) 982-7800</a>
          </p>
        </div>
      </div>
    );
  }

  // Show loading while checking auth state
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#fff", marginBottom: 16 }}>Engage<span style={{ color: C.primary }}>Worx</span></div>
          <div style={{ color: C.muted, fontSize: 14 }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (drillDownTenant) {
    var crumbLabel = function(id) {
      var t = liveTenants.find(function(x) { return x.id === id; });
      return t ? (t.name || t.company || 'Tenant') : 'Tenant';
    };
    var breadcrumb = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#0a0d14', borderBottom: '1px solid #1a2030', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#8899aa', flexWrap: 'wrap' }}>
        <span onClick={function() { setDrillDownStack([]); }} style={{ cursor: 'pointer', color: '#7C4DFF', fontWeight: 600 }}>SP Admin</span>
        {drillDownStack.map(function(id, idx) {
          var isLast = idx === drillDownStack.length - 1;
          return (
            <span key={id + ':' + idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#445566' }}>›</span>
              <span onClick={isLast ? undefined : function() { jumpDrill(idx + 1); }} style={{ cursor: isLast ? 'default' : 'pointer', color: isLast ? '#e8f0f8' : '#7C4DFF', fontWeight: 600 }}>{crumbLabel(id)}</span>
            </span>
          );
        })}
      </div>
    );
    var drillDownTenantData = liveTenants.find(function(t) { return t.id === drillDownTenant; });
    var inner;
    if (drillDownTenantData && drillDownTenantData.entity_tier === 'master_agent') {
      inner = <MasterAgentPortal masterAgentTenantId={drillDownTenant} onBack={popDrill} onLogout={handleLogout} profile={profile} onOpenTenantPortal={pushDrill} />;
    } else if (drillDownTenantData && drillDownTenantData.tenant_type === 'csp') {
      inner = <CSPPortal cspTenantId={drillDownTenant} onBack={popDrill} onLogout={handleLogout} profile={profile} onOpenTenantPortal={pushDrill} />;
    } else if (drillDownTenantData && drillDownTenantData.tenant_type === 'agent') {
      inner = <AgentPortal agentTenantId={drillDownTenant} onBack={popDrill} onLogout={handleLogout} profile={profile} onOpenTenantPortal={pushDrill} />;
    } else {
      inner = <CustomerPortal tenantId={drillDownTenant} onBack={popDrill} liveTenants={liveTenants} />;
    }
    // The drilled portal uses 100vw/100% internally — the wrapper must not constrain it.
    // Also inject CSS custom properties for the drilled tenant's brand colors so any
    // child that reads --color-primary / --color-accent picks up the right values.
    var drillColors = {};
    if (drillDownTenantData) {
      if (drillDownTenantData.brand && drillDownTenantData.brand.primary) drillColors['--color-primary'] = drillDownTenantData.brand.primary;
      if (drillDownTenantData.brand && drillDownTenantData.brand.secondary) drillColors['--color-accent'] = drillDownTenantData.brand.secondary;
      if (drillDownTenantData.colors && drillDownTenantData.colors.primary) drillColors['--color-primary'] = drillDownTenantData.colors.primary;
      if (drillDownTenantData.colors && drillDownTenantData.colors.accent) drillColors['--color-accent'] = drillDownTenantData.colors.accent;
    }
    return (
      <div style={Object.assign({ width: '100vw', minHeight: '100vh', display: 'flex', flexDirection: 'column', overflow: 'visible' }, drillColors)}>
        {breadcrumb}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'visible' }}>
          {inner}
        </div>
      </div>
    );
  }

  // AUP gate — first-login block for authenticated tenant users (not superadmin)
  if (isAuthenticated && profile && profile.tenant_id && profile.aup_accepted === false && !isSuperAdmin) {
    return <AUPModal tenantId={profile.tenant_id} onAccepted={function() {
      // Patch profile in React state instead of window.location.reload().
      // Reload drops the auth session momentarily → race condition → 400s on every
      // Supabase query → blank portal. setProfile triggers a clean React re-render
      // that skips the AUP gate and routes straight into the portal.
      setProfile(function(prev) { return Object.assign({}, prev, { aup_accepted: true }); });
    }} onSignOut={handleLogout} />;
  }

  // Password recovery screen
  if (passwordRecovery && isAuthenticated) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ width: 420 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>Engage<span style={{ color: C.primary }}>Worx</span></div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "36px 32px" }}>
            <h2 style={{ color: "#fff", margin: "0 0 8px", textAlign: "center", fontSize: 20 }}>Set New Password</h2>
            <p style={{ color: C.muted, textAlign: "center", marginBottom: 24, fontSize: 13 }}>Enter your new password below</p>
            
            {resetMessage && (
              <div style={{ background: resetMessage.type === "error" ? "#FF3B3018" : "#00E67618", border: `1px solid ${resetMessage.type === "error" ? "#FF3B3044" : "#00E67644"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: resetMessage.type === "error" ? "#FF3B30" : "#00E676", fontSize: 13 }}>
                {resetMessage.text}
              </div>
            )}

            <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
              <div>
                <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
              </div>
              <div>
                <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Confirm New Password</label>
                <input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} placeholder="Repeat password" style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" }} />
              </div>
            </div>

            <button onClick={async () => {
              if (!newPassword || newPassword.length < 6) {
                setResetMessage({ type: "error", text: "Password must be at least 6 characters" });
                return;
              }
              if (newPassword !== confirmNewPassword) {
                setResetMessage({ type: "error", text: "Passwords don't match" });
                return;
              }
              const { error } = await updatePassword(newPassword);
              if (error) {
                setResetMessage({ type: "error", text: error });
              } else {
                setResetMessage({ type: "success", text: "Password updated! Redirecting..." });
                setNewPassword("");
                setConfirmNewPassword("");
                setTimeout(() => setResetMessage(null), 2000);
              }
            }} style={{
              width: "100%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
              border: "none", borderRadius: 10, padding: "14px",
              color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 15,
            }}>
              Update Password
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "admin_tenants") {
    return <AdminTenants onBack={() => setView("sp")} />;
  }
  if (view === "login") {
    const inputLogin = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px 16px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };

    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ width: 480 }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#fff" }}>Engage<span style={{ color: C.primary }}>Worx</span></div>
            <div style={{ color: C.muted, marginTop: 6 }}>Multi-Tenant Communications Platform</div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 40 }}>
            {/* Mode Toggle */}
            <div style={{ display: "flex", gap: 2, marginBottom: 24, background: "rgba(255,255,255,0.04)", padding: 3, borderRadius: 10 }}>
              {[
                { id: "login", label: "Sign In" },
                { id: "signup", label: "Sign Up" },
              ].map(t => (
                <button key={t.id} onClick={() => { setLoginTab(t.id); setLoginMessage(null); }} style={{
                  flex: 1, background: loginTab === t.id ? C.primary : "transparent",
                  border: "none", borderRadius: 8, padding: "8px 12px",
                  color: loginTab === t.id ? "#000" : C.muted,
                  fontWeight: loginTab === t.id ? 700 : 400, cursor: "pointer", fontSize: 13,
                  fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
                }}>{t.label}</button>
              ))}
            </div>

            {/* Status message */}
            {loginMessage && (
              <div style={{ background: loginMessage.type === "error" ? "#FF3B3018" : "#00E67618", border: `1px solid ${loginMessage.type === "error" ? "#FF3B3044" : "#00E67644"}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, color: loginMessage.type === "error" ? "#FF3B30" : "#00E676", fontSize: 13 }}>
                {loginMessage.text}
              </div>
            )}

            {/* ═══ SIGN IN ═══ */}
            {loginTab === "login" && (
              <form onSubmit={handleLogin}>
                <h2 style={{ color: "#fff", margin: "0 0 8px", textAlign: "center", fontSize: 20 }}>Sign In</h2>
                <p style={{ color: C.muted, textAlign: "center", marginBottom: 24, fontSize: 13 }}>Access your account with email and password</p>

                <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Email</label>
                    <input type="email" required value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))} placeholder="you@company.com" style={inputLogin} />
                  </div>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Password</label>
                    <input type="password" required value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" style={inputLogin} />
                  </div>
                </div>

                <button type="submit" disabled={loginLoading} style={{
                  width: "100%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                  border: "none", borderRadius: 10, padding: "14px",
                  color: "#000", fontWeight: 700, cursor: loginLoading ? "wait" : "pointer",
                  fontSize: 15, opacity: loginLoading ? 0.7 : 1,
                }}>
                  {loginLoading ? "Signing in..." : "Sign In →"}
                </button>

                <div style={{ marginTop: 14, textAlign: "center" }}>
                  <button type="button" onClick={() => { setLoginTab("reset"); setLoginMessage(null); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12 }}>
                    Forgot password?
                  </button>
                </div>
              </form>
            )}

            {/* ═══ SIGN UP ═══ */}
            {loginTab === "signup" && (
              <div>
                <h2 style={{ color: "#fff", margin: "0 0 8px", textAlign: "center", fontSize: 20 }}>Create Account</h2>
                <p style={{ color: C.muted, textAlign: "center", marginBottom: 24, fontSize: 13 }}>Start your free trial — no credit card required</p>

                <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Full Name</label>
                      <input type="text" required value={loginForm.fullName} onChange={e => setLoginForm(p => ({ ...p, fullName: e.target.value }))} placeholder="Jane Smith" style={inputLogin} />
                    </div>
                    <div>
                      <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Company</label>
                      <input type="text" required value={loginForm.companyName} onChange={e => setLoginForm(p => ({ ...p, companyName: e.target.value }))} placeholder="Acme Inc" style={inputLogin} />
                    </div>
                  </div>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Email</label>
                    <input type="email" required value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))} placeholder="you@company.com" style={inputLogin} />
                  </div>
                  <div>
                    <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Password</label>
                    <input type="password" required minLength={6} value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} placeholder="Min 6 characters" style={inputLogin} />
                  </div>
                </div>

                <button type="button" disabled={loginLoading} onClick={async () => {
                  if (!loginForm.fullName || !loginForm.companyName || !loginForm.email || !loginForm.password) {
                    setLoginMessage({ type: "error", text: "Please fill all fields" });
                    return;
                  }
                  if (loginForm.password.length < 6) {
                    setLoginMessage({ type: "error", text: "Password must be at least 6 characters" });
                    return;
                  }
                  setLoginLoading(true);
                  setLoginMessage(null);
                  try {
                    const checkoutRes = await fetch("/api/billing?action=signup", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        plan: "starter",
                        email: loginForm.email,
                        password: loginForm.password,
                        fullName: loginForm.fullName,
                        companyName: loginForm.companyName,
                      }),
                    });
                    const checkoutData = await checkoutRes.json();
                    if (checkoutData.url) {
                      // Send admin notification in background
                      fetch("/api/email?action=send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          to: (process.env.REACT_APP_PLATFORM_ADMIN_EMAIL || "rob@engwx.com"),
                          subject: "🎉 New Signup: " + loginForm.companyName + " (starter)",
                          html: "<h2>New EngageWorx Signup</h2><p><b>Name:</b> " + loginForm.fullName + "</p><p><b>Business:</b> " + loginForm.companyName + "</p><p><b>Email:</b> " + loginForm.email + "</p>",
                        }),
                      }).catch(() => {});
                      window.location.href = checkoutData.url;
                    } else {
                      throw new Error(checkoutData.error || "Something went wrong. Please try again or contact hello@engwx.com for help.");
                    }
                  } catch (err) {
                    console.error("SIGNUP ERROR:", err);
                    // Send error report to Rob
                    fetch("/api/email?action=send", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        to: (process.env.REACT_APP_PLATFORM_ADMIN_EMAIL || "rob@engwx.com"),
                        subject: "Signup Error: " + loginForm.email,
                        html: "<h2>Signup Failed</h2><p><b>Name:</b> " + loginForm.fullName + "</p><p><b>Company:</b> " + loginForm.companyName + "</p><p><b>Email:</b> " + loginForm.email + "</p><p><b>Error:</b> " + (err.message || "Unknown") + "</p>",
                      }),
                    }).catch(function() {});
                    setLoginMessage({ type: "error", text: "We're having trouble processing your signup. Please try again or contact us at hello@engwx.com and we'll get you set up right away." });
                    setLoginLoading(false);
                  }
                }} style={{
                  width: "100%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                  border: "none", borderRadius: 10, padding: "14px",
                  color: "#000", fontWeight: 700, cursor: loginLoading ? "wait" : "pointer",
                  fontSize: 15, opacity: loginLoading ? 0.7 : 1,
                }}>
                  {loginLoading ? "Creating account..." : "Create Account →"}
                </button>
              </div>
            )}

            {/* ═══ RESET PASSWORD ═══ */}
            {loginTab === "reset" && (
              <form onSubmit={handleReset}>
                <h2 style={{ color: "#fff", margin: "0 0 8px", textAlign: "center", fontSize: 20 }}>Reset Password</h2>
                <p style={{ color: C.muted, textAlign: "center", marginBottom: 24, fontSize: 13 }}>Enter your email and we'll send a reset link</p>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4, fontWeight: 700 }}>Email</label>
                  <input type="email" required value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))} placeholder="you@company.com" style={inputLogin} />
                </div>

                <button type="submit" disabled={loginLoading} style={{
                  width: "100%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`,
                  border: "none", borderRadius: 10, padding: "14px",
                  color: "#000", fontWeight: 700, cursor: loginLoading ? "wait" : "pointer",
                  fontSize: 15, opacity: loginLoading ? 0.7 : 1,
                }}>
                  {loginLoading ? "Sending..." : "Send Reset Link"}
                </button>

                <div style={{ marginTop: 14, textAlign: "center" }}>
                  <button type="button" onClick={() => { setLoginTab("login"); setLoginMessage(null); }} style={{ background: "none", border: "none", color: C.primary, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    ← Back to Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (view.startsWith("tenant_")) {
    const tenantId = view.replace("tenant_", "");
    return <CustomerPortal tenantId={tenantId} onLogout={handleLogout} liveTenants={liveTenants} />;
  }

  // CSP Portal — filtered view for Channel Service Providers
  if (view.startsWith("csp_")) {
    const cspTenantId = view.replace("csp_", "");
    return <CSPPortal cspTenantId={cspTenantId} onLogout={handleLogout} profile={profile} />;
  }

  // Master Agent Portal — hierarchy rollup view (checked before agent_ since it also starts with 'agent_')
  if (view.startsWith("master_agent_")) {
    const maTenantId = view.replace("master_agent_", "");
    return <MasterAgentPortal masterAgentTenantId={maTenantId} onLogout={handleLogout} profile={profile} onOpenTenantPortal={pushDrill} />;
  }

  // Agent Portal — referral partner view
  if (view.startsWith("agent_")) {
    const agentTenantId = view.replace("agent_", "");
    return <AgentPortal agentTenantId={agentTenantId} onLogout={handleLogout} profile={profile} onOpenTenantPortal={pushDrill} />;
  }

  // Service Provider portal
  return (
   <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text, overflow: "hidden", position: "relative" }}>
      {isMobile && !sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)} style={{ position: "fixed", top: 12, left: 12, zIndex: 200, background: C.surface, border: "1px solid " + C.border, borderRadius: 8, padding: "8px 12px", color: "#fff", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>
          ☰
        </button>
      )}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 99 }} />
      )}
      <div style={{ width: sidebarCollapsed ? 64 : 240, boxSizing: "border-box", background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: sidebarCollapsed ? "24px 8px" : "24px 16px", flexShrink: 0, position: "fixed", height: "100vh", zIndex: 100, transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)", transition: "all 0.25s ease", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ marginBottom: 32, paddingLeft: sidebarCollapsed ? 0 : 8, textAlign: sidebarCollapsed ? "center" : "left" }}>
          {sidebarCollapsed ? (
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.primary }}>EW</div>
              <div style={{ marginTop: 8, textAlign: 'center' }}><PlatformUpdatesBell userId={profile?.id} audience="sp" /></div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Engage<span style={{ color: C.primary }}>Worx</span></div>
                <PlatformUpdatesBell userId={profile?.id} audience="sp" />
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Service Provider Console</div>
              <div style={{ marginTop: 8 }}><Badge color={C.primary}>🌐 Super Admin</Badge></div>
            </>
          )}
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
          {spNavItems.map(item => (
            <button key={item.id} onClick={() => { setSpPage(item.id); if(isMobile) setSidebarOpen(false); }} title={sidebarCollapsed ? item.label : undefined} style={{
              width: "100%", display: "flex", alignItems: "center", gap: sidebarCollapsed ? 0 : 12,
              justifyContent: sidebarCollapsed ? "center" : "flex-start",
              padding: sidebarCollapsed ? "11px 0" : "11px 12px", borderRadius: 9, border: "none",
              background: spPage === item.id ? `${C.primary}22` : "transparent",
              color: spPage === item.id ? C.primary : C.muted,
              cursor: "pointer", fontSize: sidebarCollapsed ? 20 : 14, fontWeight: spPage === item.id ? 700 : 400,
              marginBottom: 4, textAlign: sidebarCollapsed ? "center" : "left",
              borderLeft: spPage === item.id ? `3px solid ${C.primary}` : "3px solid transparent",
              transition: "all 0.2s",
            }}>
              <span style={{ fontSize: sidebarCollapsed ? 20 : 17 }}>{item.icon}</span>
              {!sidebarCollapsed && item.label}
            </button>
          ))}
        </nav>

        {/* Demo Mode Toggle */}
        {!sidebarCollapsed && (
          <button onClick={() => toggleDemoMode(!demoMode)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderRadius: 9, marginBottom: 6,
            background: demoMode ? `${C.accent}22` : "rgba(255,255,255,0.03)",
            border: `1px solid ${demoMode ? C.accent + "44" : "rgba(255,255,255,0.08)"}`,
            color: demoMode ? C.accent : C.muted, cursor: "pointer", fontSize: 12,
            fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s", flexShrink: 0,
          }}>
            <span>🎮 Demo Mode</span>
            <span style={{ width: 32, height: 18, borderRadius: 9, position: "relative", background: demoMode ? C.accent : "rgba(255,255,255,0.15)", display: "inline-block", transition: "all 0.2s" }}>
              <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: demoMode ? 16 : 2, transition: "all 0.2s" }} />
            </span>
          </button>
        )}
        {sidebarCollapsed && (
          <button onClick={() => toggleDemoMode(!demoMode)} title={demoMode ? "Demo Mode ON" : "Demo Mode OFF"} style={{ width: "100%", padding: "8px 0", borderRadius: 9, marginBottom: 6, border: "none", background: demoMode ? `${C.accent}22` : "transparent", color: demoMode ? C.accent : C.muted, cursor: "pointer", fontSize: 16, fontFamily: "'DM Sans', sans-serif", textAlign: "center", flexShrink: 0 }}>🎮</button>
        )}
        {/* Light/Dark Toggle */}
        {!sidebarCollapsed && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 9, marginBottom: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: 12, color: C.muted }}>🌙 Dark Mode</span>
            <ThemeToggle />
          </div>
        )}
        {sidebarCollapsed && (
          <div style={{ textAlign: "center", marginBottom: 6 }}><ThemeToggle /></div>
        )}

        {/* Sign Out */}
        {!sidebarCollapsed && (
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 9, marginBottom: 6, background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)", color: "#FF3B30", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
            <span>⏻</span><span>Sign Out</span>
          </button>
        )}
        {sidebarCollapsed && (
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = "/"; }} title="Sign Out" style={{ width: "100%", padding: "8px 0", borderRadius: 9, marginBottom: 6, border: "none", background: "rgba(255,59,48,0.08)", color: "#FF3B30", cursor: "pointer", fontSize: 16, fontFamily: "'DM Sans', sans-serif", textAlign: "center" }}>⏻</button>
        )}

        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} style={{ width: "100%", padding: "6px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", textAlign: "center", flexShrink: 0 }}>{sidebarCollapsed ? "»" : "«"}</button>
      </div>

      <div style={{ position: 'fixed', top: 0, left: isMobile ? 0 : (sidebarCollapsed ? 64 : 240), right: 0, bottom: 0, overflowY: (spPage === "inbox" || spPage === "flows" || spPage === "helpdesk") ? "hidden" : "auto", transition: "left 0.25s ease", display: "flex", flexDirection: "column", background: C.bg, zIndex: 50 }}>
        {spPage === "dashboard" && <SuperAdminDashboard tenant={TENANTS.serviceProvider} onDrillDown={pushDrill} C={C} demoMode={demoMode} liveTenants={liveTenants} liveStats={liveStats} />}
        {spPage === "tenants" && <TenantManagement C={C} demoMode={demoMode} onDrillDown={pushDrill} refreshLiveData={refreshLiveData} />}
        {spPage === "hierarchy" && <HierarchyView C={C} onDrillDown={pushDrill} />}
        {spPage === "pipeline" && (isSuperAdmin || profile?.aup_accepted
          ? <PipelineDashboard C={C} supabase={supabase} tenantId={profile?.tenant_id} demoMode={demoMode} isSuperAdmin={isSuperAdmin} />
          : <FeatureGate featureName="Pipeline" C={C} requirements={{ met: false, steps: [{ title: 'Accept AUP', description: 'Required for all pipeline features.', done: !!profile?.aup_accepted }] }} />)}
        {spPage === "import" && <ImportLeads C={C} demoMode={demoMode} />}
        {spPage === "sequences" && (isSuperAdmin || (profile?.aup_accepted && profile?.sms_enabled)
          ? <SequenceRoster C={C} currentTenantId={profile?.role === "superadmin" ? (process.env.REACT_APP_SP_TENANT_ID || "c1bc59a8-5235-4921-9755-02514b574387") : profile?.tenant_id} />
          : <FeatureGate featureName="Sequence Roster" C={C} requirements={{ met: false, steps: [
              { title: 'Accept AUP', description: 'Required for all messaging features.', done: !!profile?.aup_accepted },
              { title: 'TCR Approval', description: 'Complete A2P 10DLC registration in SMS Registration.', done: !!profile?.sms_enabled, ctaHref: '#sms-registration', ctaLabel: 'Register' },
            ] }} />)}
        {spPage === "sequence-builder" && (isSuperAdmin || (profile?.aup_accepted && profile?.sms_enabled)
          ? <SequenceBuilder C={C} currentTenantId={profile?.role === "superadmin" ? (process.env.REACT_APP_SP_TENANT_ID || "c1bc59a8-5235-4921-9755-02514b574387") : profile?.tenant_id} />
          : <FeatureGate featureName="Sequence Builder" C={C} requirements={{ met: false, steps: [
              { title: 'Accept AUP', description: 'Required for all messaging features.', done: !!profile?.aup_accepted },
              { title: 'TCR Approval', description: 'Complete A2P 10DLC registration in SMS Registration.', done: !!profile?.sms_enabled, ctaHref: '#sms-registration', ctaLabel: 'Register' },
            ] }} />)}
        {spPage === "campaigns" && <CampaignsModule C={C} tenants={TENANTS} viewLevel="sp" demoMode={demoMode} />}
        {spPage === "contacts" && <ContactsModule C={C} tenants={TENANTS} viewLevel="sp" demoMode={demoMode} />}
        {spPage === "inbox" && <LiveInbox C={C} tenants={TENANTS} viewLevel="sp" demoMode={demoMode} supabase={supabase} />}
        {spPage === "chatbot" && <AIChatbot C={C} tenants={TENANTS} viewLevel="sp" demoMode={demoMode} currentTenantId={process.env.REACT_APP_SP_TENANT_ID || "c1bc59a8-5235-4921-9755-02514b574387"} />}
        {spPage === "blog" && <BlogAdmin C={C} />}
        {spPage === "flows" && <FlowBuilder C={C} tenants={TENANTS} viewLevel="sp" demoMode={demoMode} />}
        {spPage === "lead-scan" && (isSuperAdmin || (profile?.aup_accepted && profile?.kyc_status === 'approved')
          ? <LeadScan C={C} demoMode={demoMode} />
          : <div>
              {profile?.aup_accepted && profile?.kyc_status !== 'approved' && profile?.tenant_id && (
                <div style={{ padding: '32px 40px 0' }}><KycStartBanner tenantId={profile.tenant_id} email={user?.email} C={C} /></div>
              )}
              <FeatureGate featureName="Lead Scan" C={C} requirements={{ met: false, steps: [
                { title: 'Accept AUP', description: 'Required for all pipeline features.', done: !!profile?.aup_accepted },
                { title: 'Identity verification (KYC)', description: 'Stripe Identity check — prevents abuse of Lead Scan.', done: profile?.kyc_status === 'approved' },
              ] }} />
            </div>)}
        {spPage === "demo" && <MobileDemo C={C} onExit={function() { setSpPage('dashboard'); }} />}
        {spPage === "analytics" && <AnalyticsDashboard C={C} tenants={TENANTS} viewLevel="sp" demoMode={demoMode} />}
        {spPage === "customer-success" && isSuperAdmin && <CustomerSuccessDashboard C={C} onDrillDown={pushDrill} />}
        {spPage === "platform-updates" && isSuperAdmin && <PlatformUpdates C={C} />}
        {spPage === "api" && <Settings C={C} tenants={TENANTS} viewLevel="sp" demoMode={demoMode} defaultTab="integrations" allowedTabs={["integrations", "api", "webhooks"]} />}
        {spPage === "tcr-queue" && isSuperAdmin && <TCRQueue C={C} />}
        {spPage === "email-digest" && isSuperAdmin && <EmailDigest C={C} />}
        {spPage === "platform-settings" && isSuperAdmin && (() => {
          function PlatformSettingsPage() {
            var [pc, setPc] = useState(null);
            var [loading, setLoading] = useState(true);
            var [lastSaved, setLastSaved] = useState(null);
            var [fieldSaved, setFieldSaved] = useState({});
            var [fieldError, setFieldError] = useState({});
            var saveTimerRef = useRef({});
            useEffect(function() {
              fetch('/api/platform-config?full=1').then(function(r) { return r.json(); }).then(function(d) { setPc(d); setLoading(false); }).catch(function() { setLoading(false); });
            }, []);
            function updateAndSave(key, val) {
              setPc(function(prev) { var n = Object.assign({}, prev); n[key] = val; return n; });
              if (saveTimerRef.current[key]) clearTimeout(saveTimerRef.current[key]);
              saveTimerRef.current[key] = setTimeout(function() { saveField(key, val); }, 1500);
            }
            async function saveField(key, val) {
              try {
                var payload = {}; payload[key] = val;
                var r = await fetch('/api/platform-config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                var d = await r.json();
                if (!r.ok) throw new Error(d.error || 'Save failed');
                setFieldSaved(function(prev) { var n = Object.assign({}, prev); n[key] = true; return n; });
                setFieldError(function(prev) { var n = Object.assign({}, prev); delete n[key]; return n; });
                setLastSaved(new Date());
                setTimeout(function() { setFieldSaved(function(prev) { var n = Object.assign({}, prev); delete n[key]; return n; }); }, 2000);
              } catch (e) {
                setFieldError(function(prev) { var n = Object.assign({}, prev); n[key] = e.message; return n; });
              }
            }
            function saveNow(key, val) {
              if (saveTimerRef.current[key]) clearTimeout(saveTimerRef.current[key]);
              saveField(key, val !== undefined ? val : (pc && pc[key]));
            }
            if (loading) return <div style={{ padding: 40, color: C.muted, textAlign: 'center' }}>Loading...</div>;
            if (!pc) return <div style={{ padding: 40, color: '#FF3B30' }}>Failed to load platform config</div>;
            var sectionStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 22, marginBottom: 16 };
            var labelStyle = { color: C.muted, fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };
            var inputStyle2 = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };
            return (
              <div style={{ padding: '32px 40px', maxWidth: 900, fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <div><h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>🔧 Platform Settings</h1><p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Single source of truth — changes auto-save on each field</p></div>
                  {lastSaved && <span style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>Last saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
                <div style={sectionStyle}>
                  <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>🏢 Brand</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div><label style={labelStyle}>Platform Name</label><input value={pc.platform_name || ''} onChange={function(e) { updateAndSave('platform_name', e.target.value); }} style={inputStyle2} /></div>
                    <div><label style={labelStyle}>Headquarters</label><input value={pc.headquarters || ''} onChange={function(e) { updateAndSave('headquarters', e.target.value); }} style={inputStyle2} /></div>
                  </div>
                </div>
                <div style={sectionStyle}>
                  <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>📞 Contact</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div><label style={labelStyle}>Support Email</label><input value={pc.support_email || ''} onChange={function(e) { updateAndSave('support_email', e.target.value); }} style={inputStyle2} /></div>
                    <div><label style={labelStyle}>Support Phone</label><input value={pc.support_phone || ''} onChange={function(e) { updateAndSave('support_phone', e.target.value); }} style={inputStyle2} /></div>
                    <div><label style={labelStyle}>Portal URL</label><input value={pc.portal_url || ''} onChange={function(e) { updateAndSave('portal_url', e.target.value); }} style={inputStyle2} /></div>
                    <div><label style={labelStyle}>Calendar URL</label><input value={pc.calendar_url || ''} onChange={function(e) { updateAndSave('calendar_url', e.target.value); }} style={inputStyle2} /></div>
                    <div><label style={labelStyle}>Onboarding Guide URL</label><input value={pc.onboarding_guide_url || ''} onChange={function(e) { updateAndSave('onboarding_guide_url', e.target.value); }} style={inputStyle2} /></div>
                  </div>
                </div>
                <div style={sectionStyle}>
                  <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>🚀 Onboarding</h3>
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div><label style={labelStyle}>Welcome Email Subject Template</label><input value={pc.welcome_email_subject_template || ''} onChange={function(e) { updateAndSave('welcome_email_subject_template', e.target.value); }} placeholder="Welcome to {platform_name} — your {tenant_name} account is ready" style={inputStyle2} /></div>
                    <div><label style={labelStyle}>Welcome Email HTML Template</label><textarea value={pc.welcome_email_html_template || ''} onChange={function(e) { updateAndSave('welcome_email_html_template', e.target.value); }} rows={10} style={Object.assign({}, inputStyle2, { fontFamily: 'monospace', fontSize: 11, resize: 'vertical' })} /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div><label style={labelStyle}>Welcome Contact Source</label><input value={pc.welcome_contact_source || ''} onChange={function(e) { updateAndSave('welcome_contact_source', e.target.value); }} placeholder="e.g. platform_onboarding" style={inputStyle2} /></div>
                      <div><label style={labelStyle}>Welcome Contact Tags (comma-separated)</label><input value={(() => { var t = pc.welcome_contact_tags; if (Array.isArray(t)) return t.join(', '); if (typeof t === 'string') { try { var p = JSON.parse(t); if (Array.isArray(p)) return p.join(', '); } catch(e) {} return t; } return ''; })()} onChange={function(e) { updateAndSave('welcome_contact_tags', e.target.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean)); }} placeholder="onboarded, welcome" style={inputStyle2} /></div>
                    </div>
                    <div><label style={labelStyle}>Customer Type Options (one per line, format: value|Label)</label><textarea value={Array.isArray(pc.customer_type_options) ? pc.customer_type_options.map(function(ct) { return typeof ct === 'object' ? ct.value + '|' + ct.label : ct; }).join('\n') : ''} onChange={function(e) { var lines = e.target.value.split('\n').filter(function(l) { return l.trim(); }); updateAndSave('customer_type_options', lines.map(function(l) { var parts = l.split('|'); return parts.length > 1 ? { value: parts[0].trim(), label: parts.slice(1).join('|').trim() } : parts[0].trim(); })); }} rows={5} placeholder={"direct|Direct Business Customer\ncsp_partner|CSP / Channel Partner\nagent|Agent / Reseller\ninternal|Internal"} style={Object.assign({}, inputStyle2, { fontFamily: 'monospace', fontSize: 12, resize: 'vertical' })} /></div>
                  </div>
                </div>
                <div style={sectionStyle}>
                  <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>💳 Plans</h3>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {(pc.plans || []).map(function(p, i) {
                      function updatePlan(key, val) { var plans = (pc.plans || []).slice(); plans[i] = Object.assign({}, plans[i]); plans[i][key] = val; updateAndSave('plans', plans); }
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 70px 90px 90px 50px 1fr 140px 32px', gap: 6, alignItems: 'center' }}>
                          <input value={p.slug || ''} onChange={function(e) { updatePlan('slug', e.target.value); updatePlan('name', e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1)); }} placeholder="slug" style={Object.assign({}, inputStyle2, { fontSize: 10 })} />
                          <input type="number" value={p.monthly_price || ''} onChange={function(e) { updatePlan('monthly_price', parseInt(e.target.value) || null); }} placeholder="$/mo" style={Object.assign({}, inputStyle2, { fontSize: 10 })} />
                          <input type="number" value={p.message_limit || ''} onChange={function(e) { updatePlan('message_limit', parseInt(e.target.value) || 0); }} placeholder="msg limit" style={Object.assign({}, inputStyle2, { fontSize: 10 })} />
                          <input type="number" value={p.contact_limit || ''} onChange={function(e) { updatePlan('contact_limit', parseInt(e.target.value) || 0); }} placeholder="contacts" style={Object.assign({}, inputStyle2, { fontSize: 10 })} />
                          <input type="number" value={p.user_seats || ''} onChange={function(e) { updatePlan('user_seats', parseInt(e.target.value) || 0); }} placeholder="seats" style={Object.assign({}, inputStyle2, { fontSize: 10 })} />
                          <input value={p.description || ''} onChange={function(e) { updatePlan('description', e.target.value); }} placeholder="Description" style={Object.assign({}, inputStyle2, { fontSize: 10 })} />
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(pc.customer_type_options || []).map(function(ct) {
                              var ctVal = typeof ct === 'object' ? ct.value : ct;
                              var ctLbl = typeof ct === 'object' ? (ct.label || ct.value) : ct;
                              var ctArr = p.customer_types || [];
                              var checked = ctArr.indexOf(ctVal) !== -1;
                              return <label key={ctVal} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, color: checked ? '#fff' : 'rgba(255,255,255,0.3)', cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={function() { var next = checked ? ctArr.filter(function(x) { return x !== ctVal; }) : ctArr.concat([ctVal]); updatePlan('customer_types', next); }} style={{ width: 12, height: 12, accentColor: C.primary }} />{ctLbl.split(' ')[0]}</label>;
                            })}
                          </div>
                          <button onClick={function() { var plans = (pc.plans || []).filter(function(_, j) { return j !== i; }); updateAndSave('plans', plans); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                        </div>
                      );
                    })}
                    <button onClick={function() { var plans = (pc.plans || []).concat([{ slug: '', name: '', monthly_price: null, message_limit: 5000, contact_limit: 10000, user_seats: 3, description: '', customer_types: [] }]); updateAndSave('plans', plans); }} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 14px', color: C.muted, cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>+ Add Plan</button>
                  </div>
                </div>
                <div style={sectionStyle}>
                  <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>🏷️ Industries</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {(pc.industries || []).map(function(ind, i) {
                      return <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,201,255,0.08)', border: '1px solid rgba(0,201,255,0.25)', borderRadius: 14, padding: '4px 10px', fontSize: 12, color: C.primary, fontWeight: 600 }}>{ind}<button onClick={function() { updateAndSave('industries', (pc.industries || []).filter(function(_, j) { return j !== i; })); }} style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button></span>;
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input id="ps-new-industry" placeholder="New industry" style={Object.assign({}, inputStyle2, { flex: 1 })} onKeyDown={function(e) { if (e.key === 'Enter') { var v = e.target.value.trim(); if (v) { updateAndSave('industries', (pc.industries || []).concat([v])); e.target.value = ''; } } }} />
                    <button onClick={function() { var el = document.getElementById('ps-new-industry'); var v = (el.value || '').trim(); if (v) { updateAndSave('industries', (pc.industries || []).concat([v])); el.value = ''; } }} style={{ background: C.primary + '22', border: '1px solid ' + C.primary + '55', borderRadius: 8, padding: '8px 14px', color: C.primary, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>+ Add</button>
                  </div>
                </div>
                <div style={sectionStyle}>
                  <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>🤖 Default Escalation Rules</h3>
                  <pre style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12, fontSize: 10, color: 'rgba(255,255,255,0.5)', overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap' }}>{JSON.stringify(pc.default_escalation_rules, null, 2)}</pre>
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 6 }}>Edit default escalation rules as JSON. These are seeded for each new tenant during onboarding.</div>
                  <textarea value={JSON.stringify(pc.default_escalation_rules || [], null, 2)} onChange={function(e) { try { updateAndSave('default_escalation_rules', JSON.parse(e.target.value)); } catch(err) {} }} rows={6} style={Object.assign({}, inputStyle2, { fontFamily: 'monospace', fontSize: 11, resize: 'vertical', marginTop: 8 })} />
                </div>
              </div>
            );
          }
          return <PlatformSettingsPage />;
        })()}
        {spPage === "settings" && <Settings C={C} tenants={TENANTS} viewLevel="sp" demoMode={demoMode} defaultTab="channels" allowedTabs={["channels", "billing", "team", "notifications", "security", "alerts", "modules"]} />}
        {spPage === "helpdesk" && (
          <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <HelpDeskModule tenantId={null} userRole="sp_admin" userId={user?.id} userName={user?.user_metadata?.full_name || user?.email} userEmail={user?.email} isSPAdmin={true} C={C} demoMode={demoMode} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WRAP WITH AUTH PROVIDER ──────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <AppInner />
    </AuthProvider>
    </ThemeProvider>
  );
}
