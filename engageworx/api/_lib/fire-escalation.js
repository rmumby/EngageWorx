// api/_lib/fire-escalation.js — Fire real notifications when escalation rules trigger

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function fireEscalation(opts) {
  var tenantId = opts.tenantId;
  var ruleId = opts.ruleId;
  var conversationId = opts.conversationId || null;
  var contactInfo = opts.contactInfo || '';
  var triggerContext = opts.triggerContext || '';
  var triggerKeyword = opts.triggerKeyword || null;
  var contactId = opts.contactId || null;

  var supabase = opts.supabase || getSupabase();

  try {
    var ruleRes = await supabase.from('escalation_rules').select('*').eq('id', ruleId).maybeSingle();
    if (!ruleRes.data) { console.warn('[fireEscalation] Rule not found:', ruleId); return; }
    var rule = ruleRes.data;
    var ac = rule.action_config || {};

    if (!ac.notify_user_id) {
      console.warn('[fireEscalation] No notify_user_id configured for rule:', rule.rule_name);
      return;
    }
    var channels = ac.channels || [];
    if (channels.length === 0) {
      console.warn('[fireEscalation] No channels configured for rule:', rule.rule_name);
      return;
    }

    var userRes = await supabase.from('user_profiles').select('id, full_name, email, phone_number').eq('id', ac.notify_user_id).maybeSingle();
    if (!userRes.data) { console.warn('[fireEscalation] Notify user not found:', ac.notify_user_id); return; }
    var user = userRes.data;

    var tenantRes = await supabase.from('tenants').select('name, brand_name').eq('id', tenantId).maybeSingle();
    var tenantName = tenantRes.data ? (tenantRes.data.brand_name || tenantRes.data.name) : 'Unknown';

    var portalUrl = process.env.PORTAL_URL || 'https://portal.engwx.com';
    var convLink = conversationId ? portalUrl + '/?page=inbox&conv=' + conversationId : null;

    var succeeded = [];
    var failed = [];

    // Email notification
    if (channels.indexOf('email') !== -1 && user.email) {
      try {
        var fromEmail = process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com';
        try {
          var ecRes = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', tenantId).eq('channel', 'email').maybeSingle();
          if (ecRes.data && ecRes.data.config_encrypted && ecRes.data.config_encrypted.from_email) fromEmail = ecRes.data.config_encrypted.from_email;
        } catch (e) {}

        var subject = '[EngageWorx] Escalation: ' + rule.rule_name + ' — ' + tenantName;
        var html = '<div style="font-family:Arial,sans-serif;max-width:500px;padding:24px;">' +
          '<h2 style="color:#dc2626;margin:0 0 12px;">🚨 Escalation: ' + rule.rule_name + '</h2>' +
          '<p style="color:#475569;font-size:14px;line-height:1.6;">Rule <strong>' + rule.rule_name + '</strong> triggered in a conversation with <strong>' + (contactInfo || 'unknown contact') + '</strong>.</p>' +
          (triggerKeyword ? '<p style="color:#475569;font-size:14px;">Matched keyword: <code style="background:#fef2f2;color:#dc2626;padding:2px 6px;border-radius:4px;">' + triggerKeyword + '</code></p>' : '') +
          (triggerContext ? '<p style="color:#475569;font-size:13px;margin-top:12px;"><strong>Inbound content:</strong></p><blockquote style="border-left:3px solid #dc2626;margin:8px 0;padding:8px 12px;color:#64748b;font-size:13px;">' + triggerContext.substring(0, 300) + '</blockquote>' : '') +
          (ac.include_conversation_link !== false && convLink ? '<p style="margin-top:16px;"><a href="' + convLink + '" style="background:#00C9FF;color:#000;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">View Conversation</a></p>' : '') +
          '</div>';

        if (process.env.SENDGRID_API_KEY) {
          var sgMail = require('@sendgrid/mail');
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          await sgMail.send({ to: user.email, from: { email: fromEmail, name: tenantName + ' Escalation' }, subject: subject, html: html });
          succeeded.push('email');
        } else {
          failed.push({ channel: 'email', error: 'SENDGRID_API_KEY not configured' });
        }
      } catch (e) {
        failed.push({ channel: 'email', error: e.message });
      }
    }

    // SMS notification
    if (channels.indexOf('sms') !== -1 && user.phone_number) {
      try {
        var sid = process.env.TWILIO_ACCOUNT_SID;
        var token = process.env.TWILIO_AUTH_TOKEN;
        var twilioFrom = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+17869827800';
        if (sid && token) {
          var smsBody = '[EngageWorx] Escalation: ' + rule.rule_name + '. Contact: ' + (contactInfo || 'unknown') + '.';
          if (ac.include_conversation_link !== false && convLink) smsBody += ' ' + convLink;
          if (smsBody.length > 320) smsBody = smsBody.substring(0, 317) + '...';

          var url = 'https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json';
          var params = new URLSearchParams();
          params.append('To', user.phone_number);
          params.append('From', twilioFrom);
          params.append('Body', smsBody);
          var r = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': 'Basic ' + Buffer.from(sid + ':' + token).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
          });
          if (r.ok) succeeded.push('sms');
          else { var rd = await r.json().catch(function() { return {}; }); failed.push({ channel: 'sms', error: rd.message || 'Twilio ' + r.status }); }
        } else {
          failed.push({ channel: 'sms', error: 'Twilio credentials not configured' });
        }
      } catch (e) {
        failed.push({ channel: 'sms', error: e.message });
      }
    }

    console.log('🚨 Escalation fired:', { ruleId: ruleId, ruleName: rule.rule_name, notifyUserId: ac.notify_user_id, notifyEmail: user.email, channels: channels, success: succeeded, failed: failed });

    // Audit trail
    try {
      await supabase.from('escalation_log').insert({
        tenant_id: tenantId,
        rule_id: ruleId,
        conversation_id: conversationId,
        contact_id: contactId,
        notified_user_id: ac.notify_user_id,
        channels_attempted: channels,
        channels_succeeded: succeeded,
        channels_failed: failed.length > 0 ? failed : null,
        trigger_keyword_matched: triggerKeyword,
        trigger_excerpt: (triggerContext || '').substring(0, 500),
      });
    } catch (e) { console.warn('[fireEscalation] Audit log insert failed:', e.message); }

  } catch (e) {
    console.error('[fireEscalation] Error:', e.message);
  }
}

module.exports = { fireEscalation: fireEscalation };
