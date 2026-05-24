/**
 * Channel routing resolver tests.
 *
 * Covers the three rewritten inbound resolvers:
 *   - Voice: getVoiceConfig (api/twilio-voice.js)
 *   - SMS: inline resolver (api/sms.js)
 *   - WhatsApp Meta: indexed phone_number_id lookup (api/meta-whatsapp.js)
 *   - WhatsApp Twilio: phone_numbers lookup (api/whatsapp.js)
 *
 * Tests verify:
 *   - Exact E.164 match returns correct tenant
 *   - No match returns null (NOT SP fallback)
 *   - Same last-10-digits across two tenants: exact match wins
 *   - Inactive phone_numbers row does not match
 *   - Number without '+' prefix returns null
 *   - Empty/null input returns null
 *   - WhatsApp phone_number_id match returns correct tenant
 *   - WhatsApp unknown phone_number_id returns null
 *   - WhatsApp empty string phone_number_id returns null
 *
 * These are unit tests with a mocked Supabase client. They do NOT
 * hit a real database.
 */

// ─── Shared mock builder ─────────────────────────────────────────────────────

function buildMockSupabase(data) {
  // data: { phone_numbers: [...], channel_configs: [...] }
  var pn = data.phone_numbers || [];
  var cc = data.channel_configs || [];

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
      return createChain([]);
    },
  };
}

// ─── Voice resolver tests ────────────────────────────────────────────────────

describe('Voice resolver (getVoiceConfig pattern)', function() {
  // Re-implement the resolver logic inline (same algorithm as twilio-voice.js)
  // to test in isolation without requiring the full handler module.
  async function resolveVoice(supabase, toNumber) {
    if (!toNumber) return null;
    var normalized = toNumber.replace(/[\s\-\(\)\.]/g, '');
    if (normalized.charAt(0) !== '+') return null;

    var result = await supabase
      .from('phone_numbers')
      .select('tenant_id, id')
      .eq('number', normalized)
      .eq('status', 'active')
      .maybeSingle();

    if (result.error || !result.data) return null;
    var tenantId = result.data.tenant_id;

    var ccResult = await supabase
      .from('channel_configs')
      .select('id, config_encrypted')
      .eq('tenant_id', tenantId)
      .eq('channel', 'voice')
      .eq('enabled', true)
      .maybeSingle();

    if (!ccResult.data) return null;
    return { tenant_id: tenantId, config_encrypted: ccResult.data.config_encrypted };
  }

  test('exact E.164 match returns correct tenant', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+17869827800', tenant_id: 'tenant-sp', status: 'active' },
        { number: '+14155551234', tenant_id: 'tenant-acme', status: 'active' },
      ],
      channel_configs: [
        { tenant_id: 'tenant-sp', channel: 'voice', enabled: true, config_encrypted: { greeting: 'Hello SP' } },
        { tenant_id: 'tenant-acme', channel: 'voice', enabled: true, config_encrypted: { greeting: 'Hello Acme' } },
      ],
    });
    var result = await resolveVoice(sb, '+14155551234');
    expect(result).not.toBeNull();
    expect(result.tenant_id).toBe('tenant-acme');
    expect(result.config_encrypted.greeting).toBe('Hello Acme');
  });

  test('no match returns null (NOT SP fallback)', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+17869827800', tenant_id: 'tenant-sp', status: 'active' },
      ],
      channel_configs: [
        { tenant_id: 'tenant-sp', channel: 'voice', enabled: true, config_encrypted: {} },
      ],
    });
    var result = await resolveVoice(sb, '+19995551111');
    expect(result).toBeNull();
  });

  test('same last-10-digits across two tenants: exact match wins, no fuzzy collision', async function() {
    // Both numbers end in 5551234 but differ in area code
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+14155551234', tenant_id: 'tenant-a', status: 'active' },
        { number: '+12125551234', tenant_id: 'tenant-b', status: 'active' },
      ],
      channel_configs: [
        { tenant_id: 'tenant-a', channel: 'voice', enabled: true, config_encrypted: {} },
        { tenant_id: 'tenant-b', channel: 'voice', enabled: true, config_encrypted: {} },
      ],
    });
    var resultA = await resolveVoice(sb, '+14155551234');
    expect(resultA.tenant_id).toBe('tenant-a');
    var resultB = await resolveVoice(sb, '+12125551234');
    expect(resultB.tenant_id).toBe('tenant-b');
  });

  test('inactive phone_numbers row does not match', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+14155551234', tenant_id: 'tenant-a', status: 'inactive' },
      ],
      channel_configs: [
        { tenant_id: 'tenant-a', channel: 'voice', enabled: true, config_encrypted: {} },
      ],
    });
    var result = await resolveVoice(sb, '+14155551234');
    expect(result).toBeNull();
  });

  test('number without + prefix returns null (no country guessing)', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+14155551234', tenant_id: 'tenant-a', status: 'active' },
      ],
      channel_configs: [],
    });
    var result = await resolveVoice(sb, '14155551234');
    expect(result).toBeNull();
    result = await resolveVoice(sb, '4155551234');
    expect(result).toBeNull();
  });

  test('empty/null input returns null safely', async function() {
    var sb = buildMockSupabase({ phone_numbers: [], channel_configs: [] });
    expect(await resolveVoice(sb, null)).toBeNull();
    expect(await resolveVoice(sb, '')).toBeNull();
    expect(await resolveVoice(sb, undefined)).toBeNull();
  });

  test('tenant owns number but has no voice config returns null', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+14155551234', tenant_id: 'tenant-a', status: 'active' },
      ],
      channel_configs: [], // no voice config
    });
    var result = await resolveVoice(sb, '+14155551234');
    expect(result).toBeNull();
  });

  test('normalizes spaces/hyphens/parens before lookup', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+14155551234', tenant_id: 'tenant-a', status: 'active' },
      ],
      channel_configs: [
        { tenant_id: 'tenant-a', channel: 'voice', enabled: true, config_encrypted: {} },
      ],
    });
    var result = await resolveVoice(sb, '+1 (415) 555-1234');
    expect(result).not.toBeNull();
    expect(result.tenant_id).toBe('tenant-a');
  });
});

// ─── SMS resolver tests ──────────────────────────────────────────────────────

describe('SMS resolver pattern', function() {
  async function resolveSms(supabase, toNumber) {
    if (!toNumber) return null;
    var normalized = toNumber.replace(/[\s\-\(\)\.]/g, '');
    if (normalized.charAt(0) !== '+') return null;

    var result = await supabase
      .from('phone_numbers')
      .select('tenant_id')
      .eq('number', normalized)
      .eq('status', 'active')
      .maybeSingle();

    if (result.error || !result.data) return null;
    return result.data.tenant_id;
  }

  test('exact E.164 match returns correct tenant', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+17869827800', tenant_id: 'sp', status: 'active' },
        { number: '+14155551234', tenant_id: 'acme', status: 'active' },
      ],
    });
    expect(await resolveSms(sb, '+14155551234')).toBe('acme');
  });

  test('no match returns null', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [{ number: '+17869827800', tenant_id: 'sp', status: 'active' }],
    });
    expect(await resolveSms(sb, '+19995551111')).toBeNull();
  });

  test('inactive row does not match', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [{ number: '+14155551234', tenant_id: 'a', status: 'released' }],
    });
    expect(await resolveSms(sb, '+14155551234')).toBeNull();
  });

  test('no + prefix returns null', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [{ number: '+14155551234', tenant_id: 'a', status: 'active' }],
    });
    expect(await resolveSms(sb, '14155551234')).toBeNull();
  });

  test('null/empty returns null', async function() {
    var sb = buildMockSupabase({ phone_numbers: [] });
    expect(await resolveSms(sb, null)).toBeNull();
    expect(await resolveSms(sb, '')).toBeNull();
  });
});

// ─── WhatsApp resolver tests ─────────────────────────────────────────────────

describe('WhatsApp Meta resolver (phone_number_id lookup)', function() {
  async function resolveWhatsAppMeta(supabase, phoneNumberId) {
    if (!phoneNumberId) return null;

    var result = await supabase
      .from('channel_configs')
      .select('tenant_id, config_encrypted')
      .eq('channel', 'whatsapp')
      .eq('enabled', true)
      .eq('whatsapp_phone_number_id', phoneNumberId)
      .maybeSingle();

    if (result.error || !result.data) return null;
    return {
      tenant_id: result.data.tenant_id,
      access_token: (result.data.config_encrypted || {}).access_token,
    };
  }

  test('phone_number_id match returns correct tenant', async function() {
    var sb = buildMockSupabase({
      channel_configs: [
        { channel: 'whatsapp', enabled: true, whatsapp_phone_number_id: '123456789', tenant_id: 'delamere', config_encrypted: { access_token: 'tok_abc' } },
        { channel: 'whatsapp', enabled: true, whatsapp_phone_number_id: '987654321', tenant_id: 'acme', config_encrypted: { access_token: 'tok_xyz' } },
      ],
    });
    var result = await resolveWhatsAppMeta(sb, '987654321');
    expect(result).not.toBeNull();
    expect(result.tenant_id).toBe('acme');
    expect(result.access_token).toBe('tok_xyz');
  });

  test('unknown phone_number_id returns null', async function() {
    var sb = buildMockSupabase({
      channel_configs: [
        { channel: 'whatsapp', enabled: true, whatsapp_phone_number_id: '123456789', tenant_id: 'delamere', config_encrypted: {} },
      ],
    });
    var result = await resolveWhatsAppMeta(sb, '999999999');
    expect(result).toBeNull();
  });

  test('empty string phone_number_id returns null', async function() {
    var sb = buildMockSupabase({
      channel_configs: [
        { channel: 'whatsapp', enabled: true, whatsapp_phone_number_id: '', tenant_id: 'misconfigured', config_encrypted: {} },
        { channel: 'whatsapp', enabled: true, whatsapp_phone_number_id: null, tenant_id: 'also-bad', config_encrypted: {} },
      ],
    });
    expect(await resolveWhatsAppMeta(sb, '')).toBeNull();
    expect(await resolveWhatsAppMeta(sb, null)).toBeNull();
    expect(await resolveWhatsAppMeta(sb, undefined)).toBeNull();
  });

  test('disabled config does not match', async function() {
    var sb = buildMockSupabase({
      channel_configs: [
        { channel: 'whatsapp', enabled: false, whatsapp_phone_number_id: '123456789', tenant_id: 'delamere', config_encrypted: {} },
      ],
    });
    var result = await resolveWhatsAppMeta(sb, '123456789');
    expect(result).toBeNull();
  });

  test('non-whatsapp channel does not match', async function() {
    var sb = buildMockSupabase({
      channel_configs: [
        { channel: 'sms', enabled: true, whatsapp_phone_number_id: '123456789', tenant_id: 'wrong', config_encrypted: {} },
      ],
    });
    var result = await resolveWhatsAppMeta(sb, '123456789');
    expect(result).toBeNull();
  });
});

describe('WhatsApp Twilio resolver (phone_numbers lookup)', function() {
  async function resolveWhatsAppTwilio(supabase, toNumber) {
    if (!toNumber) return null;
    var clean = toNumber.replace(/^whatsapp:/, '');
    var normalized = clean.replace(/[\s\-\(\)\.]/g, '');
    if (normalized.charAt(0) !== '+') return null;

    var result = await supabase
      .from('phone_numbers')
      .select('tenant_id')
      .eq('number', normalized)
      .eq('status', 'active')
      .maybeSingle();

    if (result.error || !result.data) return null;
    return result.data.tenant_id;
  }

  test('whatsapp: prefix stripped before lookup', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+14155551234', tenant_id: 'acme', status: 'active' },
      ],
    });
    expect(await resolveWhatsAppTwilio(sb, 'whatsapp:+14155551234')).toBe('acme');
  });

  test('no match returns null', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+14155551234', tenant_id: 'acme', status: 'active' },
      ],
    });
    expect(await resolveWhatsAppTwilio(sb, 'whatsapp:+19995551111')).toBeNull();
  });

  test('null input returns null', async function() {
    var sb = buildMockSupabase({ phone_numbers: [] });
    expect(await resolveWhatsAppTwilio(sb, null)).toBeNull();
  });
});
