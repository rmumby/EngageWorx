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
          console.log('[Stripe] User already has tenant, skipping tenant creation');
          // Still send welcome email if not already sent
          // (non-blocking, falls through to welcome email below)
        } else {

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

        // ── Welcome email to new customer ─────────────────────────────────
        try {
          var sgMailWelcome = require('@sendgrid/mail');
          sgMailWelcome.setApiKey(process.env.SENDGRID_API_KEY);
          await sgMailWelcome.send({
            to: email,
            from: { email: 'hello@engwx.com', name: 'EngageWorx' },
            subject: 'Welcome to EngageWorx — Your Account is Ready 🎉',
            text: 'Welcome to EngageWorx!\n\nYour account is live at portal.engwx.com\n\nEmail: ' + email + '\nPlan: ' + plan + '\n\n3 things to do first:\n1. Add your phone number (Settings → Phone Numbers)\n2. Import your contacts (Contacts → Import)\n3. Set up your AI Chatbot\n\nBook an onboarding call: calendly.com/rob-engwx/30min\n\nRob Mumby\nFounder & CEO, EngageWorx\n+1 (786) 982-7800\nengwx.com',
            html: '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;"><div style="background:linear-gradient(135deg,#00C9FF,#E040FB);border-radius:12px;padding:32px;text-align:center;margin-bottom:24px;"><span style="color:#fff;font-weight:900;font-size:22px;">EngageWorx</span><div style="color:#fff;font-size:13px;opacity:0.85;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">AI-Powered CX</div><h1 style="color:#fff;margin:16px 0 8px;font-size:26px;font-weight:800;">Welcome! 🎉</h1><p style="color:rgba(255,255,255,0.9);margin:0;font-size:15px;">Your account is live and ready to go.</p></div><div style="background:#fff;border-radius:12px;padding:28px;margin-bottom:20px;border:1px solid #e2e8f0;"><h2 style="color:#1e293b;margin:0 0 16px;font-size:18px;">Your Login Details</h2><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:10px 0;color:#64748b;font-size:14px;width:120px;">Portal</td><td style="padding:10px 0;font-size:14px;"><a href="https://portal.engwx.com" style="color:#00C9FF;text-decoration:none;font-weight:700;">portal.engwx.com</a></td></tr><tr style="border-top:1px solid #f1f5f9;"><td style="padding:10px 0;color:#64748b;font-size:14px;">Email</td><td style="padding:10px 0;font-size:14px;color:#1e293b;font-weight:600;">' + email + '</td></tr><tr style="border-top:1px solid #f1f5f9;"><td style="padding:10px 0;color:#64748b;font-size:14px;">Plan</td><td style="padding:10px 0;font-size:14px;color:#1e293b;">' + plan.charAt(0).toUpperCase() + plan.slice(1) + '</td></tr></table><div style="margin-top:20px;text-align:center;"><a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15px;">Log In to Your Portal →</a></div></div><div style="background:#fff;border-radius:12px;padding:28px;margin-bottom:20px;border:1px solid #e2e8f0;"><h2 style="color:#1e293b;margin:0 0 16px;font-size:18px;">3 Things to Do First</h2><div style="padding:14px;background:#f8fafc;border-radius:8px;margin-bottom:10px;"><strong style="color:#1e293b

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
