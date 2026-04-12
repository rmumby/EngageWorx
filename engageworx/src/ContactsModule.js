import { useState, useEffect, useRef } from "react";
import { supabase } from './supabaseClient';
import { DEMO_CONTACTS } from './demoFixtures';

const TAGS = ["VIP", "New", "Active", "Inactive", "Churned", "Lead", "Prospect", "Enterprise", "SMB", "Newsletter"];
const TAG_COLORS = { VIP: "#FFD600", New: "#00E676", Active: "#00C9FF", Inactive: "#FF9800", Churned: "#FF3B30", Lead: "#E040FB", Prospect: "#7C4DFF", Enterprise: "#FF6B35", SMB: "#6B8BAE", Newsletter: "#25D366" };
const CHANNELS = ["SMS", "Email", "WhatsApp", "RCS", "MMS", "Voice"];
const CHANNEL_ICONS = { SMS: "💬", Email: "📧", WhatsApp: "📱", RCS: "✨", MMS: "📷", Voice: "📞" };
const STATUSES = ["active", "unsubscribed", "bounced", "blocked"];
const STATUS_COLORS = { active: "#00E676", unsubscribed: "#FF3B30", bounced: "#FF9800", blocked: "#6B8BAE" };

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

const SEGMENTS = [
  { id: "all", name: "All Contacts", icon: "👥", desc: "Every contact in your database", filter: () => true },
  { id: "active", name: "Active", icon: "✅", desc: "Active contacts", filter: c => c.status === "active" },
  { id: "vip", name: "VIP Customers", icon: "⭐", desc: "Tagged as VIP", filter: c => c.tags.includes("VIP") },
  { id: "new30", name: "New (30 days)", icon: "🆕", desc: "Joined in the last 30 days", filter: c => (Date.now() - c.created) < 30 * 86400000 },
  { id: "inactive", name: "Inactive 30+ Days", icon: "😴", desc: "No activity in 30+ days", filter: c => (Date.now() - c.lastActive) > 30 * 86400000 },
  { id: "highvalue", name: "High Value", icon: "💎", desc: "LTV over $1,000", filter: c => c.ltv > 1000 },
  { id: "enterprise", name: "Enterprise", icon: "🏢", desc: "Tagged as Enterprise", filter: c => c.tags.includes("Enterprise") },
  { id: "unsubscribed", name: "Unsubscribed", icon: "🚫", desc: "Opted out", filter: c => c.status === "unsubscribed" },
  { id: "sms_only", name: "SMS Subscribers", icon: "💬", desc: "Active SMS contacts", filter: c => c.channels.includes("SMS") && c.status === "active" },
{ id: "email_only", name: "Email Subscribers", icon: "📧", desc: "Active Email contacts", filter: c => c.channels.includes("Email") && c.status === "active" },
];

const CRM_INTEGRATIONS = [
  { id: "salesforce", name: "Salesforce", icon: "☁️", color: "#00A1E0", status: "connected", lastSync: new Date(Date.now() - 12 * 60000), contacts: 48200, synced: 47800, errors: 12, direction: "bidirectional" },
  { id: "hubspot", name: "HubSpot", icon: "🟠", color: "#FF7A59", status: "connected", lastSync: new Date(Date.now() - 45 * 60000), contacts: 32100, synced: 32100, errors: 0, direction: "bidirectional" },
  { id: "zoho", name: "Zoho CRM", icon: "🔴", color: "#E42527", status: "disconnected", lastSync: null, contacts: 0, synced: 0, errors: 0, direction: "none" },
  { id: "pipedrive", name: "Pipedrive", icon: "🟢", color: "#017737", status: "disconnected", lastSync: null, contacts: 0, synced: 0, errors: 0, direction: "none" },
  { id: "dynamics", name: "Microsoft Dynamics", icon: "🔷", color: "#002050", status: "error", lastSync: new Date(Date.now() - 3 * 3600000), contacts: 15400, synced: 14200, errors: 1200, direction: "import" },
  { id: "freshsales", name: "Freshsales", icon: "🟤", color: "#F26522", status: "disconnected", lastSync: null, contacts: 0, synced: 0, errors: 0, direction: "none" },
];

function mapContact(c) {
  return {
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
  };
}

export default function ContactsModule({ C, tenants, viewLevel = "tenant", currentTenantId, demoMode = true }) {
  const [contacts, setContacts] = useState(() => demoMode ? DEMO_CONTACTS : []);
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
  const [newContact, setNewContact] = useState({ firstName: "", lastName: "", email: "", phone: "", phoneNumber: "", countryCode: "+1", company: "", status: "active", channel_preference: "SMS" });
  const [emailWarning, setEmailWarning] = useState(null);
  const [dedupRunning, setDedupRunning] = useState(false);
  // SP admin tenant filter — only used when viewLevel === 'sp'
  const [spTenantFilter, setSpTenantFilter] = useState('all');
  const [spTenantList, setSpTenantList] = useState([]);
  // CSV import state
  const [importRows, setImportRows] = useState(null);         // parsed rows (array of objects)
  const [importDedupAction, setImportDedupAction] = useState('skip'); // 'skip' | 'allow'
  const [importTagsInput, setImportTagsInput] = useState('');
  const [importSequenceId, setImportSequenceId] = useState('');
  const [importCampaignId, setImportCampaignId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResult, setImportResult] = useState(null);
  const [availableSequences, setAvailableSequences] = useState([]);
  const [availableCampaigns, setAvailableCampaigns] = useState([]);
  const [existingEmailSet, setExistingEmailSet] = useState(new Set());
  const [editingContact, setEditingContact] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 15;

  useEffect(() => {
    if (demoMode) { setContacts(DEMO_CONTACTS); return; }
    const fetchContacts = async () => {
      setLiveLoading(true);
      try {
        let query = supabase.from('contacts').select('*').order('created_at', { ascending: false });
        if (currentTenantId) query = query.eq('tenant_id', currentTenantId);
        else if (viewLevel === 'sp' && spTenantFilter && spTenantFilter !== 'all') query = query.eq('tenant_id', spTenantFilter);
        const { data, error } = await query;
        if (error) throw error;
        setContacts((data || []).map(mapContact));
      } catch (err) {
        console.warn('Contacts fetch error:', err.message);
        setContacts([]);
      }
      setLiveLoading(false);
    };
    fetchContacts();
  }, [demoMode, currentTenantId, viewLevel, spTenantFilter]);

  // Load tenant list for the SP admin filter dropdown (only when viewLevel === 'sp')
  useEffect(() => {
    if (demoMode || viewLevel !== 'sp') return;
    supabase.from('tenants')
      .select('id, name, status')
      .in('status', ['active', 'trial'])
      .order('name')
      .then(function(r) { if (r.data) setSpTenantList(r.data); });
  }, [demoMode, viewLevel]);

  // Debounced email duplicate check on add form
  useEffect(() => {
    if (demoMode || !currentTenantId || !newContact.email || !showAddContact) { setEmailWarning(null); return; }
    var em = newContact.email.trim().toLowerCase();
    if (em.length < 5 || !em.includes('@')) { setEmailWarning(null); return; }
    var timer = setTimeout(function() {
      fetch('/api/contacts?action=check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: currentTenantId, email: em }),
      })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.exists && data.matches && data.matches.length > 0) {
            var m = data.matches[0];
            setEmailWarning('⚠️ Contact already exists: ' + (m.first_name || '') + ' ' + (m.last_name || '') + ' (' + m.email + ')');
          } else { setEmailWarning(null); }
        })
        .catch(function() {});
    }, 400);
    return function() { clearTimeout(timer); };
  }, [newContact.email, showAddContact, currentTenantId, demoMode]);

  // ── CSV IMPORT HELPERS ────────────────────────────────────────────────
  function parseCSVLine(line) {
    var out = []; var cur = ''; var inQ = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }
  function parseCSVText(text) {
    var lines = text.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
    if (lines.length < 2) return { headers: [], rows: [] };
    var headers = parseCSVLine(lines[0]).map(function(h) { return h.trim().toLowerCase(); });
    var rows = [];
    for (var i = 1; i < lines.length; i++) {
      var values = parseCSVLine(lines[i]);
      var row = {};
      headers.forEach(function(h, idx) { row[h] = (values[idx] || '').trim(); });
      rows.push(row);
    }
    return { headers: headers, rows: rows };
  }

  function scopedTenantId() {
    return currentTenantId || (viewLevel === 'sp' && spTenantFilter && spTenantFilter !== 'all' ? spTenantFilter : null);
  }

  function handleDownloadTemplate() {
    var csv =
      'first_name,last_name,email,phone,company,tags\n' +
      'John,Doe,john.doe@example.com,+15551234567,Acme Corp,VIP;Sales\n' +
      'Jane,Smith,jane.smith@example.com,+15559876543,Retail Inc,Returning';
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'contacts_template.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleFileSelected(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) { alert('Please select a .csv file.'); return; }

    var tid = scopedTenantId();
    if (!tid) {
      alert('No tenant context. ' + (viewLevel === 'sp' ? 'Select a specific tenant from the filter dropdown before importing.' : 'Open a tenant portal to import.'));
      return;
    }

    // Load existing emails for dedup preview (one shot, cached in Set)
    try {
      var existing = await supabase.from('contacts').select('email').eq('tenant_id', tid).not('email', 'is', null);
      var set = new Set();
      (existing.data || []).forEach(function(c) { if (c.email) set.add(c.email.toLowerCase().trim()); });
      setExistingEmailSet(set);
    } catch (e) { console.warn('[Import] Existing email fetch failed:', e.message); setExistingEmailSet(new Set()); }

    // Load available sequences + campaigns for the assignment dropdowns
    try {
      var sres = await supabase.from('sequences').select('id, name').eq('tenant_id', tid).eq('status', 'active').order('name');
      setAvailableSequences(sres.data || []);
    } catch (e) { setAvailableSequences([]); }
    try {
      var cres = await supabase.from('campaigns').select('id, name').eq('tenant_id', tid).order('created_at', { ascending: false }).limit(50);
      setAvailableCampaigns(cres.data || []);
    } catch (e) { setAvailableCampaigns([]); }

    // Parse the file
    var reader = new FileReader();
    reader.onload = function(ev) {
      var parsed = parseCSVText(String(ev.target.result || ''));
      if (parsed.rows.length === 0) { alert('No rows found in CSV. Make sure the first line is headers and there is at least one data row.'); return; }
      setImportRows(parsed.rows);
      setImportResult(null);
      setImportProgress({ current: 0, total: parsed.rows.length });
    };
    reader.readAsText(file);
  }

  async function handleRunImport() {
    if (!importRows || importRows.length === 0) return;
    var tid = scopedTenantId();
    if (!tid) { alert('No tenant context.'); return; }

    setImporting(true);
    setImportResult(null);
    var imported = 0, skipped = 0, failed = 0;
    var importedIds = [];
    var importedEmails = [];

    var extraTags = importTagsInput.split(',').map(function(t) { return t.trim(); }).filter(Boolean);
    var campaignName = availableCampaigns.find(function(c) { return c.id === importCampaignId; });
    var campaignTag = campaignName ? ('campaign:' + campaignName.name) : null;

    for (var i = 0; i < importRows.length; i++) {
      var r = importRows[i];
      setImportProgress({ current: i, total: importRows.length });

      try {
        var em = (r.email || '').trim().toLowerCase();
        if (em && existingEmailSet.has(em) && importDedupAction === 'skip') { skipped++; continue; }

        var rowTags = (r.tags || '').split(/[,;]/).map(function(t) { return t.trim(); }).filter(Boolean);
        var tags = [].concat(rowTags, extraTags, campaignTag ? [campaignTag] : []);

        var contact = {
          tenant_id: tid,
          first_name: r.first_name || r.firstname || null,
          last_name: r.last_name || r.lastname || null,
          email: em || null,
          phone: r.phone || null,
          company: r.company || null,
          tags: tags.length > 0 ? tags : null,
          status: 'active',
          source: 'csv_import',
        };

        var ins = await supabase.from('contacts').insert(contact).select('id, email').single();
        if (ins.error) { failed++; console.warn('[Import] Insert error row', i, ins.error.message); continue; }
        imported++;
        if (ins.data) { importedIds.push(ins.data.id); if (ins.data.email) importedEmails.push(ins.data.email); }
        if (em) existingEmailSet.add(em);
      } catch (e) { failed++; console.warn('[Import] Row error', i, e.message); }
    }
    setImportProgress({ current: importRows.length, total: importRows.length });

    // Optional: enrol imported contacts in a sequence
    // Flow: for each email, find-or-create a lead, then upsert lead_sequences.
    var enrolled = 0;
    if (importSequenceId && importedEmails.length > 0) {
      try {
        var seqStep = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', importSequenceId).eq('step_number', 1).single();
        var delayDays = (seqStep.data && seqStep.data.delay_days) ? seqStep.data.delay_days : 0;
        var startIso = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString();

        for (var j = 0; j < importedEmails.length; j++) {
          var email = importedEmails[j];
          try {
            // Find matching lead
            var leadRes = await supabase.from('leads').select('id').eq('tenant_id', tid).eq('email', email).limit(1);
            var leadId = (leadRes.data && leadRes.data[0]) ? leadRes.data[0].id : null;
            if (!leadId) {
              // Create a minimal lead from the contact
              var contactRow = importRows.find(function(x) { return (x.email || '').trim().toLowerCase() === email; }) || {};
              var name = ((contactRow.first_name || '') + ' ' + (contactRow.last_name || '')).trim() || email;
              var newLead = await supabase.from('leads').insert({
                tenant_id: tid, name: name, email: email, company: contactRow.company || '',
                type: 'Direct Business', urgency: 'Warm', stage: 'inquiry', source: 'csv_import',
                last_action_at: new Date().toISOString().split('T')[0], last_activity_at: new Date().toISOString(),
              }).select('id').single();
              if (newLead.data) leadId = newLead.data.id;
            }
            if (leadId) {
              await supabase.from('lead_sequences').upsert({
                tenant_id: tid, lead_id: leadId, sequence_id: importSequenceId,
                current_step: 0, status: 'active', enrolled_at: new Date().toISOString(), next_step_at: startIso,
              }, { onConflict: 'lead_id,sequence_id' });
              enrolled++;
            }
          } catch (le) { console.warn('[Import] Enrol error for', email, le.message); }
        }
      } catch (seqErr) { console.warn('[Import] Sequence lookup error:', seqErr.message); }
    }

    setImporting(false);
    setImportResult({ imported: imported, skipped: skipped, failed: failed, enrolled: enrolled, campaign_tagged: campaignTag ? imported : 0 });

    // Refresh contacts list
    try {
      let refreshQ = supabase.from('contacts').select('*').order('created_at', { ascending: false });
      if (currentTenantId) refreshQ = refreshQ.eq('tenant_id', currentTenantId);
      else if (viewLevel === 'sp' && spTenantFilter && spTenantFilter !== 'all') refreshQ = refreshQ.eq('tenant_id', spTenantFilter);
      const { data: refreshed } = await refreshQ;
      setContacts((refreshed || []).map(mapContact));
    } catch (re) {}
  }

  function handleCloseImport() {
    setShowImport(false);
    setImportRows(null);
    setImportResult(null);
    setImportProgress({ current: 0, total: 0 });
    setImportTagsInput('');
    setImportSequenceId('');
    setImportCampaignId('');
    setImportDedupAction('skip');
  }

  const handleDedup = async () => {
    console.log('[Dedup] handleDedup clicked. demoMode=', demoMode, 'currentTenantId=', currentTenantId, 'viewLevel=', viewLevel);
    if (demoMode) { alert('Dedup is disabled in demo mode.'); return; }

    var scope = currentTenantId || (viewLevel === 'sp' && spTenantFilter && spTenantFilter !== 'all' ? spTenantFilter : null);
    var scopeMsg = scope
      ? 'this tenant'
      : 'ALL tenants (SP admin global dedup)';

    if (!window.confirm(
      'Find & merge duplicate contacts for ' + scopeMsg + '?\n\n' +
      'Oldest record per (tenant, email) is kept. Missing fields are filled in from duplicates. ' +
      'Conversations and messages are redirected to the kept contact. This cannot be undone.'
    )) { console.log('[Dedup] User cancelled'); return; }

    setDedupRunning(true);
    console.log('[Dedup] Calling /api/contacts?action=dedup with scope:', scope || 'ALL');

    try {
      const resp = await fetch('/api/contacts?action=dedup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scope ? { tenant_id: scope } : { all_tenants: true }),
      });
      console.log('[Dedup] API response status:', resp.status);
      const data = await resp.json();
      console.log('[Dedup] API response body:', data);

      if (data.success) {
        alert(
          'Dedup complete.\n' +
          '• Email groups merged: ' + (data.groups_merged || 0) + '\n' +
          '• Contacts deleted: ' + (data.contacts_deleted || 0) + '\n' +
          '• Lead groups merged: ' + (data.leads_merged || 0) + '\n' +
          '• Leads deleted: ' + (data.leads_deleted || 0) + '\n' +
          '• Related rows redirected: ' + (data.fk_rows_redirected || 0) +
          (data.tenants_processed ? '\n• Tenants processed: ' + data.tenants_processed : '') +
          (data.errors && data.errors.length > 0 ? '\n\n⚠️ ' + data.errors.length + ' error(s) — see console.' : '')
        );
        if (data.errors && data.errors.length > 0) console.warn('[Dedup] Errors:', data.errors);
        // Refresh contacts
        try {
          let query = supabase.from('contacts').select('*').order('created_at', { ascending: false });
          if (currentTenantId) query = query.eq('tenant_id', currentTenantId);
          const { data: refreshed } = await query;
          setContacts((refreshed || []).map(mapContact));
        } catch (re) { console.warn('[Dedup] Refresh failed:', re.message); }
      } else {
        alert('Dedup failed: ' + (data.error || 'Unknown') + ' (status ' + resp.status + ')');
      }
    } catch (e) {
      console.error('[Dedup] Fetch error:', e);
      alert('Dedup error: ' + e.message);
    }
    setDedupRunning(false);
  };

  const handleAddContact = async () => {
    if (!newContact.firstName || !newContact.phone) {
      alert('First name and phone are required.');
      return;
    }
    if (emailWarning) {
      if (!window.confirm(emailWarning + '\n\nSave anyway? (A duplicate will be created and can be merged later.)')) return;
    }
    if (demoMode) {
      setContacts(prev => [{
        id: "ct_" + Date.now(),
        firstName: newContact.firstName, lastName: newContact.lastName,
        email: newContact.email, phone: newContact.phone, company: newContact.company,
        status: newContact.status || "subscribed", tags: [],
        channels: [newContact.channel_preference || "SMS"],
        created: new Date(), lastActive: new Date(),
        messagesSent: 0, messagesReceived: 0, openRate: 0, clickRate: 0, ltv: 0,
        city: "", state: "", notes: "", customFields: {},
      }, ...prev]);
      setNewContact({ firstName: "", lastName: "", email: "", phone: "", phoneNumber: "", countryCode: "+1", company: "", status: "subscribed", channel_preference: "SMS" });
      setShowAddContact(false);
      return;
    }
    try {
      const { error } = await supabase.from('contacts').insert({
        tenant_id: currentTenantId,
        first_name: newContact.firstName,
        last_name: newContact.lastName,
        email: newContact.email || null,
        phone: newContact.phone,
        company: newContact.company || null,
        status: newContact.status,
        channel_preference: newContact.channel_preference.toLowerCase(),
        source: 'manual',
      });
      if (error) throw error;
      const { data, error: fetchError } = await supabase
        .from('contacts').select('*')
        .eq('tenant_id', currentTenantId)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setContacts((data || []).map(mapContact));
      setNewContact({ firstName: "", lastName: "", email: "", phone: "", phoneNumber: "", countryCode: "+1", company: "", status: "subscribed", channel_preference: "SMS" });
      setShowAddContact(false);
    } catch (err) {
      console.error('Add contact error:', err);
      alert('Save failed: ' + err.message);
    }
  };

  const handleEditContact = async (contact) => {
    if (demoMode) {
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, ...contact } : c));
      setEditingContact(null);
      if (selectedContact?.id === contact.id) setSelectedContact({ ...selectedContact, ...contact });
      return;
    }
    try {
      const { error } = await supabase.from('contacts').update({
        first_name: contact.firstName, last_name: contact.lastName,
        email: contact.email, phone: contact.phone,
        company: contact.company, status: contact.status,
      }).eq('id', contact.id);
      if (error) throw error;
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, ...contact } : c));
      setEditingContact(null);
      if (selectedContact?.id === contact.id) setSelectedContact({ ...selectedContact, ...contact });
    } catch (err) {
      console.warn('Edit contact error:', err.message);
      alert('Edit failed: ' + err.message);
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (demoMode) {
      setContacts(prev => prev.filter(c => c.id !== contactId));
      if (selectedContact?.id === contactId) { setSelectedContact(null); setView("list"); }
      setSelectedContacts(prev => prev.filter(id => id !== contactId));
      return;
    }
    setDeleting(true);
    try {
      const { error } = await supabase.from('contacts').delete().eq('id', contactId);
      if (error) throw error;
      setContacts(prev => prev.filter(c => c.id !== contactId));
      if (selectedContact?.id === contactId) { setSelectedContact(null); setView("list"); }
      setSelectedContacts(prev => prev.filter(id => id !== contactId));
    } catch (err) {
      console.warn('Delete contact error:', err.message);
    }
    setDeleting(false);
  };

  const handleBulkDelete = async () => {
    if (selectedContacts.length === 0) return;
    if (!window.confirm(`Delete ${selectedContacts.length} contact${selectedContacts.length > 1 ? 's' : ''}?`)) return;
    if (demoMode) {
      setContacts(prev => prev.filter(c => !selectedContacts.includes(c.id)));
      setSelectedContacts([]);
      return;
    }
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
  const avgOpenRate = totalContacts > 0 ? (contacts.reduce((s, c) => s + c.openRate, 0) / totalContacts).toFixed(1) : "0.0";
  const totalLTV = contacts.reduce((s, c) => s + c.ltv, 0);

  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };
  const btnPrimary = { background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, border: "none", borderRadius: 10, padding: "10px 20px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const btnSecondary = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 22 };
  const badge = (color) => ({ display: "inline-block", background: color + "18", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 });
  const handleSort = (col) => { if (sortBy === col) setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortBy(col); setSortDir("desc"); } };
  const toggleSelect = (id) => setSelectedContacts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => { if (selectedContacts.length === paged.length) setSelectedContacts([]); else setSelectedContacts(paged.map(c => c.id)); };
  const handleExport = () => {
    const headers = ["First Name", "Last Name", "Email", "Phone", "Company", "Status", "Tags", "Channels", "LTV", "Open Rate", "Created"];
    const rows = filtered.map(c => [c.firstName, c.lastName, c.email, c.phone, c.company, c.status, c.tags.join(";"), c.channels.join(";"), c.ltv, c.openRate, c.created.toISOString().split("T")[0]]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "contacts-export.csv"; a.click();
    URL.revokeObjectURL(url);
  };

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
                  {[{ key: "firstName", label: "First Name", icon: "👤" }, { key: "lastName", label: "Last Name", icon: "👤" }, { key: "email", label: "Email", icon: "📧" }, { key: "phone", label: "Phone", icon: "📞" }, { key: "company", label: "Company", icon: "🏢" }].map(f => (
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
                [{ icon: "📧", label: "Email", value: c.email }, { icon: "📞", label: "Phone", value: c.phone }, { icon: "🏢", label: "Company", value: c.company }, { icon: "📅", label: "Created", value: c.created.toLocaleDateString() }, { icon: "⏰", label: "Last Active", value: c.lastActive.toLocaleDateString() }].map(item => (
                  <div key={item.label} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: 14, width: 20 }}>{item.icon}</span>
                    <span style={{ color: C.muted, fontSize: 12, width: 80 }}>{item.label}</span>
                    <span style={{ color: "#fff", fontSize: 13, flex: 1, wordBreak: "break-all" }}>{item.value}</span>
                  </div>
                ))
              )}
            </div>
            <div style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ color: "#fff", margin: "0 0 14px", fontSize: 14 }}>Channels</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {c.channels.map(ch => <div key={ch} style={{ background: `${C.primary}15`, border: `1px solid ${C.primary}33`, borderRadius: 8, padding: "8px 14px", fontSize: 13, color: C.primary, fontWeight: 600 }}>{CHANNEL_ICONS[ch]} {ch}</div>)}
              </div>
            </div>
            <div style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ color: "#fff", margin: "0 0 14px", fontSize: 14 }}>Engagement Stats</h3>
              {[{ label: "Messages Sent", value: c.messagesSent, color: C.primary }, { label: "Open Rate", value: `${c.openRate}%`, color: "#00C9FF" }, { label: "Click Rate", value: `${c.clickRate}%`, color: "#E040FB" }, { label: "Lifetime Value", value: `$${c.ltv.toLocaleString()}`, color: "#FFD600" }].map(s => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ color: C.muted, fontSize: 13 }}>{s.label}</span>
                  <span style={{ color: s.color, fontSize: 13, fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
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

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1400 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Contacts</h1>
          <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>Manage contacts, segments, and CRM integrations</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {viewLevel === 'sp' && !demoMode && (
            <select value={spTenantFilter} onChange={e => setSpTenantFilter(e.target.value)} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", minWidth: 220, cursor: 'pointer' }}>
              <option value="all">🏢 All Tenants ({spTenantList.length})</option>
              {spTenantList.map(function(t) { return <option key={t.id} value={t.id}>{t.name}</option>; })}
            </select>
          )}
          <button onClick={handleDownloadTemplate} style={btnSecondary}>📄 Download Template</button>
          <button onClick={() => setShowImport(true)} style={btnSecondary}>📥 Import CSV</button>
          <button onClick={handleExport} style={btnSecondary}>📤 Export CSV</button>
          {!demoMode && <button onClick={handleDedup} disabled={dedupRunning} style={{ background: 'rgba(255,214,0,0.12)', border: '1px solid rgba(255,214,0,0.3)', borderRadius: 10, padding: '10px 18px', color: '#FFD600', fontWeight: 700, cursor: dedupRunning ? 'wait' : 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif", opacity: dedupRunning ? 0.6 : 1 }}>{dedupRunning ? '⏳ Merging...' : '🔀 Find & Merge Duplicates'}</button>}
          <button onClick={() => setShowAddContact(true)} style={btnPrimary}>+ Add Contact</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Contacts", value: totalContacts.toLocaleString(), color: C.primary, icon: "👥" },
          { label: "Subscribed", value: subscribedCount.toLocaleString(), sub: totalContacts > 0 ? `${((subscribedCount / totalContacts) * 100).toFixed(0)}%` : "0%", color: "#00E676", icon: "✅" },
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

      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {[{ id: "contacts", label: "Contacts", icon: "👥" }, { id: "segments", label: "Segments", icon: "🎯" }, { id: "crm", label: "CRM Integrations", icon: "🔗" }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ background: activeTab === t.id ? C.primary : "rgba(255,255,255,0.04)", border: activeTab === t.id ? "none" : "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "8px 18px", color: activeTab === t.id ? "#000" : C.muted, fontWeight: activeTab === t.id ? 700 : 400, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {activeTab === "contacts" && (
        <>
          {showImport && (() => {
            var dupeCount = importRows ? importRows.filter(function(r) { var em = (r.email || '').trim().toLowerCase(); return em && existingEmailSet.has(em); }).length : 0;
            var newCount = importRows ? importRows.length - dupeCount : 0;
            var canImport = importRows && importRows.length > 0 && !importing && !importResult;
            return (
            <div style={{ ...card, marginBottom: 20, border: `1px solid ${C.primary}44` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Import Contacts from CSV</h3>
                <button onClick={handleCloseImport} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18 }}>✕</button>
              </div>

              {/* Step 1: File picker */}
              {!importRows && !importResult && (
                <div>
                  <label style={{ display: "block", padding: 40, textAlign: "center", border: "2px dashed rgba(255,255,255,0.15)", borderRadius: 12, marginBottom: 12, cursor: "pointer" }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>📁</div>
                    <div style={{ color: "#fff", fontWeight: 600, marginBottom: 4 }}>Choose a CSV file</div>
                    <div style={{ color: C.muted, fontSize: 13 }}>Expected columns: first_name, last_name, email, phone, company, tags</div>
                    <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={function(e) { handleFileSelected(e.target.files[0]); }} />
                  </label>
                  <div style={{ color: C.muted, fontSize: 12 }}>💡 Not sure of the format? Click <b>📄 Download Template</b> in the header above.</div>
                </div>
              )}

              {/* Step 2: Preview + assignment */}
              {importRows && !importing && !importResult && (
                <div>
                  <div style={{ display: "flex", gap: 16, marginBottom: 16, padding: "12px 16px", background: "rgba(0,201,255,0.05)", borderRadius: 10, border: "1px solid rgba(0,201,255,0.2)" }}>
                    <div><div style={{ color: C.muted, fontSize: 11 }}>TOTAL ROWS</div><div style={{ color: "#fff", fontSize: 20, fontWeight: 800 }}>{importRows.length}</div></div>
                    <div><div style={{ color: C.muted, fontSize: 11 }}>NEW</div><div style={{ color: "#00E676", fontSize: 20, fontWeight: 800 }}>{newCount}</div></div>
                    <div><div style={{ color: C.muted, fontSize: 11 }}>DUPLICATES</div><div style={{ color: "#FFD600", fontSize: 20, fontWeight: 800 }}>{dupeCount}</div></div>
                    <div style={{ flex: 1 }} />
                    <div>
                      <div style={{ color: C.muted, fontSize: 11, marginBottom: 4 }}>DUPLICATE ACTION</div>
                      <select value={importDedupAction} onChange={function(e) { setImportDedupAction(e.target.value); }} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 8px', color: '#fff', fontSize: 12 }}>
                        <option value="skip">Skip duplicates</option>
                        <option value="allow">Allow duplicates</option>
                      </select>
                    </div>
                  </div>

                  {/* Preview table — first 5 rows */}
                  <div style={{ overflowX: "auto", marginBottom: 16 }}>
                    <div style={{ color: C.muted, fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Preview (first 5 rows)</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                          {["first_name","last_name","email","phone","company","tags"].map(function(h) { return <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, border: "1px solid rgba(255,255,255,0.06)" }}>{h}</th>; })}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 5).map(function(r, idx) {
                          var em = (r.email || '').trim().toLowerCase();
                          var isDupe = em && existingEmailSet.has(em);
                          return (
                            <tr key={idx} style={{ background: isDupe ? "rgba(255,214,0,0.06)" : "transparent" }}>
                              {["first_name","last_name","email","phone","company","tags"].map(function(h) { return <td key={h} style={{ padding: "6px 10px", color: "#fff", border: "1px solid rgba(255,255,255,0.06)" }}>{r[h] || '—'}{h === 'email' && isDupe ? <span style={{ color: '#FFD600', marginLeft: 6, fontSize: 10 }}>⚠ exists</span> : null}</td>; })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Assignment panel */}
                  <div style={{ padding: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, marginBottom: 16 }}>
                    <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Optional: Tag & Assign</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Add Tags (comma separated)</label>
                        <input value={importTagsInput} onChange={function(e) { setImportTagsInput(e.target.value); }} placeholder="e.g. Trade Show, Q2 Leads" style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Enrol in Sequence</label>
                        <select value={importSequenceId} onChange={function(e) { setImportSequenceId(e.target.value); }} style={inputStyle}>
                          <option value="">— None —</option>
                          {availableSequences.map(function(s) { return <option key={s.id} value={s.id}>{s.name}</option>; })}
                        </select>
                      </div>
                      <div>
                        <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}>Tag for Campaign</label>
                        <select value={importCampaignId} onChange={function(e) { setImportCampaignId(e.target.value); }} style={inputStyle}>
                          <option value="">— None —</option>
                          {availableCampaigns.map(function(c) { return <option key={c.id} value={c.id}>{c.name}</option>; })}
                        </select>
                      </div>
                    </div>
                    {importCampaignId && <div style={{ color: C.muted, fontSize: 11, marginTop: 8 }}>Campaign assignment adds a tag <code>campaign:&lt;name&gt;</code> to each contact — filter by that tag inside the campaign's audience.</div>}
                  </div>

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={function() { setImportRows(null); }} style={btnSecondary}>← Choose Different File</button>
                    <button onClick={handleRunImport} disabled={!canImport} style={{ ...btnPrimary, opacity: canImport ? 1 : 0.5, cursor: canImport ? 'pointer' : 'not-allowed' }}>🚀 Import {newCount} Contact{newCount === 1 ? '' : 's'}</button>
                  </div>
                </div>
              )}

              {/* Step 3: Progress */}
              {importing && (
                <div style={{ padding: 24, textAlign: "center" }}>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Importing… {importProgress.current} / {importProgress.total}</div>
                  <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 6, height: 8, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ width: (importProgress.total > 0 ? (100 * importProgress.current / importProgress.total) : 0) + '%', height: "100%", background: `linear-gradient(90deg, ${C.primary}, #00E676)`, transition: "width 0.2s" }} />
                  </div>
                  <div style={{ color: C.muted, fontSize: 12 }}>Inserting rows and redirecting FK references. Don't close this tab.</div>
                </div>
              )}

              {/* Step 4: Summary */}
              {importResult && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                    <div style={{ background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.3)", borderRadius: 10, padding: 14, textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: "#00E676" }}>{importResult.imported}</div>
                      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Imported</div>
                    </div>
                    <div style={{ background: "rgba(255,214,0,0.08)", border: "1px solid rgba(255,214,0,0.3)", borderRadius: 10, padding: 14, textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: "#FFD600" }}>{importResult.skipped}</div>
                      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Skipped (dupes)</div>
                    </div>
                    <div style={{ background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.3)", borderRadius: 10, padding: 14, textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: "#FF3B30" }}>{importResult.failed}</div>
                      <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 2 }}>Failed</div>
                    </div>
                  </div>
                  {(importResult.enrolled > 0 || importResult.campaign_tagged > 0) && (
                    <div style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>
                      {importResult.enrolled > 0 && <span>✓ Enrolled {importResult.enrolled} in sequence · </span>}
                      {importResult.campaign_tagged > 0 && <span>✓ Tagged {importResult.campaign_tagged} for campaign</span>}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={handleCloseImport} style={btnPrimary}>Done</button>
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          {showAddContact && (
            <div style={{ ...card, marginBottom: 20, border: `1px solid ${C.primary}44` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>Add Contact</h3>
                <button onClick={() => { setShowAddContact(false); setNewContact({ firstName: "", lastName: "", email: "", phone: "", phoneNumber: "", countryCode: "+1", company: "", status: "subscribed", channel_preference: "SMS" }); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18 }}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div><label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>First Name *</label><input value={newContact.firstName} onChange={e => setNewContact(p => ({ ...p, firstName: e.target.value }))} placeholder="John" style={inputStyle} /></div>
                <div><label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Last Name</label><input value={newContact.lastName} onChange={e => setNewContact(p => ({ ...p, lastName: e.target.value }))} placeholder="Doe" style={inputStyle} /></div>
                <div>
                  <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Phone *</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select value={newContact.countryCode || "+1"} onChange={e => setNewContact(p => ({ ...p, countryCode: e.target.value }))}
                      style={{ ...inputStyle, width: "110px", flexShrink: 0 }}>
                      {[
                        { code: "+1",   flag: "🇺🇸", label: "US/CA" },
                        { code: "+44",  flag: "🇬🇧", label: "UK" },
                        { code: "+61",  flag: "🇦🇺", label: "AU" },
                        { code: "+64",  flag: "🇳🇿", label: "NZ" },
                        { code: "+353", flag: "🇮🇪", label: "IE" },
                        { code: "+49",  flag: "🇩🇪", label: "DE" },
                        { code: "+33",  flag: "🇫🇷", label: "FR" },
                        { code: "+34",  flag: "🇪🇸", label: "ES" },
                        { code: "+39",  flag: "🇮🇹", label: "IT" },
                        { code: "+31",  flag: "🇳🇱", label: "NL" },
                        { code: "+32",  flag: "🇧🇪", label: "BE" },
                        { code: "+41",  flag: "🇨🇭", label: "CH" },
                        { code: "+43",  flag: "🇦🇹", label: "AT" },
                        { code: "+46",  flag: "🇸🇪", label: "SE" },
                        { code: "+47",  flag: "🇳🇴", label: "NO" },
                        { code: "+45",  flag: "🇩🇰", label: "DK" },
                        { code: "+358", flag: "🇫🇮", label: "FI" },
                        { code: "+351", flag: "🇵🇹", label: "PT" },
                        { code: "+30",  flag: "🇬🇷", label: "GR" },
                        { code: "+48",  flag: "🇵🇱", label: "PL" },
                        { code: "+420", flag: "🇨🇿", label: "CZ" },
                        { code: "+36",  flag: "🇭🇺", label: "HU" },
                        { code: "+40",  flag: "🇷🇴", label: "RO" },
                        { code: "+380", flag: "🇺🇦", label: "UA" },
                        { code: "+7",   flag: "🇷🇺", label: "RU" },
                        { code: "+90",  flag: "🇹🇷", label: "TR" },
                        { code: "+972", flag: "🇮🇱", label: "IL" },
                        { code: "+971", flag: "🇦🇪", label: "UAE" },
                        { code: "+966", flag: "🇸🇦", label: "SA" },
                        { code: "+974", flag: "🇶🇦", label: "QA" },
                        { code: "+965", flag: "🇰🇼", label: "KW" },
                        { code: "+973", flag: "🇧🇭", label: "BH" },
                        { code: "+968", flag: "🇴🇲", label: "OM" },
                        { code: "+91",  flag: "🇮🇳", label: "IN" },
                        { code: "+92",  flag: "🇵🇰", label: "PK" },
                        { code: "+880", flag: "🇧🇩", label: "BD" },
                        { code: "+94",  flag: "🇱🇰", label: "LK" },
                        { code: "+65",  flag: "🇸🇬", label: "SG" },
                        { code: "+60",  flag: "🇲🇾", label: "MY" },
                        { code: "+63",  flag: "🇵🇭", label: "PH" },
                        { code: "+66",  flag: "🇹🇭", label: "TH" },
                        { code: "+62",  flag: "🇮🇩", label: "ID" },
                        { code: "+84",  flag: "🇻🇳", label: "VN" },
                        { code: "+82",  flag: "🇰🇷", label: "KR" },
                        { code: "+81",  flag: "🇯🇵", label: "JP" },
                        { code: "+86",  flag: "🇨🇳", label: "CN" },
                        { code: "+852", flag: "🇭🇰", label: "HK" },
                        { code: "+886", flag: "🇹🇼", label: "TW" },
                        { code: "+55",  flag: "🇧🇷", label: "BR" },
                        { code: "+52",  flag: "🇲🇽", label: "MX" },
                        { code: "+54",  flag: "🇦🇷", label: "AR" },
                        { code: "+56",  flag: "🇨🇱", label: "CL" },
                        { code: "+57",  flag: "🇨🇴", label: "CO" },
                        { code: "+51",  flag: "🇵🇪", label: "PE" },
                        { code: "+58",  flag: "🇻🇪", label: "VE" },
                        { code: "+593", flag: "🇪🇨", label: "EC" },
                        { code: "+598", flag: "🇺🇾", label: "UY" },
                        { code: "+595", flag: "🇵🇾", label: "PY" },
                        { code: "+591", flag: "🇧🇴", label: "BO" },
                        { code: "+27",  flag: "🇿🇦", label: "ZA" },
                        { code: "+234", flag: "🇳🇬", label: "NG" },
                        { code: "+254", flag: "🇰🇪", label: "KE" },
                        { code: "+233", flag: "🇬🇭", label: "GH" },
                        { code: "+255", flag: "🇹🇿", label: "TZ" },
                        { code: "+256", flag: "🇺🇬", label: "UG" },
                        { code: "+251", flag: "🇪🇹", label: "ET" },
                        { code: "+212", flag: "🇲🇦", label: "MA" },
                        { code: "+216", flag: "🇹🇳", label: "TN" },
                        { code: "+213", flag: "🇩🇿", label: "DZ" },
                        { code: "+20",  flag: "🇪🇬", label: "EG" },
                      ].map(c => <option key={c.code} value={c.code}>{c.flag} {c.code} {c.label}</option>)}
                    </select>
                    <input value={newContact.phoneNumber || ""} onChange={e => setNewContact(p => ({ ...p, phoneNumber: e.target.value, phone: (p.countryCode || "+1") + e.target.value.replace(/\D/g, "") }))}
                      placeholder="555 123 4567" style={{ ...inputStyle, flex: 1 }} />
                  </div>
                </div>
                <div>
                  <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Email</label>
                  <input value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} placeholder="john@example.com" style={Object.assign({}, inputStyle, emailWarning ? { borderColor: '#FFD600' } : {})} />
                  {emailWarning && <div style={{ color: '#FFD600', fontSize: 11, marginTop: 4 }}>{emailWarning}</div>}
                </div>
                <div><label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Company</label><input value={newContact.company} onChange={e => setNewContact(p => ({ ...p, company: e.target.value }))} placeholder="Acme Inc" style={inputStyle} /></div>
                <div><label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 4 }}>Channel</label><select value={newContact.channel_preference} onChange={e => setNewContact(p => ({ ...p, channel_preference: e.target.value }))} style={inputStyle}>{CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}</select></div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => { setShowAddContact(false); setNewContact({ firstName: "", lastName: "", email: "", phone: "", company: "", status: "subscribed", channel_preference: "SMS" }); }} style={btnSecondary}>Cancel</button>
                <button onClick={handleAddContact} style={btnPrimary}>Save Contact</button>
              </div>
            </div>
          )}

          {!demoMode && contacts.length === 0 && !liveLoading && (
            <div style={{ ...card, textAlign: "center", padding: 48, marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 8 }}>No contacts yet</div>
              <div style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>Add your first contact to get started.</div>
              <button onClick={() => setShowAddContact(true)} style={btnPrimary}>+ Add Contact</button>
            </div>
          )}

          {liveLoading && <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading contacts...</div>}

          <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
            {SEGMENTS.slice(0, 6).map(s => (
              <button key={s.id} onClick={() => { setSelectedSegment(s.id); setPage(0); }} style={{ background: selectedSegment === s.id ? `${C.primary}22` : "rgba(255,255,255,0.03)", border: `1px solid ${selectedSegment === s.id ? C.primary : "rgba(255,255,255,0.06)"}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap", color: selectedSegment === s.id ? C.primary : C.muted, fontSize: 12, fontWeight: selectedSegment === s.id ? 700 : 400, fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s" }}>{s.icon} {s.name}</button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
            <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(0); }} placeholder="Search name, email, phone, company..." style={{ ...inputStyle, width: 300, padding: "10px 14px" }} />
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(0); }} style={{ ...inputStyle, width: 140 }}><option value="all">All Statuses</option>{STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select>
            <select value={filterTag} onChange={e => { setFilterTag(e.target.value); setPage(0); }} style={{ ...inputStyle, width: 130 }}><option value="all">All Tags</option>{TAGS.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <select value={filterChannel} onChange={e => { setFilterChannel(e.target.value); setPage(0); }} style={{ ...inputStyle, width: 140 }}><option value="all">All Channels</option>{CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}</select>
            <div style={{ marginLeft: "auto", color: C.muted, fontSize: 13 }}>{filtered.length} contact{filtered.length !== 1 ? "s" : ""}</div>
          </div>

          {selectedContacts.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: `${C.primary}11`, border: `1px solid ${C.primary}33`, borderRadius: 10, marginBottom: 12 }}>
              <span style={{ color: C.primary, fontSize: 13, fontWeight: 700 }}>{selectedContacts.length} selected</span>
              <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }}>🏷️ Add Tag</button>
              <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }}>🚀 Add to Campaign</button>
              <button style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12 }}>📤 Export</button>
              <button onClick={handleBulkDelete} disabled={deleting} style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12, color: "#FF3B30", borderColor: "rgba(255,59,48,0.3)" }}>{deleting ? "Deleting..." : "🗑 Delete"}</button>
              <button onClick={() => setSelectedContacts([])} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 12, marginLeft: "auto" }}>Clear</button>
            </div>
          )}

          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "40px 2fr 2fr 140px 100px 120px 90px 80px 80px", gap: 8, padding: "10px 16px", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div><input type="checkbox" checked={selectedContacts.length === paged.length && paged.length > 0} onChange={toggleSelectAll} style={{ cursor: "pointer" }} /></div>
              {[{ label: "Name", key: "name" }, { label: "Email", key: "email" }, { label: "Phone" }, { label: "Status" }, { label: "Tags" }, { label: "Open %", key: "openRate" }, { label: "LTV", key: "ltv" }, { label: "" }].map((h, i) => (
                <div key={i} onClick={() => h.key && handleSort(h.key)} style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, cursor: h.key ? "pointer" : "default", userSelect: "none" }}>
                  {h.label} {sortBy === h.key && (sortDir === "asc" ? "↑" : "↓")}
                </div>
              ))}
            </div>
            {paged.map(c => (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "40px 2fr 2fr 140px 100px 120px 90px 80px 80px", gap: 8, padding: "12px 16px", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.03)", cursor: "pointer", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedContacts.includes(c.id)} onChange={() => toggleSelect(c.id)} style={{ cursor: "pointer" }} /></div>
                <div onClick={() => { setSelectedContact(c); setView("detail"); }} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${C.primary}44, ${C.primary}22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: C.primary, flexShrink: 0 }}>{c.firstName[0]}{c.lastName[0]}</div>
                  <div><div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{c.firstName} {c.lastName}</div><div style={{ color: C.muted, fontSize: 11 }}>{c.company}</div></div>
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

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16 }}>
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12, opacity: page === 0 ? 0.3 : 1 }}>← Prev</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i : page < 3 ? i : page > totalPages - 4 ? totalPages - 7 + i : page - 3 + i;
                return <button key={p} onClick={() => setPage(p)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer", background: page === p ? C.primary : "rgba(255,255,255,0.04)", color: page === p ? "#000" : C.muted, fontWeight: page === p ? 700 : 400, fontSize: 13 }}>{p + 1}</button>;
              })}
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page === totalPages - 1} style={{ ...btnSecondary, padding: "6px 14px", fontSize: 12, opacity: page === totalPages - 1 ? 0.3 : 1 }}>Next →</button>
            </div>
          )}
        </>
      )}

      {activeTab === "segments" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: 0 }}>Segments & Smart Lists</h2>
            <button style={btnPrimary}>+ Create Segment</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
            {SEGMENTS.map(s => {
              const count = contacts.filter(s.filter).length;
              const pct = totalContacts > 0 ? ((count / totalContacts) * 100).toFixed(0) : "0";
              return (
                <div key={s.id} onClick={() => { setSelectedSegment(s.id); setActiveTab("contacts"); setPage(0); }} style={{ ...card, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 16, borderLeft: `4px solid ${C.primary}` }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}>
                  <div style={{ fontSize: 28, width: 44, textAlign: "center" }}>{s.icon}</div>
                  <div style={{ flex: 1 }}><div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{s.name}</div><div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{s.desc}</div></div>
                  <div style={{ textAlign: "right" }}><div style={{ color: "#fff", fontSize: 20, fontWeight: 800 }}>{count.toLocaleString()}</div><div style={{ color: C.primary, fontSize: 11, fontWeight: 600 }}>{pct}% of total</div></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "crm" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: 0 }}>CRM Integrations</h2>
            <button style={btnPrimary}>+ Connect CRM</button>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            {CRM_INTEGRATIONS.map(crm => (
              <div key={crm.id} style={{ ...card, display: "grid", gridTemplateColumns: "60px 1fr 140px 140px 120px 120px", alignItems: "center", gap: 16, borderLeft: `4px solid ${crm.status === "connected" ? "#00E676" : crm.status === "error" ? "#FF3B30" : "rgba(255,255,255,0.1)"}` }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: `${crm.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{crm.icon}</div>
                <div><div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{crm.name}</div><div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{crm.status === "connected" ? `Last sync: ${Math.round((Date.now() - crm.lastSync) / 60000)} min ago` : crm.status === "error" ? `Last attempt: ${Math.round((Date.now() - crm.lastSync) / 3600000)}h ago` : "Not configured"}</div></div>
                <div style={{ textAlign: "center" }}><div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>{crm.contacts > 0 ? crm.contacts.toLocaleString() : "—"}</div><div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase" }}>Contacts</div></div>
                <div style={{ textAlign: "center" }}><div style={{ color: crm.synced > 0 ? "#00E676" : C.muted, fontSize: 16, fontWeight: 700 }}>{crm.synced > 0 ? crm.synced.toLocaleString() : "—"}</div><div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase" }}>Synced</div></div>
                <div style={{ textAlign: "center" }}><span style={badge(crm.status === "connected" ? "#00E676" : crm.status === "error" ? "#FF3B30" : "#6B8BAE")}>{crm.status === "connected" ? "● Connected" : crm.status === "error" ? "● Error" : "○ Disconnected"}</span>{crm.errors > 0 && <div style={{ color: "#FF6B35", fontSize: 11, marginTop: 4 }}>{crm.errors} errors</div>}</div>
                <div style={{ textAlign: "right" }}>
                  {crm.status === "connected" && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><button style={{ ...btnSecondary, padding: "6px 12px", fontSize: 11 }}>🔄 Sync Now</button><button style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer" }}>Configure</button></div>}
                  {crm.status === "error" && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><button style={{ ...btnPrimary, padding: "6px 12px", fontSize: 11 }}>🔧 Fix</button></div>}
                  {crm.status === "disconnected" && <button style={{ ...btnPrimary, padding: "8px 16px", fontSize: 12 }}>Connect</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
