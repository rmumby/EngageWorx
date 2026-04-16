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
  var system = 'You rewrite email drafts to incorporate new context naturally. Keep the same length and warmth as the original. Do NOT add salutations or sign-offs the original doesn\'t already have. Reference the new context specifically — names, events, topics — never generic. Output the rewritten body only, no preamble.';
  var prompt = 'Original draft:\n"""\n' + (originalDraft || '(empty)') + '\n"""\n\n' +
    'Context to weave in (provided by the sender):\n"""\n' + (context || '').trim() + '\n"""\n\n' +
    (meta && meta.tenant_name ? 'Recipient is at: ' + meta.tenant_name + '\n' : '') +
    (meta && meta.classification ? 'Reason for outreach: ' + meta.classification + '\n' : '') +
    (meta && meta.subject ? 'Subject line: ' + meta.subject + '\n' : '') +
    '\nRewrite the draft now.';
  try {
    var r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 800, system: system, messages: [{ role: 'user', content: prompt }] }),
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

    var improved = await rewrite(original, context, {
      tenant_name: ap.source_tenant_name || ap.tenant_name,
      classification: ap.classification,
      subject: loaded.data.email_subject,
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
