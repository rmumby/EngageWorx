// api/kyc.js — Stripe Identity verification
// POST /api/kyc?action=create-session  → returns { url, client_secret }
// POST /api/kyc?action=webhook         → Stripe Identity status updates

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Stripe-Signature');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var action = req.query.action;
  var body = req.body || {};
  var supabase = getSupabase();
  var stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(500).json({ error: 'STRIPE_SECRET_KEY missing' });

  // ── CREATE-SESSION: kick off a Stripe Identity verification flow ────────
  if (action === 'create-session') {
    var tenantId = body.tenant_id;
    var email = body.email;
    if (!tenantId || !email) return res.status(400).json({ error: 'tenant_id and email required' });

    try {
      var params = new URLSearchParams();
      params.append('type', 'document');
      params.append('metadata[tenant_id]', tenantId);
      params.append('metadata[email]', email);
      params.append('return_url', 'https://portal.engwx.com/?kyc=complete');
      params.append('options[document][require_matching_selfie]', 'true');

      var stripeRes = await fetch('https://api.stripe.com/v1/identity/verification_sessions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + stripeKey, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      var stripeData = await stripeRes.json();
      if (!stripeRes.ok) return res.status(500).json({ error: stripeData.error ? stripeData.error.message : 'Stripe error' });

      await supabase.from('tenants').update({
        kyc_session_id: stripeData.id,
        kyc_status: 'pending',
        updated_at: new Date().toISOString(),
      }).eq('id', tenantId);

      return res.status(200).json({
        success: true,
        session_id: stripeData.id,
        client_secret: stripeData.client_secret,
        url: stripeData.url,
      });
    } catch (err) {
      console.error('[KYC] create-session error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── WEBHOOK: Stripe Identity status updates ─────────────────────────────
  if (action === 'webhook') {
    var event = body;
    var sig = req.headers['stripe-signature'];
    // Signature verification would go here in production
    console.log('[KYC Webhook]', event.type || 'unknown');

    try {
      var verSession = event.data && event.data.object ? event.data.object : null;
      if (!verSession) return res.status(200).json({ received: true });
      var sessionId = verSession.id;
      var metadataTenantId = verSession.metadata ? verSession.metadata.tenant_id : null;

      // Find tenant by either metadata or stored session_id
      var tenant = null;
      if (metadataTenantId) {
        var t = await supabase.from('tenants').select('id, name, digest_email').eq('id', metadataTenantId).maybeSingle();
        tenant = t.data;
      }
      if (!tenant && sessionId) {
        var t2 = await supabase.from('tenants').select('id, name, digest_email').eq('kyc_session_id', sessionId).maybeSingle();
        tenant = t2.data;
      }
      if (!tenant) { console.warn('[KYC Webhook] Tenant not found for session', sessionId); return res.status(200).json({ received: true }); }

      var sgMail = null;
      if (process.env.SENDGRID_API_KEY) {
        sgMail = require('@sendgrid/mail');
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      }

      if (event.type === 'identity.verification_session.verified') {
        await supabase.from('tenants').update({
          kyc_status: 'approved',
          kyc_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', tenant.id);
        try {
          var { notifyTenantAdmins: _notifyKYC1 } = require('./_lib/notify-tenant-admins');
          await _notifyKYC1(supabase, tenant.id, 'kyc_passed', {}, {
            subject: '🪪 KYC Approved: ' + tenant.name,
            html: '<h3>Identity Verified</h3><p><b>Tenant:</b> ' + tenant.name + '</p><p>Your identity has been verified. Lead Scan is now unlocked on your account.</p>',
          });
        } catch (ne) {}
        console.log('[KYC Webhook] Approved:', tenant.name);
      } else if (event.type === 'identity.verification_session.requires_input' ||
                 event.type === 'identity.verification_session.canceled') {
        await supabase.from('tenants').update({
          kyc_status: 'rejected',
          updated_at: new Date().toISOString(),
        }).eq('id', tenant.id);
        var lastErr = (verSession.last_error && verSession.last_error.reason) || 'unknown';
        try {
          var { notifyTenantAdmins: _notifyKYC2 } = require('./_lib/notify-tenant-admins');
          await _notifyKYC2(supabase, tenant.id, 'kyc_failed', { reason: lastErr }, {
            subject: '⚠️ KYC Verification Failed — action required: ' + tenant.name,
            html: '<h3>Identity Verification Failed</h3>' +
              '<p><b>Tenant:</b> ' + tenant.name + '</p>' +
              '<p><b>Reason:</b> ' + lastErr + '</p>' +
              '<p><b>Next steps:</b> Please retry the identity verification from your <a href="https://portal.engwx.com">portal settings</a>. Ensure your ID photo is clear and matches your registered details. Contact support if the issue persists.</p>',
          });
        } catch (ne) {}
        console.log('[KYC Webhook] Rejected:', tenant.name);
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error('[KYC Webhook] Error:', err.message);
      return res.status(200).json({ received: true });
    }
  }

  return res.status(400).json({ error: 'Unknown action: ' + action });
};
