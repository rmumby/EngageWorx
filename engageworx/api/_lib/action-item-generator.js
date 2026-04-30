// api/_lib/action-item-generator.js — Pure function: event → action_item row
// Called by crons (Phase 2) and test endpoint. No HTTP handling.

var CLAUDE_MODEL = 'claude-sonnet-4-20250514';

var TIER_DESCRIPTIONS = {
  priority: 'This needs personal attention from {user_name} today. Draft should be warm, direct, advance the relationship. This person or situation matters — the email should feel like {user_name} sat down and wrote it personally.',
  engagement: 'This is active and advancing through the pipeline. Draft should maintain momentum, be specific to where the conversation is. Reference the last interaction or next step naturally. Don\'t oversell — keep it conversational.',
  bulk: 'This is one of several similar nudges. Draft should be templated but personalized — recipient should not feel mass-blasted. Use their name and company naturally. Keep it short (2 paragraphs max). Light touch, easy to respond to.',
};

var SOURCE_DESCRIPTIONS = {
  pipeline_stale: 'Lead has been in stage \'{stage_name}\' for {days_stale} days with no activity. Last activity: {last_activity_date}. This is a re-engagement — acknowledge the gap naturally without apologizing. Reference their original interest.',
  newly_signed: 'Tenant \'{tenant_name}\' was created {days_ago} days ago. Plan: {plan_name}. This is an activation check-in — make sure they\'re getting value from the platform. Ask what channels they want to set up first.',
  ai_escalation: 'The AI chatbot escalated a conversation because: \'{escalation_reason}\'. The customer has been waiting {minutes_waiting} minutes. Draft a response that addresses their concern directly.',
  inbound_message: 'New inbound {channel} message from {contact_name} received {time_ago}. No agent has replied yet. Draft a response based on their message content.',
  vip_message: 'VIP contact {contact_name} ({contact_title} at {contact_company}) sent a {channel} message. VIP contacts get priority attention — draft should reflect the relationship importance.',
  manual_priority: 'User manually flagged this as priority.',
  bulk_setup_nudge: 'Tenant \'{tenant_name}\' signed up {days_ago} days ago but has not configured any channels yet. Nudge them to complete setup — mention the easiest channel to start with (usually SMS).',
  bulk_inactive_check: 'Tenant \'{tenant_name}\' has channels configured but has sent 0 messages in the last {inactive_days} days. Check if they need help or have questions about getting started.',
};

var SOURCE_USER_MESSAGES = {
  pipeline_stale: 'Re-engage {contact_name} at {company}. They\'ve been in {stage_name} for {days_stale} days. Last activity: {last_activity_summary}.',
  newly_signed: 'Write an activation check-in for {contact_name} at {tenant_name}. They signed up {days_ago} days ago on the {plan_name} plan. Channels configured: {channels_list}.',
  ai_escalation: 'Customer {contact_name} was escalated: \'{escalation_reason}\'. Write a helpful response.',
  inbound_message: 'Reply to {contact_name}\'s {channel} message: \'{message_preview}\'. They are a {relationship_type}.',
  vip_message: 'VIP {contact_name} ({contact_title} at {contact_company}) sent: \'{message_preview}\'. Write a priority response.',
  manual_priority: '{manual_context}',
  bulk_setup_nudge: 'Write a setup nudge for {contact_name} at {tenant_name}. Signed up {days_ago} days ago, no channels configured yet.',
  bulk_inactive_check: 'Write an activity check-in for {contact_name} at {tenant_name}. They have {channels_configured} configured but haven\'t sent any messages in {inactive_days} days.',
};

var C_LEVEL_TITLES = ['ceo', 'cto', 'cfo', 'coo', 'vp', 'president', 'founder', 'owner', 'director', 'managing partner', 'principal', 'chief'];

// ── Enrich context from DB ──────────────────────────────────────────

async function enrichContext(supabase, event) {
  var contact = null;
  var lead = null;
  var tenant = null;
  var relatedTenant = null;
  var emailSendMethod = null;
  var userName = null;

  // Fetch contact
  if (event.contact_id) {
    try {
      var cr = await supabase.from('contacts').select('*').eq('id', event.contact_id).maybeSingle();
      if (cr.data) contact = cr.data;
    } catch (_) {}
  }

  // Fetch lead
  if (event.lead_id) {
    try {
      var lr = await supabase.from('leads').select('*').eq('id', event.lead_id).maybeSingle();
      if (lr.data) lead = lr.data;
    } catch (_) {}
  }

  // When both exist, prefer more recently updated for conflicting fields
  if (contact && lead) {
    var contactTime = new Date(contact.updated_at || contact.created_at || 0).getTime();
    var leadTime = new Date(lead.updated_at || lead.created_at || 0).getTime();
    if (leadTime > contactTime) {
      // Lead is newer — override contact fields where lead has data
      if (lead.email) contact.email = lead.email;
      if (lead.phone) contact.phone = lead.phone;
      if (lead.company) contact.company = lead.company;
    }
  }

  // Fetch tenant
  try {
    var tr = await supabase.from('tenants').select('id, name, plan, email_send_method, status').eq('id', event.tenant_id).maybeSingle();
    if (tr.data) {
      tenant = tr.data;
      emailSendMethod = tr.data.email_send_method || null;
    }
  } catch (_) {}

  // Fetch related tenant (for newly_signed, bulk_setup_nudge, etc.)
  if (event.related_tenant_id) {
    try {
      var rtr = await supabase.from('tenants').select('id, name, plan, status, created_at').eq('id', event.related_tenant_id).maybeSingle();
      if (rtr.data) relatedTenant = rtr.data;
    } catch (_) {}
  }

  // Fetch user name
  try {
    var ur = await supabase.from('user_profiles').select('full_name, email').eq('id', event.user_id).maybeSingle();
    if (ur.data) userName = ur.data.full_name || ur.data.email || null;
  } catch (_) {}

  return { contact: contact, lead: lead, tenant: tenant, relatedTenant: relatedTenant, emailSendMethod: emailSendMethod, userName: userName || 'Team' };
}

// ── Determine tier ──────────────────────────────────────────────────

function determineTier(source, contact, lead) {
  // Always priority sources
  if (['ai_escalation', 'vip_message', 'manual_priority', 'newly_signed'].indexOf(source) >= 0) {
    return 'priority';
  }

  // VIP or priority flags
  if (contact && contact.is_vip) return 'priority';
  if (lead && lead.is_priority) return 'priority';

  // C-level title check
  if (contact && contact.title) {
    var titleLower = contact.title.toLowerCase();
    for (var i = 0; i < C_LEVEL_TITLES.length; i++) {
      if (titleLower.indexOf(C_LEVEL_TITLES[i]) >= 0) return 'priority';
    }
  }
  if (lead && lead.title) {
    var leadTitleLower = lead.title.toLowerCase();
    for (var j = 0; j < C_LEVEL_TITLES.length; j++) {
      if (leadTitleLower.indexOf(C_LEVEL_TITLES[j]) >= 0) return 'priority';
    }
  }

  // Bulk sources
  if (source === 'bulk_setup_nudge') return 'bulk';
  if (source === 'bulk_inactive_check') return 'bulk';

  // Everything else is engagement
  return 'engagement';
}

// ── Resolve signature ───────────────────────────────────────────────

async function resolveSignature(supabase, event, isFirstTouch) {
  // Try per-tenant chatbot_configs signature
  try {
    var sigField = isFirstTouch ? 'email_signature_first' : 'email_signature_reply';
    var cr = await supabase.from('chatbot_configs')
      .select('email_signature_first, email_signature_reply, email_from_name')
      .eq('tenant_id', event.tenant_id).maybeSingle();
    if (cr.data) {
      var sig = cr.data[sigField] || cr.data.email_signature_first;
      if (sig) return { html: sig, fromName: cr.data.email_from_name || null };
    }
  } catch (_) {}

  return { html: '', fromName: null };
}

// ── Resolve pipeline transition ─────────────────────────────────────

function resolvePipelineTransition(source, contextData) {
  // Only pipeline_stale with auto-advance is mechanical
  if (source === 'pipeline_stale' && contextData && contextData.auto_advance) {
    return {
      predicted_stage_id: contextData.next_stage_id || null,
      stage_advance_type: 'mechanical',
    };
  }

  // Judgment calls
  if (contextData && contextData.stage_advance_type === 'judgment') {
    return {
      predicted_stage_id: contextData.next_stage_id || null,
      stage_advance_type: 'judgment',
    };
  }

  return { predicted_stage_id: null, stage_advance_type: 'none' };
}

// ── Template string interpolation ───────────────────────────────────

function interpolate(template, vars) {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, function (_, key) {
    return vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : '';
  });
}

// ── Generate draft via Claude ───────────────────────────────────────

async function generateDraft(event, enriched, tier) {
  var apiKey = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackDraft(event, enriched, tier);

  var contact = enriched.contact;
  var lead = enriched.lead;
  var relatedTenant = enriched.relatedTenant;
  var cd = event.context_data || {};

  // Build template variables from all available data
  var vars = {
    user_name: enriched.userName,
    platform_name: enriched.tenant ? enriched.tenant.name : 'Platform',
    contact_name: (contact && (contact.first_name || contact.last_name))
      ? ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim()
      : (lead ? lead.name : 'there'),
    contact_title: (contact && contact.title) || (lead && lead.title) || '',
    contact_company: (contact && contact.company) || (lead && lead.company) || '',
    contact_email: (contact && contact.email) || (lead && lead.email) || '',
    company: (lead && lead.company) || (contact && contact.company) || '',
    tenant_name: relatedTenant ? relatedTenant.name : (enriched.tenant ? enriched.tenant.name : ''),
    plan_name: relatedTenant ? (relatedTenant.plan || 'Starter') : '',
    stage_name: cd.stage_name || '',
    days_stale: cd.days_stale || '',
    days_ago: cd.days_ago || '',
    last_activity_date: cd.last_activity_date || '',
    last_activity_summary: cd.last_activity_summary || '',
    escalation_reason: cd.escalation_reason || '',
    minutes_waiting: cd.minutes_waiting || '',
    channel: cd.channel || 'email',
    time_ago: cd.time_ago || '',
    message_preview: cd.message_preview || '',
    relationship_type: cd.relationship_type || 'contact',
    manual_context: cd.manual_context || '',
    channels_list: cd.channels_list || 'none yet',
    channels_configured: cd.channels_configured || '0',
    inactive_days: cd.inactive_days || '30',
  };

  var tierDesc = interpolate(TIER_DESCRIPTIONS[tier] || '', vars);
  var sourceDesc = interpolate(SOURCE_DESCRIPTIONS[event.source] || '', vars);
  var userMessage = interpolate(SOURCE_USER_MESSAGES[event.source] || cd.manual_context || 'Write an appropriate email.', vars);

  var systemPrompt = [
    'You are a business email drafting assistant for ' + vars.user_name + ' at ' + vars.platform_name + '.',
    'You write emails on behalf of ' + vars.user_name + ' — match a professional, personable tone.',
    'Do NOT include a signature — it will be appended separately.',
    'Do NOT include "Dear" or overly formal openings — use first name directly.',
    '',
    'TIER: ' + tier,
    tierDesc,
    '',
    'SOURCE: ' + event.source,
    sourceDesc,
    '',
    'Respond with ONLY a JSON object (no markdown fences):',
    '{',
    '  "title": "Display title — format: \'{contact_name} · {contact_title} at {contact_company}\' or best fit",',
    '  "context": "1-2 sentences explaining why this needs attention right now. Be specific — reference dates, amounts, last activity.",',
    '  "suggested_action": "Short label like \'Personal re-engagement\' or \'Activation check-in\'",',
    '  "draft_subject": "Email subject line — concise, no emoji, professional",',
    '  "draft_body_html": "Email body as clean HTML. Use <p> tags. 2-4 short paragraphs max. End with a clear next step or question."',
    '}',
  ].join('\n');

  try {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      console.error('[action-item-generator] Claude error:', res.status);
      return fallbackDraft(event, enriched, tier);
    }

    var data = await res.json();
    var text = (data.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('').trim();
    var clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    var parsed = JSON.parse(clean);

    return {
      title: parsed.title || vars.contact_name,
      context: parsed.context || '',
      suggested_action: parsed.suggested_action || '',
      draft_subject: parsed.draft_subject || '',
      draft_body_html: parsed.draft_body_html || '',
      usage: data.usage || null,
    };
  } catch (err) {
    console.error('[action-item-generator] Claude/parse error:', err.message);
    return fallbackDraft(event, enriched, tier);
  }
}

function fallbackDraft(event, enriched, tier) {
  var contact = enriched.contact;
  var lead = enriched.lead;
  var name = (contact && contact.first_name) || (lead && lead.name) || 'Contact';
  var company = (contact && contact.company) || (lead && lead.company) || '';
  var title = (contact && contact.title) || '';

  return {
    title: name + (title ? ' · ' + title : '') + (company ? ' at ' + company : ''),
    context: 'Auto-generated action — Claude was unavailable for draft.',
    suggested_action: event.source.replace(/_/g, ' '),
    draft_subject: 'Following up',
    draft_body_html: '<p>Hi ' + name.split(' ')[0] + ',</p><p>I wanted to follow up and see how things are going. Do you have a few minutes to connect this week?</p>',
    usage: null,
  };
}

// ── Insert or update (dedup) ────────────────────────────────────────

async function insertOrUpdate(supabase, row) {
  try {
    var { data, error } = await supabase.from('action_items').insert(row).select().single();
    if (error) {
      // Check for unique violation (dedup index)
      if (error.code === '23505') {
        var { data: updated, error: updateErr } = await supabase.from('action_items')
          .update({
            updated_at: new Date().toISOString(),
            context: row.context,
            draft_subject: row.draft_subject,
            draft_body_html: row.draft_body_html,
          })
          .eq('tenant_id', row.tenant_id)
          .eq('user_id', row.user_id)
          .eq('source', row.source)
          .eq('status', 'pending')
          .select()
          .single();
        if (updateErr) return { success: false, error: updateErr.message };
        return { success: true, action_item: updated, updated_existing: true };
      }
      return { success: false, error: error.message };
    }
    return { success: true, action_item: data, updated_existing: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Main entry point ────────────────────────────────────────────────

async function generateActionItem(supabase, event) {
  // Validate required fields
  if (!event.tenant_id) return { success: false, error: 'tenant_id required' };
  if (!event.user_id) return { success: false, error: 'user_id required' };
  if (!event.source) return { success: false, error: 'source required' };

  console.log('[action-item-generator]', {
    tenant_id: event.tenant_id,
    user_id: event.user_id,
    source: event.source,
    contact_id: event.contact_id || null,
    lead_id: event.lead_id || null,
  });

  // 1. Enrich context
  var enriched = await enrichContext(supabase, event);

  // 2. Determine tier
  var tier = determineTier(event.source, enriched.contact, enriched.lead);

  // 3. Generate draft via Claude
  var draft = await generateDraft(event, enriched, tier);

  // 4. Resolve signature
  var isFirstTouch = ['newly_signed', 'bulk_setup_nudge', 'bulk_inactive_check'].indexOf(event.source) >= 0;
  var sig = await resolveSignature(supabase, event, isFirstTouch);

  // Embed signature in draft
  var bodyWithSig = draft.draft_body_html;
  if (sig.html) {
    bodyWithSig = draft.draft_body_html + '\n' + sig.html;
  }

  // 5. Pipeline transition
  var transition = resolvePipelineTransition(event.source, event.context_data || {});

  // 6. Build recipients
  var recipientEmail = (enriched.contact && enriched.contact.email) || (enriched.lead && enriched.lead.email) || null;
  var recipientName = draft.title.split(' · ')[0] || '';
  var draftRecipients = recipientEmail ? [{ email: recipientEmail, name: recipientName }] : null;

  // 7. Build row
  var row = {
    tenant_id: event.tenant_id,
    user_id: event.user_id,
    tier: tier,
    source: event.source,
    contact_id: event.contact_id || null,
    lead_id: event.lead_id || null,
    conversation_id: event.conversation_id || null,
    ticket_id: event.ticket_id || null,
    related_tenant_id: event.related_tenant_id || null,
    title: draft.title,
    context: draft.context,
    suggested_action: draft.suggested_action,
    draft_subject: draft.draft_subject,
    draft_body_html: bodyWithSig,
    draft_recipients: draftRecipients,
    predicted_stage_id: transition.predicted_stage_id,
    stage_advance_type: transition.stage_advance_type,
    status: 'pending',
    is_vip_action: !!(enriched.contact && enriched.contact.is_vip),
  };

  // 8. Insert (dedup handled by unique index)
  var result = await insertOrUpdate(supabase, row);

  if (result.success) {
    result.debug = {
      tier: tier,
      enriched_contact: draft.title,
      email_send_method: enriched.emailSendMethod || 'default',
      claude_usage: draft.usage,
    };
  }

  return result;
}

module.exports = { generateActionItem: generateActionItem };
