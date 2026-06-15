// api/provision-eval.js — SP-admin tool: create card-free eval workspace
// POST ?action=provision  { company_name, emails: [{email, first_name?, last_name?}], plan? }
// POST ?action=seed       { tenant_id }  — seed sample conversations into existing tenant
// Superadmin-only. Service-role client.

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function verifySuperadmin(supabase, req) {
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return { error: 'Missing auth', status: 401 };
  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { error: 'Invalid auth', status: 401 };
  var { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'superadmin') return { error: 'Superadmin role required', status: 403 };
  return { user: user };
}

// ── Link or create a user + send sign-in link. NEVER writes passwords. ──
async function linkOrCreateUser(supabase, email, fullName, tenantId) {
  var userId = null;
  var existing = false;
  var signInLinkSent = false;

  // 1. Resolve existing user (profile → orphaned auth fallback)
  var { data: existingProfile } = await supabase.from('user_profiles').select('id').ilike('email', email).maybeSingle();

  if (existingProfile) {
    userId = existingProfile.id;
    existing = true;
  } else {
    // Create auth user with NO password — sign-in is via magic link only
    var authResult = await supabase.auth.admin.createUser({
      email: email, email_confirm: true,
      user_metadata: { full_name: fullName, tenant_id: tenantId },
    });
    if (authResult.error) {
      if (authResult.error.message.includes('already') || authResult.error.message.includes('exists')) {
        // Orphaned auth user — resolve via profile-less auth lookup
        try {
          var listRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
          var found = (listRes.data && listRes.data.users || []).find(function(u) { return u.email && u.email.toLowerCase() === email.toLowerCase(); });
          if (found) { userId = found.id; existing = true; }
        } catch (_) {}
        if (!userId) return { error: 'Auth user exists but cannot resolve: ' + authResult.error.message };
      } else {
        return { error: 'User creation failed: ' + authResult.error.message };
      }
    } else {
      userId = authResult.data.user.id;
    }
  }

  // 2. Upsert profile (tenant_id is TEXT)
  await supabase.from('user_profiles').upsert({
    id: userId, email: email, tenant_id: String(tenantId), role: 'admin', full_name: fullName,
  }, { onConflict: 'id' });

  // 3. Idempotent tenant_members
  var { data: existingLink } = await supabase.from('tenant_members').select('id')
    .eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle();
  if (!existingLink) {
    await supabase.from('tenant_members').insert({
      user_id: userId, tenant_id: tenantId, role: 'admin', status: 'active', joined_at: new Date().toISOString(),
    });
  }

  // 4. Generate recovery link (set-password, durable) + send via platform email
  var signInError = null;
  try {
    var portalUrl = process.env.PORTAL_URL || 'https://portal.engwx.com';
    var { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: { redirectTo: portalUrl + '/auth/callback' },
    });
    if (linkErr) throw new Error('Link generation: ' + linkErr.message);
    var actionLink = linkData && linkData.properties && linkData.properties.action_link;
    if (!actionLink) throw new Error('No action_link in response');

    // Send via SP/platform sender (eval tenant has no email config yet)
    var { sendTenantEmail } = require('./_lib/send-tenant-email');
    var SP_TENANT_ID = process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387';
    var { data: tenantInfo } = await supabase.from('tenants').select('name, brand_name').eq('id', tenantId).maybeSingle();
    var tenantName = (tenantInfo && (tenantInfo.brand_name || tenantInfo.name)) || 'EngageWorx';
    var firstName = fullName.split(' ')[0] || 'there';

    var sendResult = await sendTenantEmail(supabase, {
      tenant_id: SP_TENANT_ID,
      to: email,
      subject: 'Set up your ' + tenantName + ' account',
      html: '<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:24px;">' +
        '<h2 style="color:#1e293b;margin:0 0 12px;">' + tenantName + '</h2>' +
        '<p style="color:#475569;font-size:14px;line-height:1.6;">Hi ' + firstName + ',</p>' +
        '<p style="color:#475569;font-size:14px;line-height:1.6;">Your evaluation workspace is ready. Click below to set your password and sign in:</p>' +
        '<a href="' + actionLink + '" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;margin:16px 0;">Set Password & Sign In</a>' +
        '<p style="color:#94a3b8;font-size:12px;margin-top:16px;">This link expires in 24 hours. If you need a new one, contact your account manager.</p>' +
        '</div>',
      text: 'Hi ' + firstName + ', your ' + tenantName + ' eval workspace is ready. Set your password: ' + actionLink,
    });
    if (sendResult && (sendResult.success || sendResult.method)) {
      signInLinkSent = true;
      console.log('[provision-eval] Recovery email sent to', email);
    } else {
      signInError = 'Email send returned no success indicator';
    }
  } catch (linkSendErr) {
    signInError = linkSendErr.message;
    console.warn('[provision-eval] Sign-in link/email failed for', email, ':', linkSendErr.message);
  }

  return { userId: userId, existing: existing, signInLinkSent: signInLinkSent, signInError: signInError };
}

// ── Seed sample conversations (independently callable) ──────────────────
async function seedEvalConversations(supabase, tenantId) {
  var EVAL_TAG = 'eval_seed';

  // Idempotency
  var { count } = await supabase.from('contacts').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('source', EVAL_TAG);
  if (count > 0) return { seeded: false, reason: 'already_seeded' };

  function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }

  var contactTemplates = [
    { first_name: 'Sarah', last_name: 'Chen', email: 'sarah.chen@example.com', phone: '+15551234001' },
    { first_name: 'Marcus', last_name: 'Williams', email: 'marcus.w@example.com', phone: '+15551234002' },
    { first_name: 'Emily', last_name: 'Rodriguez', email: 'emily.r@example.com', phone: '+15551234003' },
    { first_name: 'James', last_name: 'Thompson', email: 'james.t@example.com', phone: '+15551234004' },
    { first_name: 'Olivia', last_name: 'Hart', email: 'olivia.h@example.com', phone: '+15551234005' },
  ];

  var contactIds = [];
  for (var ci = 0; ci < contactTemplates.length; ci++) {
    var ct = contactTemplates[ci];
    var { data: contact } = await supabase.from('contacts').insert(
      Object.assign({ tenant_id: tenantId, status: 'active', source: EVAL_TAG }, ct)
    ).select('id').single();
    if (contact) contactIds.push(contact.id);
  }

  // Conversations with escalation scenarios + AI summaries
  var convTemplates = [
    { contactIdx: 0, channel: 'email', subject: 'Pricing for multi-location setup', status: 'active', msgs: [
      { dir: 'inbound', body: 'Hi, I manage 3 locations and need a unified platform. What are my options?', d: 5 },
      { dir: 'outbound', body: 'Thanks for reaching out, Sarah! Our Growth plan covers multi-location setups at $249/mo. Want to schedule a walkthrough this week?', d: 5, st: 'bot' },
      { dir: 'inbound', body: 'That sounds good. Can you do Thursday at 2pm?', d: 4 },
      { dir: 'outbound', body: 'Thursday at 2pm works perfectly. I\'ll send a calendar invite to your email.', d: 4, st: 'bot' },
      { dir: 'inbound', body: 'Great, looking forward to it!', d: 3 },
    ]},
    { contactIdx: 1, channel: 'sms', subject: null, status: 'active', msgs: [
      { dir: 'inbound', body: 'Saw your ad. How much does this cost?', d: 3 },
      { dir: 'outbound', body: 'Hi Marcus! Plans start at $99/mo with a free trial. What kind of business are you setting up?', d: 3, st: 'bot' },
      { dir: 'inbound', body: 'I need to talk to a real person. This is for a franchise with 12 locations and the bot isn\'t going to work for this conversation.', d: 2 },
      { dir: 'outbound', body: 'Completely understand. I\'ve flagged this for our team — someone will reach out within the hour to discuss your franchise setup directly.', d: 2, st: 'bot' },
    ]},
    { contactIdx: 2, channel: 'email', subject: 'Compliance question — urgent', status: 'active', msgs: [
      { dir: 'inbound', body: 'We\'re in healthcare and need HIPAA compliance. Can you confirm your platform meets these requirements before we proceed?', d: 6 },
      { dir: 'outbound', body: 'Great question, Emily. I want to make sure we give you an accurate answer — I\'ve escalated this to our compliance team. They\'ll respond within 24 hours with documentation.', d: 6, st: 'bot' },
      { dir: 'inbound', body: 'Thanks, please also include your BAA template if you have one.', d: 5 },
    ]},
    { contactIdx: 3, channel: 'whatsapp', subject: null, status: 'active', msgs: [
      { dir: 'inbound', body: 'Hi, referred by a colleague. We want to white-label your platform for our agency clients.', d: 4 },
      { dir: 'outbound', body: 'Welcome James! Our partner program is designed for exactly that — full white-label, your own portal, per-client billing. Want to see a demo?', d: 4, st: 'bot' },
      { dir: 'inbound', body: 'Yes, and can we get a sandbox to test first?', d: 3 },
      { dir: 'outbound', body: 'Absolutely. I\'ll set up a sandbox today. What\'s the best email for the login credentials?', d: 3, st: 'agent' },
    ]},
    { contactIdx: 4, channel: 'sms', subject: null, status: 'active', msgs: [
      { dir: 'inbound', body: 'Hi, I was referred by James Thompson. Looking for something similar for our law firm.', d: 1 },
      { dir: 'outbound', body: 'Welcome Olivia! James is a great partner. I\'d love to show you how we set things up for professional services. Free for a call this week?', d: 1, st: 'agent' },
    ]},
  ];

  var convCount = 0;
  for (var cvi = 0; cvi < convTemplates.length; cvi++) {
    var ct2 = convTemplates[cvi];
    var cId = contactIds[ct2.contactIdx];
    if (!cId) continue;

    var { data: conv } = await supabase.from('conversations').insert({
      tenant_id: tenantId, contact_id: cId, channel: ct2.channel,
      subject: ct2.subject, status: ct2.status,
      last_message_at: daysAgo(ct2.msgs[ct2.msgs.length - 1].d),
      unread_count: ct2.status === 'active' ? 1 : 0,
    }).select('id').single();
    if (!conv) continue;

    for (var mi = 0; mi < ct2.msgs.length; mi++) {
      var m = ct2.msgs[mi];
      await supabase.from('messages').insert({
        tenant_id: tenantId, conversation_id: conv.id, contact_id: cId,
        direction: m.dir, channel: ct2.channel, body: m.body, status: 'delivered',
        sender_type: m.st || (m.dir === 'inbound' ? 'contact' : 'agent'),
        created_at: daysAgo(m.d),
      });
    }
    convCount++;
  }

  return { seeded: true, conversations: convCount, contacts: contactIds.length };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var supabase = getSupabase();
  var auth = await verifySuperadmin(supabase, req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  var action = req.query.action || 'provision';
  var body = req.body || {};

  // ── SEED ONLY (independently callable) ─────────────────────────────────
  if (action === 'seed') {
    if (!body.tenant_id) return res.status(400).json({ error: 'tenant_id required' });
    var { data: seedTenant } = await supabase.from('tenants').select('id').eq('id', body.tenant_id).maybeSingle();
    if (!seedTenant) return res.status(404).json({ error: 'Tenant not found' });
    try {
      var seedResult = await seedEvalConversations(supabase, body.tenant_id);
      return res.status(200).json({ success: true, seed: seedResult });
    } catch (e) {
      return res.status(500).json({ error: 'Seed failed: ' + e.message });
    }
  }

  // ── PROVISION ──────────────────────────────────────────────────────────
  var companyName = (body.company_name || '').trim();
  var emails = body.emails;
  var plan = body.plan || 'growth';

  if (!companyName || !emails || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'company_name and emails[] required' });
  }

  try {
    // 1. Check for existing eval tenant
    var existingTenant = null;
    var { data: byName } = await supabase.from('tenants').select('id, name, slug, is_sandbox')
      .ilike('name', companyName).eq('is_sandbox', true).maybeSingle();
    if (byName) existingTenant = byName;

    if (!existingTenant) {
      for (var ei = 0; ei < emails.length; ei++) {
        var checkEmail = (emails[ei].email || '').trim().toLowerCase();
        if (!checkEmail) continue;
        var { data: prof } = await supabase.from('user_profiles').select('id').ilike('email', checkEmail).maybeSingle();
        if (prof) {
          var { data: mems } = await supabase.from('tenant_members').select('tenant_id').eq('user_id', prof.id).eq('status', 'active');
          for (var mj = 0; mj < (mems || []).length; mj++) {
            var { data: mt } = await supabase.from('tenants').select('id, name, slug, is_sandbox').eq('id', mems[mj].tenant_id).eq('is_sandbox', true).maybeSingle();
            if (mt) { existingTenant = mt; break; }
          }
          if (existingTenant) break;
        }
      }
    }

    if (existingTenant) {
      // Link any unlinked emails to the existing tenant
      var linkResults = [];
      for (var li = 0; li < emails.length; li++) {
        var le = emails[li];
        var leEmail = (le.email || '').trim().toLowerCase();
        if (!leEmail) continue;
        var leName = ((le.first_name || '') + ' ' + (le.last_name || '')).trim() || leEmail.split('@')[0];
        var lr = await linkOrCreateUser(supabase, leEmail, leName, existingTenant.id);
        linkResults.push({ email: leEmail, userId: lr.userId, existing: lr.existing, error: lr.error || null });
      }
      return res.status(200).json({
        success: true, existing: true,
        tenantId: existingTenant.id, tenantName: existingTenant.name, slug: existingTenant.slug,
        invites: linkResults,
      });
    }

    // 2. Create the eval tenant atomically (tenant + bind + admin member) via the shared RPC.
    //    Provision the primary user first so the RPC has a profile to bind; the remaining emails
    //    are linked to the now-existing tenant by the loop below.
    var primary = emails.find(function(e) { return (e.email || '').trim(); }) || emails[0];
    var primaryEmail = (primary.email || '').trim().toLowerCase();
    var primaryName = ((primary.first_name || '') + ' ' + (primary.last_name || '')).trim() || primaryEmail.split('@')[0];

    var primaryUserId = null, primaryCreated = false;
    var { data: existingPrimary } = await supabase.from('user_profiles').select('id').ilike('email', primaryEmail).maybeSingle();
    if (existingPrimary) {
      primaryUserId = existingPrimary.id;
    } else {
      var pCreate = await supabase.auth.admin.createUser({ email: primaryEmail, email_confirm: true, user_metadata: { full_name: primaryName } });
      if (pCreate.error) {
        var pList = await supabase.auth.admin.listUsers({ perPage: 1000 });
        var pFound = (pList.data && pList.data.users || []).find(function(u) { return u.email && u.email.toLowerCase() === primaryEmail; });
        if (pFound) primaryUserId = pFound.id;
        else return res.status(500).json({ error: 'Primary user creation failed: ' + pCreate.error.message });
      } else { primaryUserId = pCreate.data.user.id; primaryCreated = true; }
    }

    var slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-eval-' + Date.now().toString(36).slice(-4);
    var prov = await supabase.rpc('provision_tenant_and_bind', {
      p_user_id: primaryUserId,
      p_name: companyName,
      p_slug: slug,
      p_customer_type: 'direct',
      p_entity_tier: 'tenant',
      p_status: 'active',
      p_parent_tenant_id: null,
      p_referred_by: null,
      p_is_sandbox: true,
      p_event_id: null,
    });
    if (prov.error) {
      // Roll back the primary auth user we just created so a failed provision leaves no orphan.
      if (primaryCreated) { try { await supabase.auth.admin.deleteUser(primaryUserId); } catch (e) { console.warn('[provision-eval] rollback auth delete:', e.message); } }
      return res.status(500).json({ error: 'Tenant provisioning failed: ' + prov.error.message });
    }
    var newEvalTenantId = prov.data;

    // Columns the RPC doesn't set for eval tenants.
    var evDetail = await supabase.from('tenants').update({
      plan: plan, is_demo: false, onboarding_completed: true, channels_enabled: ['sms', 'email', 'whatsapp'],
    }).eq('id', newEvalTenantId);
    if (evDetail.error) console.warn('[provision-eval] tenant detail update (non-fatal):', evDetail.error.message);

    // Seed pipeline stages
    try { var { seedPipelineStages } = require('./_lib/seed-pipeline-stages'); await seedPipelineStages(supabase, newEvalTenantId); } catch (e) { console.warn('[provision-eval] Stage seed error:', e.message); }

    // Re-use the existing tenant object shape downstream (loop / seed / audit / return).
    var tenant = { id: newEvalTenantId };

    // 3. Link/create each user
    var inviteResults = [];
    for (var ui = 0; ui < emails.length; ui++) {
      var ue = emails[ui];
      var ueEmail = (ue.email || '').trim().toLowerCase();
      if (!ueEmail) continue;
      var ueName = ((ue.first_name || '') + ' ' + (ue.last_name || '')).trim() || ueEmail.split('@')[0];
      var ur = await linkOrCreateUser(supabase, ueEmail, ueName, tenant.id);
      inviteResults.push({
        email: ueEmail, userId: ur.userId,
        existing: ur.existing, signInLinkSent: ur.signInLinkSent, error: ur.error || null,
      });
    }

    // 4. Seed conversations
    var seedResult = null;
    try { seedResult = await seedEvalConversations(supabase, tenant.id); } catch (e) { console.warn('[provision-eval] Seed error:', e.message); }

    // 5. Audit
    try {
      await supabase.rpc('log_audit_event', {
        p_action: 'eval.provisioned', p_resource_type: 'tenants',
        p_tenant_id: tenant.id, p_user_id: auth.user.id, p_resource_id: tenant.id,
        p_details: { company: companyName, plan: plan, email_count: emails.length },
        p_ip_address: null, p_user_agent: null,
      });
    } catch (_) {}

    return res.status(200).json({
      success: true, existing: false,
      tenantId: tenant.id, tenantName: companyName, slug: slug, plan: plan,
      invites: inviteResults, seed: seedResult,
    });
  } catch (err) {
    console.error('[provision-eval] Error:', err.message);
    return res.status(500).json({ error: 'Internal error: ' + err.message });
  }
};

// Export seed function for direct use
module.exports.seedEvalConversations = seedEvalConversations;
