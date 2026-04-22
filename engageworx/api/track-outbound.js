// api/track-outbound.js
// SendGrid Inbound Parse webhook for outbound tracking. Configure track@engwx.com
// (or your tenant-specific tracking alias) in SendGrid → Inbound Parse to POST here.
// When a user BCCs track@engwx.com on a Gmail/Outlook reply, we log the outbound
// message into the matched contact's conversation so Live Inbox shows the full thread.

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function parseAddrList(header) {
  if (!header) return [];
  var parts = String(header).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  return parts.map(function(raw) {
    var e = (raw.match(/<([^>]+)>/) || [])[1] || raw;
    return (e || '').trim().toLowerCase();
  }).filter(function(e) { return e && e.indexOf('@') !== -1; });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};

  // SendGrid inbound parse — multipart/form-data. If Vercel didn't parse, replicate the pattern
  // used by api/email-inbound.js (buffer-the-stream + split on boundary). Keep this lean: the
  // inbound-parse config at SendGrid can be set to "post raw fields" with parsed form data.
  if (!body || Object.keys(body).length === 0) {
    var rawBody = await new Promise(function(resolve) {
      var chunks = [];
      req.on('data', function(c) { chunks.push(c); });
      req.on('end', function() { resolve(Buffer.concat(chunks).toString()); });
    });
    var ct = req.headers['content-type'] || '';
    var boundary = ct.split('boundary=')[1];
    if (boundary) {
      boundary = boundary.split(';')[0].trim();
      body = {};
      rawBody.split('--' + boundary).forEach(function(part) {
        var m = part.match(/Content-Disposition: form-data; name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n$/);
        if (m) body[m[1]] = m[2];
      });
    }
  }

  var supabase = getSupabase();
  try {
    var fromRaw = body.from || '';
    var toHeader = body.to || '';
    var ccHeader = body.cc || '';
    var subject = body.subject || '(no subject)';
    var text = body.text || '';
    var html = body.html || '';
    var senderEmail = ((fromRaw.match(/<([^>]+)>/) || [])[1] || fromRaw).trim().toLowerCase();
    var emailBody = (text || html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).substring(0, 4000);

    // Identify the tenant. Preferred: the BCC address `track+{slug}@track.engwx.com` embeds the
    // tenant's unique slug so we don't rely on sender matching. Fall back to user_profiles /
    // digest_email lookup for the legacy `track@engwx.com` alias or edge cases.
    var tenantId = null;
    var allRecipientsRaw = [body.to, body.cc, body.bcc, body.envelope].filter(Boolean).join(' ').toLowerCase();
    // Match both new track.engwx.com and legacy engwx.com
    var slugMatch = allRecipientsRaw.match(/track\+([a-z0-9]{4,})@(?:track\.)?engwx\.com/);
    if (slugMatch) {
      try {
        var ts = await supabase.from('tenants').select('id').eq('email_tracking_slug', slugMatch[1]).maybeSingle();
        if (ts.data) tenantId = ts.data.id;
      } catch (e) {}
    }
    if (!tenantId) {
      try {
        var up = await supabase.from('user_profiles').select('id, tenant_id').ilike('email', senderEmail).maybeSingle();
        if (up.data && up.data.tenant_id) tenantId = up.data.tenant_id;
      } catch (e) {}
    }
    if (!tenantId) {
      try {
        var td = await supabase.from('tenants').select('id').ilike('digest_email', senderEmail).maybeSingle();
        if (td.data) tenantId = td.data.id;
      } catch (e) {}
    }
    if (!tenantId) {
      console.warn('[track-outbound] sender not matched to any tenant:', senderEmail);
      return res.status(200).json({ skipped: 'no_tenant_match', sender: senderEmail });
    }

    // Primary recipient = first To address that isn't a tracking alias
    var recipients = parseAddrList(toHeader).concat(parseAddrList(ccHeader))
      .filter(function(e) { return e !== senderEmail && !/^track[\+@]/.test(e) && !/^bcc@/.test(e) && e.indexOf('@track.engwx.com') === -1; });
    if (recipients.length === 0) {
      return res.status(200).json({ skipped: 'no_recipient' });
    }
    var primaryTo = recipients[0];

    // Find the contact within this tenant
    var contact = await supabase.from('contacts').select('id').eq('tenant_id', tenantId).ilike('email', primaryTo).limit(1).maybeSingle();
    if (!contact.data) {
      // Optionally auto-create — keep it scoped to the sender's tenant. Internal addresses excluded.
      var INTERNAL = [(process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com'), (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'), 'notifications@engwx.com', 'support@engwx.com'];
      if (INTERNAL.indexOf(primaryTo) !== -1) return res.status(200).json({ skipped: 'internal_recipient' });
      var _companies = require('./_companies');
      var companyId = await _companies.ensureCompanyForContact(supabase, tenantId, primaryTo);
      var newC = await supabase.from('contacts').insert({
        tenant_id: tenantId, email: primaryTo, first_name: primaryTo.split('@')[0], status: 'active',
        source: 'outbound_bcc', company_id: companyId || null,
      }).select('id').single();
      contact = { data: newC.data };
    }
    var contactId = contact.data && contact.data.id;
    if (!contactId) return res.status(500).json({ error: 'contact create failed' });

    // Find or create an open conversation
    var conv = await supabase.from('conversations').select('id').eq('tenant_id', tenantId).eq('contact_id', contactId).eq('channel', 'email').in('status', ['active', 'waiting']).limit(1).maybeSingle();
    var conversationId = conv.data && conv.data.id;
    if (!conversationId) {
      var newConv = await supabase.from('conversations').insert({
        tenant_id: tenantId, contact_id: contactId, channel: 'email', status: 'active',
        subject: subject, last_message_at: new Date().toISOString(), unread_count: 0,
      }).select('id').single();
      conversationId = newConv.data && newConv.data.id;
    }
    if (!conversationId) return res.status(500).json({ error: 'conversation create failed' });

    // Insert outbound message
    var msg = await supabase.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      contact_id: contactId,
      channel: 'email',
      direction: 'outbound',
      sender_type: 'agent',
      body: emailBody,
      status: 'sent',
      metadata: { from: senderEmail, to: recipients, subject: subject, source: 'bcc_tracking' },
      created_at: new Date().toISOString(),
    }).select('id').single();

    await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conversationId);

    console.log('[track-outbound] logged outbound from', senderEmail, '→', primaryTo, 'conv:', conversationId);
    return res.status(200).json({ success: true, message_id: msg.data && msg.data.id, conversation_id: conversationId });
  } catch (err) {
    console.error('[track-outbound] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

module.exports.config = { api: { bodyParser: false } };
