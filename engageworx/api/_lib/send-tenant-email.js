// api/_lib/send-tenant-email.js — Tenant→customer outbound email routing
// Routes through tenant's configured method (resend/gmail/smtp).
// Strict enforcement controlled by STRICT_TENANT_EMAIL_ENFORCEMENT env var.
// Every violation logged to email_routing_violations table.

var { generateThreadId, makeReplyToAddress } = require('./reply-thread');

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
  if (opts.bcc) payload.bcc = Array.isArray(opts.bcc) ? opts.bcc : [opts.bcc];

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
  if (opts.bcc) mailOpts.bcc = opts.bcc;

  var info = await transport.sendMail(mailOpts);
  return { success: true, message_id: info.messageId || null, method: 'smtp' };
}

// ── Fallback: platform Resend (grace period only) ───────────────────

async function sendViaResendFallback(opts) {
  var fromAddress = process.env.PLATFORM_FROM_EMAIL;
  if (!fromAddress) throw new Error('PLATFORM_FROM_EMAIL env var not set — cannot use fallback sender');
  var fromName = process.env.PLATFORM_NAME || 'Platform';
  return await sendViaResend(fromAddress, fromName, opts);
}

// ── Main entry point ────────────────────────────────────────────────

async function sendTenantEmail(supabase, opts) {
  if (!opts.tenant_id) throw new Error('tenant_id required');
  if (!opts.to) throw new Error('to required');
  if (!opts.subject) throw new Error('subject required');
  if (!opts.html && !opts.text) throw new Error('html or text required');

  // Load tenant
  var { data: tenant, error: tenantErr } = await supabase.from('tenants')
    .select('id, name, email_send_method, smtp_config_encrypted, resend_domain, resend_domain_verified, email_tracking_domain')
    .eq('id', opts.tenant_id).maybeSingle();

  if (tenantErr || !tenant) throw new Error('Tenant not found: ' + opts.tenant_id);

  // Build Reply-To for conversation threading
  var replyTo = opts.from || null;
  var threadId = null;
  if (opts.conversation_id) {
    threadId = generateThreadId();
    replyTo = makeReplyToAddress(threadId, tenant.email_tracking_domain);
  }

  var sendOpts = {
    to: opts.to,
    subject: opts.subject,
    html: opts.html || null,
    text: opts.text || null,
    replyTo: replyTo,
    bcc: opts.bcc || null,
    threadId: threadId,
  };

  console.log('[sendTenantEmail]', {
    tenant_id: opts.tenant_id,
    method: tenant.email_send_method,
    to: opts.to,
    domain_verified: tenant.resend_domain_verified,
  });

  // Route by method
  var method = tenant.email_send_method;

  // Gmail: stub until OAuth integration
  if (method === 'gmail') {
    throw new Error('Gmail OAuth integration coming soon. Configure verified domain or SMTP in Settings → Email Sync.');
  }

  // SMTP: use tenant's credentials
  if (method === 'smtp' && tenant.smtp_config_encrypted) {
    var smtpFrom = tenant.smtp_config_encrypted.from_address || opts.from;
    if (!smtpFrom) throw new Error('SMTP config has no from_address and no override provided');
    var smtpName = tenant.smtp_config_encrypted.from_name || opts.from_name || tenant.name;
    return await sendViaSMTP(tenant.smtp_config_encrypted, smtpFrom, smtpName, sendOpts);
  }

  // Resend with verified domain: send from tenant's domain
  if (method === 'resend' && tenant.resend_domain_verified && tenant.resend_domain) {
    var resendFrom = opts.from || ('hello@' + tenant.resend_domain);
    var resendName = opts.from_name || tenant.name;
    return await sendViaResend(resendFrom, resendName, sendOpts);
  }

  // ── Not configured — violation path ─────────────────────────────
  var strict = process.env.STRICT_TENANT_EMAIL_ENFORCEMENT === 'true';

  // ALWAYS log the violation
  try {
    await supabase.from('email_routing_violations').insert({
      tenant_id: opts.tenant_id,
      violation_type: 'tenant_email_unconfigured',
      to_address: opts.to,
      used_fallback: strict ? null : 'platform_resend',
    });
  } catch (_) {}

  console.warn('[sendTenantEmail] VIOLATION: tenant', opts.tenant_id, '(' + (tenant.name || 'unknown') + ')',
    'has no verified email config.', strict ? 'BLOCKED.' : 'Falling back to platform Resend.');

  if (strict) {
    throw new Error('Email sending not configured. Verify your domain or connect an email account in Settings → Email Sync.');
  }

  // Grace period fallback
  var result = await sendViaResendFallback(sendOpts);
  result.violation = true;
  result.violation_type = 'tenant_email_unconfigured';
  return result;
}

module.exports = { sendTenantEmail: sendTenantEmail };
