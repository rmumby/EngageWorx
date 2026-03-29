import React, { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const ROLES = ["Admin", "Campaign Manager", "Analyst", "Support Agent", "Read Only"];

const NOTIFICATION_PREFS = [
  { id: "np_1", label: "Campaign completed", email: true, push: true, sms: false },
  { id: "np_2", label: "Campaign failed", email: true, push: true, sms: true },
  { id: "np_3", label: "New contact signup", email: false, push: true, sms: false },
  { id: "np_4", label: "Webhook failure", email: true, push: true, sms: true },
  { id: "np_5", label: "API rate limit warning", email: true, push: false, sms: false },
  { id: "np_6", label: "Monthly usage report", email: true, push: false, sms: false },
  { id: "np_7", label: "New team member joined", email: true, push: true, sms: false },
  { id: "np_8", label: "Billing invoice ready", email: true, push: false, sms: false },
  { id: "np_9", label: "Message delivery errors spike", email: true, push: true, sms: true },
  { id: "np_10", label: "Security alert", email: true, push: true, sms: true },
];

const CHANNEL_DEFS = [
  { id: "sms", label: "SMS", icon: "💬", color: "#00C9FF", fields: [
    { key: "phone_country", label: "Country Code", type: "select", options: ["🇺🇸 US (+1)", "🇬🇧 UK (+44)", "🇨🇦 Canada (+1)", "🇦🇺 Australia (+61)", "🇩🇪 Germany (+49)", "🇫🇷 France (+33)", "🇪🇸 Spain (+34)", "🇮🇪 Ireland (+353)"] },
    { key: "phone_number", label: "Phone Number (without country code)", placeholder: "7869827800", aiAssist: true, aiContext: "SMS phone number field for a business — just confirm the number looks correct" },
    { key: "business_name", label: "Business Name (Sender ID)", placeholder: "Your Business Name", aiAssist: true, aiContext: "Business name used as SMS sender ID — suggest a clean, professional version" },
    { key: "opt_in_message", label: "Opt-In Confirmation Message", placeholder: "You're now subscribed to [Business] updates.", aiAssist: true, aiContext: "SMS opt-in confirmation message. Msg & data rates may apply. Reply STOP to unsubscribe. will be appended automatically — do not include it." },
    { key: "_rcs_note", label: "RCS Messaging", type: "note", text: "Your SMS number automatically upgrades to RCS on supported Android devices — richer messages, read receipts, and branded sender profile. No separate number needed. Register your RCS Business Agent in Settings to activate." },
    { key: "_byoc_toggle", label: "Enable BYOC (Bring Your Own Carrier)", type: "select", options: ["Disabled", "Enabled"], spOnly: true },
    { key: "account_sid", label: "Carrier Account SID", type: "password", spOnly: true, showWhen: "byoc" },
    { key: "auth_token", label: "Carrier Auth Token", type: "password", spOnly: true, showWhen: "byoc" },
    { key: "messaging_service_sid", label: "Messaging Service SID", type: "text", spOnly: true, showWhen: "byoc" },
  ]},
  { id: "email", label: "Email", icon: "📧", color: "#FF6B35", fields: [
    { key: "from_email", label: "From Email Address", placeholder: "hello@yourbusiness.com" },
    { key: "from_name", label: "From Name", placeholder: "Your Business Name" },
    { key: "_ai_note", label: "AI Settings", type: "note", text: "AI agent name and business knowledge are configured in the AI Chatbot Studio (sidebar menu). Changes there apply to all channels including email." },
    { key: "welcome_email_enabled", label: "Send Welcome Email to New Signups", type: "select", options: ["Enabled", "Disabled"] },
    { key: "welcome_email_from", label: "Welcome Email From Address", placeholder: "hello@yourcompany.com" },
    { key: "welcome_email_from_name", label: "Welcome Email From Name", placeholder: "Jane at Acme Corp" },
    { key: "welcome_email_onboarding_link", label: "Onboarding Call Link", placeholder: "https://calendly.com/yourname/30min" },
    { key: "welcome_email_ai_prompt", label: "AI Welcome Email Tone", type: "ai_tone", placeholder: "e.g. You are Jane, founder of Acme. Write a warm, personal 2-3 sentence welcome. Reference their company name and plan. Mention booking a call at https://calendly.com/yourlink. No URLs written out directly.", rows: 6 },
    { key: "api_key", label: "Email API Key (SP only)", type: "password", spOnly: true },
    { key: "domain", label: "Email Domain (SP only)", placeholder: "mail.yourdomain.com", spOnly: true },
  ]},
  { id: "whatsapp", label: "WhatsApp Business API", icon: "📱", color: "#25D366", fields: [
    { key: "business_account_id", label: "Business Account ID" },
    { key: "phone_number_id", label: "Phone Number ID" },
    { key: "access_token", label: "Access Token", type: "password" },
  ]},
  { id: "rcs", label: "RCS Business Messaging", icon: "✨", color: "#7C4DFF", fields: [
    { key: "agent_id", label: "Agent ID", placeholder: "brands/your-brand/agents/engage" },
    { key: "service_account", label: "Service Account Email" },
  ]},
  { id: "voice", label: "Voice", icon: "📞", color: "#FFD600", fields: [
    { key: "_ai_note", label: "AI Agent Settings", type: "note", text: "AI agent name and business knowledge are configured in the AI Chatbot Studio (sidebar menu). Changes there apply to all channels including voice." },
    { key: "phone_country", label: "Country", type: "select", options: ["🇺🇸 US (+1)", "🇬🇧 UK (+44)", "🇨🇦 Canada (+1)", "🇦🇺 Australia (+61)", "🇩🇪 Germany (+49)", "🇫🇷 France (+33)", "🇪🇸 Spain (+34)", "🇮🇪 Ireland (+353)"] },
    { key: "phone_number", label: "Phone Number (without country code)", placeholder: "7869827800" },
    { key: "tts_voice", label: "TTS Voice", type: "select", options: ["Polly.Joanna-Neural (US Female Natural)", "Polly.Joanna (US Female)", "Polly.Salli (US Female)", "Polly.Amy-Neural (UK Female Natural)", "Polly.Amy (UK Female)", "Polly.Emma (UK Female)", "Polly.Matthew-Neural (US Male Natural)", "Polly.Matthew (US Male)", "Polly.Joey (US Male)", "Polly.Brian-Neural (UK Male Natural)", "Polly.Brian (UK Male)", "Polly.Olivia-Neural (AU Female)", "Polly.Kajal-Neural (Indian English Female)"] },
    { key: "greeting", label: "During-Hours Greeting", placeholder: "Thank you for calling [Business]. Our AI assistant will help you now.", aiAssist: true, aiContext: "Professional during-hours phone greeting. Reference the business name naturally." },
    { key: "after_hours_greeting", label: "After-Hours Greeting", placeholder: "You've reached [Business]. We're currently closed. Please leave a message.", aiAssist: true, aiContext: "Professional after-hours phone greeting. Reference the business name naturally." },
    { key: "timezone", label: "Timezone", type: "select", options: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London"] },
    { key: "business_hours_start", label: "Open", placeholder: "9", hint: "24-hour format · 9 = 9:00 AM · 13 = 1:00 PM · 17 = 5:00 PM · 20.5 = 8:30 PM" },
    { key: "business_hours_end", label: "Close", placeholder: "17", hint: "24-hour format · 9 = 9:00 AM · 13 = 1:00 PM · 17 = 5:00 PM · 20.5 = 8:30 PM" },
    { key: "recording_enabled", label: "Call Recording", type: "select", options: ["Enabled", "Disabled"] },
  ]},
  { id: "mms", label: "MMS", icon: "📷", color: "#E040FB", fields: [
    { key: "max_media_size", label: "Max Media Size", type: "select", options: ["1 MB", "5 MB (default)", "10 MB"] },
  ]},
];

function TeamMembersTab({ C, viewLevel, currentTenantId, isSuperAdmin }) {
  const EW_SP_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';
  const [members, setMembers] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [allTenants, setAllTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState(currentTenantId || EW_SP_TENANT_ID);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('admin');
  const [saving, setSaving] = useState(null);

  const NOTIFY_FLAGS = [
    { key: 'notify_on_escalation', label: 'Ticket Escalations' },
    { key: 'notify_on_new_signup', label: 'New Signups' },
    { key: 'notify_on_payment', label: 'Payments' },
    { key: 'notify_on_new_lead', label: 'New Leads' },
  ];

  const isOwner = isSuperAdmin || viewLevel === 'sp';

  function canEdit(tenantId) {
    if (isSuperAdmin) return true;
    if (viewLevel === 'sp') return tenantId === EW_SP_TENANT_ID;
    return tenantId === currentTenantId;
  }

  useEffect(function() {
    if (isOwner) {
      supabase.from('tenants').select('id, name, tenant_type').order('name').then(function(r) {
        setAllTenants(r.data || []);
      });
    }
  }, [isOwner]);

  useEffect(function() {
    fetchMembers(selectedTenantId);
  }, [selectedTenantId]);

  async function fetchMembers(tenantId) {
    setLoading(true);
    try {
      var memberResult = await supabase.from('tenant_members').select('*').eq('tenant_id', tenantId).order('joined_at', { ascending: false });
      var memberData = memberResult.data || [];
      if (memberData.length === 0) { setMembers([]); setLoading(false); return; }
      var userIds = memberData.map(function(m) { return m.user_id; }).filter(Boolean);
      var profileResult = await supabase.from('user_profiles').select('id, email, full_name, company_name').in('id', userIds);
      var profileMap = {};
      (profileResult.data || []).forEach(function(p) { profileMap[p.id] = p; });
      setMembers(memberData.map(function(m) {
        var profile = profileMap[m.user_id] || {};
        return Object.assign({}, m, {
          email: profile.email || 'Unknown',
          full_name: profile.full_name || profile.company_name || profile.email || 'Unknown',
        });
      }));
    } catch (e) { console.error('fetchMembers error:', e); }
    setLoading(false);
  }

  async function toggleFlag(memberId, flag, currentVal) {
    setSaving(memberId + flag);
    var update = {};
    update[flag] = !currentVal;
    await supabase.from('tenant_members').update(update).eq('id', memberId);
    setMembers(function(prev) {
      return prev.map(function(m) {
        if (m.id !== memberId) return m;
        var updated = Object.assign({}, m);
        updated[flag] = !currentVal;
        return updated;
      });
    });
    setSaving(null);
  }

  async function updateRole(memberId, role) {
    await supabase.from('tenant_members').update({ role: role }).eq('id', memberId);
    setMembers(function(prev) {
      return prev.map(function(m) { return m.id === memberId ? Object.assign({}, m, { role: role }) : m; });
    });
  }

  async function removeMember(memberId) {
    if (!window.confirm('Remove this team member?')) return;
    await supabase.from('tenant_members').delete().eq('id', memberId);
    setMembers(function(prev) { return prev.filter(function(m) { return m.id !== memberId; }); });
  }

  async function inviteMember() {
    if (!inviteEmail) return;
    setSaving('invite');
    try {
      var profileRes = await supabase.from('user_profiles').select('id').eq('email', inviteEmail).single();
      if (!profileRes.data) { alert('No user found with that email. They must sign up first.'); setSaving(null); return; }
      var insertRes = await supabase.from('tenant_members').insert({
        tenant_id: selectedTenantId,
        user_id: profileRes.data.id,
        role: inviteRole,
        status: 'active',
        joined_at: new Date().toISOString(),
        notify_on_escalation: false,
        notify_on_new_signup: false,
        notify_on_payment: false,
        notify_on_new_lead: false,
      });
      if (insertRes.error) { alert('Error: ' + insertRes.error.message); setSaving(null); return; }
      setInviteEmail('');
      setShowInvite(false);
      fetchMembers(selectedTenantId);
    } catch (e) { alert('Error: ' + e.message); }
    setSaving(null);
  }

  var inputSt = { width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 12px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box', outline: 'none' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ color: '#fff', fontSize: 18, margin: 0 }}>Team Members</h2>
        {canEdit(selectedTenantId) && (
          <button onClick={function() { setShowInvite(!showInvite); }} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: 'none', borderRadius: 8, padding: '9px 18px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>+ Add Member</button>
        )}
      </div>

      {isOwner && allTenants.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 6, fontWeight: 700 }}>Viewing Team For</label>
          <select value={selectedTenantId} onChange={function(e) { setSelectedTenantId(e.target.value); }} style={{ ...inputSt, maxWidth: 320 }}>
            <option value={EW_SP_TENANT_ID}>EngageWorx (SP Admin)</option>
            {allTenants.filter(function(t) { return t.id !== EW_SP_TENANT_ID; }).sort(function(a,b) { return a.name.localeCompare(b.name); }).map(function(t) {
              return <option key={t.id} value={t.id}>{t.name}{t.tenant_type === 'csp' ? ' (CSP)' : t.tenant_type === 'agent' ? ' (Agent)' : ''}</option>;
            })}
          </select>
          {!canEdit(selectedTenantId) && (
            <div style={{ marginTop: 6, fontSize: 11, color: C.muted }}>👁 View only for this tenant</div>
          )}
        </div>
      )}

      {showInvite && canEdit(selectedTenantId) && (
        <div style={{ background: `${C.primary}08`, border: `1px solid ${C.primary}33`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 15 }}>Add Team Member</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>Email Address</label>
              <input value={inviteEmail} onChange={function(e) { setInviteEmail(e.target.value); }} placeholder="colleague@company.com" style={inputSt} />
            </div>
            <div>
              <label style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}>Role</label>
              <select value={inviteRole} onChange={function(e) { setInviteRole(e.target.value); }} style={inputSt}>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="agent">Support Agent</option>
                <option value="analyst">Analyst</option>
                <option value="readonly">Read Only</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={inviteMember} disabled={saving === 'invite'} style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.accent})`, border: 'none', borderRadius: 8, padding: '9px 18px', color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{saving === 'invite' ? 'Adding...' : 'Add Member'}</button>
            <button onClick={function() { setShowInvite(false); }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '9px 18px', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.muted }}>Loading team...</div>
      ) : members.length === 0 ? (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>👥</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No team members yet</div>
          <div style={{ color: C.muted, fontSize: 13 }}>Add team members to collaborate and manage notification preferences.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {members.map(function(m) {
            var initials = (m.full_name || m.email || '?').split(' ').map(function(w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase();
            var editable = canEdit(selectedTenantId);
            return (
              <div key={m.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: `linear-gradient(135deg, ${C.primary}44, ${C.primary}22)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: C.primary, flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1 }}>
                    {editingId === m.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <input defaultValue={m.full_name} onBlur={async function(e) {
                          await supabase.from('user_profiles').update({ full_name: e.target.value }).eq('id', m.user_id);
                          setMembers(function(prev) { return prev.map(function(x) { return x.id === m.id ? Object.assign({}, x, { full_name: e.target.value }) : x; }); });
                        }} placeholder="Display name" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '5px 8px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", width: '100%', boxSizing: 'border-box' }} />
                       <input defaultValue={m.notify_email || ''} onBlur={async function(e) {
  await supabase.from('tenant_members').update({ notify_email: e.target.value || null }).eq('id', m.id);
  setMembers(function(prev) { return prev.map(function(x) { return x.id === m.id ? Object.assign({}, x, { notify_email: e.target.value }) : x; }); });
}} placeholder="Notification email override (leave blank to use login email)" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '5px 8px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    ) : (
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{m.full_name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>{m.email}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {editable && (
                      <button onClick={function() { setEditingId(editingId === m.id ? null : m.id); }} style={{ background: editingId === m.id ? `${C.primary}22` : 'rgba(255,255,255,0.04)', border: `1px solid ${editingId === m.id ? C.primary + '44' : 'rgba(255,255,255,0.08)'}`, borderRadius: 6, padding: '5px 10px', color: editingId === m.id ? C.primary : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>✏️ {editingId === m.id ? 'Done' : 'Edit'}</button>
                    )}
                    {editable ? (
                      <select value={m.role || 'admin'} onChange={function(e) { updateRole(m.id, e.target.value); }} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '5px 8px', color: '#fff', fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer' }}>
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="agent">Support Agent</option>
                        <option value="analyst">Analyst</option>
                        <option value="readonly">Read Only</option>
                      </select>
                    ) : (
                      <span style={{ background: `${C.primary}22`, color: C.primary, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>{m.role}</span>
                    )}
                    {editable && (
                      <button onClick={function() { removeMember(m.id); }} style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid rgba(255,59,48,0.2)', borderRadius: 6, padding: '5px 10px', color: '#FF3B30', cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>Remove</button>
                    )}
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>📧 Email Notifications</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {NOTIFY_FLAGS.map(function(flag) {
                      var isOn = m[flag.key] || false;
                      var isSavingThis = saving === m.id + flag.key;
                      return (
                        <button key={flag.key} onClick={editable ? function() { toggleFlag(m.id, flag.key, isOn); } : undefined} disabled={!editable || isSavingThis} style={{
                          background: isOn ? `${C.primary}22` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${isOn ? C.primary + '55' : 'rgba(255,255,255,0.08)'}`,
                          borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 600,
                          color: isOn ? C.primary : 'rgba(255,255,255,0.3)',
                          cursor: editable ? 'pointer' : 'default',
                          fontFamily: "'DM Sans', sans-serif", transition: 'all 0.2s',
                          opacity: isSavingThis ? 0.5 : 1,
                        }}>{isOn ? '✓ ' : ''}{flag.label}</button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>💬 Other Channels <span style={{ background: '#FFD60022', color: '#FFD600', borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700, marginLeft: 6 }}>COMING SOON</span></div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['💬 SMS', '📱 WhatsApp', '✨ RCS'].map(function(ch) {
                      return <button key={ch} disabled style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, padding: '5px 12px', fontSize: 11, color: 'rgba(255,255,255,0.2)', cursor: 'not-allowed', fontFamily: "'DM Sans', sans-serif" }}>{ch}</button>;
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function Settings({ C, tenants, viewLevel = "tenant", currentTenantId, demoMode = true }) {
  const [activeTab, setActiveTab] = useState("api");
  const [topupLoading, setTopupLoading] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [stripePlan, setStripePlan] = useState(null);
  const [stripeStatus, setStripeStatus] = useState(null);
  const [usageData, setUsageData] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setUserEmail(data.user.email);
        fetch(`/api/billing?action=status&email=${encodeURIComponent(data.user.email)}`)
          .then(r => r.json())
          .then(status => {
            if (status.plan) setStripePlan(status.plan);
            if (status.status) setStripeStatus(status.status);
          })
          .catch(() => {});
      }
    });
  }, []);

  useEffect(() => {
    if (activeTab !== "billing") return;
    (async () => {
      try {
        var results = await Promise.all([
          supabase.from("messages").select("id", { count: "exact", head: true }),
          supabase.from("contacts").select("id", { count: "exact", head: true }),
          supabase.from("campaigns").select("id", { count: "exact", head: true }),
          supabase.from("tenant_members").select("id", { count: "exact", head: true }),
          supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("status", "active"),
        ]);
        setUsageData({
          messages: results[0].count || 0,
          contacts: results[1].count || 0,
          campaigns: results[2].count || 0,
          members: results[3].count || 0,
          apiKeys: results[4].count || 0,
        });
      } catch (err) {
        setUsageData({ messages: 0, contacts: 0, campaigns: 0, members: 0, apiKeys: 0 });
      }
    })();
  }, [activeTab]);

  const SMS_TOPUPS = [
    { id: "topup_500", name: "500 SMS", credits: 500, price: "$15.00", priceId: "price_1T4OfbPEs1sluBAUCYOGvoDQ", perSms: "$0.03" },
    { id: "topup_2000", name: "2,000 SMS", credits: 2000, price: "$45.00", priceId: "price_1T6x6sPEs1sluBAUwaBzwHxA", perSms: "$0.0225", savings: "10% off" },
    { id: "topup_5000", name: "5,000 SMS", credits: 5000, price: "$100.00", priceId: "price_1T4OgUPEs1sluBAUZ24cjbfP", perSms: "$0.02", savings: "20% off" },
  ];

  const handleTopup = async (topup) => {
    setTopupLoading(topup.id);
    try {
      const response = await fetch("/api/billing?action=checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: topup.priceId, email: userEmail, mode: "payment", successUrl: window.location.href + "?topup=success", cancelUrl: window.location.href }),
      });
      const data = await response.json();
      if (data.url) { window.location.href = data.url; } else { alert("Error creating checkout session"); }
    } catch (err) { alert("Error: " + err.message); }
    finally { setTopupLoading(null); }
  };

  const [upgradeLoading, setUpgradeLoading] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const PLANS = [
    { id: "starter", name: "Starter", price: "$99", priceId: "price_1T4OeIPEs1sluBAUuRIaD8Cq", features: ["1 phone number", "1,000 SMS/month", "AI bot included", "Overage: $0.025/SMS"] },
    { id: "growth", name: "Growth", price: "$249", priceId: "price_1T4OefPEs1sluBAUuZVAaBJ3", features: ["3 phone numbers", "5,000 SMS/month", "AI bot included", "Overage: $0.025/SMS"], popular: true },
    { id: "pro", name: "Pro", price: "$499", priceId: "price_1T4Of6PEs1sluBAURFjaViRv", features: ["10 phone numbers", "20,000 SMS/month", "AI bot included", "Overage: $0.025/SMS"] },
  ];

  const tenantsArray = Array.isArray(tenants) ? tenants : Object.values(tenants || {});
  const currentTenant = tenantsArray.find(t => t.id === currentTenantId) || tenantsArray[0];
  const currentPlanId = stripePlan || currentTenant?.plan || currentTenant?.billing_plan || "starter";
  const currentPlanInfo = PLANS.find(p => p.id === currentPlanId.toLowerCase()) || PLANS[0];
  const planStatus = stripeStatus === "trialing" ? "Trial" : stripeStatus === "active" ? "Active" : stripePlan ? "Active" : "Active";

  const handleUpgrade = async (plan) => {
    setUpgradeLoading(plan.id);
    try {
      const response = await fetch("/api/billing?action=checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.id, email: userEmail, successUrl: window.location.href + "?upgrade=success", cancelUrl: window.location.href }),
      });
      const data = await response.json();
      if (data.url) { window.location.href = data.url; } else { alert("Error: " + (data.error || "Could not create checkout session")); }
    } catch (err) { alert("Error: " + err.message); }
    finally { setUpgradeLoading(null); }
  };

  const handleManageBilling = async () => {
    try {
      const response = await fetch("/api/billing?action=portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: userEmail }) });
      const data = await response.json();
      if (data.url) { window.location.href = data.url; } else { alert("Error: " + (data.error || "Could not open billing portal")); }
    } catch (err) { alert("Error: " + err.message); }
  };

  const [showNewKey, setShowNewKey] = useState(false);
  const [showNewWebhook, setShowNewWebhook] = useState(false);
  const [notifications, setNotifications] = useState(NOTIFICATION_PREFS);

  const [liveApiKeys, setLiveApiKeys] = useState([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [newKeyData, setNewKeyData] = useState({ name: "", environment: "production", permissions: ["messages"] });
  const [generatedKey, setGeneratedKey] = useState(null);
  const ALL_PERMISSIONS = ["messages", "contacts", "campaigns", "analytics", "webhooks", "flows", "settings"];

  const loadApiKeys = async () => {
    setApiKeysLoading(true);
    try {
      const { data, error } = await supabase.from("api_keys").select("*").order("created_at", { ascending: false });
      if (!error && data) setLiveApiKeys(data);
    } catch (err) { console.error("Failed to load API keys:", err); }
    setApiKeysLoading(false);
  };
  useEffect(() => { if (activeTab === "api") loadApiKeys(); }, [activeTab]);

  const generateApiKey = async () => {
    if (!newKeyData.name) return alert("Key name is required");
    const tenantRow = await supabase.from("tenants").select("id").limit(1);
    const tenantId = currentTenantId || tenantRow?.data?.[0]?.id;
    if (!tenantId) return alert("No tenant found");
    const envPrefix = newKeyData.environment === "production" ? "ewx_live_" : newKeyData.environment === "staging" ? "ewx_test_" : "ewx_dev_";
    const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(36)).join("").slice(0, 32);
    const fullKey = envPrefix + randomPart;
    const keyPrefix = fullKey.slice(0, 12);
    const { error } = await supabase.from("api_keys").insert({ tenant_id: tenantId, name: newKeyData.name, key_prefix: keyPrefix, key_hash: fullKey, environment: newKeyData.environment, permissions: newKeyData.permissions });
    if (error) return alert("Error creating key: " + error.message);
    setGeneratedKey(fullKey);
    setNewKeyData({ name: "", environment: "production", permissions: ["messages"] });
    setShowNewKey(false);
    loadApiKeys();
  };

  const revokeApiKey = async (id) => {
    if (!window.confirm("Revoke this API key? Any integrations using it will stop working.")) return;
    const { error } = await supabase.from("api_keys").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) return alert("Error revoking key: " + error.message);
    loadApiKeys();
  };

  const deleteApiKey = async (id) => {
    if (!window.confirm("Permanently delete this API key?")) return;
    const { error } = await supabase.from("api_keys").delete().eq("id", id);
    if (error) return alert("Error deleting: " + error.message);
    loadApiKeys();
  };

  const [auditLog, setAuditLog] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const loadAuditLog = async () => {
    setAuditLoading(true);
    try {
      const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(20);
      if (!error && data) setAuditLog(data);
    } catch (err) { console.error("Failed to load audit log:", err); }
    setAuditLoading(false);
  };
  useEffect(() => { if (activeTab === "security") loadAuditLog(); }, [activeTab]);

  const AUDIT_ICONS = { "api_key.created": "🔑", "api_key.revoked": "🔑", "team.invited": "👤", "team.removed": "👤", "password.changed": "🔒", "2fa.enabled": "🛡️", "2fa.disabled": "🛡️", "login.success": "✅", "login.failed": "🚫", "webhook.created": "🔗", "channel.updated": "📡", "campaign.created": "📣", default: "📋" };

  const [channelConfigs, setChannelConfigs] = useState({});
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelSaving, setChannelSaving] = useState(null);
  const [aiTonePreviews, setAiTonePreviews] = useState({});

  const loadChannelConfigs = async () => {
  setChannelsLoading(true);
  try {
    const tenantRow = await supabase.from("tenants").select("id").limit(1);
    const tenantId = currentTenantId || tenantRow?.data?.[0]?.id;
    const { data, error } = await supabase.from("channel_configs").select("*").eq("tenant_id", tenantId);
      if (!error && data) {
        const map = {};
        data.forEach(c => { map[c.channel] = c; });
        setChannelConfigs(map);
      }
    } catch (err) { console.error("Failed to load channel configs:", err); }
    setChannelsLoading(false);
  };
  useEffect(() => { if (activeTab === "channels") loadChannelConfigs(); }, [activeTab]);

  const saveChannelConfig = async (channelId, config, enabled) => {
    setChannelSaving(channelId);
    const tenantRow = await supabase.from("tenants").select("id").limit(1);
    const tenantId = currentTenantId || tenantRow?.data?.[0]?.id;
    if (!tenantId) { setChannelSaving(null); return alert("No tenant found"); }
    const existing = channelConfigs[channelId];
    // Preserve existing config when just toggling enabled state
    const existingConfig = existing?.config_encrypted || {};
    const newConfig = config !== undefined ? config : existingConfig;
    const newEnabled = enabled !== undefined ? enabled : (existing?.enabled || false);
    const payload = {
      tenant_id: tenantId,
      channel: channelId,
      enabled: newEnabled,
      config_encrypted: newConfig,
      status: newEnabled ? "connected" : "disconnected",
      updated_at: new Date().toISOString()
    };
    let error;
    if (existing) {
      ({ error } = await supabase.from("channel_configs").update(payload).eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("channel_configs").insert(payload));
    }
    if (error) alert("Error saving: " + error.message);
    else loadChannelConfigs();
    setChannelSaving(null);
  };

  const updateChannelField = (channelId, key, value) => {
    setChannelConfigs(prev => {
      const existing = prev[channelId] || { config_encrypted: {} };
      return { ...prev, [channelId]: { ...existing, config_encrypted: { ...existing.config_encrypted, [key]: value } } };
    });
  };

  const aiAssistField = async (channelId, fieldKey, currentValue, aiContext, businessName) => {
    try {
      const res = await fetch("/api/ai-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 150,
          messages: [{ role: "user", content: `Improve this for ${businessName || "our business"}: "${currentValue}". Context: ${aiContext}. Return only the improved text, no explanation.` }]
        })
      });
      const data = await res.json();
      const improved = (data.content || []).find(b => b.type === "text")?.text || "";
      if (improved) updateChannelField(channelId, fieldKey, improved.trim());
    } catch (e) { alert("AI assist failed. Try again."); }
  };

  const aiTonePreview = async (tone, businessName, setPreview) => {
    try {
      const res = await fetch("/api/ai-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 200,
          messages: [{ role: "user", content: `Write a sample welcome email opening in this tone: "${tone || "warm and professional"}". Company: ${businessName || "our business"}. 2-3 sentences, no sign-off, no subject line.` }]
        })
      });
      const data = await res.json();
      const preview = (data.content || []).find(b => b.type === "text")?.text || "";
      setPreview(preview);
    } catch (e) { alert("AI preview failed. Try again."); }
  };

  const [liveWebhooks, setLiveWebhooks] = useState([]);
  const [webhooksLoading, setWebhooksLoading] = useState(true);
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [newWebhookData, setNewWebhookData] = useState({ name: "", url: "", events: [], secret: "", retry_policy: "3_exponential" });
  const [webhookTestResult, setWebhookTestResult] = useState({});
  const ALL_EVENTS = ["message.sent", "message.delivered", "message.failed", "message.replied", "contact.created", "contact.updated", "contact.deleted", "campaign.started", "campaign.completed", "campaign.paused", "invoice.created", "payment.received"];

  const loadWebhooks = async () => {
    setWebhooksLoading(true);
    try {
      const { data, error } = await supabase.from("webhooks").select("*").order("created_at", { ascending: false });
      if (!error && data) setLiveWebhooks(data);
    } catch (err) { console.error("Failed to load webhooks:", err); }
    setWebhooksLoading(false);
  };
  useEffect(() => { if (activeTab === "webhooks") loadWebhooks(); }, [activeTab]);

  const generateSecret = () => "whsec_" + Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, "0")).join("");

  const createWebhook = async () => {
    if (!newWebhookData.name || !newWebhookData.url) return alert("Name and URL are required");
    if (!newWebhookData.url.startsWith("https://")) return alert("Webhook URL must use HTTPS");
    if (newWebhookData.events.length === 0) return alert("Select at least one event");
    const secret = newWebhookData.secret || generateSecret();
    const tenantRow = await supabase.from("tenants").select("id").limit(1);
    const tenantId = currentTenantId || tenantRow?.data?.[0]?.id;
    if (!tenantId) return alert("No tenant found");
    const { error } = await supabase.from("webhooks").insert({ tenant_id: tenantId, name: newWebhookData.name, url: newWebhookData.url, events: newWebhookData.events, secret, retry_policy: newWebhookData.retry_policy, status: "active" });
    if (error) return alert("Error creating webhook: " + error.message);
    setNewWebhookData({ name: "", url: "", events: [], secret: "", retry_policy: "3_exponential" });
    setShowNewWebhook(false);
    loadWebhooks();
  };

  const updateWebhook = async () => {
    if (!editingWebhook) return;
    const { error } = await supabase.from("webhooks").update({ name: editingWebhook.name, url: editingWebhook.url, events: editingWebhook.events, retry_policy: editingWebhook.retry_policy }).eq("id", editingWebhook.id);
    if (error) return alert("Error updating webhook: " + error.message);
    setEditingWebhook(null);
    loadWebhooks();
  };

  const deleteWebhook = async (id) => {
    if (!window.confirm("Delete this webhook? This cannot be undone.")) return;
    const { error } = await supabase.from("webhooks").delete().eq("id", id);
    if (error) return alert("Error deleting webhook: " + error.message);
    loadWebhooks();
  };

  const toggleWebhookStatus = async (wh) => {
    const newStatus = wh.status === "active" ? "paused" : "active";
    const { error } = await supabase.from("webhooks").update({ status: newStatus }).eq("id", wh.id);
    if (error) return alert("Error updating status: " + error.message);
    loadWebhooks();
  };

  const testWebhook = async (wh) => {
    setWebhookTestResult({ ...webhookTestResult, [wh.id]: "testing" });
    try {
      const res = await fetch(wh.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Secret": wh.secret || "" }, body: JSON.stringify({ event: "test.ping", timestamp: new Date().toISOString(), data: { message: "EngageWorx webhook test" } }) });
      setWebhookTestResult({ ...webhookTestResult, [wh.id]: res.ok ? "success" : `failed (${res.status})` });
    } catch (err) { setWebhookTestResult({ ...webhookTestResult, [wh.id]: "failed (network)" }); }
    setTimeout(() => setWebhookTestResult(prev => { const n = { ...prev }; delete n[wh.id]; return n; }), 5000);
  };

  const inputStyle = { width: "100%", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", outline: "none" };
  const btnPrimary = { background: `linear-gradient(135deg, ${C.primary}, ${C.accent || C.primary})`, border: "none", borderRadius: 10, padding: "10px 20px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const btnSec = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 20px", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" };
  const btnAI = { background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 6, padding: "5px 12px", color: "#a5b4fc", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginTop: 6 };
  const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 22 };
  const badge = (color) => ({ display: "inline-block", background: color + "18", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 });
  const label = { color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, display: "block", fontWeight: 700 };

  const toggleNotif = (id, channel) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, [channel]: !n[channel] } : n));
  };

  const Toggle = ({ enabled, color }) => (
    <div style={{ width: 36, height: 20, borderRadius: 10, cursor: "pointer", background: enabled ? (color || C.primary) : "rgba(255,255,255,0.1)", position: "relative", transition: "all 0.2s", flexShrink: 0 }}>
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: enabled ? 18 : 2, transition: "all 0.2s" }} />
    </div>
  );

  // ── Channel field renderer ────────────────────────────────────────────────
  const renderChannelField = (ch, f, configData) => {
    const businessName = configData["business_name"] || configData["from_name"] || "";

    if (f.type === "note") {
      return (
        <div style={{ background: "rgba(0,201,255,0.06)", border: "1px solid rgba(0,201,255,0.2)", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: "#6B8BAE", lineHeight: 1.6 }}>
          <div>ℹ️ {f.text}</div>
          <div style={{ marginTop: 6, color: "#00C9FF", fontWeight: 600, fontSize: 11 }}>→ Click "AI Chatbot" in the sidebar to configure</div>
        </div>
      );
    }

   if (f.type === "ai_tone") {
  const previewKey = ch.id + "_" + f.key;
  const preview = aiTonePreviews[previewKey] || "";
  return (
    <div>
      <textarea value={configData[f.key] || ""} onChange={e => updateChannelField(ch.id, f.key, e.target.value)} placeholder={f.placeholder || ""} rows={f.rows || 5} style={{ ...inputStyle, resize: "vertical", minHeight: 100 }} />
      <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => aiTonePreview(configData[f.key], businessName, (p) => setAiTonePreviews(prev => ({ ...prev, [previewKey]: p })))} style={btnAI}>✨ Preview Tone</button>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Describe your style — AI will write in that voice</span>
      </div>
      {preview && (
        <div style={{ marginTop: 10, background: "rgba(0,201,255,0.06)", border: "1px solid rgba(0,201,255,0.2)", borderRadius: 8, padding: "12px 14px", fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, fontStyle: "italic" }}>
          <div style={{ color: "#00C9FF", fontSize: 10, fontWeight: 700, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>AI Preview</div>
          {preview}
          <button onClick={() => setAiTonePreviews(prev => ({ ...prev, [previewKey]: "" }))} style={{ display: "block", background: "none", border: "none", color: "rgba(255,255,255,0.25)", fontSize: 10, cursor: "pointer", marginTop: 8, padding: 0 }}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

    if (f.type === "select") {
      return (
        <select value={configData[f.key] || f.options?.[0] || ""} onChange={e => updateChannelField(ch.id, f.key, e.target.value)} style={inputStyle}>
          {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }

    if (f.type === "textarea") {
      return (
        <div>
          <textarea value={configData[f.key] || ""} onChange={e => updateChannelField(ch.id, f.key, e.target.value)} placeholder={f.placeholder || ""} rows={4} style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} />
          {f.aiAssist && (
            <button onClick={() => aiAssistField(ch.id, f.key, configData[f.key] || "", f.aiContext || "", businessName)} style={btnAI}>✨ AI Assist</button>
          )}
        </div>
      );
    }

    return (
      <div>
        <input type={f.type || "text"} value={configData[f.key] || ""} onChange={e => updateChannelField(ch.id, f.key, e.target.value)} placeholder={f.placeholder || ""} style={inputStyle} />
        {f.hint && <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{f.hint}</div>}
        {f.aiAssist && (
          <button onClick={() => aiAssistField(ch.id, f.key, configData[f.key] || "", f.aiContext || "", businessName)} style={btnAI}>✨ AI Assist</button>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: 0 }}>Settings</h1>
        <p style={{ color: C.muted, marginTop: 4, fontSize: 14 }}>API keys, integrations, channels, billing & team management</p>
      </div>

      <div style={{ display: "flex", gap: 2, marginBottom: 24, overflowX: "auto", paddingBottom: 4 }}>
        {[
          { id: "api", label: "API Keys", icon: "🔑" },
          { id: "webhooks", label: "Webhooks", icon: "🔗" },
          { id: "channels", label: "Channels", icon: "📡" },
          { id: "billing", label: "Billing", icon: "💳" },
          { id: "team", label: "Team", icon: "👥" },
          { id: "notifications", label: "Notifications", icon: "🔔" },
          { id: "security", label: "Security", icon: "🔒" },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: activeTab === t.id ? C.primary : "rgba(255,255,255,0.04)",
            border: activeTab === t.id ? "none" : "1px solid rgba(255,255,255,0.06)",
            borderRadius: 8, padding: "8px 16px", color: activeTab === t.id ? "#000" : C.muted,
            fontWeight: activeTab === t.id ? 700 : 400, cursor: "pointer", fontSize: 13,
            fontFamily: "'DM Sans', sans-serif", transition: "all 0.2s", whiteSpace: "nowrap",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* ═══════════ API KEYS TAB ═══════════ */}
      {activeTab === "api" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>API Keys</h2>
            <button onClick={() => { setShowNewKey(!showNewKey); setGeneratedKey(null); }} style={btnPrimary}>+ Generate Key</button>
          </div>
          {generatedKey && (
            <div style={{ ...card, marginBottom: 16, border: "1px solid #00E67644", background: "#00E67608" }}>
              <div style={{ color: "#00E676", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>✓ API Key Generated — Copy it now! It won't be shown again.</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ flex: 1, background: "rgba(0,0,0,0.4)", padding: "10px 14px", borderRadius: 8, color: C.primary, fontSize: 13, fontFamily: "monospace", wordBreak: "break-all" }}>{generatedKey}</code>
                <button onClick={() => { navigator.clipboard.writeText(generatedKey); }} style={{ ...btnPrimary, padding: "10px 16px", whiteSpace: "nowrap" }}>Copy</button>
              </div>
              <button onClick={() => setGeneratedKey(null)} style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer", marginTop: 8 }}>Dismiss</button>
            </div>
          )}
          {showNewKey && (
            <div style={{ ...card, marginBottom: 16, border: `1px solid ${C.primary}44` }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Generate New API Key</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div><label style={label}>Key Name</label><input value={newKeyData.name} onChange={e => setNewKeyData({ ...newKeyData, name: e.target.value })} placeholder="e.g. Production API Key" style={inputStyle} /></div>
                <div><label style={label}>Environment</label><select value={newKeyData.environment} onChange={e => setNewKeyData({ ...newKeyData, environment: e.target.value })} style={inputStyle}><option value="production">Production</option><option value="staging">Staging</option><option value="development">Development</option></select></div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Permissions</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {ALL_PERMISSIONS.map(p => (
                    <label key={p} onClick={() => { const perms = newKeyData.permissions.includes(p) ? newKeyData.permissions.filter(x => x !== p) : [...newKeyData.permissions, p]; setNewKeyData({ ...newKeyData, permissions: perms }); }} style={{ display: "flex", alignItems: "center", gap: 4, borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 11, background: newKeyData.permissions.includes(p) ? `${C.primary}22` : "rgba(255,255,255,0.04)", border: `1px solid ${newKeyData.permissions.includes(p) ? C.primary : "rgba(255,255,255,0.08)"}`, color: newKeyData.permissions.includes(p) ? C.primary : "rgba(255,255,255,0.5)" }}>{newKeyData.permissions.includes(p) ? "✓" : "○"} {p}</label>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={generateApiKey} style={btnPrimary}>Generate Key</button>
                <button onClick={() => setShowNewKey(false)} style={btnSec}>Cancel</button>
              </div>
            </div>
          )}
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={label}>Base URL</label>
                <div style={{ ...inputStyle, background: "rgba(0,0,0,0.4)", fontFamily: "monospace", fontSize: 13, color: C.primary, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>https://api.engwx.com/v1</span>
                  <button onClick={() => navigator.clipboard.writeText("https://api.engwx.com/v1")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11 }}>Copy</button>
                </div>
              </div>
              <div><label style={label}>API Version</label><div style={{ ...inputStyle, background: "rgba(0,0,0,0.4)", color: "rgba(255,255,255,0.5)" }}>v1 (Latest)</div></div>
            </div>
          </div>
          {apiKeysLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading API keys...</div>
          ) : liveApiKeys.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No API keys yet</div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Generate your first API key to start integrating with EngageWorx.</div>
              <button onClick={() => setShowNewKey(true)} style={btnPrimary}>Generate Key</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {liveApiKeys.map(key => (
                <div key={key.id} style={{ ...card, display: "grid", gridTemplateColumns: "1fr 160px 140px 100px auto", alignItems: "center", gap: 14, opacity: key.status === "revoked" ? 0.5 : 1, borderLeft: `4px solid ${key.status === "active" ? "#00E676" : "#FF3B30"}` }}>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{key.name}</div>
                    <div style={{ fontFamily: "monospace", color: C.primary, fontSize: 12, marginTop: 2 }}>{key.key_prefix}...••••••</div>
                    <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 2 }}>{key.environment} · Created {new Date(key.created_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{(key.permissions || []).map(p => (<span key={p} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, padding: "1px 6px", fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{p}</span>))}</div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Used: {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : "Never"}</div>
                  <div><span style={badge(key.status === "active" ? "#00E676" : "#FF3B30")}>{key.status === "active" ? "● Active" : "● Revoked"}</span></div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {key.status === "active" && <button onClick={() => revokeApiKey(key.id)} style={{ ...btnSec, padding: "6px 10px", fontSize: 11 }}>Revoke</button>}
                    {key.status === "revoked" && <button onClick={() => deleteApiKey(key.id)} style={{ ...btnSec, padding: "6px 10px", fontSize: 11, color: "#FF3B30" }}>Delete</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ WEBHOOKS TAB ═══════════ */}
      {activeTab === "webhooks" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h2 style={{ color: "#fff", fontSize: 18, margin: 0 }}>Webhooks</h2>
            <button onClick={() => { setShowNewWebhook(!showNewWebhook); setEditingWebhook(null); }} style={btnPrimary}>+ Add Webhook</button>
          </div>
          {(showNewWebhook || editingWebhook) && (() => {
            const isEdit = !!editingWebhook;
            const data = isEdit ? editingWebhook : newWebhookData;
            const setData = isEdit ? (updates) => setEditingWebhook({ ...editingWebhook, ...updates }) : (updates) => setNewWebhookData({ ...newWebhookData, ...updates });
            const toggleEvent = (ev) => { const events = data.events.includes(ev) ? data.events.filter(e => e !== ev) : [...data.events, ev]; setData({ events }); };
            return (
              <div style={{ ...card, marginBottom: 16, border: `1px solid ${C.primary}44` }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>{isEdit ? "Edit Webhook" : "New Webhook Endpoint"}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div><label style={label}>Name</label><input value={data.name} onChange={e => setData({ name: e.target.value })} placeholder="e.g. CRM Sync" style={inputStyle} /></div>
                  <div><label style={label}>URL (HTTPS required)</label><input value={data.url} onChange={e => setData({ url: e.target.value })} placeholder="https://your-domain.com/webhook" style={inputStyle} /></div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={label}>Events</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ALL_EVENTS.map(ev => (
                      <label key={ev} onClick={() => toggleEvent(ev)} style={{ display: "flex", alignItems: "center", gap: 4, borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontFamily: "monospace", background: data.events.includes(ev) ? `${C.primary}22` : "rgba(255,255,255,0.04)", border: `1px solid ${data.events.includes(ev) ? C.primary : "rgba(255,255,255,0.08)"}`, color: data.events.includes(ev) ? C.primary : "rgba(255,255,255,0.5)" }}>{data.events.includes(ev) ? "✓" : "○"} {ev}</label>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button onClick={() => setData({ events: [...ALL_EVENTS] })} style={{ background: "none", border: "none", color: C.primary, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Select All</button>
                    <button onClick={() => setData({ events: [] })} style={{ background: "none", border: "none", color: C.muted, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>Clear</button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={label}>Signing Secret</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={data.secret || ""} onChange={e => setData({ secret: e.target.value })} placeholder="Auto-generated on create" style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }} />
                      {!isEdit && <button onClick={() => setData({ secret: generateSecret() })} style={{ ...btnSec, padding: "8px 12px", fontSize: 11, whiteSpace: "nowrap" }}>Generate</button>}
                    </div>
                  </div>
                  <div>
                    <label style={label}>Retry Policy</label>
                    <select value={data.retry_policy || "3_exponential"} onChange={e => setData({ retry_policy: e.target.value })} style={inputStyle}>
                      <option value="3_exponential">3 retries with exponential backoff</option>
                      <option value="5_linear">5 retries with linear backoff</option>
                      <option value="none">No retries</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={isEdit ? updateWebhook : createWebhook} style={btnPrimary}>{isEdit ? "Save Changes" : "Create Webhook"}</button>
                  <button onClick={() => { setShowNewWebhook(false); setEditingWebhook(null); }} style={btnSec}>Cancel</button>
                  {isEdit && <button onClick={() => { deleteWebhook(editingWebhook.id); setEditingWebhook(null); }} style={{ ...btnSec, color: "#FF3B30", borderColor: "#FF3B3044" }}>Delete</button>}
                </div>
              </div>
            );
          })()}
          {webhooksLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading webhooks...</div>
          ) : liveWebhooks.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No webhooks configured</div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Webhooks let you receive real-time notifications when events happen in your account.</div>
              <button onClick={() => setShowNewWebhook(true)} style={btnPrimary}>Create Your First Webhook</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {liveWebhooks.map(wh => {
                const successRate = wh.total_deliveries > 0 ? Math.round((wh.successful_deliveries / wh.total_deliveries) * 1000) / 10 : null;
                const lastTriggered = wh.last_triggered_at ? new Date(wh.last_triggered_at).toLocaleString() : "Never";
                const testStatus = webhookTestResult[wh.id];
                return (
                  <div key={wh.id} style={{ ...card, display: "grid", gridTemplateColumns: "1fr 120px 140px 80px auto", alignItems: "center", gap: 14, borderLeft: `4px solid ${wh.status === "active" ? "#00E676" : wh.status === "failed" ? "#FF3B30" : "#FFD600"}` }}>
                    <div>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{wh.name}</div>
                      <div style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wh.url}</div>
                      <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>{(wh.events || []).map(ev => <span key={ev} style={{ background: `${C.primary}12`, color: C.primary, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontFamily: "monospace" }}>{ev}</span>)}</div>
                    </div>
                    <div>{successRate !== null ? (<><div style={{ color: successRate >= 99 ? "#00E676" : successRate >= 95 ? "#FFD600" : "#FF3B30", fontSize: 16, fontWeight: 700 }}>{successRate}%</div><div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{wh.total_deliveries} deliveries</div></>) : (<div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>No data yet</div>)}</div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{lastTriggered}</div>
                    <div><button onClick={() => toggleWebhookStatus(wh)} style={{ ...badge(wh.status === "active" ? "#00E676" : wh.status === "failed" ? "#FF3B30" : "#FFD600"), cursor: "pointer", border: "none", background: (wh.status === "active" ? "#00E676" : wh.status === "failed" ? "#FF3B30" : "#FFD600") + "18" }}>{wh.status}</button></div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => testWebhook(wh)} disabled={testStatus === "testing"} style={{ ...btnSec, padding: "6px 10px", fontSize: 11, color: testStatus === "success" ? "#00E676" : testStatus && testStatus.startsWith("failed") ? "#FF3B30" : "#fff" }}>{testStatus === "testing" ? "..." : testStatus === "success" ? "✓ OK" : testStatus ? "✗ Fail" : "Test"}</button>
                      <button onClick={() => { setEditingWebhook({ ...wh }); setShowNewWebhook(false); }} style={{ ...btnSec, padding: "6px 10px", fontSize: 11 }}>Edit</button>
                      <button onClick={() => deleteWebhook(wh.id)} style={{ ...btnSec, padding: "6px 10px", fontSize: 11, color: "#FF3B30" }}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ CHANNELS TAB ═══════════ */}
      {activeTab === "channels" && (
        <div>
          <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Channel Configuration</h2>
          {channelsLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: C.muted }}>Loading channels...</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {CHANNEL_DEFS.map(ch => {
                const config = channelConfigs[ch.id] || {};
                const configData = config.config_encrypted || {};
                const isEnabled = config.enabled || false;
                const status = config.status || "disconnected";
                const isSaving = channelSaving === ch.id;
                return (
                  <div key={ch.id} style={{ ...card, borderLeft: `4px solid ${isEnabled ? ch.color : "rgba(255,255,255,0.15)"}`, opacity: isEnabled ? 1 : 0.7 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 24 }}>{ch.icon}</span>
                        <div>
                          <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{ch.label}</div>
                          <div style={{ color: status === "connected" ? "#00E676" : status === "error" ? "#FF3B30" : status === "pending" ? "#FFD600" : C.muted, fontSize: 11 }}>{status === "connected" ? "● Connected" : status === "error" ? "● Error" : status === "pending" ? "◉ Pending" : "○ Not configured"}</div>
                        </div>
                      </div>
                      <button onClick={() => saveChannelConfig(ch.id, configData, !isEnabled)} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", background: isEnabled ? ch.color : "rgba(255,255,255,0.15)", transition: "background 0.2s" }}>
                        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: isEnabled ? 23 : 3, transition: "left 0.2s" }} />
                      </button>
                    </div>
                    {isEnabled && (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                          {ch.fields.filter(f => {
                            if (f.spOnly && viewLevel !== "sp") return false;
                            if (f.showWhen === "byoc" && configData["_byoc_toggle"] !== "Enabled") return false;
                            return true;
                          }).map(f => (
                            <div key={f.key}>
                              <label style={label}>{f.label}</label>
                              {renderChannelField(ch, f, configData)}
                            </div>
                          ))}
                        </div>

                        {/* IVR Department Routing */}
                        {ch.id === "voice" && (() => {
                          const depts = configData.departments || [{ digit: "1", name: "", number: "" }, { digit: "2", name: "", number: "" }, { digit: "3", name: "", number: "" }];
                          const updateDept = (idx, field, value) => { const updated = [...depts]; updated[idx] = { ...updated[idx], [field]: value }; updateChannelField(ch.id, "departments", updated); };
                          const addDept = () => { if (depts.length >= 9) return; updateChannelField(ch.id, "departments", [...depts, { digit: String(depts.length + 1), name: "", number: "" }]); };
                          const removeDept = (idx) => { updateChannelField(ch.id, "departments", depts.filter((_, i) => i !== idx)); };
                          return (
                            <div style={{ marginTop: 18, padding: 16, background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                <div><div style={{ color: "#FFD600", fontWeight: 700, fontSize: 14 }}>📋 IVR Department Routing</div><div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>Configure "Press 1 for Sales, Press 2 for Support..." menu</div></div>
                                <button onClick={addDept} disabled={depts.length >= 9} style={{ ...btnSec, padding: "6px 12px", fontSize: 11, opacity: depts.length >= 9 ? 0.4 : 1 }}>+ Add</button>
                              </div>
                              <div style={{ display: "grid", gap: 8 }}>
                                {depts.map((d, i) => (
                                  <div key={i} style={{ display: "grid", gridTemplateColumns: "50px 1fr 1fr 32px", gap: 8, alignItems: "center" }}>
                                    <div style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 8, textAlign: "center", padding: "8px 0", color: "#FFD600", fontWeight: 800, fontSize: 16 }}>{d.digit}</div>
                                    <input value={d.name} onChange={e => updateDept(i, "name", e.target.value)} placeholder="Department name" style={{ ...inputStyle, fontSize: 12 }} />
                                    <div style={{ display: "flex", gap: 4 }}>
                                      <select value={d.country || "+1"} onChange={e => updateDept(i, "country", e.target.value)} style={{ ...inputStyle, fontSize: 11, width: 72, padding: "6px 4px", flexShrink: 0 }}>
                                        <option value="+1">🇺🇸 +1</option>
                                        <option value="+44">🇬🇧 +44</option>
                                        <option value="+61">🇦🇺 +61</option>
                                        <option value="+49">🇩🇪 +49</option>
                                        <option value="+33">🇫🇷 +33</option>
                                        <option value="+34">🇪🇸 +34</option>
                                        <option value="+353">🇮🇪 +353</option>
                                      </select>
                                      <input value={d.number} onChange={e => updateDept(i, "number", e.target.value)} placeholder="7700 900000" style={{ ...inputStyle, fontSize: 12, fontFamily: "monospace", flex: 1 }} />
                                    </div>
                                    <button onClick={() => removeDept(i)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 16, padding: 4 }}>✕</button>
                                  </div>
                                ))}
                              </div>
                              {depts.length === 0 && <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "12px 0" }}>No departments configured. Calls will go directly to voicemail.</div>}
                            </div>
                          );
                        })()}

                        {/* Working Days */}
                        {ch.id === "voice" && (() => {
                          const workDays = configData.work_days || [1, 2, 3, 4, 5];
                          const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                          return (
                            <div style={{ marginTop: 14, padding: 14, background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 12 }}>
                              <div style={{ color: "#FFD600", fontWeight: 700, fontSize: 13, marginBottom: 10 }}>📅 Working Days</div>
                              <div style={{ display: "flex", gap: 6 }}>
                                {dayNames.map((d, i) => (
                                  <button key={i} onClick={() => { const updated = workDays.includes(i) ? workDays.filter(x => x !== i) : [...workDays, i].sort(); updateChannelField(ch.id, "work_days", updated); }} style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", border: "1px solid", background: workDays.includes(i) ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.03)", borderColor: workDays.includes(i) ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.08)", color: workDays.includes(i) ? "#FFD600" : "rgba(255,255,255,0.3)" }}>{d}</button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Hours Overrides */}
                        {ch.id === "voice" && (() => {
                          const overrides = configData.hours_overrides || [];
                          const addOverride = () => { const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0]; updateChannelField(ch.id, "hours_overrides", [...overrides, { date: tomorrow, closed: false, open: "10", close: "22" }]); };
                          const updateOverride = (idx, field, value) => { const updated = [...overrides]; updated[idx] = { ...updated[idx], [field]: value }; updateChannelField(ch.id, "hours_overrides", updated); };
                          const removeOverride = (idx) => updateChannelField(ch.id, "hours_overrides", overrides.filter((_, i) => i !== idx));
                          return (
                            <div style={{ marginTop: 14, padding: 14, background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 12 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                <div><div style={{ color: "#FFD600", fontWeight: 700, fontSize: 13 }}>🗓️ Hours Overrides</div><div style={{ color: C.muted, fontSize: 11 }}>Set custom hours for weddings, events, holidays, etc.</div></div>
                                <button onClick={addOverride} style={{ ...btnSec, padding: "5px 10px", fontSize: 11 }}>+ Add Date</button>
                              </div>
                              {overrides.length === 0 ? (
                                <div style={{ color: C.muted, fontSize: 12, textAlign: "center", padding: "8px 0" }}>No overrides set. Default hours will apply every working day.</div>
                              ) : (
                                <div style={{ display: "grid", gap: 8 }}>
                                  {overrides.map((o, i) => (
                                    <div key={i} style={{ display: "grid", gridTemplateColumns: "140px auto 70px 70px 32px", gap: 8, alignItems: "center" }}>
                                      <input type="date" value={o.date} onChange={e => updateOverride(i, "date", e.target.value)} style={{ ...inputStyle, fontSize: 12, padding: "6px 8px" }} />
                                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: o.closed ? "#FF3B30" : C.muted, fontSize: 12 }}><input type="checkbox" checked={o.closed || false} onChange={e => updateOverride(i, "closed", e.target.checked)} />Closed all day</label>
                                      {!o.closed && <><input value={o.open || "10"} onChange={e => updateOverride(i, "open", e.target.value)} placeholder="Open" style={{ ...inputStyle, fontSize: 12, padding: "6px 8px", textAlign: "center" }} /><input value={o.close || "17"} onChange={e => updateOverride(i, "close", e.target.value)} placeholder="Close" style={{ ...inputStyle, fontSize: 12, padding: "6px 8px", textAlign: "center" }} /></>}
                                      {o.closed && <><span /><span /></>}
                                      <button onClick={() => removeOverride(i)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 16, padding: 4 }}>✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                          <button onClick={() => saveChannelConfig(ch.id, channelConfigs[ch.id]?.config_encrypted || configData)} disabled={isSaving} style={{ ...btnPrimary, padding: "8px 14px", fontSize: 11, opacity: isSaving ? 0.6 : 1 }}>{isSaving ? "Saving..." : "Save Configuration"}</button>
                          <button style={{ ...btnSec, padding: "8px 14px", fontSize: 11 }} onClick={() => { saveChannelConfig(ch.id, configData, isEnabled).then(() => { supabase.from("channel_configs").update({ last_tested_at: new Date().toISOString() }).eq("channel", ch.id).then(() => loadChannelConfigs()); }); }}>Test Connection</button>
                        </div>
                      </>
                    )}
                    {!isEnabled && <div style={{ color: C.muted, fontSize: 12, padding: "8px 0" }}>Enable this channel to configure your {ch.label} integration.</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ BILLING TAB ═══════════ */}
      {activeTab === "billing" && (
        <div>
          <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Billing & Subscription</h2>
          {(planStatus === "Trial" || stripeStatus === "trialing" || !stripePlan) && (
            <div style={{ background: "linear-gradient(135deg, rgba(0,201,255,0.08), rgba(224,64,251,0.08))", border: "1px solid rgba(0,201,255,0.25)", borderRadius: 14, padding: "24px 28px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ color: "#00C9FF", fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Welcome to Your Trial</div>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>You have full access to all {currentPlanInfo.name} plan features. No credit card required during your trial.</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 6 }}>When you are ready, activate your subscription to continue using EngageWorx.</div>
              </div>
              <button onClick={() => setShowUpgradeModal(true)} style={{ background: "linear-gradient(135deg, #00C9FF, #E040FB)", border: "none", borderRadius: 10, padding: "12px 24px", color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap" }}>Activate Subscription</button>
            </div>
          )}
          <div style={{ ...card, marginBottom: 20, borderLeft: `4px solid ${C.primary}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: C.primary, fontSize: 22, fontWeight: 800 }}>{currentPlanInfo.name} Plan</span>
                  <span style={badge(stripeStatus === "trialing" ? "#FFD600" : "#00E676")}>● {planStatus}</span>
                </div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{currentPlanInfo.price}/month · Billed monthly</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#fff", fontSize: 28, fontWeight: 800 }}>{currentPlanInfo.price}<span style={{ color: C.muted, fontSize: 14, fontWeight: 400 }}>/mo</span></div>
                <button onClick={() => setShowUpgradeModal(true)} style={{ ...btnSec, padding: "6px 14px", fontSize: 11, marginTop: 6 }}>Upgrade Plan</button>
                <button onClick={handleManageBilling} style={{ ...btnSec, padding: "6px 14px", fontSize: 11, marginTop: 6, marginLeft: 6, background: "transparent", border: "1px solid rgba(255,255,255,0.15)" }}>Manage Billing</button>
              </div>
            </div>
          </div>
          {(() => {
            var planLimits = (stripePlan && stripePlan.includes("Pro")) ? { messages: 500000, contacts: 500000, campaigns: 200, users: 50 } : (stripePlan && stripePlan.includes("Growth")) ? { messages: 250000, contacts: 100000, campaigns: 50, users: 10 } : { messages: 50000, contacts: 10000, campaigns: 10, users: 3 };
            var items = usageData ? [{ label: "Messages", used: usageData.messages, limit: planLimits.messages, color: C.primary }, { label: "Contacts", used: usageData.contacts, limit: planLimits.contacts, color: "#00E676" }, { label: "Campaigns", used: usageData.campaigns, limit: planLimits.campaigns, color: "#FFD600" }, { label: "Team Members", used: usageData.members, limit: planLimits.users, color: "#E040FB" }] : null;
            return (
              <div style={{ ...card, marginBottom: 20 }}>
                <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Current Usage</h3>
                {!items ? <div style={{ color: C.muted, fontSize: 13 }}>Loading usage data...</div> : (
                  <div style={{ display: "grid", gap: 14 }}>
                    {items.map(function(u, i) {
                      var pct = u.limit > 0 ? Math.round((u.used / u.limit) * 100) : 0;
                      return (
                        <div key={i}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{u.label}</span>
                            <span style={{ color: pct > 80 ? "#FF6B35" : "#fff", fontSize: 13, fontWeight: 600 }}>{u.used.toLocaleString()} / {u.limit.toLocaleString()} <span style={{ color: u.color, fontSize: 11 }}>({pct}%)</span></span>
                          </div>
                          <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                            <div style={{ height: "100%", width: Math.min(pct, 100) + "%", background: pct > 90 ? "#FF3B30" : pct > 80 ? "#FF6B35" : u.color, borderRadius: 3, transition: "width 0.3s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
          <div style={{ ...card, marginBottom: 20, borderLeft: "4px solid #FFD600" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div><h3 style={{ color: "#fff", margin: 0, fontSize: 15 }}>SMS Top-Up Credits</h3><div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Purchase additional SMS credits when you need more</div></div>
              <span style={{ fontSize: 24 }}>📲</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {SMS_TOPUPS.map(t => (
                <div key={t.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "20px 16px", textAlign: "center", position: "relative" }}>
                  {t.savings && <div style={{ position: "absolute", top: -8, right: 12, background: "linear-gradient(135deg, #FFD600, #FF6B35)", color: "#000", padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 800 }}>{t.savings}</div>}
                  <div style={{ color: "#fff", fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{t.name}</div>
                  <div style={{ color: C.primary, fontSize: 24, fontWeight: 900, marginBottom: 4 }}>{t.price}</div>
                  <div style={{ color: C.muted, fontSize: 11, marginBottom: 12 }}>{t.perSms}/SMS</div>
                  <button onClick={() => handleTopup(t)} disabled={topupLoading === t.id} style={{ width: "100%", background: topupLoading === t.id ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #00C9FF, #E040FB)", border: "none", borderRadius: 8, padding: "10px", color: topupLoading === t.id ? C.muted : "#000", fontWeight: 700, cursor: topupLoading === t.id ? "wait" : "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{topupLoading === t.id ? "Loading..." : "Buy Now"}</button>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...card, marginBottom: 20 }}>
            <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Payment Method</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ fontSize: 28 }}>💳</div>
                <div><div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Managed by Stripe</div><div style={{ color: C.muted, fontSize: 12 }}>View and update your payment details securely</div></div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={handleManageBilling} style={btnSec}>Update Payment Method</button>
                <button onClick={handleManageBilling} style={btnSec}>View Invoices</button>
              </div>
            </div>
          </div>
          {viewLevel === "sp" && (
            <div style={{ ...card }}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Stripe Integration (Service Provider)</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div><label style={label}>Stripe Publishable Key</label><input defaultValue="pk_live_••••••••••••••••" style={inputStyle} type="password" /></div>
                <div><label style={label}>Stripe Secret Key</label><input defaultValue="sk_live_••••••••••••••••" style={inputStyle} type="password" /></div>
                <div><label style={label}>Webhook Signing Secret</label><input defaultValue="whsec_••••••••••••" style={inputStyle} type="password" /></div>
                <div><label style={label}>Webhook Endpoint</label><input defaultValue="https://api.engwx.com/v1/stripe/webhook" style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }} readOnly /></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button style={btnPrimary}>Save Stripe Config</button>
                <button style={btnSec}>Test Connection</button>
                <button style={btnSec}>View Dashboard →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TEAM TAB ═══════════ */}
      {activeTab === "team" && (
        <TeamMembersTab
          C={C}
          viewLevel={viewLevel}
          currentTenantId={currentTenantId}
          isSuperAdmin={viewLevel === 'sp'}
        />
      )}

      {/* ═══════════ UPGRADE MODAL ═══════════ */}
      {showUpgradeModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => setShowUpgradeModal(false)}>
          <div style={{ background: "#1A1D2E", borderRadius: 16, padding: 32, maxWidth: 720, width: "90%", maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ color: "#fff", margin: 0, fontSize: 20 }}>Choose Your Plan</h2>
              <button onClick={() => setShowUpgradeModal(false)} style={{ background: "none", border: "none", color: C.muted, fontSize: 24, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              {PLANS.map(plan => (
                <div key={plan.id} style={{ background: "rgba(255,255,255,0.04)", border: plan.popular ? `2px solid ${C.primary}` : "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, position: "relative" }}>
                  {plan.popular && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: C.primary, color: "#000", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 10 }}>POPULAR</div>}
                  <div style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ color: C.primary, fontSize: 28, fontWeight: 800, marginBottom: 12 }}>{plan.price}<span style={{ color: C.muted, fontSize: 13, fontWeight: 400 }}>/mo</span></div>
                  <div style={{ marginBottom: 16 }}>{plan.features.map((f, i) => (<div key={i} style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, padding: "4px 0", display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "#00E676" }}>✓</span> {f}</div>))}</div>
                  <button onClick={() => handleUpgrade(plan)} disabled={upgradeLoading === plan.id} style={{ width: "100%", background: upgradeLoading === plan.id ? "rgba(255,255,255,0.1)" : plan.popular ? "linear-gradient(135deg, #00C9FF, #E040FB)" : "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: "10px", color: plan.popular ? "#000" : "#fff", fontWeight: 700, cursor: upgradeLoading === plan.id ? "wait" : "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>{upgradeLoading === plan.id ? "Redirecting..." : "Select Plan"}</button>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={handleManageBilling} style={{ background: "none", border: "none", color: C.primary, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Or manage your existing subscription →</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ NOTIFICATIONS TAB ═══════════ */}
      {activeTab === "notifications" && (
        <div>
          <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Notification Preferences</h2>
          <div style={card}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px", gap: 8, padding: "0 0 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 8 }}>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Event</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>📧 Email</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>🔔 Push</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, textAlign: "center" }}>💬 SMS</div>
            </div>
            {notifications.map(n => (
              <div key={n.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px", gap: 8, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", alignItems: "center" }}>
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{n.label}</div>
                {["email", "push", "sms"].map(ch => (
                  <div key={ch} style={{ textAlign: "center" }} onClick={() => toggleNotif(n.id, ch)}><Toggle enabled={n[ch]} /></div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ SECURITY TAB ═══════════ */}
      {activeTab === "security" && (
        <div>
          <h2 style={{ color: "#fff", fontSize: 18, margin: "0 0 20px" }}>Security Settings</h2>
          <div style={{ display: "grid", gap: 16 }}>
            <div style={card}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Authentication</h3>
              <div style={{ display: "grid", gap: 14 }}>
                {[{ label: "Two-Factor Authentication (2FA)", desc: "Require 2FA for all team members", enabled: true }, { label: "SSO (Single Sign-On)", desc: "SAML 2.0 / OpenID Connect integration", enabled: false }, { label: "IP Allowlist", desc: "Restrict API access to specific IP addresses", enabled: false }, { label: "Session Timeout", desc: "Auto-logout after 30 minutes of inactivity", enabled: true }].map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <div><div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{s.label}</div><div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 2 }}>{s.desc}</div></div>
                    <Toggle enabled={s.enabled} />
                  </div>
                ))}
              </div>
            </div>
            <div style={card}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Data & Compliance</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[{ label: "Data Encryption", status: "AES-256 at rest, TLS 1.3 in transit", color: "#00E676" }, { label: "GDPR Compliance", status: "Enabled — DPA signed", color: "#00E676" }, { label: "SOC 2 Type II", status: "Certified", color: "#00E676" }, { label: "Data Retention", status: "90 days (configurable)", color: "#FFD600" }, { label: "PII Masking", status: "Enabled for logs", color: "#00E676" }, { label: "Audit Trail", status: "All actions logged", color: "#00E676" }].map((item, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 16px" }}>
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 4 }}>{item.label}</div>
                    <div style={{ color: item.color, fontSize: 13, fontWeight: 600 }}>{item.status}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={card}>
              <h3 style={{ color: "#fff", margin: "0 0 16px", fontSize: 15 }}>Recent Security Events</h3>
              {auditLoading ? (
                <div style={{ color: C.muted, fontSize: 13, padding: "12px 0" }}>Loading audit log...</div>
              ) : auditLog.length === 0 ? (
                <div style={{ color: C.muted, fontSize: 13, padding: "12px 0" }}>No security events recorded yet.</div>
              ) : (
                auditLog.map((ev, i) => {
                  const icon = AUDIT_ICONS[ev.action] || AUDIT_ICONS.default;
                  const timeAgo = (() => { const diff = Date.now() - new Date(ev.created_at).getTime(); const mins = Math.floor(diff / 60000); if (mins < 60) return `${mins} min ago`; const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`; const days = Math.floor(hrs / 24); return `${days} day${days > 1 ? "s" : ""} ago`; })();
                  return (
                    <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < auditLog.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{ev.action.replace(/\./g, " → ")}</div>
                        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>{ev.details?.email || ev.details?.user_email || ev.resource_type || ""}</div>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>{timeAgo}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
