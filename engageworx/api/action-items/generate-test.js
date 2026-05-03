// api/action-items/generate-test.js — Manually generate action items for a tenant
// POST { tenant_id }
// Finds stale leads for the tenant and generates action_items via the generator.
// JWT-gated, admin only. For testing — doesn't replace scheduled crons.

var { createClient } = require('@supabase/supabase-js');
var { generateActionItem } = require('../_lib/action-item-generator');

var STALE_DAYS = 7;
var FROZEN_STAGES = ['customer', 'closed_won', 'closed_lost'];

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

  var authHeader = req.headers.authorization || '';
  var jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return res.status(401).json({ error: 'Authorization required' });

  var supabase = getSupabase();
  var { data: userData } = await supabase.auth.getUser(jwt);
  if (!userData || !userData.user) return res.status(401).json({ error: 'Invalid token' });
  var userId = userData.user.id;

  var tenantId = (req.body || {}).tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

  // Verify membership
  var { data: membership } = await supabase.from('tenant_members')
    .select('role').eq('tenant_id', tenantId).eq('user_id', userId).eq('status', 'active').maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Not a member of this tenant' });

  console.log('[action-items/generate-test]', { tenant_id: tenantId, user_id: userId });

  var cutoff = new Date(Date.now() - STALE_DAYS * 86400000).toISOString();

  // Find stale leads for this tenant
  var { data: leads } = await supabase.from('leads')
    .select('id, name, company, email, stage, last_activity_at, created_at, source')
    .eq('tenant_id', tenantId)
    .eq('qualified', true)
    .eq('archived', false)
    .not('stage', 'in', '(' + FROZEN_STAGES.map(function(s) { return '"' + s + '"'; }).join(',') + ')')
    .lt('last_activity_at', cutoff)
    .limit(20);

  var staleLeads = leads || [];
  var generated = 0;
  var skipped = 0;
  var errors = [];

  for (var i = 0; i < staleLeads.length; i++) {
    var lead = staleLeads[i];
    var daysStale = Math.floor((Date.now() - new Date(lead.last_activity_at || lead.created_at).getTime()) / 86400000);

    try {
      var result = await generateActionItem(supabase, {
        tenant_id: tenantId,
        user_id: userId,
        source: 'pipeline_stale',
        lead_id: lead.id,
        context_data: {
          days_stale: daysStale,
          stage_name: lead.stage || '',
          last_activity_date: lead.last_activity_at || lead.created_at,
          last_activity_summary: lead.name + ' at ' + (lead.company || 'unknown') + ' — ' + daysStale + ' days stale',
        },
      });
      if (result.success) {
        if (result.updated_existing) skipped++;
        else generated++;
      } else {
        errors.push({ lead_id: lead.id, error: result.error });
      }
    } catch (e) {
      errors.push({ lead_id: lead.id, error: e.message });
    }
  }

  return res.status(200).json({
    success: true,
    stale_leads_found: staleLeads.length,
    generated: generated,
    skipped_dedup: skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
};
