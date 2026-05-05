// api/email-setup.js — Resend custom domain setup wizard backend
// Actions: create-domain, check-verification, save-config, send-test, dns-instructions

var { createClient } = require('@supabase/supabase-js');
var { sendTenantEmail } = require('./_lib/send-tenant-email');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function resendAPI(method, path, body) {
  var key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not configured');
  var opts = {
    method: method,
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch('https://api.resend.com' + path, opts);
  var data = await res.json().catch(function() { return {}; });
  if (!res.ok) throw new Error(data.message || data.error || 'Resend API error: HTTP ' + res.status);
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var authHeader = req.headers.authorization || '';
  var jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return res.status(401).json({ error: 'Authorization required' });

  var supabase = getSupabase();
  var { data: userData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !userData || !userData.user) return res.status(401).json({ error: 'Invalid token' });

  var action = (req.query || {}).action || (req.body || {}).action;
  var body = req.body || {};

  // ── create-domain: Register domain with Resend, return DNS records ──────
  if (action === 'create-domain') {
    var domain = (body.domain || '').trim().toLowerCase();
    if (!domain || domain.indexOf('.') === -1) return res.status(400).json({ error: 'Valid domain required' });

    try {
      var result = await resendAPI('POST', '/domains', { name: domain });
      return res.status(200).json({
        success: true,
        domain_id: result.id,
        domain: result.name,
        status: result.status,
        records: result.records || [],
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // ── check-verification: Poll domain verification status ─────────────────
  if (action === 'check-verification') {
    var domainId = body.domain_id;
    if (!domainId) return res.status(400).json({ error: 'domain_id required' });

    try {
      // Trigger verification check first
      await resendAPI('POST', '/domains/' + domainId + '/verify').catch(function() {});
      // Then read status
      var domainInfo = await resendAPI('GET', '/domains/' + domainId);
      return res.status(200).json({
        success: true,
        domain_id: domainInfo.id,
        domain: domainInfo.name,
        status: domainInfo.status,
        records: domainInfo.records || [],
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  // ── save-config: Write to channel_configs + tenants ─────────────────────
  if (action === 'save-config') {
    var tenantId = body.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
    if (!body.from_email || !body.from_name || !body.domain) return res.status(400).json({ error: 'from_email, from_name, and domain required' });

    try {
      // Load existing channel config to preserve other fields
      var existing = await supabase.from('channel_configs')
        .select('id, config_encrypted')
        .eq('tenant_id', tenantId).eq('channel', 'email').maybeSingle();

      var existingConfig = (existing.data && existing.data.config_encrypted) || {};
      var mergedConfig = Object.assign({}, existingConfig, {
        from_email: body.from_email,
        from_name: body.from_name,
        domain: body.domain,
        resend_domain_id: body.domain_id || existingConfig.resend_domain_id || null,
      });

      var configPayload = {
        tenant_id: tenantId,
        channel: 'email',
        enabled: true,
        config_encrypted: mergedConfig,
        status: 'connected',
        updated_at: new Date().toISOString(),
      };

      if (existing.data && existing.data.id) {
        await supabase.from('channel_configs').update(configPayload).eq('id', existing.data.id);
      } else {
        await supabase.from('channel_configs').insert(configPayload);
      }

      // Update tenants table
      var tenantUpdate = {
        email_send_method: 'resend',
        resend_domain: body.domain,
        resend_domain_verified: true,
      };
      // Set email_tracking_domain if not already set
      var tenantRow = await supabase.from('tenants').select('email_tracking_domain').eq('id', tenantId).maybeSingle();
      if (!tenantRow.data || !tenantRow.data.email_tracking_domain) {
        tenantUpdate.email_tracking_domain = 'track.engwx.com';
      }
      await supabase.from('tenants').update(tenantUpdate).eq('id', tenantId);

      console.log('[email-setup] Config saved for tenant:', tenantId, 'domain:', body.domain);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[email-setup] Save error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── send-test: Send test email via sendTenantEmail ──────────────────────
  if (action === 'send-test') {
    var testTenantId = body.tenant_id;
    var testTo = body.to;
    if (!testTenantId || !testTo) return res.status(400).json({ error: 'tenant_id and to required' });

    try {
      await sendTenantEmail(supabase, {
        tenant_id: testTenantId,
        to: testTo,
        subject: 'Email setup verified',
        html: '<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;">' +
          '<div style="text-align:center;margin-bottom:24px;font-size:48px;">✅</div>' +
          '<h1 style="color:#1e293b;font-size:20px;margin:0 0 8px;text-align:center;">Your email is set up!</h1>' +
          '<p style="color:#64748b;font-size:14px;line-height:1.6;text-align:center;">This test email was sent from your verified domain. All outbound emails from your portal will now use this configuration.</p>' +
          '</div>',
        text: 'Your email is set up! This test email was sent from your verified domain.',
      });
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── dns-instructions: AI-generated provider-specific DNS instructions ───
  if (action === 'dns-instructions') {
    var provider = body.provider || 'generic';
    var records = body.records;
    if (!records || !Array.isArray(records)) return res.status(400).json({ error: 'records array required' });

    try {
      var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_KEY) return res.status(200).json({ instructions: 'Add the DNS records shown above at your DNS provider.' });

      var recordsSummary = records.map(function(r) {
        return r.type + ' record: name="' + (r.name || r.host || '') + '" value="' + (r.value || r.content || '') + '"' + (r.priority ? ' priority=' + r.priority : '') + (r.ttl ? ' TTL=' + r.ttl : '');
      }).join('\n');

      var aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 800,
          system: 'You help non-technical users add DNS records to verify their email sending domain. Give step-by-step instructions specific to the DNS provider they use. Be concise — numbered steps, no preamble. If the provider is "generic" or unknown, give general instructions that work for most DNS panels.',
          messages: [{ role: 'user', content: 'DNS provider: ' + provider + '\n\nRecords to add:\n' + recordsSummary + '\n\nGive me step-by-step instructions to add these records at ' + provider + '.' }],
        }),
      });
      var aiData = await aiRes.json();
      var instructions = (aiData.content || []).find(function(b) { return b.type === 'text'; });
      return res.status(200).json({ instructions: instructions ? instructions.text : 'Add the DNS records shown above at your DNS provider.' });
    } catch (err) {
      return res.status(200).json({ instructions: 'Add the DNS records shown above at your DNS provider.' });
    }
  }

  return res.status(400).json({ error: 'Unknown action: ' + action });
};
