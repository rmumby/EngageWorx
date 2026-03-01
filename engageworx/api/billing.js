// /api/billing.js — Single Vercel Serverless Function for all Stripe operations
// POST /api/billing?action=checkout  → Create Stripe Checkout session
// POST /api/billing?action=portal    → Create Customer Portal session
// POST /api/billing?action=webhook   → Stripe webhook handler
// GET  /api/billing?action=status    → Check subscription status

const PRICE_IDS = {
  starter: 'price_1T4QhrPEs1sluBAUvF8Jt7tx',
  growth: 'price_1T4QqZPEs1sluBAUFNhNczt1',
  pro: 'price_1T4QqhPEs1sluBAUNd6yUGYd',
};

async function stripeRequest(endpoint, method, body) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const response = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });

  const action = req.query.action || 'checkout';

  // ─── CREATE CHECKOUT SESSION ──────────────────────────────────────
  if (action === 'checkout' && req.method === 'POST') {
    const { plan, email, tenantId, tenantName } = req.body;

    if (!plan || !email) {
      return res.status(400).json({ error: 'Missing required fields: plan, email' });
    }

    const priceId = PRICE_IDS[plan.toLowerCase()];
    if (!priceId) {
      return res.status(400).json({ error: `Invalid plan: ${plan}. Use starter, growth, or pro` });
    }

    const successUrl = `https://portal.engwx.com?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `https://portal.engwx.com?checkout=cancelled`;

    try {
      // Check if customer already exists
      const existingCustomer = await stripeRequest('/customers/search', 'GET');
      // Search by email using query param
      const searchResult = await stripeRequest(
        `/customers/search?query=email:'${encodeURIComponent(email)}'`,
        'GET'
      );

      let customerId;
      if (searchResult.ok && searchResult.data.data && searchResult.data.data.length > 0) {
        customerId = searchResult.data.data[0].id;
      }

      // Build checkout params
      const params = {
        'mode': 'subscription',
        'payment_method_types[0]': 'card',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': successUrl,
        'cancel_url': cancelUrl,
        'allow_promotion_codes': 'true',
        'billing_address_collection': 'required',
        'subscription_data[trial_period_days]': '14',
      };

      // Add metadata
      if (tenantId) params['subscription_data[metadata][tenant_id]'] = tenantId;
      if (tenantName) params['subscription_data[metadata][tenant_name]'] = tenantName;
      params['subscription_data[metadata][plan]'] = plan;

      if (customerId) {
        params['customer'] = customerId;
      } else {
        params['customer_email'] = email;
      }

      const result = await stripeRequest('/checkout/sessions', 'POST', params);

      if (!result.ok) {
        return res.status(result.status).json({ error: result.data.error?.message || 'Stripe error' });
      }

      return res.status(200).json({
        success: true,
        sessionId: result.data.id,
        url: result.data.url,
      });
    } catch (err) {
      console.error('Checkout error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ─── CUSTOMER PORTAL ──────────────────────────────────────────────
  if (action === 'portal' && req.method === 'POST') {
    const { customerId, email } = req.body;

    try {
      let stripeCustomerId = customerId;

      // Look up customer by email if no ID provided
      if (!stripeCustomerId && email) {
        const searchResult = await stripeRequest(
          `/customers/search?query=email:'${encodeURIComponent(email)}'`,
          'GET'
        );
        if (searchResult.ok && searchResult.data.data?.length > 0) {
          stripeCustomerId = searchResult.data.data[0].id;
        }
      }

      if (!stripeCustomerId) {
        return res.status(404).json({ error: 'No Stripe customer found' });
      }

      const result = await stripeRequest('/billing_portal/sessions', 'POST', {
        'customer': stripeCustomerId,
        'return_url': 'https://portal.engwx.com',
      });

      if (!result.ok) {
        return res.status(result.status).json({ error: result.data.error?.message || 'Stripe error' });
      }

      return res.status(200).json({
        success: true,
        url: result.data.url,
      });
    } catch (err) {
      console.error('Portal error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ─── SUBSCRIPTION STATUS ──────────────────────────────────────────
  if (action === 'status' && req.method === 'GET') {
    const email = req.query.email;
    if (!email) return res.status(400).json({ error: 'Missing email query param' });

    try {
      const searchResult = await stripeRequest(
        `/customers/search?query=email:'${encodeURIComponent(email)}'`,
        'GET'
      );

      if (!searchResult.ok || !searchResult.data.data?.length) {
        return res.status(200).json({ subscribed: false, plan: null });
      }

      const customerId = searchResult.data.data[0].id;

      const subs = await stripeRequest(
        `/subscriptions?customer=${customerId}&status=active&limit=1`,
        'GET'
      );

      if (!subs.ok || !subs.data.data?.length) {
        // Check for trialing
        const trialSubs = await stripeRequest(
          `/subscriptions?customer=${customerId}&status=trialing&limit=1`,
          'GET'
        );
        if (trialSubs.ok && trialSubs.data.data?.length) {
          const sub = trialSubs.data.data[0];
          const plan = sub.metadata?.plan || Object.entries(PRICE_IDS).find(
            ([, v]) => v === sub.items.data[0]?.price?.id
          )?.[0] || 'unknown';
          return res.status(200).json({
            subscribed: true,
            status: 'trialing',
            plan,
            trialEnd: sub.trial_end,
            customerId,
          });
        }
        return res.status(200).json({ subscribed: false, plan: null, customerId });
      }

      const sub = subs.data.data[0];
      const plan = sub.metadata?.plan || Object.entries(PRICE_IDS).find(
        ([, v]) => v === sub.items.data[0]?.price?.id
      )?.[0] || 'unknown';

      return res.status(200).json({
        subscribed: true,
        status: sub.status,
        plan,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        customerId,
      });
    } catch (err) {
      console.error('Status check error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ─── WEBHOOK ──────────────────────────────────────────────────────
  if (action === 'webhook' && req.method === 'POST') {
    // Note: For production, verify webhook signature with STRIPE_WEBHOOK_SECRET
    const event = req.body;

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          console.log(`[Stripe] Checkout completed: ${session.customer_email}, sub: ${session.subscription}`);

          const { createClient } = require('@supabase/supabase-js');
          const supabase = createClient(
            process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
          );

          const email = session.customer_email;
          const metadata = session.metadata || {};
          const subMetadata = session.subscription_data?.metadata || metadata;
          const plan = subMetadata.plan || metadata.plan || 'starter';
          const tenantName = subMetadata.tenant_name || metadata.tenant_name || 'My Business';

          // Find auth user by email
          const { data: authUsers } = await supabase.auth.admin.listUsers();
          const authUser = authUsers?.users?.find(u => u.email === email);
          const userId = authUser?.id;
          const userMeta = authUser?.user_metadata || {};

          // Check if tenant already exists for this user
          const { data: existingProfile } = await supabase
            .from('user_profiles')
            .select('tenant_id')
            .eq('email', email)
            .single();

          if (existingProfile?.tenant_id) {
            // Tenant already exists — just update billing info
            await supabase
              .from('tenants')
              .update({
                status: 'active',
                stripe_customer_id: session.customer,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingProfile.tenant_id);
          } else {
            // Create tenant
            const slug = (userMeta.business_name || tenantName || 'business')
              .toLowerCase().replace(/[^a-z0-9]/g, '-');

            const { data: tenant, error: tenantError } = await supabase
              .from('tenants')
              .insert({
                name: userMeta.business_name || tenantName,
                slug,
                brand_primary: userMeta.brand_color || '#00C9FF',
                brand_logo_url: userMeta.logo_url || null,
                plan,
                status: 'active',
              })
              .select()
              .single();

            if (tenantError) {
              console.error('[Stripe] Tenant create error:', tenantError);
              break;
            }

            // Link user to tenant
            if (userId) {
              await supabase.from('tenant_members').insert({
                tenant_id: tenant.id,
                user_id: userId,
                role: 'admin',
                status: 'active',
                joined_at: new Date().toISOString(),
              });

              // Update user profile
              await supabase.from('user_profiles').upsert({
                id: userId,
                email,
                tenant_id: tenant.id,
                company_name: tenant.name,
                role: 'admin',
              });

              // Handle team invites from signup metadata
              const teamEmails = userMeta.team_emails;
              if (teamEmails) {
                const emails = teamEmails.split(',').map(e => e.trim()).filter(Boolean);
                for (const inviteEmail of emails) {
                  await supabase.from('tenant_members').insert({
                    tenant_id: tenant.id,
                    role: 'member',
                    status: 'invited',
                  });
                }
              }
            }
          }
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object;
          console.log(`[Stripe] Subscription updated: ${sub.id} → ${sub.status}`);
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          console.log(`[Stripe] Subscription cancelled: ${sub.id}`);

          const { createClient } = require('@supabase/supabase-js');
          const supabase = createClient(
            process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
          );

          // Find tenant by stripe customer ID and suspend
          await supabase
            .from('tenants')
            .update({ status: 'suspended', updated_at: new Date().toISOString() })
            .eq('stripe_customer_id', sub.customer);
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          console.log(`[Stripe] Payment failed: ${invoice.customer_email}`);
          break;
        }

        default:
          console.log(`[Stripe] Unhandled event: ${event.type}`);
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('[Stripe] Webhook error:', err);
      return res.status(200).json({ received: true });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use ?action=checkout|portal|status|webhook' });
};
