// Shared notification helper — used by all API routes
// Looks up tenant_members with the specified notify flag and returns their emails
var { createClient } = require('@supabase/supabase-js');

async function getNotifyEmails(tenantId, flag) {
  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get members with the flag set, including notify_email override
  var membersResult = await supabase
    .from('tenant_members')
    .select('user_id, notify_email')
    .eq('tenant_id', tenantId)
    .eq(flag, true);

  var members = membersResult.data || [];
  if (members.length === 0) return [];

  var userIds = members.map(function(m) { return m.user_id; });

  // Get their emails from user_profiles
  var profilesResult = await supabase
    .from('user_profiles')
    .select('id, email')
    .in('id', userIds);

  var profiles = profilesResult.data || [];

  // Use notify_email override if set, otherwise fall back to login email
  return members.map(function(m) {
    var profile = profiles.find(function(p) { return p.id === m.user_id; });
    return m.notify_email || (profile && profile.email) || null;
  }).filter(Boolean);
}

module.exports = { getNotifyEmails };
