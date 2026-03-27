var stripe = require('stripe');
var { createClient } = require('@supabase/supabase-js');

var supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var stripeClient = stripe(process.env.STRIPE_SECRET_KEY);
  var event = req.body;

  console.log('[Stripe Webhook] Event type:', event.type);

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
  var session = event.data.object;
  
  // Email is in customer_details.email, not customer_email
  var email = session.customer_email || 
              session.customer_details?.email || 
              session.metadata?.email;
  
  // Plan from success_url or metadata
  var plan = session.metadata?.plan || 'starter';
  
  // Company from metadata or customer name
  var companyName = session.metadata?.tenantName || 
                    session.metadata?.company_name ||
                    session.customer_details?.name ||
                    'My Business';

  console.log('[Stripe] Checkout completed:', email, 'plan:', plan, 'company:', companyName);

  if (!email) { console.warn('[Stripe] No email in session'); break; }

  // Find user via auth
  var authLookup = await supabase.auth.admin.getUserByEmail(email);
  var userId = authLookup?.data?.user?.id;
  if (!userId) { console.warn('[Stripe] No user found for:', email); break; }

  // Check if user already has a tenant
  var { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('tenant_id')
    .eq('id', userId)
    .single();

  if (existingProfile?.tenant_id) {
    console.log('[Stripe] User already has tenant, skipping');
    break;
  }

  // Create tenant
  var slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
  var { data: tenant, error: tErr } = await supabase.from('tenants').insert({
    name: companyName,
    slug: slug,
    plan: plan,
    status: 'active',
    brand_primary: '#00C9FF',
    brand_name: companyName,
    channels_enabled: ['sms', 'email', 'whatsapp'],
  }).select().single();

  if (tErr) { console.error('[Stripe] Tenant create error:', tErr.message); break; }

  // Link user to tenant
  await supabase.from('user_profiles').update({
    tenant_id: tenant.id,
    role: 'admin',
    company_name: companyName,
  }).eq('id', userId);

  await supabase.from('tenant_members').insert({
    tenant_id: tenant.id,
    user_id: userId,
    role: 'admin',
    status: 'active',
    joined_at: new Date().toISOString(),
  });

  console.log('[Stripe] Tenant created:', tenant.id, 'for:', email);

  // Notify rob@engwx.com
  try {
    var sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to: 'rob@engwx.com',
      from: { email: 'hello@engwx.com', name: 'EngageWorx' },
      subject: '🎉 New Signup: ' + companyName + ' (' + plan + ')',
      text: 'New signup\n\nCompany: ' + companyName + '\nEmail: ' + email + '\nPlan: ' + plan + '\nTenant ID: ' + tenant.id,
    });
  } catch (emailErr) { console.log('Notify email failed:', emailErr.message); }

  break;
}

        // Create tenant
        var slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
        var { data: tenant, error: tErr } = await supabase.from('tenants').insert({
          name: companyName,
          slug: slug,
          plan: plan,
          status: 'active',
          brand_primary: '#00C9FF',
          brand_name: companyName,
          channels_enabled: ['sms', 'email', 'whatsapp'],
        }).select().single();

        if (tErr) { console.error('[Stripe] Tenant create error:', tErr.message); break; }

        // Link user to tenant
        await supabase.from('user_profiles').update({
          tenant_id: tenant.id,
          role: 'admin',
          company_name: companyName,
        }).eq('id', user.id);

        await supabase.from('tenant_members').insert({
          tenant_id: tenant.id,
          user_id: user.id,
          role: 'admin',
          status: 'active',
          joined_at: new Date().toISOString(),
        });

        console.log('[Stripe] Tenant created and user linked:', tenant.id);

        // Notify rob@engwx.com
        try {
          var sgMail = require('@sendgrid/mail');
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          await sgMail.send({
            to: 'rob@engwx.com',
            from: { email: 'hello@engwx.com', name: 'EngageWorx' },
            subject: '🎉 New Signup: ' + companyName + ' (' + plan + ')',
            text: 'New EngageWorx signup\n\nCompany: ' + companyName + '\nEmail: ' + email + '\nPlan: ' + plan + '\nTenant ID: ' + tenant.id,
          });
        } catch (emailErr) { console.log('Notify email failed:', emailErr.message); }

        break;
      }

      case 'invoice.payment_succeeded': {
        var invoice = event.data.object;
        console.log('[Stripe] Payment succeeded:', invoice.customer_email, '$' + (invoice.amount_paid / 100));
        // Log to Supabase — non-blocking
        supabase.from('audit_log').insert({
          action: 'payment_succeeded',
          metadata: {
            email: invoice.customer_email,
            amount: invoice.amount_paid / 100,
            invoice_id: invoice.id,
          },
        }).then(function() {}).catch(function() {});
        break;
      }

      case 'customer.subscription.deleted': {
        var sub = event.data.object;
        console.log('[Stripe] Subscription cancelled:', sub.customer);
        break;
      }

      default:
        console.log('[Stripe] Unhandled event type:', event.type);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[Stripe Webhook] Error:', err.message);
    return res.status(200).json({ received: true }); // Always 200 to prevent Stripe retries
  }
};
