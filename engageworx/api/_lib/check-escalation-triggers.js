// api/_lib/check-escalation-triggers.js — Detect which escalation rules match inbound content

var { fireEscalation } = require('./fire-escalation');

async function checkEscalationTriggers(opts) {
  var supabase = opts.supabase;
  var tenantId = opts.tenantId;
  var inboundBody = opts.inboundBody || '';
  var contactId = opts.contactId || null;
  var conversationId = opts.conversationId || null;
  var contactInfo = opts.contactInfo || '';
  var isVip = opts.isVip || false;

  if (!tenantId || !supabase) return [];

  try {
    var rulesRes = await supabase.from('escalation_rules').select('*').eq('tenant_id', tenantId).eq('active', true).order('priority', { ascending: true });
    if (!rulesRes.data || rulesRes.data.length === 0) return [];

    var bodyLower = (inboundBody || '').toLowerCase();
    var matched = [];

    for (var i = 0; i < rulesRes.data.length; i++) {
      var rule = rulesRes.data[i];
      var triggered = false;
      var matchedKeyword = null;

      if (rule.trigger_type === 'keyword') {
        var keywords = (rule.trigger_config && rule.trigger_config.keywords) || [];
        for (var k = 0; k < keywords.length; k++) {
          if (bodyLower.indexOf(keywords[k].toLowerCase()) !== -1) {
            triggered = true;
            matchedKeyword = keywords[k];
            break;
          }
        }
      } else if (rule.trigger_type === 'vip_match') {
        if (isVip) triggered = true;
      } else if (rule.trigger_type === 'sentiment') {
        console.log('[EscalationTrigger] Sentiment triggers are Phase 2b, not firing for rule:', rule.rule_name);
      }

      if (triggered) {
        matched.push({ ruleId: rule.id, ruleName: rule.rule_name, keyword: matchedKeyword });
        // Fire notification non-blocking
        fireEscalation({
          supabase: supabase,
          tenantId: tenantId,
          ruleId: rule.id,
          conversationId: conversationId,
          contactId: contactId,
          contactInfo: contactInfo,
          triggerContext: inboundBody,
          triggerKeyword: matchedKeyword,
        }).catch(function(e) { console.error('[EscalationTrigger] fireEscalation error for rule ' + rule.rule_name + ':', e.message); });
      }
    }

    if (matched.length > 0) {
      console.log('🎯 Escalation triggers matched:', { tenantId: tenantId, rules: matched.map(function(m) { return m.ruleName + (m.keyword ? ' (keyword: ' + m.keyword + ')' : ''); }) });
    }

    return matched;
  } catch (e) {
    console.error('[checkEscalationTriggers] Error:', e.message);
    return [];
  }
}

module.exports = { checkEscalationTriggers: checkEscalationTriggers };
