// api/cron-digest-scheduled.js — fires email_actions whose scheduled_at has passed
// Schedule: every 30 minutes. Re-uses the same action semantics as the digest UI.

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function executeAction(supabase, a) {
  try {
    if (a.claude_action === 'advance_stage' && a.lead_id && a.action_payload && a.action_payload.new_stage) {
      await supabase.from('leads').update({ stage: a.action_payload.new_stage, last_activity_at: new Date().toISOString() }).eq('id', a.lead_id);
      return true;
    }
    if (a.claude_action === 'enroll_sequence' && a.lead_id && a.tenant_id && a.action_payload && a.action_payload.sequence_name) {
      var seq = await supabase.from('sequences').select('id').eq('tenant_id', a.tenant_id).ilike('name', '%' + a.action_payload.sequence_name + '%').limit(1).maybeSingle();
      if (!seq.data) seq = await supabase.from('sequences').select('id').eq('tenant_id', (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387')).ilike('name', '%' + a.action_payload.sequence_name + '%').limit(1).maybeSingle();
      if (!seq.data) return false;
      var fs = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', seq.data.id).eq('step_number', 1).single();
      var nextAt = new Date(Date.now() + ((fs.data && fs.data.delay_days) || 0) * 86400000).toISOString();
      await supabase.from('lead_sequences').upsert({
        tenant_id: a.tenant_id, lead_id: a.lead_id, sequence_id: seq.data.id,
        current_step: 0, status: 'active', enrolled_at: new Date().toISOString(), next_step_at: nextAt,
      }, { onConflict: 'lead_id,sequence_id' });
      return true;
    }
    if ((a.claude_action === 'auto_reply' || a.claude_action === 'review') && a.claude_reply_draft && a.email_from) {
      if (!process.env.SENDGRID_API_KEY) return false;
      var sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      var subj = (a.email_subject || '').startsWith('Re:') ? a.email_subject : 'Re: ' + (a.email_subject || 'your message');
      var _sig = require('./_email-signature');
      var sigInfo = await _sig.getSignature(supabase, { tenantId: a.tenant_id || null, fromEmail: (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'), isFirstTouch: false, closingKind: 'reply' });
      var bodyHtml = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;line-height:1.6;white-space:pre-wrap;">' + a.claude_reply_draft.replace(/</g, '&lt;') + '</div>';
      await sgMail.send({
        to: a.email_from,
        from: { email: (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'), name: sigInfo.fromName || 'EngageWorx' },
        replyTo: (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'),
        subject: subj,
        text: _sig.composeTextBody(a.claude_reply_draft, sigInfo.closingLine, sigInfo.fromName),
        html: _sig.composeHtmlBody(bodyHtml, sigInfo.closingLine, sigInfo.signatureHtml),
      });
      return true;
    }
    if (a.claude_action === 'no_action') return true;
  } catch (e) {
    console.warn('[Cron] executeAction error for', a.id, e.message);
    return false;
  }
  return false;
}

module.exports = async function handler(req, res) {
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) return res.status(401).json({ error: 'Unauthorized' });

  var supabase = getSupabase();
  var now = new Date().toISOString();

  try {
    var dueRes = await supabase.from('email_actions')
      .select('*')
      .eq('status', 'pending')
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', now)
      .limit(200);
    var due = dueRes.data || [];

    var fired = 0, failed = 0;
    for (var a of due) {
      var ok = await executeAction(supabase, a);
      if (ok) {
        await supabase.from('email_actions').update({
          status: 'actioned',
          actioned_at: new Date().toISOString(),
        }).eq('id', a.id);
        fired++;
      } else {
        failed++;
      }
    }

    console.log('[Cron] Digest scheduled fired:', fired, 'failed:', failed, 'of', due.length, 'due');
    return res.status(200).json({ success: true, due: due.length, fired: fired, failed: failed });
  } catch (err) {
    console.error('[Cron] Digest scheduled error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
