// api/action-items/test.js — Test endpoint for action-item-generator
// POST /api/action-items/test
// Body: { tenant_id, user_id, source, contact_id?, lead_id?, ..., context_data }
// Returns: { success, action_item, updated_existing, debug }
//
// SP-admin only. For testing the generator before wiring to crons.

var { createClient } = require('@supabase/supabase-js');
var { generateActionItem } = require('../_lib/action-item-generator');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Auth: JWT required
  var authHeader = req.headers.authorization || '';
  var jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return res.status(401).json({ error: 'Authorization required' });

  var supabase = getSupabase();
  var { data: userData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !userData || !userData.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // SP-admin check
  var { data: profile } = await supabase.from('user_profiles')
    .select('role').eq('id', userData.user.id).maybeSingle();
  if (!profile || ['superadmin', 'super_admin', 'sp_admin'].indexOf(profile.role) === -1) {
    return res.status(403).json({ error: 'SP admin access required' });
  }

  // Validate body
  var body = req.body || {};
  if (!body.tenant_id || !body.user_id || !body.source) {
    return res.status(400).json({ error: 'tenant_id, user_id, and source are required' });
  }

  console.log('[action-items/test] called by', userData.user.id, 'source:', body.source);

  var result = await generateActionItem(supabase, {
    tenant_id: body.tenant_id,
    user_id: body.user_id,
    source: body.source,
    contact_id: body.contact_id || null,
    lead_id: body.lead_id || null,
    conversation_id: body.conversation_id || null,
    ticket_id: body.ticket_id || null,
    related_tenant_id: body.related_tenant_id || null,
    context_data: body.context_data || {},
  });

  return res.status(200).json(result);
};
