// /api/usage.js — Usage metering, threshold alerts, and top-up processing
// POST /api/usage?action=check    → Check if message is allowed + increment
// POST /api/usage?action=status   → Get current usage status for tenant
// POST /api/usage?action=topup    → Create Stripe checkout for top-up pack
// POST /api/usage?action=alerts   → Process threshold alerts (cron job)

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var { createClient } = require('@supabase/supabase-js');
  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  var action = req.query.action || 'check';

  // ─── CHECK & INCREMENT ────────────────────────────────────────
  // Called before every outbound message to check if allowed
  if (action === 'check' && req.method === 'POST') {
    var tenantId = req.body.tenant_id;
    var channel = req.body.channel || 'sms';
    var count = req.body.count || 1;

    if (!tenantId) return res.status(400).json({ error: 'Missing tenant_id' });

    try {
      var result = await supabase.rpc('increment_usage', {
        p_tenant_id: tenantId,
        p_channel: channel,
        p_count: count,
      });

      if (result.error) {
        console.error('[Usage] increment error:', result.error.message);
        // Fail open — allow the message if metering fails
        return res.status(200).json({ allowed: true, error: result.error.message, failOpen: true });
      }

      var usage = result.data;

      // Check if we need to send threshold alerts
      if (usage.limit > 0) {
        var pct = Math.round((usage.usage / usage.limit) * 100);
        try {
          await checkAndSendAlerts(supabase, tenantId, pct, usage);
        } catch (e) { /* alert errors are non-fatal */ }
      }

      return res.status(200).json(usage);
    } catch (err) {
      console.error('[Usage] check error:', err.message);
      return res.status(200).json({ allowed: true, error: err.message, failOpen: true });
    }
  }

  // ─── STATUS ───────────────────────────────────────────────────
  // Get current usage status for dashboard display
  if (action === 'status') {
    var tenantId = req.query.tenant_id || (req.body && req.body.tenant_id);
    if (!tenantId) return res.status(400).json({ error: 'Missing tenant_id' });

    try {
      var result = await supabase.rpc('check_usage_status', { p_tenant_id: tenantId });

      if (result.error) {
        return res.status(500).json({ error: result.error.message });
      }

      return res.status(200).json(result.data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ─── TOP-UP ───────────────────────────────────────────────────
  // Create Stripe checkout for message top-up pack
  if (action === 'topup' && req.method === 'POST') {
    var tenantId = req.body.tenant_id;
    var pack = req.body.pack; // '10k', '50k', '100k', '250k', '500k'
    var email = req.body.email;

    if (!tenantId || !pack) return res.status(400).json({ error: 'Missing tenant_id or pack' });

    var packs = {
      '10k':  { messages: 10000,  price: 15000,  label: '10,000 Messages' },
      '50k':  { messages: 50000,  price: 60000,  label: '50,000 Messages' },
      '100k': { messages: 100000, price: 100000, label: '100,000 Messages' },
      '250k': { messages: 250000, price: 200000, label: '250,000 Messages' },
      '500k': { messages: 500000, price: 350000, label: '500,000 Messages' },
    };

    var selectedPack = packs[pack];
    if (!selectedPack) return res.status(400).json({ error: 'Invalid pack. Use: 10k, 50k, 100k, 250k, 500k' });

    try {
      var secretKey = process.env.STRIPE_SECRET_KEY;
      var response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + secretKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          'mode': 'payment',
          'payment_method_types[0]': 'card',
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][product_data][name]': 'EngageWorx Message Top-Up: ' + selectedPack.label,
          'line_items[0][price_data][unit_amount]': String(selectedPack.price),
          'line_items[0][quantity]': '1',
          'success_url': 'https://portal.engwx.com?topup=success&messages=' + selectedPack.messages,
          'cancel_url': 'https://portal.engwx.com?topup=cancelled',
          'metadata[tenant_id]': tenantId,
          'metadata[pack]': pack,
          'metadata[messages]': String(selectedPack.messages),
          'metadata[type]': 'topup',
          'customer_email': email || '',
        }).toString(),
      });

      var data = await response.json();

      if (!response.ok) {
        return res.status(500).json({ error: data.error ? data.error.message : 'Stripe error' });
      }

      return res.status(200).json({
        success: true,
        url: data.url,
        sessionId: data.id,
        pack: pack,
        messages: selectedPack.messages,
        price: selectedPack.price / 100,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ─── PROCESS TOP-UP WEBHOOK ───────────────────────────────────
  // Called from billing.js webhook when a top-up payment completes
  if (action === 'credit' && req.method === 'POST') {
    var tenantId = req.body.tenant_id;
    var messages = req.body.messages;
    var amount = req.body.amount;
    var stripePaymentId = req.body.stripe_payment_id;

    if (!tenantId || !messages) return res.status(400).json({ error: 'Missing tenant_id or messages' });

    try {
      var insertResult = await supabase.from('usage_topups').insert({
        tenant_id: tenantId,
        messages_purchased: parseInt(messages),
        messages_remaining: parseInt(messages),
        amount_paid: parseFloat(amount) || 0,
        stripe_payment_id: stripePaymentId || null,
        status: 'active',
      });

      if (insertResult.error) {
        return res.status(500).json({ error: insertResult.error.message });
      }

      // Send confirmation to Rob
      try {
        var RESEND_KEY = process.env.RESEND_API_KEY;
        if (RESEND_KEY) {
          var tenantResult = await supabase.from('tenants').select('name').eq('id', tenantId).single();
          var tenantName = tenantResult.data ? tenantResult.data.name : tenantId;
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'EngageWorx <hello@engwx.com>',
              to: [(process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com')],
              subject: 'Top-up purchased: ' + tenantName + ' (' + messages + ' messages)',
              html: '<h2>Message Top-Up Purchased</h2><p><b>Tenant:</b> ' + tenantName + '</p><p><b>Messages:</b> ' + messages + '</p><p><b>Amount:</b> $' + (parseFloat(amount) || 0).toFixed(2) + '</p>',
            }),
          });
        }
      } catch (e) { /* non-fatal */ }

      return res.status(200).json({ success: true, messages_credited: parseInt(messages) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ─── ALERTS PROCESSOR ─────────────────────────────────────────
  // Called periodically (cron) or after each usage check
  if (action === 'alerts') {
    try {
      var result = await supabase.from('usage_metering')
        .select('*, tenants(name, plan)')
        .eq('status', 'active')
        .gte('period_start', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

      if (result.error || !result.data) {
        return res.status(500).json({ error: result.error ? result.error.message : 'No data' });
      }

      var alertsSent = 0;
      for (var i = 0; i < result.data.length; i++) {
        var usage = result.data[i];
        if (usage.plan_limit <= 0) continue;
        var pct = Math.round((usage.total_messages / usage.plan_limit) * 100);
        var sent = await checkAndSendAlerts(supabase, usage.tenant_id, pct, {
          usage: usage.total_messages,
          limit: usage.plan_limit,
        });
        if (sent) alertsSent++;
      }

      return res.status(200).json({ processed: result.data.length, alerts_sent: alertsSent });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action. Use: check, status, topup, credit, alerts' });
};

// ─── HELPER: Check and send threshold alerts ────────────────────
async function checkAndSendAlerts(supabase, tenantId, pct, usage) {
  var periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  // Get current alert state
  var alertResult = await supabase.from('usage_metering')
    .select('alert_80_sent, alert_90_sent, alert_100_sent')
    .eq('tenant_id', tenantId)
    .eq('period_start', periodStart)
    .single();

  if (!alertResult.data) return false;
  var alerts = alertResult.data;

  var threshold = null;
  var updateField = null;

  if (pct >= 100 && !alerts.alert_100_sent) {
    threshold = 100;
    updateField = 'alert_100_sent';
  } else if (pct >= 90 && !alerts.alert_90_sent) {
    threshold = 90;
    updateField = 'alert_90_sent';
  } else if (pct >= 80 && !alerts.alert_80_sent) {
    threshold = 80;
    updateField = 'alert_80_sent';
  }

  if (!threshold) return false;

  // Mark alert as sent
  var updateObj = {};
  updateObj[updateField] = true;
  await supabase.from('usage_metering').update(updateObj)
    .eq('tenant_id', tenantId).eq('period_start', periodStart);

  // Get tenant info for the email
  var tenantResult = await supabase.from('tenants').select('name').eq('id', tenantId).single();
  var tenantName = tenantResult.data ? tenantResult.data.name : 'Unknown';

  // Get tenant admin email
  var memberResult = await supabase.from('tenant_members')
    .select('user_id').eq('tenant_id', tenantId).eq('role', 'admin').limit(1).single();

  var adminEmail = null;
  if (memberResult.data) {
    var authResult = await supabase.auth.admin.getUserById(memberResult.data.user_id);
    if (authResult.data && authResult.data.user) {
      adminEmail = authResult.data.user.email;
    }
  }

  // Send alert email
  var RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return false;

  var subject = threshold === 100
    ? 'Usage Alert: ' + tenantName + ' has reached 100% of message limit'
    : 'Usage Alert: ' + tenantName + ' has reached ' + threshold + '% of message limit';

  var actionText = threshold === 100
    ? 'Your account has reached its message limit. Additional messages may be blocked. Purchase a top-up pack or upgrade your plan to continue sending.'
    : 'Your account is approaching its message limit. Consider purchasing a top-up pack or upgrading your plan to avoid interruption.';

  var html = '<div style="font-family:Arial,sans-serif;max-width:520px;">'
    + '<div style="background:linear-gradient(135deg,#00BFFF,#A855F7);padding:20px;border-radius:12px 12px 0 0;">'
    + '<h2 style="color:#fff;margin:0;">Usage Alert: ' + threshold + '% Reached</h2></div>'
    + '<div style="background:#f8f9fa;padding:20px;border-radius:0 0 12px 12px;border:1px solid #e0e0e0;">'
    + '<p><b>Tenant:</b> ' + tenantName + '</p>'
    + '<p><b>Messages Used:</b> ' + (usage.usage || 0).toLocaleString() + ' / ' + (usage.limit || 0).toLocaleString() + '</p>'
    + '<p><b>Usage:</b> ' + threshold + '%</p>'
    + '<p>' + actionText + '</p>'
    + '<a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#00BFFF,#A855F7);color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:10px;">View Dashboard</a>'
    + '</div></div>';

  // Send to tenant admin
  var recipients = [(process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com')];
  if (adminEmail && adminEmail !== (process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com')) {
    recipients.push(adminEmail);
  }

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'EngageWorx <hello@engwx.com>',
      to: recipients,
      subject: subject,
      html: html,
    }),
  });

  return true;
}
