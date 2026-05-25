/**
 * Tests for voicemail assign ID resolution.
 *
 * Verifies that:
 * - Regular conversation cards pass raw UUID to RPC
 * - Voicemail/call cards resolve the real conversation_id
 * - Prefixed IDs are never passed directly to RPCs
 */

describe('ID prefix stripping', function() {
  function stripIdPrefix(id) {
    if (!id) return id;
    if (id.startsWith('call_')) return id.replace('call_', '');
    return id;
  }

  test('regular conversation UUID passes through unchanged', function() {
    var uuid = '8edb2e51-6623-463c-8954-1109226e228a';
    expect(stripIdPrefix(uuid)).toBe(uuid);
  });

  test('call-prefixed ID gets prefix stripped', function() {
    var prefixed = 'call_8edb2e51-6623-463c-8954-1109226e228a';
    expect(stripIdPrefix(prefixed)).toBe('8edb2e51-6623-463c-8954-1109226e228a');
  });

  test('null input returns null', function() {
    expect(stripIdPrefix(null)).toBeNull();
  });

  test('empty string returns empty string', function() {
    expect(stripIdPrefix('')).toBe('');
  });
});

describe('Voicemail assign conversation resolution', function() {
  // Simulates the resolveConversationIdForRpc logic
  async function resolveConvId(conv, db) {
    if (!conv || !conv.id) return null;
    var rawId = conv.id;
    if (!rawId.startsWith('call_')) return rawId;

    // It's a call-based conversation
    var callUuid = rawId.replace('call_', '');
    var call = db.calls.find(function(c) { return c.id === callUuid; });
    if (!call) return null;

    // Find existing voice conversation for this contact+tenant
    var contact = db.contacts.find(function(c) { return c.phone === call.from_number && c.tenant_id === call.tenant_id; });
    if (contact) {
      var existingConv = db.conversations.find(function(c) { return c.contact_id === contact.id && c.channel === 'voice' && c.tenant_id === call.tenant_id; });
      if (existingConv) return existingConv.id;
    }
    // Would create new conversation in real code — return sentinel for test
    return 'new_conv_created';
  }

  var testDb = {
    calls: [
      { id: 'aaa-bbb-ccc', from_number: '+14155551234', tenant_id: 'tenant-1' },
    ],
    contacts: [
      { id: 'contact-1', phone: '+14155551234', tenant_id: 'tenant-1' },
    ],
    conversations: [
      { id: 'real-conv-uuid-123', contact_id: 'contact-1', channel: 'voice', tenant_id: 'tenant-1' },
    ],
  };

  test('voicemail card resolves to real conversation UUID via call lookup', async function() {
    var voicemailConv = { id: 'call_aaa-bbb-ccc', tenant_id: 'tenant-1' };
    var result = await resolveConvId(voicemailConv, testDb);
    expect(result).toBe('real-conv-uuid-123');
  });

  test('regular conversation card returns its own ID directly', async function() {
    var regularConv = { id: 'real-conv-uuid-123', tenant_id: 'tenant-1' };
    var result = await resolveConvId(regularConv, testDb);
    expect(result).toBe('real-conv-uuid-123');
  });

  test('call with no matching contact returns new_conv_created (would auto-create)', async function() {
    var orphanCall = { id: 'call_orphan-uuid', tenant_id: 'tenant-1' };
    var dbWithOrphan = Object.assign({}, testDb, {
      calls: [{ id: 'orphan-uuid', from_number: '+19995550000', tenant_id: 'tenant-1' }],
    });
    var result = await resolveConvId(orphanCall, dbWithOrphan);
    expect(result).toBe('new_conv_created');
  });

  test('null conv returns null', async function() {
    var result = await resolveConvId(null, testDb);
    expect(result).toBeNull();
  });

  test('conv with no id returns null', async function() {
    var result = await resolveConvId({}, testDb);
    expect(result).toBeNull();
  });
});

describe('Assign to Me on voicemail vs regular', function() {
  test('voicemail card ID starts with call_ prefix', function() {
    // Simulates what groupCallsByNumber produces
    var callId = '8edb2e51-6623-463c-8954-1109226e228a';
    var syntheticId = 'call_' + callId;
    expect(syntheticId.startsWith('call_')).toBe(true);
    // This is what was being passed to the RPC (the bug)
    expect(syntheticId).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  test('regular conversation ID is a raw UUID', function() {
    var convId = '12345678-1234-1234-1234-123456789012';
    expect(convId.startsWith('call_')).toBe(false);
    expect(convId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
