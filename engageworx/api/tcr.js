// api/tcr.js — TCR A2P Registration API
// GET  /api/tcr?action=prefill&tenant_id=xxx
// POST /api/tcr?action=validate
// POST /api/tcr?action=generate-copy
// POST /api/tcr?action=submit-draft
// POST /api/tcr?action=submit-tcr  (SP Admin only)

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

var EW_SP_TENANT_ID = 'c1bc59a8-5235-4921-9755-02514b574387';

async function callClaude(system, userMessage, maxTokens) {
  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens || 1024,
      system: system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  var data = await res.json();
  return (data.content || []).find(function(b) { return b.type === 'text'; })?.text || '';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var action = req.query.action;
  var supabase = getSupabase();

  // ── PREFILL: read tenant profile → return pre-filled form fields ────────
  if (action === 'prefill' && req.method === 'GET') {
    var tenantId = req.query.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

    try {
      var tenantRes = await supabase.from('tenants').select('*').eq('id', tenantId).single();
      var tenant = tenantRes.data;
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      var ownerRes = await supabase.from('tenant_members').select('user_id').eq('tenant_id', tenantId).eq('role', 'admin').limit(1);
      var ownerProfile = null;
      if (ownerRes.data && ownerRes.data[0]) {
        var pRes = await supabase.from('user_profiles').select('*').eq('id', ownerRes.data[0].user_id).single();
        ownerProfile = pRes.data;
      }

      var prefill = {
        legalName: tenant.brand_name || tenant.name || '',
        dba: tenant.brand_name || tenant.name || '',
        website: tenant.website_url || '',
        vertical: 'Telecommunications',
        country: 'US',
        contactFirstName: ownerProfile ? (ownerProfile.full_name || '').split(' ')[0] : '',
        contactLastName: ownerProfile ? (ownerProfile.full_name || '').split(' ').slice(1).join(' ') : '',
        contactEmail: ownerProfile ? ownerProfile.email || '' : '',
        contactPhone: '',
        contactTitle: '',
      };

      var existing = await supabase.from('tcr_submissions').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1);
      return res.status(200).json({ prefill: prefill, existing: existing.data ? existing.data[0] : null });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  var body = req.body || {};

  // ── VALIDATE: Claude checks against TCR rejection patterns ──────────────
  if (action === 'validate') {
    try {
      var system = 'You are a TCR (The Campaign Registry) compliance expert for A2P 10DLC SMS registration. ' +
        'You review campaign registration submissions and identify issues that would cause TCR rejection. ' +
        'Common rejection reasons: T04 (incomplete sample messages), T25 (misleading content), T40 (missing opt-in), ' +
        'T50 (prohibited content). Return JSON with: score (0-100), pass (boolean, true if score >= 80), ' +
        'issues (array of {field, severity, message}). Be strict — carriers reject aggressively.';

      var text = callClaude(system, 'Review this TCR campaign submission:\n\n' + JSON.stringify(body.submission, null, 2), 1500);
      var result = await text;

      var parsed;
      try {
        var jsonMatch = result.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 50, pass: false, issues: [{ field: 'general', severity: 'error', message: 'Could not parse validation result' }] };
      } catch (e) {
        parsed = { score: 50, pass: false, issues: [{ field: 'general', severity: 'warning', message: result.substring(0, 500) }] };
      }

      return res.status(200).json(parsed);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GENERATE-COPY: Claude generates description + 5 sample messages ─────
  if (action === 'generate-copy') {
    try {
      var genSystem = 'You are a TCR compliance copywriter. Generate A2P 10DLC compliant campaign copy. ' +
        'All sample messages MUST include: opt-out language ("Reply STOP to unsubscribe"), ' +
        'business identifier, and be under 160 characters. Messages should feel authentic, not templated. ' +
        'Return JSON: { description (string, 2-3 sentences), sampleMessages (array of exactly 5 strings) }';

      var prompt = 'Company: ' + (body.companyName || 'Unknown') +
        '\nIndustry: ' + (body.vertical || 'General') +
        '\nUse case: ' + (body.useCase || 'mixed') +
        '\nBusiness description: ' + (body.businessDescription || 'SMS messaging platform') +
        '\n\nGenerate a TCR-compliant campaign description and 5 diverse sample messages for this business.';

      var genResult = await callClaude(genSystem, prompt, 1200);
      var genParsed;
      try {
        var genMatch = genResult.match(/\{[\s\S]*\}/);
        genParsed = genMatch ? JSON.parse(genMatch[0]) : null;
      } catch (e) { genParsed = null; }

      if (!genParsed || !genParsed.sampleMessages) {
        return res.status(200).json({
          description: 'SMS messaging for customer communication including service updates, appointment reminders, and account notifications.',
          sampleMessages: [
            body.companyName + ': Your appointment is confirmed for tomorrow at 2pm. Reply STOP to unsubscribe.',
            body.companyName + ': Your order #1234 has shipped! Track: engwx.com/track. Reply STOP to opt out.',
            body.companyName + ': Reminder — your account payment is due in 3 days. Reply STOP to unsubscribe.',
            body.companyName + ': Thank you for contacting us. A team member will respond shortly. Reply STOP to opt out.',
            body.companyName + ': Your verification code is 482910. Do not share this code. Reply STOP to unsubscribe.',
          ],
        });
      }
      return res.status(200).json(genParsed);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── SUBMIT-DRAFT: save to tcr_submissions + email SP admin ──────────────
  if (action === 'submit-draft') {
    var tenantId = body.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

    try {
      var submissionData = {
        tenant_id: tenantId,
        status: 'pending_review',
        current_step: 4,
        legal_name: body.legalName,
        dba: body.dba,
        entity_type: body.entityType,
        ein: body.ein,
        vertical: body.vertical,
        website: body.website,
        country: body.country || 'US',
        state: body.state,
        city: body.city,
        zip: body.zip,
        street: body.street,
        contact_first_name: body.contactFirstName,
        contact_last_name: body.contactLastName,
        contact_email: body.contactEmail,
        contact_phone: body.contactPhone,
        contact_title: body.contactTitle,
        use_case: body.useCase,
        use_case_description: body.useCaseDescription,
        message_volume: body.messageVolume,
        sample_messages: body.sampleMessages || [],
        has_opt_in: body.hasOptIn !== false,
        opt_in_method: body.optInMethod,
        opt_in_description: body.optInDescription,
        has_opt_out: body.hasOptOut !== false,
        has_help: body.hasHelp !== false,
        has_age_gated: body.hasAgeGated || false,
        has_embedded_links: body.hasEmbeddedLinks || false,
        has_embedded_phone: body.hasEmbeddedPhone || false,
        ai_review_result: body.aiReviewResult || null,
        ai_reviewed_at: body.aiReviewResult ? new Date().toISOString() : null,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      var existing = await supabase.from('tcr_submissions').select('id').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1);
      var result;
      if (existing.data && existing.data.length > 0) {
        result = await supabase.from('tcr_submissions').update(submissionData).eq('id', existing.data[0].id).select().single();
      } else {
        result = await supabase.from('tcr_submissions').insert(submissionData).select().single();
      }
      if (result.error) return res.status(500).json({ error: result.error.message });

      await supabase.from('tenants').update({ tcr_status: 'pending', updated_at: new Date().toISOString() }).eq('id', tenantId);

      try {
        var sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        var tenantName = body.legalName || body.dba || 'Unknown';
        await sgMail.send({
          to: 'rob@engwx.com',
          from: { email: 'notifications@engwx.com', name: 'EngageWorx' },
          subject: 'TCR Submission: ' + tenantName + ' (' + (body.useCase || 'mixed') + ')',
          html: '<h3>New TCR A2P Registration</h3>' +
            '<p><b>Tenant:</b> ' + tenantName + '</p>' +
            '<p><b>Use Case:</b> ' + (body.useCase || 'mixed') + '</p>' +
            '<p><b>Volume:</b> ' + (body.messageVolume || 'medium') + '</p>' +
            '<p><b>AI Score:</b> ' + (body.aiReviewResult?.score || 'N/A') + '/100</p>' +
            '<p><a href="https://portal.engwx.com">Review in TCR Queue →</a></p>',
        });
      } catch (ne) { console.log('[TCR] Notification error:', ne.message); }

      return res.status(200).json({ success: true, submission: result.data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── SUBMIT-TCR: SP Admin submits to Twilio A2P API ─────────────────────
  if (action === 'submit-tcr') {
    var submissionId = body.submission_id;
    if (!submissionId) return res.status(400).json({ error: 'submission_id required' });

    try {
      var subRes = await supabase.from('tcr_submissions').select('*').eq('id', submissionId).single();
      var sub = subRes.data;
      if (!sub) return res.status(404).json({ error: 'Submission not found' });

      var accountSid = process.env.TWILIO_ACCOUNT_SID;
      var authToken = process.env.TWILIO_AUTH_TOKEN;
      var msgServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
      var auth = Buffer.from(accountSid + ':' + authToken).toString('base64');

      // 1. Register Brand via Twilio Trust Hub
      var brandParams = new URLSearchParams();
      brandParams.append('CustomerProfileBundleSid', process.env.TWILIO_CUSTOMER_PROFILE_SID || '');
      brandParams.append('A2PProfileBundleSid', process.env.TWILIO_A2P_PROFILE_SID || '');
      brandParams.append('BrandRegistrationSid', '');

      var brandRes = await fetch('https://messaging.twilio.com/v1/a2p/BrandRegistrations', {
        method: 'POST',
        headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: brandParams.toString(),
      });
      var brandData = await brandRes.json();
      var brandSid = brandData.sid || null;

      if (brandSid) {
        await supabase.from('tcr_submissions').update({
          tcr_brand_id: brandSid, status: 'brand_pending', updated_at: new Date().toISOString(),
        }).eq('id', submissionId);
      }

      // 2. Register Campaign (if brand SID available)
      if (brandSid && msgServiceSid) {
        var campaignParams = new URLSearchParams();
        campaignParams.append('BrandRegistrationSid', brandSid);
        campaignParams.append('MessagingServiceSid', msgServiceSid);
        campaignParams.append('Description', sub.use_case_description || '');
        campaignParams.append('UseCase', sub.use_case === 'marketing' ? 'MARKETING' : sub.use_case === 'customer_care' ? 'CUSTOMER_CARE' : sub.use_case === 'two_factor' ? '2FA' : 'MIXED');
        campaignParams.append('HasEmbeddedLinks', sub.has_embedded_links ? 'true' : 'false');
        campaignParams.append('HasEmbeddedPhone', sub.has_embedded_phone ? 'true' : 'false');
        if (sub.sample_messages && sub.sample_messages.length > 0) {
          sub.sample_messages.forEach(function(m, i) { campaignParams.append('MessageSamples', m); });
        }

        var campaignRes = await fetch('https://messaging.twilio.com/v1/a2p/BrandRegistrations/' + brandSid + '/SmsVettings', {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: campaignParams.toString(),
        });
        var campaignData = await campaignRes.json();

        if (campaignData.sid) {
          await supabase.from('tcr_submissions').update({
            tcr_campaign_id: campaignData.sid, status: 'campaign_pending', updated_at: new Date().toISOString(),
          }).eq('id', submissionId);
        }
      }

      await supabase.from('tenants').update({
        tcr_status: 'submitted', updated_at: new Date().toISOString(),
      }).eq('id', sub.tenant_id);

      return res.status(200).json({
        success: true,
        brand_sid: brandSid,
        campaign_sid: brandData.sid ? (campaignParams ? 'submitted' : null) : null,
      });
    } catch (err) {
      console.error('[TCR] Submit error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action: ' + action });
};
