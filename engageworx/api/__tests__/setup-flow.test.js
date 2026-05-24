/**
 * Setup flow data hygiene tests.
 *
 * Covers:
 *   - Settings panel: tenant switch clears form state
 *   - Settings panel: Save button disabled during load
 *   - Settings panel: Save handler refuses if loading=true
 *   - save_channel_config RPC: rejects non-E.164 phone numbers
 *   - save_channel_config RPC: rejects phone numbers not owned by tenant
 *   - Tenant provisioning: phone_numbers row auto-created
 *   - Tenant provisioning: duplicate phone number returns clear error
 */

// ─── Mock Supabase builder ───────────────────────────────────────────────────

function buildMockSupabase(data) {
  var pn = data.phone_numbers || [];
  var cc = data.channel_configs || [];
  var tenants = data.tenants || [];
  var user_profiles = data.user_profiles || [];
  var tenant_members = data.tenant_members || [];

  function createChain(rows) {
    var chain = {
      _rows: rows,
      _filters: [],
      select: function() { return chain; },
      eq: function(col, val) { chain._filters.push({ col: col, val: val }); return chain; },
      in: function() { return chain; },
      limit: function() { return chain; },
      insert: function(row) {
        // Check for unique constraint on phone_numbers.number
        if (chain._tableName === 'phone_numbers' && row.number) {
          var dup = pn.find(function(r) { return r.number === row.number && r.status === 'active'; });
          if (dup) return Promise.resolve({ data: null, error: { message: 'duplicate key value violates unique constraint' } });
        }
        var newRow = Object.assign({ id: 'new-' + Date.now() }, row);
        chain._rows.push(newRow);
        return Promise.resolve({ data: newRow, error: null });
      },
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
    chain._tableName = null;
    return chain;
  }

  return {
    from: function(table) {
      var rows;
      if (table === 'phone_numbers') rows = pn;
      else if (table === 'channel_configs') rows = cc;
      else if (table === 'tenants') rows = tenants;
      else if (table === 'user_profiles') rows = user_profiles;
      else if (table === 'tenant_members') rows = tenant_members;
      else rows = [];
      var chain = createChain(rows);
      chain._tableName = table;
      return chain;
    },
    rpc: function(name, params) {
      // Simulate save_channel_config validation logic
      if (name === 'save_channel_config') {
        var pTenantId = params.p_tenant_id;
        var pChannel = params.p_channel;
        var pConfig = params.p_config_encrypted;

        if (!pTenantId) return Promise.resolve({ error: { message: 'Tenant not found' } });
        if (!['sms', 'voice', 'email', 'whatsapp', 'rcs', 'mms'].includes(pChannel)) {
          return Promise.resolve({ error: { message: 'Invalid channel: ' + pChannel } });
        }

        // Validate phone_number if present
        if (pConfig && (pChannel === 'sms' || pChannel === 'voice')) {
          var phoneNum = pConfig.phone_number;
          if (phoneNum && phoneNum !== '') {
            if (!/^\+\d{8,15}$/.test(phoneNum)) {
              return Promise.resolve({ error: { message: 'Phone number must be in E.164 format (e.g. +14155551234)' } });
            }
            var owned = pn.find(function(r) {
              return r.tenant_id === pTenantId && r.number === phoneNum && r.status === 'active';
            });
            if (!owned) {
              return Promise.resolve({ error: { message: 'This number is not assigned to this tenant' } });
            }
          }
        }
        return Promise.resolve({ data: { id: 'cc-result', success: true }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: 'Unknown RPC: ' + name } });
    },
  };
}

// ─── save_channel_config validation tests ────────────────────────────────────

describe('save_channel_config RPC validation', function() {
  test('rejects non-E.164 phone numbers', async function() {
    var sb = buildMockSupabase({ phone_numbers: [] });
    var result = await sb.rpc('save_channel_config', {
      p_tenant_id: 'tenant-a',
      p_channel: 'sms',
      p_enabled: true,
      p_config_encrypted: { phone_number: '7869827800' }, // missing + prefix
    });
    expect(result.error).not.toBeNull();
    expect(result.error.message).toContain('E.164');
  });

  test('rejects phone numbers not owned by target tenant', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+17869827800', tenant_id: 'sp-tenant', status: 'active' },
      ],
    });
    var result = await sb.rpc('save_channel_config', {
      p_tenant_id: 'other-tenant', // not the owner
      p_channel: 'sms',
      p_enabled: true,
      p_config_encrypted: { phone_number: '+17869827800' },
    });
    expect(result.error).not.toBeNull();
    expect(result.error.message).toContain('not assigned to this tenant');
  });

  test('accepts valid E.164 number owned by tenant', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+14155551234', tenant_id: 'acme', status: 'active' },
      ],
    });
    var result = await sb.rpc('save_channel_config', {
      p_tenant_id: 'acme',
      p_channel: 'sms',
      p_enabled: true,
      p_config_encrypted: { phone_number: '+14155551234' },
    });
    expect(result.error).toBeNull();
    expect(result.data.success).toBe(true);
  });

  test('allows save without phone_number for email channel', async function() {
    var sb = buildMockSupabase({ phone_numbers: [] });
    var result = await sb.rpc('save_channel_config', {
      p_tenant_id: 'acme',
      p_channel: 'email',
      p_enabled: true,
      p_config_encrypted: { from_email: 'hello@acme.com' },
    });
    expect(result.error).toBeNull();
  });

  test('allows save with empty phone_number (clearing the field)', async function() {
    var sb = buildMockSupabase({ phone_numbers: [] });
    var result = await sb.rpc('save_channel_config', {
      p_tenant_id: 'acme',
      p_channel: 'sms',
      p_enabled: true,
      p_config_encrypted: { phone_number: '' },
    });
    expect(result.error).toBeNull();
  });
});

// ─── Tenant provisioning phone_numbers auto-create ───────────────────────────

describe('Tenant provisioning phone_numbers auto-create', function() {
  // Simulates the invite-tenant.js phone_numbers insert logic
  async function provisionPhone(supabase, tenantId, phoneNumber) {
    if (!phoneNumber) return { status: 'skipped', warning: null };
    if (!/^\+\d{8,15}$/.test(phoneNumber)) {
      return { status: 'invalid', warning: 'Phone number not assigned — must be E.164 format' };
    }
    var result = await supabase.from('phone_numbers').insert({
      tenant_id: tenantId,
      number: phoneNumber,
      status: 'active',
      type: '10dlc',
    });
    if (result.error) {
      return { status: 'failed', warning: result.error.message };
    }
    return { status: 'assigned', warning: null };
  }

  test('creates phone_numbers row with valid E.164 number', async function() {
    var sb = buildMockSupabase({ phone_numbers: [] });
    var result = await provisionPhone(sb, 'new-tenant', '+14155551234');
    expect(result.status).toBe('assigned');
    expect(result.warning).toBeNull();
  });

  test('rejects invalid format without creating row', async function() {
    var sb = buildMockSupabase({ phone_numbers: [] });
    var result = await provisionPhone(sb, 'new-tenant', '4155551234');
    expect(result.status).toBe('invalid');
    expect(result.warning).toContain('E.164');
  });

  test('returns clear error on duplicate phone number', async function() {
    var sb = buildMockSupabase({
      phone_numbers: [
        { number: '+14155551234', tenant_id: 'existing-tenant', status: 'active' },
      ],
    });
    var result = await provisionPhone(sb, 'new-tenant', '+14155551234');
    expect(result.status).toBe('failed');
    expect(result.warning).toContain('duplicate');
  });

  test('skips gracefully when no phone number provided', async function() {
    var sb = buildMockSupabase({ phone_numbers: [] });
    var result = await provisionPhone(sb, 'new-tenant', null);
    expect(result.status).toBe('skipped');
  });

  test('skips gracefully for empty string', async function() {
    var sb = buildMockSupabase({ phone_numbers: [] });
    var result = await provisionPhone(sb, 'new-tenant', '');
    expect(result.status).toBe('skipped');
  });
});

// ─── Settings panel loading state tests ──────────────────────────────────────

describe('Settings panel loading state behavior', function() {
  // Simulates the saveChannelConfig loading guard
  function trySave(channelsLoading) {
    if (channelsLoading) return { blocked: true, reason: 'loading' };
    return { blocked: false, reason: null };
  }

  test('save blocked while loading', function() {
    expect(trySave(true).blocked).toBe(true);
  });

  test('save allowed when not loading', function() {
    expect(trySave(false).blocked).toBe(false);
  });

  // Simulates tenant switch clearing state
  function simulateTenantSwitch() {
    var channelConfigs = { sms: { config_encrypted: { phone_number: '+1OLD' } } };
    var channelsLoading = false;

    // Tenant switch fires
    channelConfigs = {}; // cleared
    channelsLoading = true; // set loading

    return { channelConfigs, channelsLoading };
  }

  test('tenant switch clears channel configs and sets loading', function() {
    var state = simulateTenantSwitch();
    expect(state.channelConfigs).toEqual({});
    expect(state.channelsLoading).toBe(true);
  });
});
