// api/email-classify.js — AI classification + action_item creation for inbound forwarded emails
// POST /api/email-classify { classification_id }
// Called fire-and-forget from email-forwarded-inbox.js after pending row is inserted.
// Steps: load classification → Haiku classifies → if actionable: resolve contact, Sonnet drafts, create action_item

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

var FILTERED_CLASSIFICATIONS = ['noise', 'spam', 'newsletter', 'internal', 'automated'];

// ── Haiku classification prompt, tuned by aggressiveness ─────────────────
function buildClassificationPrompt(aggressiveness) {
  var base = 'You classify inbound emails for a business. Return STRICT JSON only:\n' +
    '{"classification":"inquiry"|"support"|"booking_request"|"complaint"|"referral"|"follow_up"|"noise"|"spam"|"newsletter"|"internal"|"automated","confidence":0.0-1.0,"reason":"one sentence"}\n\n' +
    'Classification definitions:\n' +
    '- inquiry: someone asking about services, pricing, availability\n' +
    '- support: existing customer needing help\n' +
    '- booking_request: explicit request to book, reserve, or schedule\n' +
    '- complaint: expressing dissatisfaction\n' +
    '- referral: someone referring a potential customer\n' +
    '- follow_up: continuing a previous conversation\n' +
    '- noise: low-value email that does not need a response\n' +
    '- spam: unsolicited commercial email, phishing\n' +
    '- newsletter: marketing digests, promotional blasts, subscription emails\n' +
    '- internal: colleague/team mail forwarded by mistake\n' +
    '- automated: system notifications, receipts, delivery confirmations, OOO replies\n\n';

  if (aggressiveness === 'permissive') {
    base += 'BIAS: Only filter obvious spam, automated system emails, and clear newsletters. ' +
      'If in doubt, classify as inquiry. Surface everything borderline.';
  } else if (aggressiveness === 'aggressive') {
    base += 'BIAS: Filter aggressively. In addition to spam/automated/newsletters, also filter: ' +
      'internal team mail, batched notifications, FYI-only messages with no question or call to action, ' +
      'and low-priority support requests that are just informational (no action needed).';
  } else {
    base += 'BIAS: Balanced filtering. Filter spam, automated, newsletters, and obvious internal mail. ' +
      'Surface anything that looks like it could need a reply from the business. When uncertain, surface it.';
  }

  return base;
}

// ── Sonnet draft reply prompt ────────────────────────────────────────────
function buildDraftPrompt(senderName, subject, body, contactContext) {
  return 'You are drafting a reply to an inbound email on behalf of a business. ' +
    'Write a professional, warm, 2-4 sentence reply. Be helpful and specific. ' +
    'Do not make up facts — if you are unsure about details, ask the sender to clarify. ' +
    'Do not include a subject line — just the body text. Do not include a signature.\n\n' +
    (contactContext ? 'Known context about this sender:\n' + contactContext + '\n\n' : '') +
    'Email to reply to:\n' +
    'From: ' + (senderName || 'Unknown') + '\n' +
    'Subject: ' + (subject || '(no subject)') + '\n' +
    'Body:\n' + (body || '').substring(0, 2000);
}

async function callClaude(model, systemPrompt, userContent, maxTokens) {
  var apiKey = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      max_tokens: maxTokens || 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!response.ok) {
    var errText = await response.text();
    throw new Error('Claude API ' + response.status + ': ' + errText.substring(0, 200));
  }

  var data = await response.json();
  var text = (data.content || []).find(function(b) { return b.type === 'text'; });
  return text ? text.text : '';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  // Auth gate: internal secret required
  var expectedSecret = process.env.EMAIL_CLASSIFY_INTERNAL_SECRET || '';
  var providedSecret = req.headers['x-internal-secret'] || '';
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = getSupabase();
  var classificationId = req.body?.classification_id;
  if (!classificationId) return res.status(400).json({ error: 'classification_id required' });

  // Load classification row
  var { data: cls } = await supabase
    .from('inbound_email_classifications')
    .select('*')
    .eq('id', classificationId)
    .single();

  if (!cls) return res.status(404).json({ error: 'Classification not found' });
  if (cls.classification !== 'pending') return res.status(200).json({ ok: true, skipped: 'already_classified' });

  var tenantId = cls.tenant_id;

  try {
    // ── 1. Load filter settings ───────────────────────────────────────────
    var { data: filterSettings } = await supabase
      .from('tenant_inbound_filter_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!filterSettings) {
      // Insert defaults
      await supabase.from('tenant_inbound_filter_settings').insert({
        tenant_id: tenantId, ai_filter_enabled: true, aggressiveness: 'balanced',
      });
      filterSettings = { ai_filter_enabled: true, aggressiveness: 'balanced' };
    }

    // ── 2. Classify with Haiku ──────────────────────────────────────────
    var classification = 'inquiry';
    var confidence = 1.0;
    var reason = 'AI filter disabled — defaulting to inquiry';

    if (filterSettings.ai_filter_enabled) {
      var classifyInput = 'Subject: ' + (cls.subject || '(none)') + '\n' +
        'From: ' + (cls.sender_name ? cls.sender_name + ' <' + cls.sender_email + '>' : cls.sender_email) + '\n' +
        'Sender domain: ' + (cls.sender_email.split('@')[1] || 'unknown') + '\n\n' +
        'Body (first 1000 chars):\n' + ((cls.cleaned_body || '') || '').substring(0, 1000);

      var classifyPrompt = buildClassificationPrompt(filterSettings.aggressiveness);

      try {
        var classifyResult = await callClaude('claude-haiku-4-5-20251001', classifyPrompt, classifyInput, 300);
        var jsonText = classifyResult.trim();
        if (jsonText.startsWith('```')) jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        var parsed = JSON.parse(jsonText);
        classification = parsed.classification || 'inquiry';
        confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
        reason = parsed.reason || '';
      } catch (aiErr) {
        console.warn('[email-classify] Haiku classification failed, defaulting to inquiry:', aiErr.message);
        classification = 'inquiry';
        confidence = 0.0;
        reason = 'Classification failed: ' + aiErr.message;
      }
    }

    var isFiltered = FILTERED_CLASSIFICATIONS.indexOf(classification) !== -1;

    // ── 3. Update classification row ────────────────────────────────────
    await supabase.from('inbound_email_classifications').update({
      classification: classification,
      confidence: confidence,
      filtered: isFiltered,
    }).eq('id', classificationId);

    console.log('[email-classify] Classified:', { id: classificationId, tenant_id: tenantId, classification: classification, confidence: confidence, filtered: isFiltered, reason: reason });

    if (isFiltered) {
      return res.status(200).json({ ok: true, classification: classification, filtered: true });
    }

    // ── 4. Resolve contact ──────────────────────────────────────────────
    var contactId = null;
    var leadId = null;
    var contactContext = '';

    // Check existing contact
    var { data: existingContact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company, title, notes, pipeline_lead_id')
      .eq('tenant_id', tenantId)
      .ilike('email', cls.sender_email)
      .limit(1)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
      leadId = existingContact.pipeline_lead_id || null;
      contactContext = [
        existingContact.first_name ? 'Name: ' + existingContact.first_name + ' ' + (existingContact.last_name || '') : null,
        existingContact.company ? 'Company: ' + existingContact.company : null,
        existingContact.title ? 'Title: ' + existingContact.title : null,
        existingContact.notes ? 'Notes: ' + existingContact.notes.substring(0, 200) : null,
      ].filter(Boolean).join('\n');
    } else {
      // Create new contact
      var nameParts = (cls.sender_name || '').split(' ');
      var { data: newContact } = await supabase.from('contacts').insert({
        tenant_id: tenantId,
        email: cls.sender_email,
        first_name: nameParts[0] || null,
        last_name: nameParts.slice(1).join(' ') || null,
        source: 'inbound_email_forward',
        status: 'active',
      }).select('id').single();
      if (newContact) contactId = newContact.id;
    }

    // Check existing lead if not found via contact
    if (!leadId && cls.sender_email) {
      var { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('email', cls.sender_email)
        .limit(1)
        .maybeSingle();
      if (existingLead) leadId = existingLead.id;
    }

    // ── 5. Generate Sonnet draft reply ──────────────────────────────────
    var draftReply = null;
    try {
      var draftPrompt = buildDraftPrompt(cls.sender_name, cls.subject, (cls.cleaned_body || '') || '', contactContext);
      draftReply = await callClaude('claude-sonnet-4-20250514', draftPrompt, 'Draft the reply now.', 500);
    } catch (draftErr) {
      console.warn('[email-classify] Draft generation failed:', draftErr.message);
      draftReply = null;
    }

    // ── 6. Find admin user for action_item ──────────────────────────────
    var { data: adminMember } = await supabase
      .from('tenant_members')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('role', 'admin')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    var adminUserId = adminMember ? adminMember.user_id : null;
    if (!adminUserId) {
      console.warn('[email-classify] No admin user for tenant:', tenantId);
      return res.status(200).json({ ok: true, classification: classification, action_item: false, reason: 'no_admin_user' });
    }

    // ── 7. Create action_item ───────────────────────────────────────────
    var tier = (classification === 'complaint' || classification === 'booking_request') ? 'priority' : 'engagement';
    var replySubject = (cls.subject || '').startsWith('Re:') ? cls.subject : 'Re: ' + (cls.subject || 'your message');

    var { data: actionItem, error: aiErr } = await supabase.from('action_items').insert({
      tenant_id: tenantId,
      user_id: adminUserId,
      source: 'inbound_email_forward',
      tier: tier,
      title: 'Reply to ' + (cls.sender_name || cls.sender_email) + ': ' + (cls.subject || '(no subject)'),
      draft_subject: replySubject,
      draft_body_html: draftReply ? '<p>' + draftReply.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>') + '</p>' : null,
      draft_recipients: [{ email: cls.sender_email, name: cls.sender_name || cls.sender_email }],
      contact_id: contactId,
      lead_id: leadId,
      status: 'pending',
      context_data: {
        classification_id: classificationId,
        classification: classification,
        confidence: confidence,
        reason: reason,
        original_sender_email: cls.sender_email,
        original_subject: cls.subject,
      },
    }).select('id').single();

    if (aiErr) {
      console.error('[email-classify] Action item insert failed:', aiErr.message);
      return res.status(500).json({ error: 'action_item_insert_failed' });
    }

    // ── 8. Link classification → action_item ────────────────────────────
    await supabase.from('inbound_email_classifications').update({
      action_item_id: actionItem.id,
    }).eq('id', classificationId);

    console.log('[email-classify] Action item created:', {
      action_item_id: actionItem.id,
      classification_id: classificationId,
      tenant_id: tenantId,
      classification: classification,
      tier: tier,
      has_draft: !!draftReply,
    });

    return res.status(200).json({ ok: true, classification: classification, action_item_id: actionItem.id });

  } catch (err) {
    console.error('[email-classify] Error:', { classification_id: classificationId, error: err.message });
    // Mark as failed but don't crash — classification stays 'pending' for retry
    await supabase.from('inbound_email_classifications').update({
      classification: 'error',
    }).eq('id', classificationId).eq('classification', 'pending');
    return res.status(500).json({ error: err.message });
  }
};
