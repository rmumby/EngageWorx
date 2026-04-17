// api/tcr-webhook.js — Twilio TCR status webhook
// POST /api/tcr-webhook — receives brand/campaign status updates from Twilio

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function callClaude(system, message) {
  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system: system,
      messages: [{ role: 'user', content: message }],
    }),
  });
  var data = await res.json();
  return (data.content || []).find(function(b) { return b.type === 'text'; })?.text || '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var supabase = getSupabase();
  var event = req.body;
  var brandSid = event.BrandRegistrationSid || event.brand_registration_sid;
  var status = event.Status || event.status;
  var failureReason = event.FailureReason || event.failure_reason || '';

  console.log('[TCR Webhook] Brand:', brandSid, 'Status:', status, 'Reason:', failureReason);

  if (!brandSid) return res.status(200).json({ received: true });

  try {
    var subRes = await supabase.from('tcr_submissions').select('*, tenants(id, name)').eq('tcr_brand_id', brandSid).limit(1).single();
    var sub = subRes.data;
    if (!sub) {
      console.warn('[TCR Webhook] No submission found for brand:', brandSid);
      return res.status(200).json({ received: true });
    }

    var tenantId = sub.tenant_id;
    var tenantName = sub.tenants ? sub.tenants.name : sub.legal_name || 'Unknown';
    var sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    // ── APPROVED ────────────────────────────────────────────────────────────
    if (status === 'approved' || status === 'APPROVED' || status === 'verified' || status === 'VERIFIED') {
      await supabase.from('tcr_submissions').update({
        status: 'completed', brand_score: event.BrandScore || event.trust_score || null, updated_at: new Date().toISOString(),
      }).eq('id', sub.id);

      await supabase.from('tenants').update({
        sms_enabled: true, tcr_status: 'active', updated_at: new Date().toISOString(),
      }).eq('id', tenantId);

      try {
        await sgMail.send({
          to: (process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com'),
          from: { email: 'notifications@engwx.com', name: 'EngageWorx' },
          subject: 'TCR Approved: ' + tenantName,
          html: '<h3>TCR Registration Approved</h3>' +
            '<p><b>Tenant:</b> ' + tenantName + '</p>' +
            '<p><b>Brand SID:</b> ' + brandSid + '</p>' +
            '<p><b>Trust Score:</b> ' + (event.BrandScore || 'N/A') + '</p>' +
            '<p>SMS sending has been enabled for this tenant.</p>',
        });
      } catch (ne) {}

      if (sub.contact_email) {
        try {
          await sgMail.send({
            to: sub.contact_email,
            from: { email: (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'), name: 'EngageWorx' },
            subject: 'Your SMS registration is approved!',
            html: '<h3>Great news!</h3>' +
              '<p>Your A2P 10DLC registration has been approved by the carriers. SMS sending is now enabled on your account.</p>' +
              '<p><a href="https://portal.engwx.com">Log in to start sending →</a></p>' +
              '<p>EngageWorx Team</p>',
          });
        } catch (ne) {}
      }

      console.log('[TCR Webhook] Approved:', tenantName, '— SMS enabled');
    }

    // ── REJECTED ────────────────────────────────────────────────────────────
    else if (status === 'failed' || status === 'FAILED' || status === 'rejected' || status === 'REJECTED') {
      var aiSuggestion = '';
      try {
        aiSuggestion = await callClaude(
          'You are a TCR compliance expert. A 10DLC campaign registration was rejected. ' +
          'Explain the rejection reason in plain English and suggest specific fixes. Be concise (3-4 sentences).',
          'Rejection reason: ' + failureReason + '\n\nSubmission details:\n' +
          'Use case: ' + (sub.use_case || '') + '\n' +
          'Description: ' + (sub.use_case_description || '') + '\n' +
          'Sample messages: ' + JSON.stringify(sub.sample_messages || [])
        );
      } catch (e) { aiSuggestion = 'Unable to generate fix suggestion. Review the rejection reason manually.'; }

      await supabase.from('tcr_submissions').update({
        status: 'rejected',
        rejection_reason: failureReason + (aiSuggestion ? '\n\nSuggested fix: ' + aiSuggestion : ''),
        updated_at: new Date().toISOString(),
      }).eq('id', sub.id);

      await supabase.from('tenants').update({
        tcr_status: 'rejected', updated_at: new Date().toISOString(),
      }).eq('id', tenantId);

      try {
        await sgMail.send({
          to: (process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com'),
          from: { email: 'notifications@engwx.com', name: 'EngageWorx' },
          subject: 'TCR Rejected: ' + tenantName,
          html: '<h3>TCR Registration Rejected</h3>' +
            '<p><b>Tenant:</b> ' + tenantName + '</p>' +
            '<p><b>Reason:</b> ' + failureReason + '</p>' +
            '<p><b>AI Suggestion:</b> ' + aiSuggestion + '</p>',
        });
      } catch (ne) {}

      if (sub.contact_email) {
        try {
          await sgMail.send({
            to: sub.contact_email,
            from: { email: (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'), name: 'EngageWorx' },
            subject: 'Action needed: SMS registration update',
            html: '<h3>Registration Update</h3>' +
              '<p>Your A2P 10DLC registration needs attention. Our team is reviewing and will reach out with next steps.</p>' +
              '<p>If you have questions, reply to this email or call +1 (786) 982-7800.</p>' +
              '<p>EngageWorx Team</p>',
          });
        } catch (ne) {}
      }

      console.log('[TCR Webhook] Rejected:', tenantName, '—', failureReason);
    }

    else {
      console.log('[TCR Webhook] Unhandled status:', status);
    }

  } catch (err) {
    console.error('[TCR Webhook] Error:', err.message);
  }

  return res.status(200).json({ received: true });
};
