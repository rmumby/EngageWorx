describe('AI Bot assignment via RPC', function() {
  var AI_SENTINEL = '00000000-0000-0000-0000-000000000000';
  function simulateAssign(assigneeId) {
    var assignAi = assigneeId === AI_SENTINEL;
    return { assigned_agent_id: assignAi ? null : assigneeId, ai_assigned: assignAi };
  }
  test('AI Bot sentinel sets ai_assigned=true, assigned_agent_id=null', function() {
    var r = simulateAssign(AI_SENTINEL);
    expect(r.ai_assigned).toBe(true);
    expect(r.assigned_agent_id).toBeNull();
  });
  test('human UUID sets ai_assigned=false, assigned_agent_id=uuid', function() {
    var r = simulateAssign('abc-123');
    expect(r.ai_assigned).toBe(false);
    expect(r.assigned_agent_id).toBe('abc-123');
  });
  test('null (unassign) sets both to false/null', function() {
    var r = simulateAssign(null);
    expect(r.ai_assigned).toBe(false);
    expect(r.assigned_agent_id).toBeNull();
  });
  test('AI sentinel is never written to FK column', function() {
    var r = simulateAssign(AI_SENTINEL);
    expect(r.assigned_agent_id).not.toBe(AI_SENTINEL);
  });
});
describe('Conversation data mapping', function() {
  function mapAssignment(conv) {
    if (conv.ai_assigned) return { id: 'bot', name: 'AI Assistant', avatar: '🤖' };
    if (conv.assigned_agent_id) return { id: conv.assigned_agent_id, name: 'Agent', avatar: '👤' };
    return null;
  }
  test('ai_assigned=true maps to AI Bot', function() {
    expect(mapAssignment({ ai_assigned: true, assigned_agent_id: null }).id).toBe('bot');
  });
  test('assigned_agent_id maps to human', function() {
    expect(mapAssignment({ ai_assigned: false, assigned_agent_id: 'u1' }).id).toBe('u1');
  });
  test('both null/false maps to null', function() {
    expect(mapAssignment({ ai_assigned: false, assigned_agent_id: null })).toBeNull();
  });
});
