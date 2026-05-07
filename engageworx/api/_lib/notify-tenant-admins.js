// api/_lib/notify-tenant-admins.js — Route notifications to tenant admin emails
// Replaces all hardcoded rob@engwx.com fallback patterns.
//
// Priority order for recipients:
//   1. tenant_members with notify_on_<flag> = true (via _notify.getNotifyEmails)
//   2. tenants.primary_contact_email
//   3. Queue to tenant_admin_notifications table (no email sent)
//
// NEVER falls back to rob@engwx.com or PLATFORM_ADMIN_EMAIL.

var { getNotifyEmails } = require('../_notify');
var { sendTenantEmail } = require('./send-tenant-email');

// Map event_type → tenant_members notify flag
var EVENT_FLAG_MAP = {
  billing_payment: 'notify_on_payment',
  subscription_change: 'notify_on_payment',
  payment_failed: 'notify_on_payment',
  helpdesk_escalation: 'notify_on_escalation',
  tcr_status: 'notify_on_signup',
  kyc_status: 'notify_on_signup',
  new_lead: 'notify_on_new_lead',
  sms_event: 'notify_on_escalation',
  whatsapp_event: 'notify_on_escalation',
  voicemail: 'notify_on_escalation',
  transcript: 'notify_on_escalation',
  usage_alert: 'notify_on_payment',
  digest: 'notify_on_escalation',
  stale_leads: 'notify_on_new_lead',
  signup_recovery: 'notify_on_signup',
};

async function notifyTenantAdmins(supabase, tenantId, eventType, payload, options) {
  options = options || {};
  var subject = options.subject || '[EngageWorx] ' + eventType.replace(/_/g, ' ');
  var html = options.html || '';
  var text = options.text || '';

  if (!tenantId) {
    console.warn('[notifyTenantAdmins] No tenant_id — queuing as unrouted:', eventType);
    return await queueUnrouted(supabase, null, eventType, payload, 'no_tenant_id');
  }

  // 1. Try tenant_members notify flag
  var flag = EVENT_FLAG_MAP[eventType] || 'notify_on_escalation';
  var recipients = [];
  try {
    recipients = await getNotifyEmails(tenantId, flag);
  } catch (e) {
    console.warn('[notifyTenantAdmins] getNotifyEmails error:', e.message);
  }

  // 2. Fallback: tenants.primary_contact_email
  if (recipients.length === 0) {
    try {
      var tr = await supabase.from('tenants').select('primary_contact_email').eq('id', tenantId).maybeSingle();
      if (tr.data && tr.data.primary_contact_email) {
        recipients = [tr.data.primary_contact_email];
      }
    } catch (e) {}
  }

  // 3. No recipients → queue, never fall back to Rob
  if (recipients.length === 0) {
    console.warn('[notifyTenantAdmins] No recipients for', eventType, 'tenant:', tenantId, '— queuing');
    return await queueUnrouted(supabase, tenantId, eventType, payload, 'no_recipients_configured');
  }

  // Route via sendTenantEmail to each recipient
  var sent = [];
  var errors = [];
  for (var i = 0; i < recipients.length; i++) {
    try {
      await sendTenantEmail(supabase, {
        tenant_id: tenantId,
        to: recipients[i],
        subject: subject,
        html: html,
        text: text || subject,
      });
      sent.push(recipients[i]);
    } catch (e) {
      console.error('[notifyTenantAdmins] send failed to', recipients[i], ':', e.message);
      errors.push({ to: recipients[i], error: e.message });
    }
  }

  console.log('[notifyTenantAdmins]', eventType, 'tenant:', tenantId, 'sent:', sent.length, 'errors:', errors.length);
  return { routed: true, recipients: sent, errors: errors };
}

async function queueUnrouted(supabase, tenantId, eventType, payload, reason) {
  try {
    await supabase.from('tenant_admin_notifications').insert({
      tenant_id: tenantId,
      event_type: eventType,
      payload: payload || {},
      reason: reason,
      status: 'unrouted',
    });
    console.log('[notifyTenantAdmins] Queued unrouted:', eventType, 'tenant:', tenantId, 'reason:', reason);
    return { routed: false, queued: true, reason: reason };
  } catch (e) {
    console.error('[notifyTenantAdmins] Queue insert failed:', e.message);
    return { routed: false, queued: false, error: e.message };
  }
}

module.exports = { notifyTenantAdmins: notifyTenantAdmins };
