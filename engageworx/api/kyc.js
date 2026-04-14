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
        if (sgMail) {
          try {
            var _sigK1 = require('./_email-signature');
            var sigK1 = await _sigK1.getSignature(supabase, { tenantId: tenant.id, fromEmail: 'notifications@engwx.com', isFirstTouch: false, closingKind: 'reply' });
            await sgMail.send({
              to: 'rob@engwx.com',
              from: { email: 'notifications@engwx.com', name: sigK1.fromName || 'EngageWorx' },
              subject: '🪪 KYC Approved: ' + tenant.name,
              html: '<h3>Identity verified via Stripe Identity</h3><p><b>Tenant:</b> ' + tenant.name + '</p><p>Lead Scan is now unlocked for this tenant.</p>',
            });
          } catch (ne) {}
        }
        console.log('[KYC Webhook] Approved:', tenant.name);
      } else if (event.type === 'identity.verification_session.requires_input' ||
                 event.type === 'identity.verification_session.canceled') {
        await supabase.from('tenants').update({
          kyc_status: 'rejected',
          updated_at: new Date().toISOString(),
        }).eq('id', tenant.id);
        if (sgMail) {
          try {
            var lastErr = (verSession.last_error && verSession.last_error.reason) || 'unknown';
            var _sigK2 = require('./_email-signature');
            var sigK2 = await _sigK2.getSignature(supabase, { tenantId: tenant.id, fromEmail: 'notifications@engwx.com', isFirstTouch: false, closingKind: 'reply' });
            await sgMail.send({
              to: 'rob@engwx.com',
              from: { email: 'notifications@engwx.com', name: sigK2.fromName || 'EngageWorx' },
              subject: '⚠️ KYC Rejected: ' + tenant.name,
              html: '<h3>Identity verification rejected</h3><p><b>Tenant:</b> ' + tenant.name + '</p><p><b>Reason:</b> ' + lastErr + '</p><p>Review in Tenant Management; may need manual override.</p>',
            });
          } catch (ne) {}
        }
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
