// api/cron-archive-leads.js — Daily cron to archive leads that completed
// a sequence 3+ days ago with no inbound reply.

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = getSupabase();
  var cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  console.log('[Cron] Archive-leads started. Cutoff:', cutoff);

  var archived = 0;
  var checked = 0;
  var skippedReplied = 0;

  try {
    // 1. Find completed enrollments older than 3 days
    var enrolRes = await supabase
      .from('lead_sequences')
      .select('id, lead_id, completed_at, tenant_id, leads(id, stage, email, phone, name, last_activity_at, notes)')
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .lt('completed_at', cutoff);

    var enrolments = enrolRes.data || [];

    for (var e of enrolments) {
      checked++;
      var lead = e.leads;
      if (!lead) continue;
      if (lead.stage === 'dormant') continue;

      // 2. Check for any inbound messages from this contact after sequence completion
      var hasReply = false;
      try {
        // Find contacts matching lead email or phone
        var contactIds = [];
        if (lead.email) {
          var ce = await supabase.from('contacts').select('id').eq('email', lead.email).eq('tenant_id', e.tenant_id);
          if (ce.data) contactIds = contactIds.concat(ce.data.map(function(c) { return c.id; }));
        }
        if (lead.phone) {
          var cp = await supabase.from('contacts').select('id').eq('phone', lead.phone).eq('tenant_id', e.tenant_id);
          if (cp.data) contactIds = contactIds.concat(cp.data.map(function(c) { return c.id; }));
        }
        if (contactIds.length > 0) {
          var unique = [...new Set(contactIds)];
          var msgRes = await supabase
            .from('messages')
            .select('id')
            .in('contact_id', unique)
            .eq('direction', 'inbound')
            .gt('created_at', e.completed_at)
            .limit(1);
          if (msgRes.data && msgRes.data.length > 0) hasReply = true;
        }
      } catch (chkErr) { console.warn('[Archive] Check error for lead', lead.id, chkErr.message); }

      if (hasReply) { skippedReplied++; continue; }

      // 3. Archive — set stage to dormant
      try {
        var existingNotes = lead.notes || '';
        var archiveNote = '\n[Auto-archived ' + new Date().toISOString().split('T')[0] + ': no response 3 days after sequence completion]';
        await supabase.from('leads').update({
          stage: 'dormant',
          last_activity_at: new Date().toISOString(),
          notes: existingNotes + archiveNote,
        }).eq('id', lead.id);
        archived++;
        console.log('[Archive] Lead', lead.id, '(' + lead.name + ') archived');
      } catch (updErr) { console.error('[Archive] Update error:', updErr.message); }
    }

    console.log('[Cron] Archive-leads complete. Checked:', checked, 'Archived:', archived, 'Skipped-replied:', skippedReplied);
    return res.status(200).json({ success: true, checked: checked, archived: archived, skipped_replied: skippedReplied });
  } catch (err) {
    console.error('[Cron] Archive-leads error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
