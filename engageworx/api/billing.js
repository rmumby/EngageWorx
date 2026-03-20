// /api/billing.js — Single Vercel Serverless Function for all Stripe + signup operations
// POST /api/billing?action=signup    → Create user + Stripe Checkout in one call
// POST /api/billing?action=checkout  → Create Stripe Checkout session
// POST /api/billing?action=portal    → Create Customer Portal session
// POST /api/billing?action=webhook   → Stripe webhook handler
// GET  /api/billing?action=status    → Check subscription status

var PRICE_IDS = {
  starter: 'price_1T4OeIPEs1sluBAUuRIaD8Cq',
  growth: 'price_1T4OefPEs1sluBAUuZVAaBJ3',
  pro: 'price_1T4Of6PEs1sluBAURFjaViRv',
};

async function stripeRequest(endpoint, method, body) {
  var secretKey = process.env.STRIPE_SECRET_KEY;
  var response = await fetch(`https://api.stripe.com/v1${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  var data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });

  var action = req.query.action || 'checkout';

  // ─── SIGNUP: Create user + checkout in one call ───────────────────
  if (action === 'signup' && req.method === 'POST') {
    var { email, password, fullName, companyName, plan } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Missing email or password' });
    }

    const { createClient } = require('@supabase/supabase-js');
    var supabase = createClient(
      process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
    }

    try {
      // Create user via admin API (server-side, no client session)
      var { data: authData, error: authError } = await supabase.auth.admin.createUser({
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
      var selectedPlan = (plan || 'starter').toLowerCase();
      var priceId = PRICE_IDS[selectedPlan];
      if (!priceId) {
        return res.status(400).json({ error: `Invalid plan: ${selectedPlan}` });
      }

      var successUrl = 'https://portal.engwx.com?checkout=success&email=' + encodeURIComponent(email);
      var cancelUrl = 'https://portal.engwx.com?checkout=cancelled';

      // Find or create Stripe customer for signup
      var signupCustomerId;
      var listResult = await stripeRequest(
        `/customers?email=${encodeURIComponent(email)}&limit=1`,
        'GET'
      );
      if (listResult.ok && listResult.data.data?.length > 0) {
        signupCustomerId = listResult.data.data[0].id;
      } else {
        var createResult = await stripeRequest('/customers', 'POST', {
          'email': email,
          'name': fullName || '',
          'metadata[source]': 'engageworx_signup',
          'metadata[company]': companyName || '',
        });
        if (createResult.ok) {
          signupCustomerId = createResult.data.id;
        }
      }

      var params = {
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

      var result = await stripeRequest('/checkout/sessions', 'POST', params);

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
    var { plan, email, tenantId, tenantName, priceId: directPriceId, mode: reqMode, successUrl: customSuccessUrl, cancelUrl: customCancelUrl } = req.body;

    // Support direct priceId for top-ups, or plan name for subscriptions
    var priceId = directPriceId;
    var checkoutMode = reqMode || 'subscription';

    if (!priceId) {
      if (!plan || !email) {
        return res.status(400).json({ error: 'Missing required fields: plan and email, or priceId' });
      }
      priceId = PRICE_IDS[plan.toLowerCase()];
      if (!priceId) {
        return res.status(400).json({ error: `Invalid plan: ${plan}. Use starter, growth, or pro` });
      }
    }

    var successUrl = customSuccessUrl || `https://portal.engwx.com?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    var cancelUrl = customCancelUrl || `https://portal.engwx.com?checkout=cancelled`;

    try {
      // Always find or create a Stripe customer
      var customerId;
      if (email) {
        // Try list endpoint (most reliable)
        var listResult = await stripeRequest(
          `/customers?email=${encodeURIComponent(email)}&limit=1`,
          'GET'
        );
        if (listResult.ok && listResult.data.data?.length > 0) {
          customerId = listResult.data.data[0].id;
        }

        // If no customer exists, create one
        if (!customerId) {
          var createResult = await stripeRequest('/customers', 'POST', {
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
      var params = {
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

      var result = await stripeRequest('/checkout/sessions', 'POST', params);

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
    var { customerId, email } = req.body;

    try {
      var stripeCustomerId = customerId;

      // Look up customer by email if no ID provided
      if (!stripeCustomerId && email) {
        // Try search API first
        var searchResult = await stripeRequest(
          `/customers/search?query=email:'${email}'`,
          'GET'
        );
        if (searchResult.ok && searchResult.data.data?.length > 0) {
          stripeCustomerId = searchResult.data.data[0].id;
        }

        // Fallback: list customers filtered by email
        if (!stripeCustomerId) {
          var listResult = await stripeRequest(
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

      var result = await stripeRequest('/billing_portal/sessions', 'POST', {
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
    var email = req.query.email;
    if (!email) return res.status(400).json({ error: 'Missing email query param' });

    try {
      // Try list endpoint (most reliable)
      var listResult = await stripeRequest(
        `/customers?email=${encodeURIComponent(email)}&limit=1`,
        'GET'
      );

      if (!listResult.ok || !listResult.data.data?.length) {
        return res.status(200).json({ subscribed: false, plan: null });
      }

      var customerId = listResult.data.data[0].id;

      var subs = await stripeRequest(
        `/subscriptions?customer=${customerId}&status=active&limit=1`,
        'GET'
      );

      if (!subs.ok || !subs.data.data?.length) {
        // Check for trialing
        var trialSubs = await stripeRequest(
          `/subscriptions?customer=${customerId}&status=trialing&limit=1`,
          'GET'
        );
        if (trialSubs.ok && trialSubs.data.data?.length) {
          var sub = trialSubs.data.data[0];
          var plan = sub.metadata?.plan || Object.entries(PRICE_IDS).find(
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

      var sub = subs.data.data[0];
      var plan = sub.metadata?.plan || Object.entries(PRICE_IDS).find(
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
    var event = req.body;

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          var session = event.data.object;
          console.log(`[Stripe] Checkout completed: ${session.customer_email}, sub: ${session.subscription}`);

          const { createClient } = require('@supabase/supabase-js');
          var supabase = createClient(
            process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
          );

          // ── CHECK IF THIS IS A TOP-UP PAYMENT ──
          var sessionMeta = session.metadata || {};
          if (sessionMeta.type === 'topup' && sessionMeta.tenant_id && sessionMeta.messages) {
            console.log('[Stripe] Top-up payment detected:', sessionMeta.messages, 'messages for tenant', sessionMeta.tenant_id);
            try {
              await supabase.from('usage_topups').insert({
                tenant_id: sessionMeta.tenant_id,
                messages_purchased: parseInt(sessionMeta.messages),
                messages_remaining: parseInt(sessionMeta.messages),
                amount_paid: (session.amount_total || 0) / 100,
                stripe_payment_id: session.payment_intent || session.id,
                status: 'active',
              });
              console.log('[Stripe] Top-up credited:', sessionMeta.messages, 'messages');

              // Notify Rob
              try {
                var RESEND_KEY = process.env.RESEND_API_KEY;
                if (RESEND_KEY) {
                  var tenantRes = await supabase.from('tenants').select('name').eq('id', sessionMeta.tenant_id).single();
                  var tName = tenantRes.data ? tenantRes.data.name : sessionMeta.tenant_id;
                  await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      from: 'EngageWorx <hello@engwx.com>',
                      to: ['rob@engwx.com'],
                      subject: 'Top-up purchased: ' + tName + ' (' + sessionMeta.messages + ' messages)',
                      html: '<h2>Message Top-Up</h2><p><b>Tenant:</b> ' + tName + '</p><p><b>Messages:</b> ' + sessionMeta.messages + '</p><p><b>Amount:</b> $' + ((session.amount_total || 0) / 100).toFixed(2) + '</p>',
                    }),
                  });
                }
              } catch (ne) { /* non-fatal */ }
            } catch (topupErr) {
              console.error('[Stripe] Top-up credit error:', topupErr.message);
            }
            break;
          }

          var email = session.customer_email;
          var metadata = session.metadata || {};

          // Fetch subscription from Stripe to get metadata (plan, tenant_name)
          var subMetadata = {};
          if (session.subscription) {
            var subResult = await stripeRequest(`/subscriptions/${session.subscription}`, 'GET');
            if (subResult.ok) {
              subMetadata = subResult.data.metadata || {};
              console.log('[Stripe] Subscription metadata:', JSON.stringify(subMetadata));
            }
          }

          var plan = subMetadata.plan || metadata.plan || 'starter';
          var tenantName = subMetadata.tenant_name || metadata.tenant_name || 'My Business';

          // Find auth user by email
          var { data: authUsers } = await supabase.auth.admin.listUsers();
          var authUser = authUsers?.users?.find(u => u.email === email);
          var userId = authUser?.id;
          var userMeta = authUser?.user_metadata || {};

          // Check if tenant already exists for this user
          var { data: existingProfile } = await supabase
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
            var name = userMeta.company_name || tenantName || 'My Business';
            var slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
            console.log('[Stripe] Creating tenant:', name, 'for', email);

            var { data: tenant, error: tenantError } = await supabase
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
              var teamEmails = userMeta.team_emails;
              if (teamEmails) {
                var emails = teamEmails.split(',').map(e => e.trim()).filter(Boolean);
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
          var sub = event.data.object;
          console.log(`[Stripe] Subscription updated: ${sub.id} → ${sub.status}`);
          break;
        }

        case 'customer.subscription.deleted': {
          var sub = event.data.object;
          console.log(`[Stripe] Subscription cancelled: ${sub.id}`);

          const { createClient } = require('@supabase/supabase-js');
          var supabase = createClient(
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
          var invoice = event.data.object;
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
