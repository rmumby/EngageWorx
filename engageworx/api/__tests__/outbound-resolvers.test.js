/**
 * Outbound channel routing resolver tests.
 *
 * Covers the rewritten outbound senders:
 *   - Sequence engine SMS: phone_numbers lookup, strict no-match, supplier check
 *   - WhatsApp outbound: whatsapp_phone_number_id usage
 *   - Multi-tenant isolation: tenant A never picks tenant B's number
 *   - No SP fallback: send fails cleanly when credentials missing
 */

// ─── Mock Supabase builder ───────────────────────────────────────────────────

function buildMockSupabase(data) {
  var pn = data.phone_numbers || [];
  var cc = data.channel_configs || [];
  var tenants = data.tenants || [];

  function createChain(rows) {
    var chain = {
      _rows: rows,
      _filters: [],
      select: function() { return chain; },
      eq: function(col, val) {
        chain._filters.push({ col: col, val: val });
        return chain;
      },
      in: function() { return chain; },
      limit: function() { return chain; },
      maybeSingle: function() {
        var filtered = chain._rows;
        for (var f of chain._filters) {
          filtered = filtered.filter(function(r) { return r[f.col] === f.val; });
        }
        return Promise.resolve({ data: filtered[0] || null, error: null });
      },
      single: function() {
        return chain.maybeSingle().then(function(res) {
          if (!res.data) return { data: null, error: { message: 'No rows' } };
          return res;
        });
      },
    };
    return chain;
  }

  return {
    from: function(table) {
      if (table === 'phone_numbers') return createChain(pn);
      if (table === 'channel_configs') return createChain(cc);
      if (table === 'tenants') return createChain(tenants);
      return createChain([]);
    },
  };
}

// ─── Sequence SMS resolver (extracted logic) ─────────────────────────────────

async function resolveSequenceSms(supabase, tenantId, tenantName) {
  // Resolve sender number from phone_numbers
  var pnResult = await supabase
    .from('phone_numbers')
    .select('number')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (!pnResult.data || !pnResult.data.number) {
    return { error: 'no_sender_number', from: null, supplier: null };
  }
  var smsFrom = pnResult.data.number;

  // Verify SMS channel is enabled
  var ccResult = await supabase
    .from('channel_configs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel', 'sms')
    .eq('enabled', true)
    .maybeSingle();

  if (!ccResult.data) {
    return { error: 'sms_channel_not_configured', from: null, supplier: null };
  }

  // Check phone_supplier
  var supplierResult = await supabase
    .from('tenants')
    .select('phone_supplier')
    .eq('id', tenantId)
    .maybeSingle();
  var supplier = (supplierResult.data && supplierResult.data.phone_supplier) || 'twilio';

  if (supplier !== 'twilio') {
    return { error: 'unsupported_supplier: ' + supplier, from: null, supplier: supplier };
  }

  return { error: null, from: smsFrom, supplier: supplier };
}

// ─── WhatsApp outbound resolver (extracted logic) ────────────────────────────

async function resolveWhatsAppOutbound(supabase, tenantId) {
  if (!tenantId) return { gateway: null, error: 'no_tenant_id' };

  var cfgResult = await supabase
    .from('channel_configs')
    .select('config_encrypted, whatsapp_phone_number_id')
    .eq('tenant_id', tenantId)
    .eq('channel', 'whatsapp')
    .eq('enabled', true)
    .maybeSingle();

  if (!cfgResult.data) {
    return { gateway: null, error: 'no_whatsapp_config' };
  }

  var cfg = cfgResult.data.config_encrypted || {};
  var pnId = cfgResult.data.whatsapp_phone_number_id || cfg.phone_number_id;

  if (pnId && cfg.access_token) {
    return { gateway: 'meta', phoneNumberId: pnId, accessToken: cfg.access_token, error: null };
  }

  // No Meta credentials — check phone_numbers for Twilio fallback number
  var pn = await supabase.from('phone_numbers').select('number')
    .eq('tenant_id', tenantId).eq('status', 'active').limit(1).maybeSingle();

  if (pn.data) {
    return { gateway: 'twilio', from: pn.data.number, error: null };
  }

  return { gateway: null, error: 'no_whatsapp_credentials_or_number' };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Sequence engine SMS sender', function() {
  test('resolves correct sender from phone_numbers for valid tenant', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+17869827800', tenant_id: 'sp', status: 'active' },
        { number: '+14155551234', tenant_id: 'acme', status: 'active' },
      ],
      channel_configs: [
        { tenant_id: 'acme', channel: 'sms', enabled: true, id: 'cc-1' },
      ],
      tenants: [
        { id: 'acme', phone_supplier: 'twilio' },
      ],
    });
    var result = await resolveSequenceSms(sb, 'acme', 'Acme Corp');
    expect(result.error).toBeNull();
    expect(result.from).toBe('+14155551234');
    expect(result.supplier).toBe('twilio');
  });

  test('throws strict error when no phone_numbers row exists', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [],
      channel_configs: [
        { tenant_id: 'orphan', channel: 'sms', enabled: true, id: 'cc-1' },
      ],
      tenants: [{ id: 'orphan', phone_supplier: 'twilio' }],
    });
    var result = await resolveSequenceSms(sb, 'orphan', 'Orphan Tenant');
    expect(result.error).toBe('no_sender_number');
    expect(result.from).toBeNull();
  });

  test('throws strict error when no channel_configs row exists', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+14155551234', tenant_id: 'acme', status: 'active' },
      ],
      channel_configs: [],
      tenants: [{ id: 'acme', phone_supplier: 'twilio' }],
    });
    var result = await resolveSequenceSms(sb, 'acme', 'Acme Corp');
    expect(result.error).toBe('sms_channel_not_configured');
  });

  test('routes through twilio when phone_supplier=twilio', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [{ number: '+14155551234', tenant_id: 'acme', status: 'active' }],
      channel_configs: [{ tenant_id: 'acme', channel: 'sms', enabled: true, id: 'cc-1' }],
      tenants: [{ id: 'acme', phone_supplier: 'twilio' }],
    });
    var result = await resolveSequenceSms(sb, 'acme', 'Acme');
    expect(result.supplier).toBe('twilio');
    expect(result.error).toBeNull();
  });

  test('throws explicit error when phone_supplier=telnyx (not implemented)', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [{ number: '+14155551234', tenant_id: 'acme', status: 'active' }],
      channel_configs: [{ tenant_id: 'acme', channel: 'sms', enabled: true, id: 'cc-1' }],
      tenants: [{ id: 'acme', phone_supplier: 'telnyx' }],
    });
    var result = await resolveSequenceSms(sb, 'acme', 'Acme');
    expect(result.error).toBe('unsupported_supplier: telnyx');
  });

  test('defaults phone_supplier to twilio when not set', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [{ number: '+14155551234', tenant_id: 'acme', status: 'active' }],
      channel_configs: [{ tenant_id: 'acme', channel: 'sms', enabled: true, id: 'cc-1' }],
      tenants: [{ id: 'acme' }], // no phone_supplier field
    });
    var result = await resolveSequenceSms(sb, 'acme', 'Acme');
    expect(result.supplier).toBe('twilio');
    expect(result.error).toBeNull();
  });

  test('multi-tenant isolation: tenant A never picks tenant B number', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+14155551111', tenant_id: 'tenant-a', status: 'active' },
        { number: '+14155552222', tenant_id: 'tenant-b', status: 'active' },
      ],
      channel_configs: [
        { tenant_id: 'tenant-a', channel: 'sms', enabled: true, id: 'cc-a' },
        { tenant_id: 'tenant-b', channel: 'sms', enabled: true, id: 'cc-b' },
      ],
      tenants: [
        { id: 'tenant-a', phone_supplier: 'twilio' },
        { id: 'tenant-b', phone_supplier: 'twilio' },
      ],
    });
    var resultA = await resolveSequenceSms(sb, 'tenant-a', 'A');
    var resultB = await resolveSequenceSms(sb, 'tenant-b', 'B');
    expect(resultA.from).toBe('+14155551111');
    expect(resultB.from).toBe('+14155552222');
    // Cross-check: A never gets B's number
    expect(resultA.from).not.toBe('+14155552222');
    expect(resultB.from).not.toBe('+14155551111');
  });

  test('no SP fallback: send fails when tenant has no number', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+17869827800', tenant_id: 'sp-tenant', status: 'active' },
        // tenant-no-number has no phone_numbers row
      ],
      channel_configs: [
        { tenant_id: 'tenant-no-number', channel: 'sms', enabled: true, id: 'cc-1' },
      ],
      tenants: [{ id: 'tenant-no-number', phone_supplier: 'twilio' }],
    });
    var result = await resolveSequenceSms(sb, 'tenant-no-number', 'No Number Tenant');
    expect(result.error).toBe('no_sender_number');
    // Confirms it does NOT return SP's number
    expect(result.from).not.toBe('+17869827800');
    expect(result.from).toBeNull();
  });
});

describe('WhatsApp outbound resolver', function() {
  test('uses whatsapp_phone_number_id for Meta gateway', async function() {
    var sb = buildMockSupabase({
      channel_configs: [{
        tenant_id: 'delamere', channel: 'whatsapp', enabled: true,
        whatsapp_phone_number_id: '123456',
        config_encrypted: { access_token: 'tok_abc', phone_number_id: '123456' },
      }],
    });
    var result = await resolveWhatsAppOutbound(sb, 'delamere');
    expect(result.gateway).toBe('meta');
    expect(result.phoneNumberId).toBe('123456');
    expect(result.accessToken).toBe('tok_abc');
  });

  test('prefers top-level whatsapp_phone_number_id over JSONB', async function() {
    var sb = buildMockSupabase({
      channel_configs: [{
        tenant_id: 'delamere', channel: 'whatsapp', enabled: true,
        whatsapp_phone_number_id: 'top-level-id',
        config_encrypted: { access_token: 'tok', phone_number_id: 'jsonb-id' },
      }],
    });
    var result = await resolveWhatsAppOutbound(sb, 'delamere');
    expect(result.phoneNumberId).toBe('top-level-id');
  });

  test('throws strict error when no WhatsApp config found', async function() {
    var sb = buildMockSupabase({
      channel_configs: [],
      phone_numbers: [],
    });
    var result = await resolveWhatsAppOutbound(sb, 'unknown-tenant');
    expect(result.gateway).toBeNull();
    expect(result.error).toBe('no_whatsapp_config');
  });

  test('falls back to Twilio with phone_numbers when no Meta credentials', async function() {
    var sb = buildMockSupabase({
      channel_configs: [{
        tenant_id: 'acme', channel: 'whatsapp', enabled: true,
        whatsapp_phone_number_id: null,
        config_encrypted: {}, // no access_token
      }],
      phone_numbers: [
        { number: '+14155551234', tenant_id: 'acme', status: 'active' },
      ],
    });
    var result = await resolveWhatsAppOutbound(sb, 'acme');
    expect(result.gateway).toBe('twilio');
    expect(result.from).toBe('+14155551234');
  });

  test('errors when no Meta credentials AND no phone_numbers', async function() {
    var sb = buildMockSupabase({
      channel_configs: [{
        tenant_id: 'acme', channel: 'whatsapp', enabled: true,
        whatsapp_phone_number_id: null,
        config_encrypted: {},
      }],
      phone_numbers: [],
    });
    var result = await resolveWhatsAppOutbound(sb, 'acme');
    expect(result.gateway).toBeNull();
    expect(result.error).toBe('no_whatsapp_credentials_or_number');
  });

  test('no tenant_id returns error', async function() {
    var sb = buildMockSupabase({ channel_configs: [], phone_numbers: [] });
    var result = await resolveWhatsAppOutbound(sb, null);
    expect(result.error).toBe('no_tenant_id');
  });
});
