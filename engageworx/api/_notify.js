// Shared notification helper — used by all API routes
// Looks up tenant_members with the specified notify flag and returns their emails

var { createClient } = require('@supabase/supabase-js');

async function getNotifyEmails(tenantId, flag) {
  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get user IDs with the flag set
  var membersResult = await supabase
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq(flag, true);

  var userIds = (membersResult.data || []).map(function(m) { return m.user_id; });
  if (userIds.length === 0) return [];

  // Get their emails from user_profiles
  var profilesResult = await supabase
    .from('user_profiles')
    .select('email')
    .in('id', userIds);

  return (profilesResult.data || []).map(function(p) { return p.email; }).filter(Boolean);
}

module.exports = { getNotifyEmails };
