// api/webhook-inbound.js
// Generic inbound webhook receiver for any service (Calendly, HubSpot, Typeform, etc.)
// POST /api/webhook-inbound?tenant_id=xxx&integration_id=xxx
//
// Two modes, decided by integrations.public_browser:
//   - server-to-server (default, public_browser=false): unchanged — open CORS, no challenge token,
//     no rate limit. Tenant scoping (tenant_id + integration_id + active) is the control; a shared
//     webhook_secret/HMAC remains the available S2S control (not enforced here).
//   - public/browser (public_browser=true): the integration is wired to a public, browser-posted
//     form, so we additionally (a) restrict CORS to the tenant's allowed_origins, (b) require a
//     bot-challenge token (verified server-side), and (c) rate-limit THIS integration's inbound
//     leads. These apply ONLY in this mode and never affect server-to-server integrations.

const { createClient } = require('@supabase/supabase-js');
const { STAGE_KEYS, getPipelineStageId } = require('./_lib/pipelineStages');

// Public/browser mode only — per-integration burst guard (counts this integration's own leads, so
// concurrent server-to-server imports on other integrations never throttle the public form).
const PUBLIC_RATE_LIMIT_PER_MIN = 10;

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { tenant_id, integration_id } = req.query;

  // Resolve the integration up front — its public_browser flag governs CORS on BOTH the preflight
  // and the POST (tenant_id + integration_id are present on the OPTIONS request too).
  const supabase = getSupabase();
  let integration = null;
  let allowedOrigins = [];
  if (tenant_id && integration_id) {
    try {
      const r = await supabase
        .from('integrations')
        .select('*')
        .eq('id', integration_id)
        .eq('tenant_id', tenant_id)
        .eq('status', 'active')
        .single();
      integration = r.data || null;
      if (integration && integration.public_browser) {
        const tr = await supabase.from('tenants').select('allowed_origins').eq('id', tenant_id).maybeSingle();
        allowedOrigins = (tr.data && Array.isArray(tr.data.allowed_origins)) ? tr.data.allowed_origins : [];
      }
    } catch (e) { /* leave integration null; POST path returns 404 */ }
  }

  const publicMode = !!(integration && integration.public_browser);

  // CORS: server-to-server (default) keeps '*'. Public/browser mode reflects the Origin only when
  // it's in the tenant's allow-list (no customer domains hardcoded); otherwise the header is omitted
  // and the browser blocks the response.
  if (publicMode) {
    if (origin && allowedOrigins.indexOf(origin) !== -1) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Max-Age', '86400'); // cache the per-tenant preflight for 24h (mirror screening-intake)
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!tenant_id || !integration_id) {
    return res.status(400).json({ error: 'Missing tenant_id or integration_id' });
  }
  if (!integration) {
    return res.status(404).json({ error: 'Integration not found' });
  }

  const payload = req.body || {};

  // ── Public/browser-mode hardening — no effect on server-to-server integrations ────────────────
  if (publicMode) {
    // (a) CORS allow-list: reject browsers on non-allow-listed origins outright. Server-to-server
    //     callers send no Origin header and are unaffected.
    if (origin && allowedOrigins.indexOf(origin) === -1) {
      return res.status(403).json({ error: 'This form is not authorized for this site.' });
    }

    // (b) Bot challenge: the public form must submit a verification token (in the body — keeps it off
    //     the URL). Verified server-side; failure blocks before any write.
    const token = payload.turnstile_token || payload['cf-turnstile-response'] || '';
    const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
    let verified = false;
    try {
      const { verifyTurnstileToken } = await import('./_verifyTurnstile.js');
      const v = await verifyTurnstileToken(token, clientIp);
      verified = !!(v && v.success);
    } catch (e) {
      console.error('[webhook-inbound] challenge verify threw tenant=' + tenant_id + ' integration=' + integration_id);
    }
    if (!verified) {
      return res.status(403).json({ error: 'Verification failed — please try again.' });
    }

    // (c) Per-integration burst guard: count THIS integration's leads in the last 60s. Matches the
    //     source label the lead insert uses below, so other integrations' (server-to-server) imports
    //     never count against this form. Coarse + non-fatal.
    try {
      const srcLabel = integration.name || integration.service || 'webhook';
      const rl = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant_id)
        .eq('source', srcLabel)
        .gte('created_at', new Date(Date.now() - 60000).toISOString());
      if (rl.count && rl.count >= PUBLIC_RATE_LIMIT_PER_MIN) {
        return res.status(429).json({ error: 'Too many submissions — please try again shortly.' });
      }
    } catch (e) { /* non-fatal */ }
  }

  try {
    // Update trigger count and last triggered
    await supabase.from('integrations').update({
      last_triggered_at: new Date().toISOString(),
      trigger_count: (integration.trigger_count || 0) + 1,
    }).eq('id', integration_id);

    // Extract fields from payload using field_mapping
    const mapping = integration.field_mapping || {};
    const config = integration.action_config || {};

    function getNestedValue(obj, path) {
      if (!path) return null;
      return path.split('.').reduce(function(acc, key) {
        return acc && acc[key] !== undefined ? acc[key] : null;
      }, obj);
    }

    // Extract contact fields from payload
    var name = getNestedValue(payload, mapping.name) ||
               getNestedValue(payload, 'payload.invitee.name') ||
               getNestedValue(payload, 'data.name') ||
               getNestedValue(payload, 'name') || '';

    var email = getNestedValue(payload, mapping.email) ||
                getNestedValue(payload, 'payload.invitee.email') ||
                getNestedValue(payload, 'data.email') ||
                getNestedValue(payload, 'email') || null;

    var phone = getNestedValue(payload, mapping.phone) ||
                getNestedValue(payload, 'data.phone') ||
                getNestedValue(payload, 'phone') || null;

    var company = getNestedValue(payload, mapping.company) ||
                  getNestedValue(payload, 'payload.invitee.company') ||
                  getNestedValue(payload, 'data.company') ||
                  getNestedValue(payload, 'company') || '';

    var notes = getNestedValue(payload, mapping.notes) ||
                getNestedValue(payload, 'payload.event.name') ||
                getNestedValue(payload, 'data.message') || '';

    var results = {};

    // ── Action: create_lead ──────────────────────────────────────────
    if (integration.action === 'create_lead' || integration.action === 'create_lead_and_contact') {
      try {
        // Dedup on email
        var existingLead = null;
        if (email) {
          var existing = await supabase.from('leads').select('id').eq('email', email).eq('tenant_id', tenant_id).limit(1);
          if (existing.data && existing.data.length > 0) existingLead = existing.data[0].id;
        }

        var leadId = existingLead;
        if (!existingLead) {
          var leadStageId = await getPipelineStageId(supabase, tenant_id, STAGE_KEYS.LEAD);
          var leadRes = await supabase.from('leads').insert({
            tenant_id: tenant_id,
            name: name || null,
            company: company || '',
            email: email,
            phone: phone,
            type: config.type || 'Direct Business',
            urgency: config.urgency || 'Hot',
            pipeline_stage_id: leadStageId,
            source: integration.name || integration.service || 'webhook',
            notes: notes || ('Auto-created from ' + integration.name + ' webhook'),
            last_action_at: new Date().toISOString().split('T')[0],
            last_activity_at: new Date().toISOString(),
          }).select('id').single();
          if (leadRes.data) leadId = leadRes.data.id;
        }
        results.lead_id = leadId;
        results.lead_created = !existingLead;
      } catch(e) { console.error('[Webhook] Lead create error:', e.message); }
    }

    // ── Action: create_contact ───────────────────────────────────────
    if (integration.action === 'create_lead_and_contact' || integration.action === 'create_contact') {
      try {
        if (email || name) {
          var existingContact = null;
          if (email) {
            var ec = await supabase.from('contacts').select('id').eq('email', email).eq('tenant_id', tenant_id).single();
            if (ec.data) existingContact = ec.data.id;
          }
          if (!existingContact) {
            var nameParts = (name || '').trim().split(' ');
            await supabase.from('contacts').insert({
              tenant_id: tenant_id,
              first_name: nameParts[0] || name || email,
              last_name: nameParts.slice(1).join(' ') || null,
              email: email,
              phone: phone,
              company_name: company || null,
              pipeline_lead_id: results.lead_id || null,
              status: 'active',
              source: integration.name || integration.service || 'webhook',
            });
            results.contact_created = true;
          } else {
            results.contact_id = existingContact;
          }
        }
      } catch(e) { console.error('[Webhook] Contact create error:', e.message); }
    }

    // ── Action: enrol_sequence ───────────────────────────────────────
    if (config.sequence_id && results.lead_id) {
      try {
        var firstStep = await supabase.from('sequence_steps')
          .select('delay_days').eq('sequence_id', config.sequence_id).eq('step_number', 1).single();
        var startDate = new Date();
        if (firstStep.data && firstStep.data.delay_days > 0) {
          startDate.setDate(startDate.getDate() + firstStep.data.delay_days);
        }
        var _safeEnrol = require('./_lib/safe-enrol-sequence');
        var enrolRes = await _safeEnrol.safeEnrolSequence(supabase, { tenant_id: tenant_id, lead_id: results.lead_id, sequence_id: config.sequence_id, next_step_at: startDate.toISOString() });
        results.sequence_enrolled = enrolRes.enrolled;
      } catch(e) { console.error('[Webhook] Sequence enrol error:', e.message); }
    }

    console.log('[Webhook] Processed:', integration.name, results);
    return res.status(200).json({ success: true, integration: integration.name, ...results });

  } catch(err) {
    console.error('[Webhook] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
