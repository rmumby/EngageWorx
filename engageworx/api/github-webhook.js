// api/github-webhook.js — GitHub push webhook → AI-summarized release notes
// POST (GitHub push events on main branch)
// Validates HMAC signature, summarizes each commit, stores in release_notes

var crypto = require('crypto');
var { createClient } = require('@supabase/supabase-js');
var { getPlatformConfig } = require('./_lib/platform-config');

function verifySignature(payload, signature, secret) {
  if (!secret || !signature) return false;
  var expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

var VENDOR_NAMES = ['twilio', 'sendgrid', 'anthropic', 'claude', 'supabase', 'vercel', 'resend', 'stripe'];
function sanitizeVendorNames(text) {
  if (!text) return text;
  var result = text;
  VENDOR_NAMES.forEach(function(v) {
    result = result.replace(new RegExp(v, 'gi'), function(match) {
      var map = { twilio: 'messaging infrastructure', sendgrid: 'email service', anthropic: 'AI provider', claude: 'AI assistant', supabase: 'cloud database', vercel: 'cloud platform', resend: 'email service', stripe: 'payment processor' };
      return map[match.toLowerCase()] || 'infrastructure provider';
    });
  });
  return result;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  var signature = req.headers['x-hub-signature-256'];
  var secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (secret && !verifySignature(rawBody, signature, secret)) {
    console.warn('[github-webhook] Invalid HMAC signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  var body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  var ref = body.ref;
  if (ref !== 'refs/heads/main') {
    console.log('[github-webhook] Ignoring non-main push:', ref);
    return res.status(200).json({ skipped: true, reason: 'not main branch' });
  }

  var commits = body.commits || [];
  if (commits.length === 0) return res.status(200).json({ skipped: true, reason: 'no commits' });

  console.log('[github-webhook] Processing', commits.length, 'commits on main');

  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  var pc = await getPlatformConfig();
  var aiPrompt = pc.release_note_ai_prompt || 'You translate engineering commit messages into customer-facing release notes. Use vendor-neutral language — never name underlying infrastructure providers even if mentioned in the commit. Output JSON: {"title":"short title","summary":"1-2 sentence customer-facing summary","audience":"all","feature_area":"area like Voice, Email, SMS, Live Inbox, AI, Platform, Settings","tenant_facing":true}. Set tenant_facing=false for internal-only changes (refactors, chores, dev infra, CI, tests).';

  var inserted = 0;
  var skipped = 0;
  var failed = 0;

  for (var i = 0; i < commits.length; i++) {
    var commit = commits[i];
    var sha = commit.id;
    var message = commit.message || '';
    var author = commit.author ? commit.author.name : 'unknown';
    var timestamp = commit.timestamp;

    // Skip if already exists (replay safety)
    var existing = await supabase.from('release_notes').select('id').eq('commit_sha', sha).maybeSingle();
    if (existing.data) { skipped++; continue; }

    // AI summarize
    var title = message.split('\n')[0].substring(0, 100);
    var summary = null;
    var audience = 'all';
    var featureArea = null;
    var tenantFacing = true;

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 300, system: aiPrompt, messages: [{ role: 'user', content: 'Commit message:\n' + message }] }),
        });
        var aiData = await aiRes.json();
        var aiText = (aiData.content || []).find(function(b) { return b.type === 'text'; });
        if (aiText) {
          try {
            var parsed = JSON.parse(aiText.text.replace(/```json|```/g, '').trim());
            title = sanitizeVendorNames(parsed.title || title);
            summary = sanitizeVendorNames(parsed.summary || null);
            audience = parsed.audience || 'all';
            featureArea = parsed.feature_area || null;
            tenantFacing = parsed.tenant_facing !== false;
          } catch (parseErr) {
            summary = sanitizeVendorNames(aiText.text.trim());
          }
        }
      } catch (aiErr) {
        console.warn('[github-webhook] AI error for', sha.substring(0, 7) + ':', aiErr.message);
      }
    }

    var ins = await supabase.from('release_notes').insert({
      commit_sha: sha, commit_message: message, commit_author: author,
      shipped_at: timestamp || new Date().toISOString(),
      title: title, summary: summary, audience: audience,
      feature_area: featureArea, tenant_facing: tenantFacing,
    });
    if (ins.error) { console.error('[github-webhook] Insert error:', sha.substring(0, 7), ins.error.message); failed++; }
    else { inserted++; }
  }

  console.log('[github-webhook] Done:', { inserted: inserted, skipped: skipped, failed: failed });
  return res.status(200).json({ inserted: inserted, skipped: skipped, failed: failed });
};
