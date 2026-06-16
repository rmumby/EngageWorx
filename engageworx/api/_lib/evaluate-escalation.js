// api/_lib/evaluate-escalation.js — Evaluate escalation rules against inbound message
// Used by email-inbound-concierge.js before the Anthropic call.
// First matching rule wins (sorted by priority ASC, lowest = highest priority).

var { sendTenantEmail } = require('./send-tenant-email');
var { systemMailHeaders } = require('./system-mail');

var EXPLICIT_ASK_PATTERNS = [
  /speak\s+(to|with)\s+(a|an|the|someone|a\s+person|a\s+human|the\s+team|the\s+manager|a\s+coordinator)/i,
  /want\s+to\s+talk\s+to\s+(someone|a\s+person|a\s+human|the\s+team|the\s+manager)/i,
  /can\s+(i|we)\s+talk\s+to/i,
  /need\s+a\s+human/i,
  /need\s+to\s+speak/i,
];

function matchRule(rule, messageText) {
  var text = (messageText || '').toLowerCase();
  if (!text) return null;

  if (rule.trigger_type === 'keyword') {
    var config = rule.trigger_config || {};
    var keywords = config.keywords || [];
    if (keywords.length === 0) return null;
    var matchMode = config.match || 'any';
    var matched = [];
    for (var i = 0; i < keywords.length; i++) {
      if (text.indexOf(keywords[i].toLowerCase()) !== -1) matched.push(keywords[i]);
    }
    if (matchMode === 'all' && matched.length < keywords.length) return null;
    if (matched.length === 0) return null;
    return { keywords_matched: matched };
  }

  if (rule.trigger_type === 'explicit_ask') {
    for (var j = 0; j < EXPLICIT_ASK_PATTERNS.length; j++) {
      var m = messageText.match(EXPLICIT_ASK_PATTERNS[j]);
      if (m) return { pattern_matched: m[0] };
    }
    return null;
  }

  return null;
}

// Evaluate all rules against message. Returns { rule, match, actions } or null.
function findMatchingRule(rules, messageText) {
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    if (!rule.active) continue;
    var match = matchRule(rule, messageText);
    if (match) {
      var actions = (Array.isArray(rule.actions) && rule.actions.length > 0)
        ? rule.actions
        : [{ type: rule.action_type, config: rule.action_config || {} }];
      return { rule: rule, match: match, actions: actions };
    }
  }
  return null;
}

// Execute actions for a matched rule. Returns { skipAI, confirmationMessage }.
async function executeActions(supabase, matched, opts) {
  var rule = matched.rule;
  var actions = matched.actions;
  var skipAI = false;
  var confirmationMessage = null;

  for (var i = 0; i < actions.length; i++) {
    var action = actions[i];
    var actionConfig = action.config || {};

    if (action.type === 'notify') {
      var recipients = actionConfig.recipients || [];
      if (recipients.length === 0) {
        // Fallback: load tenant members with notify_on_escalation
        try {
          var { data: members } = await supabase.from('tenant_members')
            .select('notify_email').eq('tenant_id', opts.tenantId).eq('notify_on_escalation', true);
          recipients = (members || []).map(function(m) { return m.notify_email; }).filter(Boolean);
        } catch (e) {}
      }

      for (var r = 0; r < recipients.length; r++) {
        try {
          var portalUrl = 'https://portal.engwx.com';
          var subject = 'Escalation: ' + rule.rule_name + ' — ' + (opts.contactName || 'Unknown');
          var html = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">' +
            '<div style="background:linear-gradient(135deg,#FF6B35,#FF3B30);padding:16px 20px;border-radius:10px 10px 0 0;">' +
            '<h2 style="color:#fff;margin:0;font-size:16px;">Escalation: ' + rule.rule_name + '</h2></div>' +
            '<div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;">' +
            '<p style="color:#334155;font-size:14px;margin:0 0 12px;"><strong>From:</strong> ' + (opts.contactName || 'Unknown') + ' (' + (opts.senderEmail || '') + ')</p>' +
            '<p style="color:#334155;font-size:14px;margin:0 0 12px;"><strong>Rule:</strong> ' + rule.rule_name + '</p>' +
            (matched.match.keywords_matched ? '<p style="color:#334155;font-size:14px;margin:0 0 12px;"><strong>Keywords:</strong> ' + matched.match.keywords_matched.join(', ') + '</p>' : '') +
            '<div style="margin:12px 0;padding:12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;">' +
            '<div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Inbound Message</div>' +
            '<div style="color:#334155;font-size:13px;line-height:1.6;">' + (opts.messageBody || '').substring(0, 800).replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</div></div>' +
            '<a href="' + portalUrl + '/?page=inbox" style="display:inline-block;background:linear-gradient(135deg,#FF6B35,#FF3B30);color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;margin-top:8px;">View in LiveInbox</a>' +
            '</div></div>';

          await sendTenantEmail(supabase, {
            tenant_id: opts.tenantId,
            to: recipients[r],
            from: opts.tenantSenderEmail || undefined,
            from_name: opts.tenantName || 'Team',
            subject: subject,
            html: html,
            text: 'Escalation: ' + rule.rule_name + '\nFrom: ' + (opts.contactName || '') + '\n\n' + (opts.messageBody || '').substring(0, 500),
            // Stamp as platform system mail so inbound drops it (no self-referential escalation loop).
            headers: systemMailHeaders('escalation'),
          });
        } catch (e) {
          console.warn('[evaluate-escalation] Notify send failed for', recipients[r], ':', e.message);
        }
      }
      console.log('[evaluate-escalation] Notified', recipients.length, 'recipients for rule:', rule.rule_name);
    }

    if (action.type === 'pause_concierge' && opts.conversationId) {
      try {
        await supabase.from('conversations').update({
          concierge_paused: true,
          concierge_paused_at: new Date().toISOString(),
          concierge_paused_by_rule_id: rule.id,
        }).eq('id', opts.conversationId);
        console.log('[evaluate-escalation] Paused concierge for conversation:', opts.conversationId);
      } catch (e) {
        console.warn('[evaluate-escalation] Pause failed:', e.message);
      }
    }

    if (action.type === 'send_confirmation') {
      skipAI = true;
      confirmationMessage = actionConfig.message || 'Thanks for reaching out — one of our team will be in touch with you shortly.';
    }
  }

  return { skipAI: skipAI, confirmationMessage: confirmationMessage };
}

module.exports = {
  matchRule: matchRule,
  findMatchingRule: findMatchingRule,
  executeActions: executeActions,
  EXPLICIT_ASK_PATTERNS: EXPLICIT_ASK_PATTERNS,
};
