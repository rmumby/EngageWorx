import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from './supabaseClient';

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
const TAGS = ["VIP", "New", "Active", "Inactive", "Churned", "Lead", "Prospect", "Enterprise", "SMB", "Newsletter"];
const TAG_COLORS = { VIP: "#FFD600", New: "#00E676", Active: "#00C9FF", Inactive: "#FF9800", Churned: "#FF3B30", Lead: "#E040FB", Prospect: "#7C4DFF", Enterprise: "#FF6B35", SMB: "#6B8BAE", Newsletter: "#25D366" };
const CHANNELS = ["SMS", "Email", "WhatsApp", "RCS", "MMS", "Voice"];
const CHANNEL_ICONS = { SMS: "💬", Email: "📧", WhatsApp: "📱", RCS: "✨", MMS: "📷", Voice: "📞" };
const STATUSES = ["subscribed", "unsubscribed", "bounced", "pending"];
const STATUS_COLORS = { subscribed: "#00E676", unsubscribed: "#FF3B30", bounced: "#FF9800", pending: "#6B8BAE" };

const FIRST_NAMES = ["Sarah", "James", "Maria", "Alex", "Emma", "David", "Sophia", "Michael", "Olivia", "Daniel", "Isabella", "Ethan", "Ava", "Ryan", "Mia", "Chris", "Luna", "Marcus", "Zara", "Nathan", "Priya", "Kevin", "Rachel", "Tom", "Grace", "Leo", "Nora", "Ben", "Chloe", "Sam", "Aisha", "Tyler", "Maya", "Jake", "Lily", "Omar", "Hannah", "Evan", "Ella", "Noah"];
const LAST_NAMES = ["Johnson", "Chen", "Rodriguez", "Williams", "Patel", "Kim", "Murphy", "Garcia", "Anderson", "Taylor", "Thomas", "Brown", "Martinez", "Wilson", "Lee", "Jackson", "White", "Harris", "Clark", "Lewis", "Young", "King", "Wright", "Lopez", "Hill", "Scott", "Green", "Adams", "Baker", "Hall"];
const COMPANIES = ["TechFlow Inc", "Meridian Health", "Apex Retail", "CloudSync", "Pinnacle Finance", "Verde Foods", "NovaTech", "Bright Horizons", "Summit Media", "Atlas Logistics", "BluePeak", "CoreStaff", "DataWave", "EcoVentures", "FlexPort"];

function generateContacts(count) {
  const contacts = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[i % LAST_NAMES.length];
    const company = COMPANIES[i % COMPANIES.length];
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@${company.toLowerCase().replace(/\s+/g, "")}.com`;
    const phone = `+1${String(Math.floor(2000000000 + Math.random() * 8000000000))}`;
    const status = Math.random() > 0.12 ? (Math.random() > 0.05 ? "subscribed" : "pending") : (Math.random() > 0.5 ? "unsubscribed" : "bounced");
    const tagCount = Math.floor(Math.random() * 3) + 1;
    const tags = [];
    while (tags.length < tagCount) { const t = TAGS[Math.floor(Math.random() * TAGS.length)]; if (!tags.includes(t)) tags.push(t); }
    const channels = [];
    const chCount = Math.floor(Math.random() * 3) + 1;
    while (channels.length < chCount) { const c = CHANNELS[Math.floor(Math.random() * CHANNELS.length)]; if (!channels.includes(c)) channels.push(c); }
    const created = new Date(Date.now() - Math.random() * 365 * 86400000);
    const lastActive = new Date(Date.now() - Math.random() * 30 * 86400000);
    const messagesSent = Math.floor(Math.random() * 120);
    const messagesReceived = Math.floor(messagesSent * (0.1 + Math.random() * 0.5));
    const openRate = Math.round((40 + Math.random() * 55) * 10) / 10;
    const clickRate = Math.round((5 + Math.random() * 30) * 10) / 10;
    const ltv = Math.round(Math.random() * 2500 * 100) / 100;

    contacts.push({
      id: `ct_${String(i + 1).padStart(4, "0")}`,
      firstName: first, lastName: last, email, phone, company,
      status, tags, channels, created, lastActive,
      messagesSent, messagesReceived, openRate, clickRate, ltv,
      city: ["New York", "Los Angeles", "Chicago", "Houston", "Miami", "Seattle", "Denver", "Boston", "Atlanta", "Portland"][i % 10],
      state: ["NY", "CA", "IL", "TX", "FL", "WA", "CO", "MA", "GA", "OR"][i % 10],
      notes: i % 5 === 0 ? "Key account — handle with priority" : i % 7 === 0 ? "Prefers WhatsApp over email" : "",
      customFields: { industry: ["Tech", "Healthcare", "Retail", "Finance", "Food"][i % 5], source: ["Website", "Referral", "Ad Campaign", "Event", "Cold Outreach"][i % 5] },
    });
  }
  return contacts;
}

function generateActivity(contact) {
  const types = [
    { type: "sms_sent", label: "SMS sent", icon: "💬", color: "#00C9FF" },
    { type: "email_sent", label: "Email sent", icon: "📧", color: "#FF6B35" },
    { type: "email_opened", label: "Email opened", icon: "👁️", color: "#00E676" },
    { type: "link_clicked", label: "Link clicked", icon: "🔗", color: "#E040FB" },
    { type: "replied", label: "Replied", icon: "↩️", color: "#7C4DFF" },
    { type: "campaign_added", label: "Added to campaign", icon: "🚀", color: "#FF6B35" },
    { type: "tag_added", label: "Tag added", icon: "🏷️", color: "#FFD600" },
    { type: "opted_in", label: "Opted in", icon: "✅", color: "#00E676" },
    { type: "whatsapp_sent", label: "WhatsApp sent", icon: "📱", color: "#25D366" },
    { type: "note_added", label: "Note added", icon: "📝", color: "#6B8BAE" },
  ];
  const activities = [];
  const count = 8 + Math.floor(Math.random() * 12);
  for (let i = 0; i < count; i++) {
    const t = types[Math.floor(Math.random() * types.length)];
    const date = new Date(Date.now() - Math.random() * 60 * 86400000);
    const details = t.type === "campaign_added" ? "Spring Flash Sale" : t.type === "tag_added" ? contact.tags[0] || "VIP" : t.type === "email_sent" ? "Monthly Newsletter" : t.type === "sms_sent" ? "Cart reminder" : "";
    activities.push({ ...t, date, details });
  }
  return activities.sort((a, b) => b.date - a.date);
}

// ─── SEGMENTS ─────────────────────────────────────────────────────────────────
const SEGMENTS = [
  { id: "all", name: "All Contacts", icon: "👥", desc: "Every contact in your database", filter: () => true },
  { id: "subscribed", name: "Subscribed", icon: "✅", desc: "Active subscribers", filter: c => c.status === "subscribed" },
  { id: "vip", name: "VIP Customers", icon: "⭐", desc: "Tagged as VIP", filter: c => c.tags.includes("VIP") },
  { id: "new30", name: "New (30 days)", icon: "🆕", desc: "Joined in the last 30 days", filter: c => (Date.now() - c.created) < 30 * 86400000 },
  { id: "inactive", name: "Inactive 30+ Days", icon: "😴", desc: "No activity in 30+ days", filter: c => (Date.now() - c.lastActive) > 30 * 86400000 },
  { id: "highvalue", name: "High Value", icon: "💎", desc: "LTV over $1,000", filter: c => c.ltv > 1000 },
  { id: "enterprise", name: "Enterprise", icon: "🏢", desc: "Tagged as Enterprise", filter: c => c.tags.includes("Enterprise") },
  { id: "unsubscribed", name: "Unsubscribed", icon: "🚫", desc: "Opted out", filter: c => c.status === "unsubscribed" },
  { id: "sms_only", name: "SMS Subscribers", icon: "💬", desc: "Subscribed to SMS channel", filter: c => c.channels.includes("SMS") && c.status === "subscribed" },
  { id: "email_only", name: "Email Subscribers", icon: "📧", desc: "Subscribed to Email channel", filter: c => c.channels.includes("Email") && c.status === "subscribed" },
];

// ─── CRM DATA ─────────────────────────────────────────────────────────────────
const CRM_INTEGRATIONS = [
  { id: "salesforce", name: "Salesforce", icon: "☁️", color: "#00A1E0", status: "connected", lastSync: new Date(Date.now() - 12 * 60000), contacts: 48200, synced: 47800, errors: 12, direction: "bidirectional" },
  { id: "hubspot", name: "HubSpot", icon: "🟠", color: "#FF7A59", status: "connected", lastSync: new Date(Date.now() - 45 * 60000), contacts: 32100, synced: 32100, errors: 0, direction: "bidirectional" },
  { id: "zoho", name: "Zoho CRM", icon: "🔴", color: "#E42527", status: "disconnected", lastSync: null, contacts: 0, synced: 0, errors: 0, direction: "none" },
  { id: "pipedrive", name: "Pipedrive", icon: "🟢", color: "#017737", status: "disconnected", lastSync: null, contacts: 0, synced: 0, errors: 0, direction: "none" },
  { id: "dynamics", name: "Microsoft Dynamics", icon: "🔷", color: "#002050", status: "error", lastSync: new Date(Date.now() - 3 * 3600000), contacts: 15400, synced: 14200, errors: 1200, direction: "import" },
  { id: "freshsales", name: "Freshsales", icon: "🟤", color: "#F26522", status: "disconnected", lastSync: null, contacts: 0, synced: 0, errors: 0, direction: "none" },
];

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function ContactsModule({ C, tenants, viewLevel = "tenant", currentTenantId, demoMode = true }) {
  const [contacts, setContacts] = useState(() => demoMode ? generateContacts(60) : []);
  const [liveLoading, setLiveLoading] = useState(false);
  const [view, setView] = useState("list");
  const [selectedContact, setSelectedContact] = useState(null);
  const [activeTab, setActiveTab] = useState("contacts");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [filterChannel, setFilterChannel] = useState("all");
  const [sortBy, setSortBy] = useState("lastActive");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedSegment, setSelectedSegment] = useState("all");
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", status: "subscribed", channel_preference: "SMS" });
  const [editingContact, setEditingContact] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 15;

  // Fetch live contacts from Supabase
  useEffect(() => {
    if (demoMode) {
      setContacts(generateContacts(60));
      return;
    }
    const fetchContacts = async () => {
      setLiveLoading(true);
      try {
        let query = supabase.from('contacts').select('*').order('created_at', { ascending: false });
        if (currentTenantId && viewLevel === 'tenant') {
          query = query.eq('tenant_id', currentTenantId);
        }
        const { data, error } = await query;
        if (error) throw error;
        const mapped = (data || []).map(c => ({
          id: c.id,
          firstName: c.first_name || '',
          lastName: c.last_name || '',
          email: c.email || '',
          phone: c.phone || '',
          company: c.company || '',
          status: c.status || 'subscribed',
          tags: c.tags || [],
          channels: c.channel_preference ? [c.channel_preference] : ['SMS'],
          created: new Date(c.created_at),
          lastActive: c.last_contacted_at ? new Date(c.last_contacted_at) : new Date(c.created_at),
          messagesSent: c.message_count || 0,
          messagesReceived: 0,
          openRate: 0,
          clickRate: 0,
          ltv: 0,
          city: '',
          state: '',
          notes: '',
          customFields: c.custom_fields || {},
          tenant_id: c.tenant_id,
        }));
        setContacts(mapped);
      } catch (err) {
        console.warn('Contacts fetch error:', err.message);
        setContacts([]);
      }
      setLiveLoading(false);
    };
    fetchContacts();
  }, [demoMode, currentTenantId, viewLevel]);

  // Add contact
  const handleAddContact = async () => {
    console.log('handleAddContact called, demoMode=', demoMode, 'currentTenantId=', currentTenantId);
    if (!newContact.firstName || !newContact.phone) {
  alert('First name and phone number are required.'); 
  return; 
}
    if (demoMode) {
      // Add to local state in demo mode
      const demoContact = {
        id: "ct_" + Date.now(),
        firstName: newContact.firstName,
        lastName: newContact.lastName,
        email: newContact.email,
        phone: newContact.phone,
        company: newContact.company,
        status: newContact.status || "subscribed",
        tags: [],
        channels: [newContact.channel_preference || "SMS"],
        created: new Date(),
        lastActive: new Date(),
        messagesSent: 0,
        messagesReceived: 0,
        openRate: 0,
        clickRate: 0,
        ltv: 0,
        city: "",
        state: "",
        notes: "",
        customFields: {},
      };
      console.log('DEMO MODE INTERCEPTED — demoMode value:', demoMode);
      setContacts(prev => [demoContact, ...prev]);
      setNewContact({ firstName: "", lastName: "", email: "", phone: "", company: "", status: "subscribed", channel_preference: "SMS" });
      setShowAddContact(false);
      return;
    }
    try {
      // Look up real tenant UUID — currentTenantId may be a slug or UUID
      let tenantUUID = null;
      // Try as UUID first
      const { data: byId } = await supabase
        .from("tenants").select("id").eq("id", currentTenantId).maybeSingle();
      if (byId) {
        tenantUUID = byId.id;
      } else {
        // Fall back to slug lookup
        const { data: bySlug } = await supabase
          .from("tenants").select("id").eq("slug", currentTenantId).maybeSingle();
        if (bySlug) tenantUUID = bySlug.id;
      }
      console.log('tenantUUID resolved:', tenantUUID, 'from:', currentTenantId);

      const { error } = await supabase.from("contacts").insert({
        first_name: newContact.firstName,
        last_name: newContact.lastName,
        email: newContact.email,
        phone: newContact.phone,
        company: newContact.company,
        status: newContact.status,
        channel_preference: newContact.channel_preference,
        tags: [],
        source: 'manual',
        tenant_id: tenantUUID,
      });
      if (error) throw error;
      // Refresh contacts
    const { data } = await supabase.from('contacts').select('*').eq('tenant_id', tenantUUID).order('created_at', { ascending: false });
      const mapped = (data || []).map(c => ({
        id: c.id, firstName: c.first_name || '', lastName: c.last_name || '', email: c.email || '',
        phone: c.phone || '', company: c.company || '', status: c.status || 'subscribed',
        tags: c.tags || [], channels: c.channel_preference ? [c.channel_preference] : ['SMS'],
        created: new Date(c.created_at), lastActive: c.last_contacted_at ? new Date(c.last_contacted_at) : new Date(c.created_at),
        messagesSent: c.message_count || 0, messagesReceived: 0, openRate: 0, clickRate: 0, ltv: 0,
        city: '', state: '', notes: '', customFields: c.custom_fields || {}, tenant_id: c.tenant_id,
      }));
      setContacts(mapped);
      setNewContact({ firstName: "", lastName: "", email: "", phone: "", company: "", status: "subscribed", channel_preference: "SMS" });
      setShowAddContact(false);
    } catch (err) {
      console.warn('Add contact error:', err.message);
      alert('Save failed: ' + err.message);
    }
  };

  // Edit contact in Supabase
  const handleEditContact = async (contact) => {
    if (demoMode) {
      // Update local state only
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, ...contact } : c));
      setEditingContact(null);
      if (selectedContact?.id === contact.id) {
        setSelectedContact({ ...selectedContact, ...contact });
      }
      return;
    }
    if (!currentTenantId) return;
    try {
      const { error } = await supabase.from('contacts').update({
        first_name: contact.firstName,
        last_name: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        status: contact.status,
      }).eq('id', contact.id);
      if (error) throw error;
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, ...contact } : c));
      setEditingContact(null);
      if (selectedContact?.id === contact.id) {
        setSelectedContact({ ...selectedContact, ...contact });
      }
    } catch (err) {
      console.warn('Edit contact error:', err.message);
    }
  };

  // Delete single contact
  const handleDeleteContact = async (contactId) => {
    if (demoMode) {
      setContacts(prev => prev.filter(c => c.id !== contactId));
      if (selectedContact?.id === contactId) { setSelectedContact(null); setView("list"); }
      setSelectedContacts(prev => prev.filter(id => id !== contactId));
      return;
    }
    if (!currentTenantId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('contacts').delete().eq('id', contactId);
      if (error) throw error;
      setContacts(prev => prev.filter(c => c.id !== contactId));
      if (selectedContact?.id === contactId) {
        setSelectedContact(null);
        setView("list");
      }
      setSelectedContacts(prev => prev.filter(id => id !== contactId));
    } catch (err) {
      console.warn('Delete contact error:', err.message);
    }
    setDeleting(false);
  };

  // Bulk delete selected contacts
  const handleBulkDelete = async () => {
    if (selectedContacts.length === 0) return;
    if (!window.confirm(`Delete ${selectedContacts.length} contact${selectedContacts.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
    if (demoMode) {
      setContacts(prev => prev.filter(c => !selectedContacts.includes(c.id)));
      setSelectedContacts([]);
      return;
    }
    if (!currentTenantId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('contacts').delete().in('id', selectedContacts);
      if (error) throw error;
      setContacts(prev => prev.filter(c => !selectedContacts.includes(c.id)));
      setSelectedContacts([]);
    } catch (err) {
      console.warn('Bulk delete error:', err.message);
    }
    setDeleting(false);
  };

  const segment = SEGMENTS.find(s => s.id === selectedSegment) || SEGMENTS[0];

  const filtered = contacts.filter(c => {
    if (!segment.filter(c)) return false;
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (filterTag !== "all" && !c.tags.includes(filterTag)) return false;
    if (filterChannel !== "all" && !c.channels.includes(filterChannel)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return c.firstName.toLowerCase().includes(q) || c.lastName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.includes(q) || c.company.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "name") return dir * `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    if (sortBy === "email") return dir * a.email.localeCompare(b.email);
    if (sortBy === "ltv") return dir * (a.ltv - b.ltv);
    if (sortBy === "openRate") return dir * (a.openRate - b.openRate);
    if (sortBy === "created") return dir * (a.created - b.created);
    return dir * (a.lastActive - b.lastActive);
  });

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const totalContacts = contacts.length;
  const subscribedCount = contacts.filter(c => c.status === "subscribed").length;
  const avgOpenRate = (contacts.reduce((s, c) => s + c.openRate, 0) / contacts.length).toFixed(1);
  const totalLTV = contacts.reduce((s, c) => s + c.ltv, 0);

  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };
  const btnPrimary = { background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, border: "none", borderRadius: 10, padding: "10px 20px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const btnSecondary = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 22 };
  const badge = (color) => ({ display: "inline-block", background: color + "18", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 });

  const handleSort = (col) => {
    if (sortBy === col) { setSortDir(sortDir === "asc" ? "desc" : "asc"); }
    else { setSortBy(col); setSortDir("desc"); }
  };

  const toggleSelect = (id) => {
    setSelectedContacts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    if (selectedContacts.length === paged.length) setSelectedContacts([]);
    else setSelectedContacts(paged.map(c => c.id));
  };

  const handleExport = () => {
    const headers = ["First Name", "Last Name", "Email", "Phone", "Company", "Status", "Tags", "Channels", "City", "State", "LTV", "Open Rate", "Created"];
    const rows = filtered.map(c => [c.firstName, c.lastName, c.email, c.phone, c.company, c.status, c.tags.join(";"), c.channels.join(";"), c.city, c.state, c.ltv, c.openRate, c.created.toISOString().split("T")[0]]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "contacts-export.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTACT DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (view === "detail" && selectedContact) {
    const c = selectedContact;
    const activities = generateActivity(c);

    return (
      <div style={{ padding: "32px 40px", maxWidth: 1200 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <button onClick={() => { setView("list"); setSelectedContact(null); setEditingContact(null); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>← Back to Contacts</button>
          <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditingContact(editingContact ? null : { ...c })} style={{ background: editingContact ? `${C.primary}22` : "rgba(255,255,255,0.04)", border: `1px solid ${editingContact ? C.primary : "rgba(255,255,255,0.1)"}`, borderRadius: 8, padding: "8px 16px", color: editingContact ? C.primary : "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{editingContact ? "Cancel Edit" : "✏️ Edit"}</button>
              <button onClick={() => { if (window.confirm(`Delete ${c.firstName} ${c.lastName}?`)) handleDeleteContact(c.id); }} disabled={deleting} style={{ background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)", borderRadius: 8, padding: "8px 16px", color: "#FF3B30", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", opacity: deleting ? 0.5 : 1 }}>{deleting ? "Deleting..." : "🗑 Delete"}</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24 }}>
          {/* Left: Contact Card */}
          <div>
            <div style={{ ...card, textAlign: "center", marginBottom: 16 }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800, color: "#000", margin: "0 auto 14px" }}>{c.firstName[0]}{c.lastName[0]}</div>
              <h2 style={{ color: "#fff", margin: "0 0 4px", fontSize: 20 }}>{c.firstName} {c.lastName}</h2>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 8 }}>{c.company}</div>
              <span style={badge(STATUS_COLORS[c.status])}>{c.status}</span>
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                {c.tags.map(t => <span key={t} style={badge(TAG_COLORS[t] || C.muted)}>{t}</span>)}
              </div>
            </div>

            <div style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ color: "#fff", margin: "0 0 14px", fontSize: 14 }}>Contact Info</h3>
              {editingContact ? (
                <div style={{ display: "grid", gap: 10 }}>
                  {[
                    { key: "firstName", label: "First Name", icon: "👤" },
                    { key: "lastName", label: "Last Name", icon: "👤" },
                    { key: "email", label: "Email", icon: "📧" },
                    { key: "phone", label: "Phone", icon: "📞" },
                    { key: "company", label: "Company", icon: "🏢" },
                  ].map(f => (
                    <div key={f.key} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontSize: 14, width: 20 }}>{f.icon}</span>
                      <span style={{ color: C.muted, fontSize: 12, width: 80 }}>{f.label}</span>
                      <input value={editingContact[f.key] || ""} onChange={e => setEditingContact({ ...editingContact, [f.key]: e.target.value })} style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 10px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ fontSize: 14, width: 20 }}>📋</span>
                    <span style={{ color: C.muted, fontSize: 12, width: 80 }}>Status</span>
                    <select value={editingContact.status} onChange={e => setEditingContact({ ...editingContact, status: e.target.value })} style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 10px", color: "#fff", fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: "none" }}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <button onClick={() => handleEditContact(editingContact)} style={{ marginTop: 8, background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, border: "none", borderRadius: 8, padding: "10px", color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Save Changes</button>
                </div>
              ) : (
                <>
                  {[
                    { icon: "📧", label: "Email", value: c.email },
                    { icon: "📞", label: "Phone", value: c.phone },
                    { icon: "🏢", label: "Company", value: c.company },
                    { icon: "📍", label: "Location", value: `${c.city}, ${c.state}` },
                    { icon: "📅", label: "Created", value: c.created.toLocaleDateString() },
                    { icon: "⏰", label: "Last Active", value: c.lastActive.toLocaleDateString() },
                  ].map(item => (
                    <div key={item.label} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontSize: 14, width: 20 }}>{item.icon}</span>
                      <span style={{ color: C.muted, fontSize: 12, width: 80 }}>{item.label}</span>
                      <span style={{ color: "#fff", fontSize: 13, flex: 1, wordBreak: "break-all" }}>{item.value}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ color: "#fff", margin: "0 0 14px", fontSize: 14 }}>Channels</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {c.channels.map(ch => (
                  <div key={ch} style={{ background: `${C.primary}15`, border: `1px solid ${C.primary}33`, borderRadius: 8, padding: "8px 14px", fontSize: 13, color: C.primary, fontWeight: 600 }}>
                    {CHANNEL_ICONS[ch]} {ch}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ color: "#fff", margin: "0 0 14px", fontSize: 14 }}>Engagement Stats</h3>
              {[
                { label: "Messages Sent", value: c.messagesSent, color: C.primary },
                { label: "Messages Received", value: c.messagesReceived, color: "#00E676" },
                { label: "Open Rate", value: `${c.openRate}%`, color: "#00C9FF" },
                { label: "Click Rate", value: `${c.clickRate}%`, color: "#E040FB" },
                { label: "Lifetime Value", value: `$${c.ltv.toLocaleString()}`, color: "#FFD600" },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ color: C.muted, fontSize: 13 }}>{s.label}</span>
                  <span style={{ color: s.color, fontSize: 13, fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
            </div>

            {c.customFields && (
              <div style={card}>
                <h3 style={{ color: "#fff", margin: "0 0 14px", fontSize: 14 }}>Custom Fields</h3>
                {Object.entries(c.customFields).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ color: C.muted, fontSize: 13, textTransform: "capitalize" }}>{k}</span>
                    <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Activity Timeline */}
          <div>
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Activity Timeline</h3>
                <span style={{ color: C.muted, fontSize: 12 }}>{activities.length} events</span>
              </div>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 15, top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,0.06)" }} />
                {activities.map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, marginBottom: 20, position: "relative" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: `${a.color}22`, border: `2px solid ${a.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, zIndex: 1 }}>{a.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{a.label}</span>
                        <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>{a.date.toLocaleDateString()} {a.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      {a.details && <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{a.details}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {c.notes && (
              <div style={{ ...card, marginTop: 16 }}>
                <h3 style={{ color: "#fff", margin: "0 0 10px", fontSize: 14 }}>Notes</h3>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, lineHeight: 1.6, padding: "12px 16px", background: "rgba(0,0,0,0.2)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>{c.notes}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN LIST VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: "32px 40px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Contacts</h1>
          <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Manage contacts, segments, and CRM integrations</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setShowImport(true)} style={btnSecondary}>📥 Import</button>
          <button onClick={handleExport} style={btnSecondary}>📤 Export CSV</button>
          <button onClick={() => setShowAddContact(true)} style={btnPrimary}>+ Add Contact</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Contacts", value: totalContacts.toLocaleString(), color: C.primary, icon: "👥" },
          { label: "Subscribed", value: subscribedCount.toLocaleString(), sub: `${((subscribedCount / totalContacts) * 100).toFixed(0)}%`, color: "#00E676", icon: "✅" },
          { label: "Avg Open Rate", value: `${avgOpenRate}%`, color: "#00C9FF", icon: "👁️" },
          { label: "Total LTV", value: `$${Math.round(totalLTV).toLocaleString()}`, color: "#FFD600", icon: "💰" },
        ].map((kpi, i) => (
          <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderTop: `3px solid ${kpi.color}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>{kpi.label}</span>
              <span style={{ fontSize: 16 }}>{kpi.icon}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{kpi.value}</div>
            {kpi.sub && <div style={{ fontSize: 12, color: kpi.color, marginTop: 2 }}>{kpi.sub} of total</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {[
          { id: "contacts", label: "Contacts", icon: "👥" },
          { id: "segments", label: "Segments", icon: "🎯" },
          { id: "crm", label: "CRM Integrations", icon: "🔗" },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: activeTab === t.id ? C.primary : "rgba(255,255,255,0.04)",
            border: activeTab === t.id ? "none" : "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8, padding: "8px 18px", color: activeTab === t.id ? "#000" : C.muted,
            fontWeight: activeTab === t.id ? 700 : 400, cursor: "pointer", fontSize: 13,
            fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ═══════════════ CONTACTS TAB ═══════════════ */}
      {activeTab === "contacts" && (
        <>
          {/* Import Modal */}
          {showImport && (
            <div style={{ ...card, marginBottom: 20, border: `1px solid ${C.primary}44` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Import Contacts</h3>
                <button onClick={() => setShowImport(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18 }}>✕</button>
              </div>
              <div style={{ padding: "40px", textAlign: "center", border: "2px dashed rgba(255,255,255,0.1)", borderRadius: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>
                <div style={{ color: "#fff", fontWeight: 600, marginBottom: 4 }}>Drop your CSV file here</div>
                <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>or click to browse</div>
                <button style={{ ...btnPrimary, fontSize: 12 }}>Choose File</button>
              </div>
              <div style={{ color: C.muted, fontSize: 12 }}>
                Required columns: <span style={{ color: "#fff" }}>first_name, last_name, email</span> · Optional: phone, company, tags, city, state
              </div>
            </div>
          )}

          {/* Add Contact Modal */}
          {showAddContact && (
            <div style={{ ...card, marginBottom: 20, border: `1px solid ${C.primary}44` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Add Contact</h3>
                <button onClick={() => { 
  setShowAddContact(false); 
  setNewContact({ firstName: "", lastName: "", email: "", phone: "", company: "", status: "subscribed", channel_preference: "SMS" }); 
}}>Cancel</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>First Name *</label>
                  <input value={newContact.firstName} onChange={e => setNewContact(p => ({ ...p, firstName: e.target.value }))} placeholder="John" style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Last Name</label>
                  <input value={newContact.lastName} onChange={e => setNewContact(p => ({ ...p, lastName: e.target.value }))} placeholder="Doe" style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Phone *</label>
                  <input value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} placeholder="+15551234567" style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Email</label>
                  <input value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} placeholder="john@example.com" style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Company</label>
                  <input value={newContact.company} onChange={e => setNewContact(p => ({ ...p, company: e.target.value }))} placeholder="Acme Inc" style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Channel</label>
                  <select value={newContact.channel_preference} onChange={e => setNewContact(p => ({ ...p, channel_preference: e.target.value }))} style={inputStyle}>
                    {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setShowAddContact(false)} style={btnSecondary}>Cancel</button>
                <button onClick={handleAddContact} style={btnPrimary}>Save Contact</button>
              </div>
            </div>
          )}

          {/* Empty state for live mode */}
          {!demoMode && contacts.length === 0 && !liveLoading && (
            <div style={{ ...card, textAlign: "center", padding: 48, marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No contacts yet</div>
              <div style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Add your first contact to get started.</div>
              <button onClick={() => setShowAddContact(true)} style={btnPrimary}>+ Add Contact</button>
            </div>
          )}

          {liveLoading && (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading contacts...</div>
          )}

          {/* Segment Quick Select */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
            {SEGMENTS.slice(0, 6).map(s => (
              <button key={s.id} onClick={() => { setSelectedSegment(s.id); setPage(0); }} style={{
                background: selectedSegment === s.id ? `${C.primary}22` : "rgba(255,255,255,0.03)",
                border: `1px solid ${selectedSegment === s.id ? C.primary : "rgba(255,255,255,0.06)"}`,
                borderRadius: 8, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap",
                color: selectedSegment === s.id ? C.primary : C.muted, fontSize: 12, fontWeight: selectedSegment === s.id ? 700 : 400,
                fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s",
              }}>{s.icon} {s.name}</button>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
            <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(0); }} placeholder="Search name, email, phone, company..." style={{ ...inputStyle, width: 300, padding: "10px 14px" }} />
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0); }} style={{ ...inputStyle, width: 140 }}>
              <option value="all">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <select value={filterTag} onChange={e => { setFilterTag(e.target.value); setPage(0); }} style={{ ...inputStyle, width: 130 }}>
              <option value="all">All Tags</option>
              {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterChannel} onChange={e => { setFilterChannel(e.target.value); setPage(0); }} style={{ ...inputStyle, width: 140 }}>
              <option value="all">All Channels</option>
              {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
            </select>
            <div style={{ marginLeft: "auto", color: C.muted, fontSize: 13 }}>{filtered.length} contact{filtered.length !== 1 ? "s" : ""}</div>
          </div>

          {/* Bulk Actions */}
          {selectedContacts.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: `${C.primary}11`, border: `1px solid ${C.primary}33`, borderRadius: 10, marginBottom: 12 }}>
              <span style={{ color: C.primary, fontSize: 13, fontWeight: 700 }}>{selectedContacts.length} selected</span>
              <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }}>🏷️ Add Tag</button>
              <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }}>🚀 Add to Campaign</button>
              <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }}>📤 Export</button>
              {<button onClick={handleBulkDelete} disabled={deleting} style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12, color: "#FF3B30", borderColor: "rgba(255,59,48,0.3)" }}>{deleting ? "Deleting..." : "🗑 Delete"}</button>}
              <button onClick={() => setSelectedContacts([])} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, marginLeft: "auto" }}>Clear</button>
            </div>
          )}

          {/* Table */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "40px 2fr 2fr 140px 100px 120px 90px 80px 80px", gap: 8, padding: "10px 16px", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div><input type="checkbox" checked={selectedContacts.length === paged.length && paged.length > 0} onChange={toggleSelectAll} style={{ cursor: "pointer" }} /></div>
              {[
                { label: "Name", key: "name" }, { label: "Email", key: "email" }, { label: "Phone" },
                { label: "Status" }, { label: "Tags" }, { label: "Open %", key: "openRate" },
                { label: "LTV", key: "ltv" }, { label: "" },
              ].map((h, i) => (
                <div key={i} onClick={() => h.key && handleSort(h.key)} style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, cursor: h.key ? "pointer" : "default", userSelect: "none" }}>
                  {h.label} {sortBy === h.key && (sortDir === "asc" ? "↑" : "↓")}
                </div>
              ))}
            </div>

            {paged.map(c => (
              <div key={c.id} style={{
                display: "grid", gridTemplateColumns: "40px 2fr 2fr 140px 100px 120px 90px 80px 80px", gap: 8,
                padding: "12px 16px", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.03)",
                cursor: "pointer", transition: "background 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <div onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedContacts.includes(c.id)} onChange={() => toggleSelect(c.id)} style={{ cursor: "pointer" }} /></div>
                <div onClick={() => { setSelectedContact(c); setView("detail"); }} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}44, ${C.primary}22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: C.primary, flexShrink: 0 }}>{c.firstName[0]}{c.lastName[0]}</div>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{c.firstName} {c.lastName}</div>
                    <div style={{ color: C.muted, fontSize: 11 }}>{c.company}</div>
                  </div>
                </div>
                <div onClick={() => { setSelectedContact(c); setView("detail"); }} style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{c.email}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "monospace" }}>{c.phone.slice(0, 6)}...{c.phone.slice(-4)}</div>
                <div><span style={badge(STATUS_COLORS[c.status])}>{c.status}</span></div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {c.tags.slice(0, 2).map(t => <span key={t} style={{ ...badge(TAG_COLORS[t] || C.muted), fontSize: 9, padding: "1px 6px" }}>{t}</span>)}
                  {c.tags.length > 2 && <span style={{ color: C.muted, fontSize: 10 }}>+{c.tags.length - 2}</span>}
                </div>
                <div style={{ color: c.openRate > 60 ? "#00E676" : c.openRate > 40 ? "#FFD600" : "#FF6B35", fontSize: 13, fontWeight: 600 }}>{c.openRate}%</div>
                <div style={{ color: c.ltv > 1000 ? "#00E676" : "#fff", fontSize: 13, fontWeight: 600 }}>${Math.round(c.ltv).toLocaleString()}</div>
                <div onClick={() => { setSelectedContact(c); setView("detail"); }} style={{ color: C.primary, fontSize: 12, fontWeight: 600, textAlign: "right" }}>View →</div>
              </div>
            ))}

            {paged.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 20px", color: C.muted }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
                <div style={{ color: "#fff", fontWeight: 600, marginBottom: 4 }}>No contacts found</div>
                <div style={{ fontSize: 13 }}>Try adjusting your filters</div>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16 }}>
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12, opacity: page === 0 ? 0.3 : 1 }}>← Prev</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i : page < 3 ? i : page > totalPages - 4 ? totalPages - 7 + i : page - 3 + i;
                return (
                  <button key={p} onClick={() => setPage(p)} style={{
                    width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer",
                    background: page === p ? C.primary : "rgba(255,255,255,0.04)",
                    color: page === p ? "#000" : C.muted, fontWeight: page === p ? 700 : 400, fontSize: 13,
                  }}>{p + 1}</button>
                );
              })}
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page === totalPages - 1} style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12, opacity: page === totalPages - 1 ? 0.3 : 1 }}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* ═══════════════ SEGMENTS TAB ═══════════════ */}
      {activeTab === "segments" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: 0 }}>Segments & Smart Lists</h2>
            <button style={btnPrimary}>+ Create Segment</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
            {SEGMENTS.map(s => {
              const count = contacts.filter(s.filter).length;
              const pct = ((count / contacts.length) * 100).toFixed(0);
              return (
                <div key={s.id} onClick={() => { setSelectedSegment(s.id); setActiveTab("contacts"); setPage(0); }} style={{
                  ...card, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 16,
                  borderLeft: `4px solid ${C.primary}`,
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = C.primary; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                >
                  <div style={{ fontSize: 28, width: 44, textAlign: "center" }}>{s.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                    <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{s.desc}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#fff", fontSize: 20, fontWeight: 800 }}>{count.toLocaleString()}</div>
                    <div style={{ color: C.primary, fontSize: 11, fontWeight: 600 }}>{pct}% of total</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════ CRM INTEGRATIONS TAB ═══════════════ */}
      {activeTab === "crm" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: 0 }}>CRM Integrations</h2>
            <button style={btnPrimary}>+ Connect CRM</button>
          </div>

          {/* Sync Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { label: "Connected CRMs", value: CRM_INTEGRATIONS.filter(c => c.status === "connected").length, total: CRM_INTEGRATIONS.length, color: "#00E676", icon: "🔗" },
              { label: "Total Synced Contacts", value: CRM_INTEGRATIONS.reduce((s, c) => s + c.synced, 0).toLocaleString(), color: C.primary, icon: "👥" },
              { label: "Sync Errors", value: CRM_INTEGRATIONS.reduce((s, c) => s + c.errors, 0).toLocaleString(), color: CRM_INTEGRATIONS.reduce((s, c) => s + c.errors, 0) > 0 ? "#FF6B35" : "#00E676", icon: "⚠️" },
            ].map((kpi, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderTop: `3px solid ${kpi.color}`, borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>{kpi.label}</span>
                  <span style={{ fontSize: 16 }}>{kpi.icon}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{kpi.value}{kpi.total !== undefined && <span style={{ color: C.muted, fontSize: 14, fontWeight: 400 }}> / {kpi.total}</span>}</div>
              </div>
            ))}
          </div>

          {/* CRM Cards */}
          <div style={{ display: "grid", gap: 14 }}>
            {CRM_INTEGRATIONS.map(crm => (
              <div key={crm.id} style={{
                ...card, display: "grid", gridTemplateColumns: "60px 1fr 140px 140px 120px 120px",
                alignItems: "center", gap: 16,
                borderLeft: `4px solid ${crm.status === "connected" ? "#00E676" : crm.status === "error" ? "#FF3B30" : "rgba(255,255,255,0.1)"}`,
              }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: `${crm.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{crm.icon}</div>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{crm.name}</div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                    {crm.status === "connected" && `Last sync: ${Math.round((Date.now() - crm.lastSync) / 60000)} min ago`}
                    {crm.status === "error" && `Last attempt: ${Math.round((Date.now() - crm.lastSync) / 3600000)}h ago`}
                    {crm.status === "disconnected" && "Not configured"}
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>{crm.contacts > 0 ? crm.contacts.toLocaleString() : "—"}</div>
                  <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase" }}>Contacts</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: crm.synced > 0 ? "#00E676" : C.muted, fontSize: 16, fontWeight: 700 }}>{crm.synced > 0 ? crm.synced.toLocaleString() : "—"}</div>
                  <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase" }}>Synced</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <span style={badge(crm.status === "connected" ? "#00E676" : crm.status === "error" ? "#FF3B30" : "#6B8BAE")}>
                    {crm.status === "connected" ? "● Connected" : crm.status === "error" ? "● Error" : "○ Disconnected"}
                  </span>
                  {crm.errors > 0 && <div style={{ color: "#FF6B35", fontSize: 11, marginTop: 4 }}>{crm.errors} errors</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  {crm.status === "connected" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <button style={{ ...btnSecondary, padding: "6px 12px", fontSize: 11 }}>🔄 Sync Now</button>
                      <button style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer" }}>Configure</button>
                    </div>
                  )}
                  {crm.status === "error" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <button style={{ ...btnPrimary, padding: "6px 12px", fontSize: 11 }}>🔧 Fix</button>
                      <button style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer" }}>View Errors</button>
                    </div>
                  )}
                  {crm.status === "disconnected" && (
                    <button style={{ ...btnPrimary, padding: "8px 16px", fontSize: 12 }}>Connect</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* API Info */}
          <div style={{ ...card, marginTop: 20 }}>
            <h3 style={{ color: "#fff", margin: "0 0 14px", fontSize: 15 }}>REST API Access</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>API Endpoint</div>
                <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 13, color: C.primary, border: "1px solid rgba(255,255,255,0.06)" }}>
                  https://api.engwx.com/v1/contacts
                </div>
              </div>
              <div>
                <div style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>Webhook URL</div>
                <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 13, color: C.primary, border: "1px solid rgba(255,255,255,0.06)" }}>
                  https://api.engwx.com/v1/webhooks
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              {["GET /contacts", "POST /contacts", "PUT /contacts/:id", "DELETE /contacts/:id", "POST /contacts/import", "GET /contacts/export"].map(ep => (
                <span key={ep} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{ep}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
