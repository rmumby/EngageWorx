var { createClient } = require('@supabase/supabase-js');

var supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var event = req.body;
  console.log('[Stripe Webhook] Event type:', event.type);

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        var session = event.data.object;
        var email = session.customer_email || (session.customer_details && session.customer_details.email) || (session.metadata && session.metadata.email);
        var plan = (session.metadata && session.metadata.plan) || 'starter';
        var companyName = (session.metadata && session.metadata.tenantName) || (session.metadata && session.metadata.company_name) || (session.customer_details && session.customer_details.name) || 'My Business';

        console.log('[Stripe] Checkout completed:', email, 'plan:', plan, 'company:', companyName);

        if (!email) { console.warn('[Stripe] No email in session'); break; }

        // Find user by email in user_profiles
var userResult = await supabase
  .from('user_profiles')
  .select('id')
  .eq('email', email)
  .limit(1);
var userId = userResult.data && userResult.data.length > 0 ? userResult.data[0].id : null;

// Fallback — try auth.users via listUsers filtered search
if (!userId) {
  var listResult = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  var matchedUser = listResult.data && listResult.data.users ? listResult.data.users.find(function(u) { return u.email === email; }) : null;
  userId = matchedUser ? matchedUser.id : null;
}

if (!userId) { console.warn('[Stripe] No user found for:', email); break; }
        // Check if user already has a tenant
        var profileResult = await supabase.from('user_profiles').select('tenant_id').eq('id', userId).single();
        if (profileResult.data && profileResult.data.tenant_id) {
          console.log('[Stripe] User already has tenant, skipping');
          break;
        }

        // Create tenant
        var slug = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
        var tenantResult = await supabase.from('tenants').insert({
          name: companyName,
          slug: slug,
          plan: plan,
          status: 'active',
          brand_primary: '#00C9FF',
          brand_name: companyName,
          channels_enabled: ['sms', 'email', 'whatsapp'],
        }).select().single();

        if (tenantResult.error) { console.error('[Stripe] Tenant create error:', tenantResult.error.message); break; }
        var tenant = tenantResult.data;

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

      case 'invoice.payment_succeeded': {
        var invoice = event.data.object;
        console.log('[Stripe] Payment succeeded:', invoice.customer_email, '$' + (invoice.amount_paid / 100));
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
    console.error('[Stripe Webhook] Error:', err.message, err.stack);
    return res.status(200).json({ received: true });
  }
};
