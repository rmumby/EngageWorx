/**
 * assign_conversation RPC tests.
 *
 * Covers permission cascade, assignee validation, and error handling.
 */

// ─── Mock RPC logic (mirrors the SQL function) ──────────────────────────────

function mockAssignConversation(db, callerId, params) {
  var convId = params.p_conversation_id;
  var assigneeId = params.p_assignee_id;

  if (!callerId) return { error: { message: 'Not authenticated' } };

  // Find conversation
  var conv = db.conversations.find(function(c) { return c.id === convId; });
  if (!conv) return { error: { message: 'Conversation not found' } };

  // Check caller role
  var callerProfile = db.user_profiles.find(function(u) { return u.id === callerId; });
  var callerRole = callerProfile ? callerProfile.role : null;
  var isSPAdmin = ['superadmin', 'super_admin', 'sp_admin'].indexOf(callerRole) > -1;

  var allowed = isSPAdmin;

  if (!allowed) {
    var callerMemberships = db.tenant_members.filter(function(m) {
      return m.user_id === callerId && m.status === 'active' && ['admin', 'superadmin', 'agent'].indexOf(m.role) > -1;
    });
    var callerTenants = callerMemberships.map(function(m) { return m.tenant_id; });
    if (callerTenants.indexOf(conv.tenant_id) > -1) allowed = true;
  }

  if (!allowed) return { error: { message: 'Insufficient permissions to assign this conversation' } };

  // Validate assignee
  if (assigneeId !== null) {
    var AI_BOT_SENTINEL = '00000000-0000-0000-0000-000000000000';
    if (assigneeId === AI_BOT_SENTINEL) {
      // AI assignment always valid
    } else {
      var assigneeIsMember = db.tenant_members.some(function(m) {
        return m.user_id === assigneeId && m.tenant_id === conv.tenant_id && m.status === 'active';
      });
      var assigneeIsSP = db.user_profiles.some(function(u) {
        return u.id === assigneeId && ['superadmin', 'super_admin', 'sp_admin'].indexOf(u.role) > -1;
      });
      if (!assigneeIsMember && !assigneeIsSP) {
        return { error: { message: 'Assignee is not a member of this tenant' } };
      }
    }
  }

  // Perform assignment
  conv.assigned_user_id = assigneeId;
  return { data: { conversation_id: convId, assigned_to: assigneeId, success: true }, error: null };
}

// ─── Test data ───────────────────────────────────────────────────────────────

var testDb = {
  conversations: [
    { id: 'conv-1', tenant_id: 'tenant-a', assigned_user_id: null },
    { id: 'conv-2', tenant_id: 'tenant-b', assigned_user_id: null },
  ],
  user_profiles: [
    { id: 'sp-admin', role: 'superadmin' },
    { id: 'tenant-a-admin', role: 'admin' },
    { id: 'tenant-b-agent', role: 'agent' },
    { id: 'outsider', role: 'viewer' },
  ],
  tenant_members: [
    { user_id: 'tenant-a-admin', tenant_id: 'tenant-a', status: 'active', role: 'admin' },
    { user_id: 'tenant-b-agent', tenant_id: 'tenant-b', status: 'active', role: 'agent' },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('assign_conversation RPC', function() {
  beforeEach(function() {
    // Reset assignments
    testDb.conversations.forEach(function(c) { c.assigned_user_id = null; });
  });

  test('SP admin can assign cross-tenant', function() {
    var result = mockAssignConversation(testDb, 'sp-admin', {
      p_conversation_id: 'conv-b', // wrong id for test - use conv-2 (tenant-b)
      p_assignee_id: 'tenant-b-agent',
    });
    // conv-b doesn't exist, use conv-2
    result = mockAssignConversation(testDb, 'sp-admin', {
      p_conversation_id: 'conv-2',
      p_assignee_id: 'tenant-b-agent',
    });
    expect(result.error).toBeNull();
    expect(result.data.success).toBe(true);
  });

  test('tenant admin can assign within own tenant', function() {
    var result = mockAssignConversation(testDb, 'tenant-a-admin', {
      p_conversation_id: 'conv-1',
      p_assignee_id: 'tenant-a-admin',
    });
    expect(result.error).toBeNull();
    expect(result.data.success).toBe(true);
  });

  test('tenant admin cannot assign cross-tenant', function() {
    var result = mockAssignConversation(testDb, 'tenant-a-admin', {
      p_conversation_id: 'conv-2', // belongs to tenant-b
      p_assignee_id: 'tenant-a-admin',
    });
    expect(result.error).not.toBeNull();
    expect(result.error.message).toContain('permissions');
  });

  test('assignee must be member of target tenant', function() {
    var result = mockAssignConversation(testDb, 'sp-admin', {
      p_conversation_id: 'conv-1', // tenant-a
      p_assignee_id: 'tenant-b-agent', // member of tenant-b, not tenant-a
    });
    expect(result.error).not.toBeNull();
    expect(result.error.message).toContain('not a member');
  });

  test('SP admin can be assigned to any tenant (sp role bypass)', function() {
    var result = mockAssignConversation(testDb, 'sp-admin', {
      p_conversation_id: 'conv-1',
      p_assignee_id: 'sp-admin', // SP admin can self-assign anywhere
    });
    expect(result.error).toBeNull();
    expect(result.data.success).toBe(true);
  });

  test('AI Bot sentinel is always valid', function() {
    var result = mockAssignConversation(testDb, 'tenant-a-admin', {
      p_conversation_id: 'conv-1',
      p_assignee_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(result.error).toBeNull();
    expect(result.data.assigned_to).toBe('00000000-0000-0000-0000-000000000000');
  });

  test('null assignee unassigns the conversation', function() {
    // First assign
    mockAssignConversation(testDb, 'sp-admin', { p_conversation_id: 'conv-1', p_assignee_id: 'tenant-a-admin' });
    expect(testDb.conversations[0].assigned_user_id).toBe('tenant-a-admin');
    // Then unassign
    var result = mockAssignConversation(testDb, 'sp-admin', { p_conversation_id: 'conv-1', p_assignee_id: null });
    expect(result.error).toBeNull();
    expect(testDb.conversations[0].assigned_user_id).toBeNull();
  });

  test('conversation not found returns clean error', function() {
    var result = mockAssignConversation(testDb, 'sp-admin', {
      p_conversation_id: 'nonexistent',
      p_assignee_id: null,
    });
    expect(result.error).not.toBeNull();
    expect(result.error.message).toContain('not found');
  });

  test('unauthenticated caller is rejected', function() {
    var result = mockAssignConversation(testDb, null, {
      p_conversation_id: 'conv-1',
      p_assignee_id: null,
    });
    expect(result.error).not.toBeNull();
    expect(result.error.message).toContain('authenticated');
  });

  test('user with no active membership is rejected', function() {
    var result = mockAssignConversation(testDb, 'outsider', {
      p_conversation_id: 'conv-1',
      p_assignee_id: null,
    });
    expect(result.error).not.toBeNull();
    expect(result.error.message).toContain('permissions');
  });
});
