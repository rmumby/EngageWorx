// api/calendly-connect.js
// INT-03 — Calendly self-service connect
// Called from Settings → Integrations → Calendly → Connect
// Registers a webhook subscription with Calendly API automatically

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const CALENDLY_API = 'https://api.calendly.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tenant_id, token, integration_id, action } = req.body;

  if (!tenant_id || !token) {
    return res.status(400).json({ error: 'tenant_id and token are required' });
  }

  // ── DISCONNECT ────────────────────────────────────────────────────────────
  if (action === 'disconnect') {
    try {
      // Get existing integration to find webhook URI
      const { data: existing } = await supabase
        .from('integrations')
        .select('action_config')
        .eq('tenant_id', tenant_id)
        .eq('service', 'calendly')
        .maybeSingle();

      const webhookUri = existing?.action_config?.calendly_webhook_uri;

      // Delete webhook from Calendly if we have the URI
      if (webhookUri && token) {
        await fetch(webhookUri, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      // Update integration status
      await supabase
        .from('integrations')
        .update({
          status: 'paused',
          action_config: {},
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenant_id)
        .eq('service', 'calendly');

      return res.status(200).json({ success: true, status: 'disconnected' });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to disconnect: ' + e.message });
    }
  }

  // ── CONNECT ───────────────────────────────────────────────────────────────
  try {
    // Step 1 — Validate token and get user + org URIs from Calendly
    const meRes = await fetch(`${CALENDLY_API}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!meRes.ok) {
  const errText = await meRes.text();
  console.error('[CalendlyConnect] Token validation failed:', meRes.status, errText);
  return res.status(400).json({
    error: 'Invalid Calendly token. Please check and try again.',
    detail: errText,
    status: meRes.status,
  });
}

    const meData = await meRes.json();
    const userUri = meData.resource?.uri;
    const orgUri = meData.resource?.current_organization;

    if (!userUri || !orgUri) {
      return res.status(400).json({ error: 'Could not retrieve Calendly user details' });
    }

    // Step 2 — Build the webhook callback URL for this tenant's integration
    // Find or use the provided integration_id
    let intgId = integration_id;
    if (!intgId) {
  const { data: existing } = await supabase
    .from('integrations')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('service', 'calendly')
    .maybeSingle();
  intgId = existing?.id;
}

// If still not found, create one automatically
if (!intgId) {
  const { data: created, error: createError } = await supabase
    .from('integrations')
    .insert({
      tenant_id: tenant_id,
      name: 'Calendly',
      service: 'calendly',
      event_type: 'invitee.created',
      action: 'create_lead_and_contact',
      action_config: { urgency: 'Hot', stage: 'inquiry', type: 'Direct Business' },
      field_mapping: { name: 'payload.invitee.name', email: 'payload.invitee.email', company: 'payload.invitee.company' },
      webhook_secret: 'ewx_whsec_' + Math.random().toString(36).slice(2),
      status: 'active',
    })
    .select('id')
    .single();
  if (createError) return res.status(500).json({ error: 'Could not create integration: ' + createError.message });
  intgId = created.id;
}

    const callbackUrl = `https://portal.engwx.com/api/webhook-inbound?tenant_id=${tenant_id}&integration_id=${intgId}`;

    // Step 3 — Check if webhook already exists for this org and delete it first
    const existingWebhooksRes = await fetch(
      `${CALENDLY_API}/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&scope=organization`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (existingWebhooksRes.ok) {
      const existingWebhooks = await existingWebhooksRes.json();
      const existing = (existingWebhooks.collection || []).find(
        (w) => w.callback_url === callbackUrl
      );
      if (existing) {
        // Already registered — just update the integration record
        await supabase
          .from('integrations')
          .update({
            status: 'active',
            action_config: {
              calendly_user_uri: userUri,
              calendly_org_uri: orgUri,
              calendly_webhook_uri: existing.uri,
              connected_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', intgId);

        return res.status(200).json({
          success: true,
          status: 'connected',
          message: 'Calendly webhook already active',
          user: meData.resource?.name,
          org: orgUri,
        });
      }
    }
    
console.log('[CalendlyConnect] Creating webhook:', { callbackUrl, orgUri, userUri });
// Step 4 — Create webhook subscription with Calendly
const webhookRes = await fetch(`${CALENDLY_API}/webhook_subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: callbackUrl,
        events: ['invitee.created', 'invitee.canceled'],
        organization: orgUri,
        user: userUri,
        scope: 'organization',
      }),
    });

    if (!webhookRes.ok) {
  const errText = await webhookRes.text();
  console.error('[CalendlyConnect] Webhook creation failed:', webhookRes.status, errText);
  return res.status(400).json({
    error: 'Failed to register Calendly webhook',
    detail: errText,
    status: webhookRes.status,
  });
}

    const webhookData = await webhookRes.json();
    const webhookUri = webhookData.resource?.uri;

    // Step 5 — Store token and connection details in integrations table
    const { error: updateError } = await supabase
      .from('integrations')
      .update({
        status: 'active',
        action_config: {
          calendly_token: token,
          calendly_user_uri: userUri,
          calendly_org_uri: orgUri,
          calendly_webhook_uri: webhookUri,
          connected_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', intgId);

    if (updateError) {
      return res.status(500).json({ error: 'Webhook registered but failed to save: ' + updateError.message });
    }

    return res.status(200).json({
      success: true,
      status: 'connected',
      message: 'Calendly connected successfully',
      user: meData.resource?.name,
      org: orgUri,
      webhook_url: callbackUrl,
    });

  } catch (e) {
    console.error('[CalendlyConnect] Error:', e);
    return res.status(500).json({ error: 'Connection failed: ' + e.message });
  }
}
