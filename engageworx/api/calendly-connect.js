// api/calendly-connect.js
// INT-03 — Calendly self-service connect
// Called from Settings → Integrations → Calendly → Connect
// Registers a webhook subscription with Calendly API automatically

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
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
      const err = await meRes.json();
      return res.status(400).json({
        error: 'Invalid Calendly token. Please check and try again.',
        detail: err?.message || meRes.status,
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

    if (!intgId) {
      return res.status(400).json({
        error: 'No Calendly integration found. Please create one in Settings → Integrations first.',
      });
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
      const err = await webhookRes.json();
      return res.status(400).json({
        error: 'Failed to register Calendly webhook',
        detail: err?.message || err?.title || webhookRes.status,
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
