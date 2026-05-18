// api/email-forwarded-inbox.js — Inbound email forwarding → Action Items pipeline
// POST /api/email-forwarded-inbox (SendGrid Inbound Parse)
// Resolves tenant from leads.{slug}@inbound.engwx.com TO header,
// parses forwarded email format, dedups, inserts pending classification.
// Returns 200 fast; classification + action_item creation in commit 4.

var { createClient } = require('@supabase/supabase-js');
var { parseForwardedEmail, cleanSubject } = require('./_lib/forwardedEmailParser');
var crypto = require('crypto');

// Disable default body parser — SendGrid sends multipart/form-data
module.exports.config = { api: { bodyParser: false } };

var SLUG_PATTERN = /leads\.([a-z0-9][a-z0-9-]*)@inbound\.engwx\.com/i;

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ── Multipart parser (same as email-inbound.js) ─────────────────────────
function parseMultipart(req) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    req.on('data', function(chunk) { chunks.push(chunk); });
    req.on('end', function() {
      var body = Buffer.concat(chunks).toString();
      var contentType = req.headers['content-type'] || '';

      if (contentType.indexOf('application/x-www-form-urlencoded') !== -1) {
        var params = new URLSearchParams(body);
        var result = {};
        for (var pair of params) { result[pair[0]] = pair[1]; }
        return resolve(result);
      }

      if (contentType.indexOf('multipart/form-data') !== -1) {
        var boundary = contentType.split('boundary=')[1];
        if (!boundary) return resolve({ _raw: body });
        boundary = boundary.split(';')[0].trim();
        var parts = body.split('--' + boundary).filter(function(p) { return p.trim() && p.trim() !== '--'; });
        var result2 = {};
        parts.forEach(function(part) {
          var nameMatch = part.match(/name="([^"]+)"/);
          if (nameMatch) {
            var name = nameMatch[1];
            var valueStart = part.indexOf('\r\n\r\n');
            if (valueStart > -1) {
              var value = part.substring(valueStart + 4).trim();
              if (value.endsWith('--')) value = value.slice(0, -2).trim();
              if (value.endsWith('\r\n')) value = value.slice(0, -2);
              result2[name] = value;
            }
          }
        });
        return resolve(result2);
      }

      try { return resolve(JSON.parse(body)); } catch (e) {}
      try {
        var params2 = new URLSearchParams(body);
        var result3 = {};
        for (var pair2 of params2) { result3[pair2[0]] = pair2[1]; }
        if (Object.keys(result3).length > 0) return resolve(result3);
      } catch (e) {}

      resolve({ _raw: body });
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true });

  var supabase = getSupabase();

  var body;
  try { body = await parseMultipart(req); } catch (e) {
    console.error('[fwd-inbox] Parse error:', e.message);
    return res.status(200).json({ ok: true, error: 'parse_failed' });
  }

  var fromHeader  = body.from || '';
  var toHeader    = body.to || '';
  var ccHeader    = body.cc || '';
  var subject     = body.subject || '';
  var textBody    = body.text || '';
  var htmlBody    = body.html || '';
  var rawHeaders  = body.headers || '';

  console.log('[fwd-inbox] Received:', { from: fromHeader.substring(0, 60), to: toHeader.substring(0, 80), subject: subject.substring(0, 60) });

  // ── 1. Tenant resolution by slug ──────────────────────────────────────────
  var allRecipients = (toHeader + ',' + ccHeader).toLowerCase();
  var slugMatch = SLUG_PATTERN.exec(allRecipients);

  if (!slugMatch) {
    console.log('[fwd-inbox] No leads.{slug}@ pattern in TO/CC — dropping');
    return res.status(200).json({ ok: true, dropped: 'no_slug_match' });
  }

  var slug = slugMatch[1].toLowerCase();
  var { data: tenant } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('inbound_email_slug', slug)
    .maybeSingle();

  if (!tenant) {
    console.log('[fwd-inbox] No tenant for slug:', slug);
    return res.status(200).json({ ok: true, dropped: 'unknown_slug' });
  }

  var tenantId = tenant.id;

  // ── 2. Parse forwarded email ──────────────────────────────────────────────
  var parsed = parseForwardedEmail(textBody || htmlBody, rawHeaders, fromHeader);

  var senderEmail = (parsed.originalSenderEmail || '').toLowerCase().trim();
  var senderName = parsed.originalSenderName || '';
  var cleanedSubject = parsed.originalSubject || cleanSubject(subject);
  var cleanedBody = parsed.cleanedBody || textBody || '';

  if (!senderEmail) {
    console.log('[fwd-inbox] No sender email resolved — dropping:', { tenant_id: tenantId, subject: subject });
    return res.status(200).json({ ok: true, dropped: 'no_sender' });
  }

  // ── 3. Dedup by Message-ID ────────────────────────────────────────────────
  var messageId = null;
  // Extract Message-ID from headers
  if (rawHeaders) {
    var midMatch = rawHeaders.match(/^Message-ID:\s*<([^>]+)>/im);
    if (midMatch) messageId = midMatch[1];
  }
  // Fallback: hash of sender + subject + body prefix
  if (!messageId) {
    var hashInput = senderEmail + '|' + cleanedSubject + '|' + (cleanedBody || '').substring(0, 200);
    messageId = 'hash-' + crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 24);
  }

  // Check for existing classification
  var { data: existing } = await supabase
    .from('inbound_email_classifications')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('message_id', messageId)
    .maybeSingle();

  if (existing) {
    console.log('[fwd-inbox] Duplicate — already classified:', { tenant_id: tenantId, message_id: messageId });
    return res.status(200).json({ ok: true, dropped: 'duplicate' });
  }

  // ── 4. Insert pending classification row ──────────────────────────────────
  var headersJson = null;
  try {
    if (typeof rawHeaders === 'string' && rawHeaders.trim().startsWith('{')) {
      headersJson = JSON.parse(rawHeaders);
    } else if (rawHeaders) {
      headersJson = { raw: rawHeaders.substring(0, 5000) };
    }
  } catch (e) { headersJson = { raw: (rawHeaders || '').substring(0, 5000) }; }

  var { data: classification, error: insertErr } = await supabase
    .from('inbound_email_classifications')
    .insert({
      tenant_id: tenantId,
      message_id: messageId,
      sender_email: senderEmail,
      sender_name: senderName || null,
      subject: cleanedSubject || null,
      classification: 'pending',
      filtered: false,
      raw_headers: headersJson,
    })
    .select('id')
    .single();

  if (insertErr) {
    // Likely unique constraint violation (race condition dedup)
    console.log('[fwd-inbox] Insert failed (likely dedup race):', insertErr.message);
    return res.status(200).json({ ok: true, dropped: 'insert_conflict' });
  }

  console.log('[fwd-inbox] Classification created:', {
    id: classification.id,
    tenant_id: tenantId,
    sender: senderEmail,
    subject: cleanedSubject,
    forwarded: parsed.wasForwarded,
    forwarded_by: parsed.forwardedBy ? parsed.forwardedBy.email : null,
  });

  // ── 5. Store cleaned body for downstream classification ────────────────
  await supabase.from('inbound_email_classifications').update({
    cleaned_body: cleanedBody.substring(0, 10000),
  }).eq('id', classification.id);

  // ── 6. Fire-and-forget: trigger classification + action_item creation ──
  var classifyUrl = (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000') + '/api/email-classify';
  var internalSecret = process.env.EMAIL_CLASSIFY_INTERNAL_SECRET || '';
  fetch(classifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
    body: JSON.stringify({ classification_id: classification.id }),
  }).catch(function(e) { console.warn('[fwd-inbox] Classify trigger failed (non-fatal):', e.message); });

  // ── 7. Return 200 fast ────────────────────────────────────────────────────
  return res.status(200).json({ ok: true, classification_id: classification.id });
};
