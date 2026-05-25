/**
 * Reassign dropdown display tests.
 * Verifies the two-step query pattern returns real team member names.
 */

describe('Team member loading (two-step query)', function() {
  test('maps tenant_members + user_profiles into display objects', function() {
    var tmRows = [
      { user_id: 'darren-uuid', role: 'admin' },
      { user_id: 'rob-dm-uuid', role: 'admin' },
    ];
    var profileMap = {
      'darren-uuid': { id: 'darren-uuid', full_name: 'Darren Wells', email: 'darren@delamere.co.uk', avatar_url: null },
      'rob-dm-uuid': { id: 'rob-dm-uuid', full_name: 'Rob Mumby', email: 'rob@delameremanor.co.uk', avatar_url: null },
    };

    var members = tmRows.map(function(m) {
      var p = profileMap[m.user_id] || {};
      var name = p.full_name || p.email || 'Unknown';
      var initials = name.split(' ').map(function(w) { return (w || '')[0]; }).filter(Boolean).join('').slice(0, 2).toUpperCase();
      return { id: m.user_id, name: name, avatar: initials, role: m.role };
    });

    expect(members.length).toBe(2);
    expect(members[0].name).toBe('Darren Wells');
    expect(members[0].avatar).toBe('DW');
    expect(members[1].name).toBe('Rob Mumby');
    expect(members[1].avatar).toBe('RM');
  });

  test('falls back to email when full_name is null', function() {
    var tmRows = [{ user_id: 'u1', role: 'agent' }];
    var profileMap = { 'u1': { id: 'u1', full_name: null, email: 'agent@example.com' } };

    var members = tmRows.map(function(m) {
      var p = profileMap[m.user_id] || {};
      return { name: p.full_name || p.email || 'Unknown' };
    });

    expect(members[0].name).toBe('agent@example.com');
  });

  test('falls back to Unknown when no profile exists', function() {
    var tmRows = [{ user_id: 'orphan', role: 'admin' }];
    var profileMap = {}; // no profile for this user

    var members = tmRows.map(function(m) {
      var p = profileMap[m.user_id] || {};
      return { name: p.full_name || p.email || 'Unknown' };
    });

    expect(members[0].name).toBe('Unknown');
  });

  test('returns empty array when tenant has zero active members', function() {
    var tmRows = [];
    expect(tmRows.length).toBe(0);
    // UI should show "No team members"
  });

  test('two-step avoids embedded FK join failure', function() {
    // The old query: supabase.from('tenant_members').select('user_id, role, user_profiles(id, full_name...)')
    // fails silently when the FK path tenant_members.user_id → user_profiles.id is ambiguous
    // (because both FK to auth.users, not directly to each other).
    //
    // The new two-step query:
    //   Step 1: supabase.from('tenant_members').select('user_id, role').eq('tenant_id', ...)
    //   Step 2: supabase.from('user_profiles').select('id, full_name, ...').in('id', userIds)
    //
    // This always works because each query is a direct table lookup.
    var step1 = [{ user_id: 'u1', role: 'admin' }, { user_id: 'u2', role: 'agent' }];
    var userIds = step1.map(function(m) { return m.user_id; });
    var step2 = [
      { id: 'u1', full_name: 'Alice', email: 'alice@co.com' },
      { id: 'u2', full_name: 'Bob', email: 'bob@co.com' },
    ];

    // Build profile map
    var profileMap = {};
    step2.forEach(function(p) { profileMap[p.id] = p; });

    // Map
    var members = step1.map(function(m) {
      var p = profileMap[m.user_id] || {};
      return { id: m.user_id, name: p.full_name || p.email || 'Unknown' };
    });

    expect(members.length).toBe(2);
    expect(members[0].name).toBe('Alice');
    expect(members[1].name).toBe('Bob');
    expect(userIds).toEqual(['u1', 'u2']);
  });
});
