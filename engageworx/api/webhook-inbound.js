// api/webhook-inbound.js
// Generic inbound webhook receiver for any service (Calendly, HubSpot, Typeform, etc.)
// POST /api/webhook-inbound?tenant_id=xxx&integration_id=xxx

const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { tenant_id, integration_id } = req.query;
  if (!tenant_id || !integration_id) {
    return res.status(400).json({ error: 'Missing tenant_id or integration_id' });
  }

  const supabase = getSupabase();
  const payload = req.body || {};

  try {
    // Load integration config
    const { data: integration, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integration_id)
      .eq('tenant_id', tenant_id)
      .eq('status', 'active')
      .single();

    if (error || !integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

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
          var leadRes = await supabase.from('leads').insert({
            tenant_id: tenant_id,
            name: name || email || 'Unknown',
            company: company || '',
            email: email,
            phone: phone,
            type: config.type || 'Direct Business',
            urgency: config.urgency || 'Hot',
            stage: config.stage || 'inquiry',
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
        await supabase.from('lead_sequences').upsert({
          tenant_id: tenant_id,
          lead_id: results.lead_id,
          sequence_id: config.sequence_id,
          current_step: 0,
          status: 'active',
          enrolled_at: new Date().toISOString(),
          next_step_at: startDate.toISOString(),
        }, { onConflict: 'lead_id,sequence_id' });
        results.sequence_enrolled = true;
      } catch(e) { console.error('[Webhook] Sequence enrol error:', e.message); }
    }

    console.log('[Webhook] Processed:', integration.name, results);
    return res.status(200).json({ success: true, integration: integration.name, ...results });

  } catch(err) {
    console.error('[Webhook] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
