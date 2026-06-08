// api/draft-approve.js — Approve & Send / Discard a pending AI draft
// POST { conversation_id, action: 'approve' | 'discard', edited_html? }
// Approve routes through the same wrapAndDispatch as auto_send — byte-identical output.

var { createClient } = require('@supabase/supabase-js');
var { wrapAndDispatch } = require('./_lib/wrap-and-dispatch');

var PORTAL_ORIGIN = process.env.PORTAL_ORIGIN || 'https://portal.engwx.com';

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Server-side HTML sanitizer: allowlist of safe tags + attributes for email body content.
// Strips scripts, event handlers, and non-email-safe elements.
function sanitizeHtml(html) {
  if (!html) return '';
  // Remove script/style/iframe/object/embed tags and their contents
  var cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>[\s\S]*?<\/embed>/gi, '')
    .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
    .replace(/<input[^>]*>/gi, '')
    .replace(/<textarea[^>]*>[\s\S]*?<\/textarea>/gi, '')
    .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '');
  // Strip event handler attributes (on*)
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  // Strip javascript: URIs in href/src/action
  cleaned = cleaned.replace(/(href|src|action)\s*=\s*["']?\s*javascript\s*:/gi, '$1="');
  return cleaned;
}

// Derive a plaintext body from the HTML that is actually being sent, so the email's
// text part and the sent-log body match the (possibly edited) HTML exactly.
function htmlToText(html) {
  if (!html) return '';
  var t = String(html);
  t = t.replace(/<\s*br\s*\/?>/gi, '\n');
  t = t.replace(/<li[^>]*>/gi, '• ');
  t = t.replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr)\s*>/gi, '\n');
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  t = t.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
  return t;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', PORTAL_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var supabase = getSupabase();
  var body = req.body || {};
  var conversationId = body.conversation_id;
  var action = body.action;

  if (!conversationId || !action) return res.status(400).json({ error: 'conversation_id and action required' });
  if (['approve', 'discard'].indexOf(action) === -1) return res.status(400).json({ error: 'action must be approve or discard' });

  // Auth: verify caller
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing auth' });
  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid auth' });

  // Load conversation with draft
  var { data: conv, error: convErr } = await supabase.from('conversations')
    .select('id, tenant_id, contact_id, channel, subject, ai_draft_body, ai_draft_html, ai_draft_status')
    .eq('id', conversationId).maybeSingle();
  if (convErr || !conv) return res.status(404).json({ error: 'Conversation not found' });
  var tenantId = conv.tenant_id;

  // Authorization: caller must be a member of this tenant
  var { data: callerProfile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  var isSA = callerProfile && callerProfile.role === 'superadmin';
  if (!isSA) {
    var { data: membership } = await supabase.from('tenant_members').select('id').eq('tenant_id', tenantId).eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (!membership) return res.status(403).json({ error: 'Not authorized for this tenant' });
  }

  if (conv.ai_draft_status !== 'pending') {
    return res.status(400).json({ error: 'No pending draft on this conversation', current_status: conv.ai_draft_status });
  }

  // ── DISCARD ──
  if (action === 'discard') {
    try {
      await supabase.rpc('clear_ai_draft', { p_tenant_id: tenantId, p_conversation_id: conversationId });
    } catch (rpcErr) { console.error('[draft-approve] clear_ai_draft error:', rpcErr.message); }
    return res.status(200).json({ success: true, action: 'discard', conversation_id: conversationId });
  }

  // ── APPROVE & SEND ──
  // Single source of truth = the editor's contents at click time (edited_html), falling
  // back to the stored draft only when the client sent no edit. Server-side re-sanitize:
  // don't trust client-side DOMPurify.
  var rawBodyContent = body.edited_html || conv.ai_draft_html;
  var bodyContent = sanitizeHtml(rawBodyContent);
  if (!bodyContent) return res.status(400).json({ error: 'No draft content to send' });
  // Derive plaintext FROM the HTML being sent — never the stale stored ai_draft_body —
  // so the email text part and the sent-log body reflect the agent's edits.
  var cleanBody = htmlToText(bodyContent);

  // Load contact email for dispatch
  var contactEmail = null;
  if (conv.contact_id) {
    var { data: contact } = await supabase.from('contacts').select('email').eq('id', conv.contact_id).maybeSingle();
    if (contact) contactEmail = contact.email;
  }
  if (!contactEmail) return res.status(400).json({ error: 'No contact email for this conversation' });

  // Derive sender — IDENTICAL to email-inbound-concierge tenant resolution:
  // 1. channel_configs (exact configured from_email/inbound_email)
  // 2. tenants.default_sender_email
  // 3. tenants.resend_domain (construct from recipient prefix, not hardcoded 'weddings@')
  var tenantName = null;
  var tenantSenderEmail = null;
  var recipientEmail = null;

  // (a) Check channel_configs for configured email sender
  try {
    var { data: emailConfig } = await supabase.from('channel_configs')
      .select('config_encrypted')
      .eq('tenant_id', tenantId).eq('channel', 'email').maybeSingle();
    if (emailConfig && emailConfig.config_encrypted) {
      var cfg = emailConfig.config_encrypted;
      recipientEmail = (cfg.inbound_email || cfg.from_email || '').toLowerCase() || null;
    }
  } catch (_) {}

  // (b) Tenant-level sender config (matches auto_send domain-match derivation)
  try {
    var { data: tenantData } = await supabase.from('tenants')
      .select('name, brand_name, default_sender_email, resend_domain')
      .eq('id', tenantId).maybeSingle();
    if (tenantData) {
      tenantName = tenantData.brand_name || tenantData.name;
      tenantSenderEmail = tenantData.default_sender_email || null;
      if (!tenantSenderEmail && tenantData.resend_domain && recipientEmail) {
        // Derive from inbound address prefix + resend_domain (e.g. weddings@, info@, hello@)
        var prefix = recipientEmail.split('@')[0] || 'noreply';
        tenantSenderEmail = prefix + '@' + tenantData.resend_domain;
      } else if (!tenantSenderEmail && tenantData.resend_domain) {
        tenantSenderEmail = 'noreply@' + tenantData.resend_domain;
      }
    }
  } catch (_) {}

  // recipientEmail falls back to tenantSenderEmail (matches auto_send where "to" address IS the sender)
  if (!recipientEmail) recipientEmail = tenantSenderEmail;

  var replySubject = conv.subject ? (conv.subject.startsWith('Re:') ? conv.subject : 'Re: ' + conv.subject) : 'Re: your message';

  // Route through the SAME wrapAndDispatch as auto_send — byte-identical output
  // Wrap in try/catch: on failure, leave draft pending for retry
  try {
    await wrapAndDispatch(supabase, {
      tenantId: tenantId, tenantName: tenantName,
      conversationId: conversationId, contactId: conv.contact_id,
      senderEmail: contactEmail, recipientEmail: recipientEmail,
      tenantSenderEmail: tenantSenderEmail,
      replySubject: replySubject,
      cleanBody: cleanBody, bodyContent: bodyContent,
      // Human approved & sent — attribute to the logged-in human, not the AI.
      senderType: 'agent', senderMeta: { approved_by_user_id: user.id, via: 'draft-approve' },
    });
  } catch (sendErr) {
    console.error('[draft-approve] wrapAndDispatch failed:', sendErr.message);
    return res.status(500).json({ error: 'Send failed — draft preserved for retry', detail: sendErr.message });
  }

  // Mark draft as sent (terminal — preserves audit trail) and transition to 'waiting'
  try {
    await supabase.from('conversations').update({
      ai_draft_status: 'sent',
      ai_draft_generated_at: null,
      // Clear the stored draft so it no longer holds the pre-edit content — the sent
      // message in `messages` is now the source of truth for what was delivered.
      ai_draft_body: null,
      ai_draft_html: null,
      status: 'waiting',
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId).eq('tenant_id', tenantId);
    console.warn('[status-audit] conv=' + conversationId + ' status=waiting via=draft-approve');
    try { await supabase.from('debug_logs').insert({ endpoint: 'draft-approve', action: 'status-audit', payload: { conv_id: conversationId, prev_status: null, new_status: 'waiting', via: 'draft-approve' } }); } catch (_) {}
  } catch (stateErr) { console.error('[draft-approve] state transition error:', stateErr.message); }

  console.log('[draft-approve] Approved and sent:', conversationId);
  return res.status(200).json({ success: true, action: 'approve', conversation_id: conversationId, message_sent: true });
};
