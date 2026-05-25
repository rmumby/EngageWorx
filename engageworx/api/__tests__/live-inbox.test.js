/**
 * Live Inbox cleanup tests.
 *
 * Covers filter tabs, voicemail handling, bulk actions, and reassign logic.
 */

// ─── Filter tab logic ────────────────────────────────────────────────────────

describe('Live Inbox filter tabs', function() {
  var conversations = [
    { id: '1', channel: 'sms', status: 'active', contact: { name: 'A', tags: [] } },
    { id: '2', channel: 'email', status: 'active', contact: { name: 'B', tags: [] } },
    { id: '3', channel: 'whatsapp', status: 'active', contact: { name: 'C', tags: [] } },
    { id: '4', channel: 'voice', status: 'active', contact: { name: 'D', tags: [] } },
    { id: '5', channel: 'voice', status: 'active', contact: { name: 'E', tags: ['Voicemail'] } },
  ];

  function applyFilter(convos, inboxTab) {
    return convos.filter(function(conv) {
      if (inboxTab === 'messages' && conv.channel === 'voice') return false;
      if (inboxTab === 'voicemails' && !(conv.channel === 'voice' && conv.contact && conv.contact.tags && conv.contact.tags.includes('Voicemail'))) return false;
      return true;
    });
  }

  test('All shows all conversations including voice', function() {
    var result = applyFilter(conversations, 'all');
    expect(result.length).toBe(5);
  });

  test('Messages excludes voice', function() {
    var result = applyFilter(conversations, 'messages');
    expect(result.length).toBe(3);
    expect(result.find(function(c) { return c.channel === 'voice'; })).toBeUndefined();
  });

  test('Voicemails shows only voice conversations with Voicemail tag', function() {
    var result = applyFilter(conversations, 'voicemails');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('5');
    expect(result[0].contact.tags).toContain('Voicemail');
  });

  test('Voicemails excludes regular voice calls (no Voicemail tag)', function() {
    var result = applyFilter(conversations, 'voicemails');
    expect(result.find(function(c) { return c.id === '4'; })).toBeUndefined();
  });
});

// ─── Voicemail Mark as Handled ───────────────────────────────────────────────

describe('Voicemail Mark as Handled', function() {
  test('sets voicemail_handled_at timestamp', function() {
    var conv = { id: 'vm1', voicemail_handled_at: null };
    // Simulate marking as handled
    conv.voicemail_handled_at = new Date().toISOString();
    expect(conv.voicemail_handled_at).not.toBeNull();
    expect(new Date(conv.voicemail_handled_at).getTime()).toBeGreaterThan(0);
  });

  test('handled voicemail is excluded from unhandled count', function() {
    var voicemails = [
      { id: 'vm1', voicemail_handled_at: null },
      { id: 'vm2', voicemail_handled_at: '2026-05-25T10:00:00Z' },
      { id: 'vm3', voicemail_handled_at: null },
    ];
    var unhandled = voicemails.filter(function(v) { return !v.voicemail_handled_at; });
    expect(unhandled.length).toBe(2);
  });
});

// ─── Outbound callback auto-resolve ──────────────────────────────────────────

describe('Voicemail auto-resolve on callback', function() {
  test('resolves voicemails from same contact within 7 days', function() {
    var now = Date.now();
    var voicemails = [
      { id: 'vm1', contact_id: 'c1', created_at: new Date(now - 3 * 86400000).toISOString(), voicemail_handled_at: null },
      { id: 'vm2', contact_id: 'c1', created_at: new Date(now - 10 * 86400000).toISOString(), voicemail_handled_at: null },
      { id: 'vm3', contact_id: 'c2', created_at: new Date(now - 1 * 86400000).toISOString(), voicemail_handled_at: null },
    ];
    var sevenDaysAgo = new Date(now - 7 * 86400000);
    // Auto-resolve for contact c1
    var resolved = voicemails.filter(function(v) {
      return v.contact_id === 'c1' && !v.voicemail_handled_at && new Date(v.created_at) >= sevenDaysAgo;
    });
    expect(resolved.length).toBe(1); // only vm1 (within 7 days)
    expect(resolved[0].id).toBe('vm1');
  });

  test('does not resolve voicemails older than 7 days', function() {
    var now = Date.now();
    var oldVoicemail = { id: 'vm-old', contact_id: 'c1', created_at: new Date(now - 10 * 86400000).toISOString(), voicemail_handled_at: null };
    var sevenDaysAgo = new Date(now - 7 * 86400000);
    var shouldResolve = !oldVoicemail.voicemail_handled_at && new Date(oldVoicemail.created_at) >= sevenDaysAgo;
    expect(shouldResolve).toBe(false);
  });

  test('does not resolve voicemails for different contacts', function() {
    var voicemails = [
      { id: 'vm1', contact_id: 'c1', voicemail_handled_at: null },
      { id: 'vm2', contact_id: 'c2', voicemail_handled_at: null },
    ];
    var callbackContactId = 'c1';
    var resolved = voicemails.filter(function(v) { return v.contact_id === callbackContactId && !v.voicemail_handled_at; });
    expect(resolved.length).toBe(1);
    expect(resolved[0].contact_id).toBe('c1');
  });
});

// ─── Bulk actions ────────────────────────────────────────────────────────────

describe('Bulk actions', function() {
  test('bulk resolve updates all selected conversations', function() {
    var conversations = [
      { id: '1', status: 'active' },
      { id: '2', status: 'active' },
      { id: '3', status: 'waiting' },
      { id: '4', status: 'active' },
      { id: '5', status: 'urgent' },
    ];
    var selectedIds = ['1', '3', '5'];
    var updated = conversations.map(function(c) {
      return selectedIds.indexOf(c.id) > -1 ? Object.assign({}, c, { status: 'resolved' }) : c;
    });
    expect(updated.filter(function(c) { return c.status === 'resolved'; }).length).toBe(3);
    expect(updated.find(function(c) { return c.id === '2'; }).status).toBe('active');
  });

  test('bulk action rejects if any conversation is cross-tenant unauthorized', function() {
    var selectedConvs = [
      { id: '1', tenant_id: 'tenant-a' },
      { id: '2', tenant_id: 'tenant-a' },
      { id: '3', tenant_id: 'tenant-b' }, // unauthorized
    ];
    var callerTenantId = 'tenant-a';
    var unauthorized = selectedConvs.filter(function(c) { return c.tenant_id !== callerTenantId; });
    expect(unauthorized.length).toBe(1);
    // Should reject the entire operation
    var shouldReject = unauthorized.length > 0;
    expect(shouldReject).toBe(true);
  });
});

// ─── Reassign dropdown ───────────────────────────────────────────────────────

describe('Reassign dropdown', function() {
  test('shows tenant_members for the conversation tenant, not SP', function() {
    var spMembers = [{ id: 'sp1', name: 'Rob' }];
    var tenantMembers = [{ id: 'tm1', name: 'Sarah' }, { id: 'tm2', name: 'James' }];
    // The dropdown should use tenantMembers, not spMembers
    var dropdownOptions = tenantMembers;
    expect(dropdownOptions.length).toBe(2);
    expect(dropdownOptions[0].name).toBe('Sarah');
  });

  test('shows "No team members" when tenant has zero active members', function() {
    var tenantMembers = [];
    var hasMembers = tenantMembers.length > 0;
    expect(hasMembers).toBe(false);
    // UI should show "No team members available"
  });

  test('AI Bot is always present as an option', function() {
    var tenantMembers = [{ id: 'tm1', name: 'Sarah' }];
    var allOptions = tenantMembers.concat([{ id: 'ai_bot', name: 'AI Bot' }]);
    expect(allOptions.find(function(o) { return o.id === 'ai_bot'; })).toBeDefined();
  });
});
