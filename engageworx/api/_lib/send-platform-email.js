// api/_lib/send-platform-email.js — Platform→tenant notification email routing
// Walks parent_tenant_id chain to find the CSP/EngageWorx platform owner.
// Sends FROM the platform owner's verified domain.
// STRICT — no fallback, no env flag. Domain must be verified.

// ── Provider implementations ────────────────────────────────────────

async function sendViaResend(fromAddress, fromName, opts) {
  var resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error('RESEND_API_KEY not configured');

  var payload = {
    from: fromName ? fromName + ' <' + fromAddress + '>' : fromAddress,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
  };
  if (opts.html) payload.html = opts.html;
  if (opts.text) payload.text = opts.text;
  if (opts.replyTo) payload.reply_to = opts.replyTo;

  var res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    var errBody;
    try { errBody = await res.json(); } catch (_) { errBody = {}; }
    throw new Error('Resend error: ' + (errBody.message || errBody.error || 'HTTP ' + res.status));
  }

  var data = await res.json();
  return { success: true, message_id: data.id || null, method: 'resend' };
}

async function sendViaSMTP(smtpConfig, fromAddress, fromName, opts) {
  if (!smtpConfig || !smtpConfig.host || !smtpConfig.username) {
    throw new Error('SMTP credentials incomplete');
  }

  var nodemailer = require('nodemailer');
  var transport = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port || 587,
    secure: smtpConfig.port === 465,
    auth: { user: smtpConfig.username, pass: smtpConfig.password_encrypted },
  });

  var mailOpts = {
    from: fromName ? fromName + ' <' + fromAddress + '>' : fromAddress,
    to: opts.to,
    subject: opts.subject,
  };
  if (opts.html) mailOpts.html = opts.html;
  if (opts.text) mailOpts.text = opts.text;
  if (opts.replyTo) mailOpts.replyTo = opts.replyTo;

  var info = await transport.sendMail(mailOpts);
  return { success: true, message_id: info.messageId || null, method: 'smtp' };
}

// ── Parent walking ──────────────────────────────────────────────────

async function resolvePlatformOwner(supabase, recipientTenantId) {
  var visited = new Set();
  var currentId = recipientTenantId;
  var ownerTypes = ['internal', 'csp_partner', 'agent', 'master_agent'];

  for (var hop = 0; hop < 5; hop++) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    var { data: tenant } = await supabase.from('tenants')
      .select('id, name, customer_type, parent_tenant_id, ' +
        'platform_email_send_method, platform_email_from_address, ' +
        'platform_email_domain, platform_email_domain_verified, ' +
        'platform_smtp_config_encrypted')
      .eq('id', currentId).maybeSingle();

    if (!tenant) return null;

    // Is this a platform owner type with a verified domain? Return it.
    // If it's an owner type but has NO verified domain and HAS a parent, keep walking up.
    if (ownerTypes.indexOf(tenant.customer_type) >= 0) {
      if (tenant.platform_email_domain_verified) return tenant;
      if (!tenant.parent_tenant_id) return tenant; // root with no domain — will fail at verification
      // Unverified owner with parent — walk up to find a verified ancestor
    }

    // No parent? This is the root
    if (!tenant.parent_tenant_id) return tenant;

    // Walk up
    currentId = tenant.parent_tenant_id;
  }

  return null;
}

// ── Main entry point ────────────────────────────────────────────────

async function sendPlatformEmail(supabase, opts) {
  if (!opts.recipient_tenant_id) throw new Error('recipient_tenant_id required');
  if (!opts.to) throw new Error('to required');
  if (!opts.subject) throw new Error('subject required');
  if (!opts.html && !opts.text) throw new Error('html or text required');

  // Resolve platform owner via parent walking. opts.owner_tenant_id (the CREATOR/parent) overrides
  // the recipient as the anchor — used by the tenant-creation welcome so a brand-new (always
  // unverified) tenant's own domain never gates the platform's welcome TO it. The sender is the
  // creator's verified domain (SP, or the parent CSP). Without an override, anchor on the recipient
  // (correct for steady-state platform mail like nudges, where the recipient's own owner sends).
  var owner = await resolvePlatformOwner(supabase, opts.owner_tenant_id || opts.recipient_tenant_id);

  if (!owner) {
    throw new Error('Could not resolve platform owner for tenant ' + opts.recipient_tenant_id);
  }

  console.log('[sendPlatformEmail]', {
    recipient_tenant_id: opts.recipient_tenant_id,
    platform_owner: owner.id,
    owner_name: owner.name,
    owner_type: owner.customer_type,
    domain_verified: owner.platform_email_domain_verified,
    domain: owner.platform_email_domain,
  });

  // STRICT: domain must be verified. No fallback.
  if (!owner.platform_email_domain_verified) {
    // Log violation
    try {
      await supabase.from('email_routing_violations').insert({
        tenant_id: opts.recipient_tenant_id,
        violation_type: 'platform_email_unverified',
        to_address: opts.to,
        used_fallback: null,
      });
    } catch (_) {}

    throw new Error(
      'Platform email domain not verified. ' +
      (owner.name || 'Platform owner') +
      ' must verify their sending domain (' +
      (owner.platform_email_domain || 'not set') +
      ') before sending platform emails to sub-tenants. Configure in Settings → Email Sync.'
    );
  }

  var fromAddress = owner.platform_email_from_address;
  if (!fromAddress) {
    throw new Error('Platform owner ' + (owner.name || owner.id) + ' has no platform_email_from_address configured.');
  }

  var fromName = opts.from_name || owner.name || 'Platform';

  var sendOpts = {
    to: opts.to,
    subject: opts.subject,
    html: opts.html || null,
    text: opts.text || null,
    replyTo: opts.replyTo || fromAddress,
  };

  // Route by platform owner's method
  if (owner.platform_email_send_method === 'smtp' && owner.platform_smtp_config_encrypted) {
    return await sendViaSMTP(owner.platform_smtp_config_encrypted, fromAddress, fromName, sendOpts);
  }

  // Default: Resend from owner's verified domain
  return await sendViaResend(fromAddress, fromName, sendOpts);
}

module.exports = { sendPlatformEmail: sendPlatformEmail, resolvePlatformOwner: resolvePlatformOwner };
