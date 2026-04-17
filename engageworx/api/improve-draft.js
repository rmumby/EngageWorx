// api/improve-draft.js
// Rewrite an email_actions reply draft using extra context Rob provides inline.
// POST { action_id, context }  →  { improved_draft }
//
// The original draft + tenant + classification metadata are loaded from
// email_actions; we ask Claude Sonnet to rewrite, persist the improved version
// back to claude_reply_draft, and tuck the user context into action_payload.user_context
// so a future open of the same card shows what was already supplied.

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function rewrite(originalDraft, context, meta) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  var calendlyUrl = (meta && meta.calendly_url) || 'https://calendly.com/rob-engwx/30min';
  var system = 'You make MINIMAL edits to email drafts. The user wrote the draft themselves and wants their exact words preserved.\n\n' +
    'RULES — follow these strictly:\n' +
    '- Keep the user\'s exact words, tone, and structure. Do NOT rewrite, restructure, or paraphrase.\n' +
    '- Only add what the user explicitly asks for in the context instructions. Nothing extra.\n' +
    '- Never add sentences the user didn\'t write. Never add AI commentary or explanations.\n' +
    '- Fix obvious grammar/spelling if broken, but do not improve style or change voice.\n' +
    '- If the user says "add calendly link" or "add booking link" → insert: ' + calendlyUrl + '\n' +
    '- If the user says "add phone" or "add number" → insert: +1 (786) 982-7800\n' +
    '- If the user says "add website" → insert: https://engwx.com\n' +
    '- Output ONLY the improved email body. No preamble, no "Here\'s the improved version:", no markdown fences, no explanation.';
  var prompt = 'Original draft (keep these exact words — make minimal changes only):\n"""\n' + (originalDraft || '(empty)') + '\n"""\n\n' +
    'User\'s instructions (do ONLY what they ask, nothing more):\n"""\n' + (context || '').trim() + '\n"""\n\n' +
    (meta && meta.tenant_name ? 'Recipient is at: ' + meta.tenant_name + '\n' : '') +
    'Output the minimally-edited email body now. Preserve the user\'s words.';
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 800, system: system, messages: [{ role: 'user', content: prompt }] }),
    });
    var d = await r.json();
    var txt = (d.content || []).find(function(b) { return b.type === 'text'; });
    return txt ? txt.text.trim() : null;
  } catch (e) { console.warn('[improve-draft] Claude error:', e.message); return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};
  var actionId = body.action_id;
  var context = (body.context || '').trim();
  if (!actionId) return res.status(400).json({ error: 'action_id required' });
  if (!context) return res.status(400).json({ error: 'context required' });

  var supabase = getSupabase();
  try {
    var loaded = await supabase.from('email_actions').select('id, claude_reply_draft, email_subject, action_payload').eq('id', actionId).maybeSingle();
    if (!loaded.data) return res.status(404).json({ error: 'action not found' });
    var original = loaded.data.claude_reply_draft || '';
    var ap = loaded.data.action_payload || {};
    var preservedOriginal = ap.original_draft || original;

    // Fetch the SP tenant's Calendly link — single source of truth from Settings → Notifications.
    var calendlyUrl = null;
    try {
      var SP_ID = (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387');
      var cu = await supabase.from('tenants').select('calendly_url').eq('id', SP_ID).maybeSingle();
      if (cu.data && cu.data.calendly_url) calendlyUrl = String(cu.data.calendly_url).trim();
    } catch (e) {}

    var improved = await rewrite(original, context, {
      tenant_name: ap.source_tenant_name || ap.tenant_name,
      calendly_url: calendlyUrl,
    });
    if (!improved) return res.status(502).json({ error: 'Claude did not return a draft — try again' });

    var newPayload = Object.assign({}, ap, {
      user_context: context,
      original_draft: preservedOriginal,
      improved_at: new Date().toISOString(),
    });

    var upd = await supabase.from('email_actions').update({
      claude_reply_draft: improved,
      action_payload: newPayload,
    }).eq('id', actionId).select('id');
    if (upd.error) return res.status(500).json({ error: 'persist failed: ' + upd.error.message });

    return res.status(200).json({ improved_draft: improved, original_draft: preservedOriginal, user_context: context });
  } catch (err) {
    console.error('[improve-draft] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
