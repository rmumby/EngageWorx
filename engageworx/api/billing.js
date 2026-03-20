// /api/billing.js — Single Vercel Serverless Function for all Stripe + signup operations
// POST /api/billing?action=signup    → Create user + Stripe Checkout in one call
// POST /api/billing?action=checkout  → Create Stripe Checkout session
// POST /api/billing?action=portal    → Create Customer Portal session
// POST /api/billing?action=webhook   → Stripe webhook handler
// GET  /api/billing?action=status    → Check subscription status

const PRICE_IDS = {
  starter: 'price_1T4OeIPEs1sluBAUuRIaD8Cq',
  growth: 'price_1T4OefPEs1sluBAUuZVAaBJ3',
  pro: 'price_1T4Of6PEs1sluBAURFjaViRv',
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

  // ─── SIGNUP: Create user + checkout in one call ───────────────────
  if (action === 'signup' && req.method === 'POST') {
    const { email, password, fullName, companyName, plan } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
    }

    try {
      // Create user via admin API (server-side, no client session)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || '',
          company_name: companyName || '',
        },
      });

      if (authError) {
        // If user already exists, that's OK — continue to checkout
        if (!authError.message.includes('already') && !authError.message.includes('exists')) {
          return res.status(400).json({ error: authError.message });
        }
      }

      // Create Stripe checkout session
      const selectedPlan = (plan || 'starter').toLowerCase();
      const priceId = PRICE_IDS[selectedPlan];
      if (!priceId) {
        return res.status(400).json({ error: `Invalid plan: ${selectedPlan}` });
      }

      const successUrl = 'https://portal.engwx.com?checkout=success&email=' + encodeURIComponent(email);
      const cancelUrl = 'https://portal.engwx.com?checkout=cancelled';

      // Find or create Stripe customer for signup
      let signupCustomerId;
      const listResult = await stripeRequest(
        `/customers?email=${encodeURIComponent(email)}&limit=1`,
        'GET'
      );
      if (listResult.ok && listResult.data.data?.length > 0) {
        signupCustomerId = listResult.data.data[0].id;
      } else {
        const createResult = await stripeRequest('/customers', 'POST', {
          'email': email,
          'name': fullName || '',
          'metadata[source]': 'engageworx_signup',
          'metadata[company]': companyName || '',
        });
        if (createResult.ok) {
          signupCustomerId = createResult.data.id;
        }
      }

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
        'subscription_data[metadata][plan]': selectedPlan,
        'subscription_data[metadata][tenant_name]': companyName || 'My Business',
      };

      if (signupCustomerId) {
        params['customer'] = signupCustomerId;
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
        userId: authData?.user?.id || null,
      });
    } catch (err) {
      console.error('Signup error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ─── CREATE CHECKOUT SESSION ──────────────────────────────────────
  if (action === 'checkout' && req.method === 'POST') {
    const { plan, email, tenantId, tenantName, priceId: directPriceId, mode: reqMode, successUrl: customSuccessUrl, cancelUrl: customCancelUrl } = req.body;

    // Support direct priceId for top-ups, or plan name for subscriptions
    let priceId = directPriceId;
    const checkoutMode = reqMode || 'subscription';

    if (!priceId) {
      if (!plan || !email) {
        return res.status(400).json({ error: 'Missing required fields: plan and email, or priceId' });
      }
      priceId = PRICE_IDS[plan.toLowerCase()];
      if (!priceId) {
        return res.status(400).json({ error: `Invalid plan: ${plan}. Use starter, growth, or pro` });
      }
    }

    const successUrl = customSuccessUrl || `https://portal.engwx.com?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = customCancelUrl || `https://portal.engwx.com?checkout=cancelled`;

    try {
      // Always find or create a Stripe customer
      let customerId;
      if (email) {
        // Try list endpoint (most reliable)
        const listResult = await stripeRequest(
          `/customers?email=${encodeURIComponent(email)}&limit=1`,
          'GET'
        );
        if (listResult.ok && listResult.data.data?.length > 0) {
          customerId = listResult.data.data[0].id;
        }

        // If no customer exists, create one
        if (!customerId) {
          const createResult = await stripeRequest('/customers', 'POST', {
            'email': email,
            'metadata[source]': 'engageworx_portal',
            'metadata[tenant_id]': tenantId || '',
            'metadata[tenant_name]': tenantName || '',
          });
          if (createResult.ok) {
            customerId = createResult.data.id;
          }
        }
      }

      // Build checkout params
      const params = {
        'mode': checkoutMode,
        'payment_method_types[0]': 'card',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': successUrl,
        'cancel_url': cancelUrl,
        'allow_promotion_codes': 'true',
        'billing_address_collection': 'required',
      };

      // Add subscription-specific params (no trial for upgrades/downgrades)
      if (checkoutMode === 'subscription') {
        if (tenantId) params['subscription_data[metadata][tenant_id]'] = tenantId;
        if (tenantName) params['subscription_data[metadata][tenant_name]'] = tenantName;
        if (plan) params['subscription_data[metadata][plan]'] = plan;
      }

      if (customerId) {
        params['customer'] = customerId;
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
        // Try search API first
        const searchResult = await stripeRequest(
          `/customers/search?query=email:'${email}'`,
          'GET'
        );
        if (searchResult.ok && searchResult.data.data?.length > 0) {
          stripeCustomerId = searchResult.data.data[0].id;
        }

        // Fallback: list customers filtered by email
        if (!stripeCustomerId) {
          const listResult = await stripeRequest(
            `/customers?email=${encodeURIComponent(email)}&limit=1`,
            'GET'
          );
          if (listResult.ok && listResult.data.data?.length > 0) {
            stripeCustomerId = listResult.data.data[0].id;
          }
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
      // Try list endpoint (most reliable)
      const listResult = await stripeRequest(
        `/customers?email=${encodeURIComponent(email)}&limit=1`,
        'GET'
      );

      if (!listResult.ok || !listResult.data.data?.length) {
        return res.status(200).json({ subscribed: false, plan: null });
      }

      const customerId = listResult.data.data[0].id;

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
        // In billing.js, find and replace the entire 'checkout.session.completed' case block.
// Find: case 'checkout.session.completed': { ... break; }
// Replace with the code below:

        case 'checkout.session.completed': {
          var session = event.data.object;
          // ═══════════════════════════════════════════════════════════════
// ADD THIS to billing.js inside the checkout.session.completed handler
// AFTER the line: var session = event.data.object;
// BEFORE the existing tenant creation logic
// ═══════════════════════════════════════════════════════════════

          // Check if this is a top-up payment (not a subscription)
          if (session.metadata && session.metadata.type === 'topup') {
            console.log('[Stripe] Top-up payment completed:', JSON.stringify(session.metadata));
            try {
              var topupTenantId = session.metadata.tenant_id;
              var topupMessages = parseInt(session.metadata.messages) || 0;
              var topupAmount = (session.amount_total || 0) / 100;

              if (topupTenantId && topupMessages > 0) {
                var { createClient } = require('@supabase/supabase-js');
                var topupSupabase = createClient(
                  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
                  process.env.SUPABASE_SERVICE_ROLE_KEY
                );

                await topupSupabase.from('usage_topups').insert({
                  tenant_id: topupTenantId,
                  messages_purchased: topupMessages,
                  messages_remaining: topupMessages,
                  amount_paid: topupAmount,
                  stripe_payment_id: session.payment_intent || session.id,
                  status: 'active',
                });

                console.log('[Stripe] Top-up credited:', topupMessages, 'messages for tenant', topupTenantId);

                // Notify Rob
                var RESEND_KEY = process.env.RESEND_API_KEY;
                if (RESEND_KEY) {
                  var tenantInfo = await topupSupabase.from('tenants').select('name').eq('id', topupTenantId).single();
                  var tName = tenantInfo.data ? tenantInfo.data.name : topupTenantId;
                  await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      from: 'EngageWorx <hello@engwx.com>',
                      to: ['rob@engwx.com'],
                      subject: 'Top-up purchased: ' + tName + ' (' + topupMessages.toLocaleString() + ' messages)',
                      html: '<h2>Message Top-Up Purchased</h2><p><b>Tenant:</b> ' + tName + '</p><p><b>Messages:</b> ' + topupMessages.toLocaleString() + '</p><p><b>Amount:</b> $' + topupAmount.toFixed(2) + '</p>',
                    }),
                  });
                }
              }
            } catch (topupErr) {
              console.error('[Stripe] Top-up credit error:', topupErr.message);
            }
            break; // Don't continue to tenant creation logic
          }

// ═══════════════════════════════════════════════════════════════
// The rest of the existing checkout.session.completed code
// (tenant creation) continues below...
// ═══════════════════════════════════════════════════════════════
          console.log('[Stripe] Checkout completed:', JSON.stringify({ email: session.customer_email, customer: session.customer, subscription: session.subscription }));

          var { createClient } = require('@supabase/supabase-js');
          var supabase = createClient(
            process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
          );

          // Get customer email - session.customer_email may be null
          var email = session.customer_email;
          if (!email && session.customer) {
            try {
              var custResult = await stripeRequest('/customers/' + session.customer, 'GET');
              if (custResult.ok) email = custResult.data.email;
              console.log('[Stripe] Fetched customer email:', email);
            } catch (e) { console.error('[Stripe] Customer fetch error:', e.message); }
          }

          if (!email) {
            console.error('[Stripe] No email found for session:', session.id);
            break;
          }

          var metadata = session.metadata || {};

          // Fetch subscription metadata
          var subMetadata = {};
          if (session.subscription) {
            try {
              var subResult = await stripeRequest('/subscriptions/' + session.subscription, 'GET');
              if (subResult.ok) subMetadata = subResult.data.metadata || {};
              console.log('[Stripe] Sub metadata:', JSON.stringify(subMetadata));
            } catch (e) {}
          }

          var plan = subMetadata.plan || metadata.plan || 'starter';
          var tenantName = subMetadata.tenant_name || metadata.tenant_name || 'My Business';

          // Find auth user
          var userId = null;
          var userMeta = {};
          try {
            var authResult = await supabase.auth.admin.listUsers();
            var authUsers = authResult.data;
            var authUser = (authUsers && authUsers.users) ? authUsers.users.find(function(u) { return u.email === email; }) : null;
            userId = authUser ? authUser.id : null;
            userMeta = authUser ? (authUser.user_metadata || {}) : {};
            console.log('[Stripe] Auth user:', userId ? userId : 'NOT FOUND', 'for', email);
          } catch (e) { console.error('[Stripe] Auth lookup error:', e.message); }

          // Check if tenant already exists via tenant_members
          var existingTenantId = null;
          if (userId) {
            try {
              var memberResult = await supabase.from('tenant_members').select('tenant_id').eq('user_id', userId).limit(1).single();
              if (memberResult.data) existingTenantId = memberResult.data.tenant_id;
            } catch (e) {}
          }

          if (existingTenantId) {
            console.log('[Stripe] Existing tenant:', existingTenantId, '- updating');
            await supabase.from('tenants').update({ status: 'active', plan: plan, updated_at: new Date().toISOString() }).eq('id', existingTenantId);
          } else {
            // Create new tenant
            var name = userMeta.company_name || tenantName || 'My Business';
            var slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            console.log('[Stripe] Creating tenant:', name, 'plan:', plan, 'email:', email);

            var tenantResult = await supabase.from('tenants').insert({ name: name, slug: slug, plan: plan, status: 'active' }).select().single();

            if (tenantResult.error) {
              console.error('[Stripe] Tenant error:', tenantResult.error.message);
              break;
            }

            var tenant = tenantResult.data;
            console.log('[Stripe] Tenant created:', tenant.id);

            // Link user to tenant
            if (userId) {
              try {
                await supabase.from('tenant_members').insert({ tenant_id: tenant.id, user_id: userId, role: 'admin', status: 'active' });
                console.log('[Stripe] User linked to tenant');
              } catch (e) { console.error('[Stripe] Member error:', e.message); }
            }

            // Notify Rob
            try {
              var RESEND_KEY = process.env.RESEND_API_KEY;
              if (RESEND_KEY) {
                await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    from: 'EngageWorx <hello@engwx.com>',
                    to: ['rob@engwx.com'],
                    subject: 'New tenant auto-provisioned: ' + name,
                    html: '<h2>New Signup</h2><p><b>Company:</b> ' + name + '</p><p><b>Email:</b> ' + email + '</p><p><b>Plan:</b> ' + plan + '</p><p><b>Tenant ID:</b> ' + tenant.id + '</p><p>Customer can now log in at portal.engwx.com</p>',
                  }),
                });
              }
            } catch (e) {}
          }
          break;
        }

          const email = session.customer_email;
          const metadata = session.metadata || {};

          // Fetch subscription from Stripe to get metadata (plan, tenant_name)
          let subMetadata = {};
          if (session.subscription) {
            const subResult = await stripeRequest(`/subscriptions/${session.subscription}`, 'GET');
            if (subResult.ok) {
              subMetadata = subResult.data.metadata || {};
              console.log('[Stripe] Subscription metadata:', JSON.stringify(subMetadata));
            }
          }

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
            const name = userMeta.company_name || tenantName || 'My Business';
            const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
            console.log('[Stripe] Creating tenant:', name, 'for', email);

            const { data: tenant, error: tenantError } = await supabase
              .from('tenants')
              .insert({
                name,
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
