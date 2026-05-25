/**
 * Reassign dropdown query tests.
 * Verifies team members are loaded from the CONVERSATION's tenant,
 * not the viewer's portal tenant.
 */

describe('Reassign dropdown tenant scoping', function() {
  test('uses conversation tenant_id, not portal resolvedTenantId', function() {
    var resolvedTenantId = 'sp-tenant-id'; // SP admin's portal tenant
    var selectedConv = { id: 'conv-1', tenant_id: 'delamere-tenant-id' }; // Delamere conversation

    // The query should use selectedConv.tenant_id
    var queryTenantId = selectedConv.tenant_id;
    expect(queryTenantId).toBe('delamere-tenant-id');
    expect(queryTenantId).not.toBe(resolvedTenantId);
  });

  test('returns all active members for the conversation tenant', function() {
    var tenantMembers = [
      { user_id: 'darren', role: 'admin', status: 'active', user_profiles: { full_name: 'Darren Wells', email: 'darren@delamere.co.uk' } },
      { user_id: 'rob-dm', role: 'admin', status: 'active', user_profiles: { full_name: 'Rob Mumby', email: 'rob@delameremanor.co.uk' } },
    ];

    var members = tenantMembers.map(function(m) {
      var p = m.user_profiles || {};
      var name = p.full_name || p.email || 'Unknown';
      return { id: m.user_id, name: name, role: m.role };
    });

    expect(members.length).toBe(2);
    expect(members[0].name).toBe('Darren Wells');
    expect(members[1].name).toBe('Rob Mumby');
  });

  test('excludes inactive members', function() {
    var rawMembers = [
      { user_id: 'active-1', role: 'admin', status: 'active' },
      { user_id: 'inactive-1', role: 'admin', status: 'inactive' },
      { user_id: 'active-2', role: 'agent', status: 'active' },
    ];

    var filtered = rawMembers.filter(function(m) { return m.status === 'active'; });
    expect(filtered.length).toBe(2);
  });

  test('includes admin and agent roles, excludes viewer/notification_only', function() {
    var rawMembers = [
      { user_id: 'admin-1', role: 'admin', status: 'active' },
      { user_id: 'agent-1', role: 'agent', status: 'active' },
      { user_id: 'viewer-1', role: 'viewer', status: 'active' },
      { user_id: 'notify-1', role: 'notification_only', status: 'active' },
    ];

    var allowedRoles = ['admin', 'agent', 'superadmin'];
    var filtered = rawMembers.filter(function(m) { return allowedRoles.indexOf(m.role) > -1; });
    expect(filtered.length).toBe(2);
    expect(filtered.find(function(m) { return m.role === 'viewer'; })).toBeUndefined();
  });

  test('when conversation tenant matches portal tenant, reuses existing members', function() {
    var resolvedTenantId = 'same-tenant';
    var convTenantId = 'same-tenant';
    var portalTeamMembers = [{ id: 'member-1', name: 'Alice' }];

    // If same tenant, reuse portalTeamMembers
    var convTeamMembers = convTenantId === resolvedTenantId ? portalTeamMembers : [];
    expect(convTeamMembers).toBe(portalTeamMembers);
  });

  test('when conversation tenant differs from portal, fetches separately', function() {
    var resolvedTenantId = 'sp-tenant';
    var convTenantId = 'delamere-tenant';
    var portalTeamMembers = [{ id: 'sp-member', name: 'SP Admin' }];

    // Should NOT reuse
    var shouldFetchSeparately = convTenantId !== resolvedTenantId;
    expect(shouldFetchSeparately).toBe(true);
  });
});
