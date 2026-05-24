// api/contacts.js — Contact dedup + email existence check
// POST /api/contacts?action=dedup        — find & merge duplicate emails per tenant
// POST /api/contacts?action=check-email  — does this email already exist for the tenant?

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Fields that get copied from a newer duplicate into the kept record
// ONLY when the kept record's value is null/empty.
var FILLABLE = [
  'first_name', 'last_name', 'phone', 'company', 'title', 'notes',
  'pipeline_lead_id', 'source', 'tags', 'channels', 'channel_preference',
  'city', 'state', 'country', 'zip', 'custom_fields',
];

function isEmpty(v) {
  return v === null || v === undefined || v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var action = req.query.action;
  var supabase = getSupabase();
  var body = req.body || {};

  // ── CHECK-EMAIL ─────────────────────────────────────────────────────────
  if (action === 'check-email') {
    var tId = body.tenant_id;
    var em = (body.email || '').trim().toLowerCase();
    if (!tId || !em) return res.status(400).json({ error: 'tenant_id and email required' });
    var excl = body.exclude_id;
    var q = supabase.from('contacts')
      .select('id, first_name, last_name, email, phone, created_at')
      .eq('tenant_id', tId)
      .ilike('email', em);
    if (excl) q = q.neq('id', excl);
    var r = await q;
    return res.status(200).json({ exists: (r.data || []).length > 0, matches: r.data || [] });
  }

  // ── DEDUP ───────────────────────────────────────────────────────────────
  if (action === 'dedup') {
    var tenantId = body.tenant_id;
    var allTenants = body.all_tenants === true;
    if (!tenantId && !allTenants) return res.status(400).json({ error: 'tenant_id required (or pass all_tenants:true)' });

    console.log('[Dedup] Start. scope:', allTenants ? 'ALL' : tenantId);

    async function dedupOneTenant(tid) {
      var all = await supabase.from('contacts')
        .select('*')
        .eq('tenant_id', tid)
        .not('email', 'is', null)
        .order('created_at', { ascending: true });
      if (all.error) throw new Error('contacts fetch: ' + all.error.message);
      var contacts = all.data || [];

      var groups = {};
      contacts.forEach(function(c) {
        var key = (c.email || '').trim().toLowerCase();
        if (!key) return;
        if (!groups[key]) groups[key] = [];
        groups[key].push(c);
      });

      var groupsMerged = 0;
      var contactsDeleted = 0;
      var fkRedirects = 0;
      var leadsMerged = 0;
      var leadsDeleted = 0;
      var errors = [];

      // Fields that get filled from newer lead dupes into the kept lead
      var LEAD_FILLABLE = ['name', 'company', 'phone', 'type', 'urgency', 'stage', 'source', 'ai_next_action', 'next_action', 'next_action_date', 'package', 'go_live_date', 'billing_status'];

      for (var key in groups) {
        var grp = groups[key];
        if (grp.length < 2) continue;
        var keep = grp[0];
        var dupes = grp.slice(1);
        console.log('[Dedup]   Contact group', key, '— keep', keep.id, 'dupes', dupes.map(function(d) { return d.id; }).join(','));

        var fillUpdate = {};
        FILLABLE.forEach(function(f) {
          if (isEmpty(keep[f])) {
            for (var d of dupes) {
              if (!isEmpty(d[f])) { fillUpdate[f] = d[f]; break; }
            }
          }
        });

        if (Object.keys(fillUpdate).length > 0) {
          var up = await supabase.from('contacts').update(fillUpdate).eq('id', keep.id);
          if (up.error) errors.push({ keep_id: keep.id, fill_error: up.error.message });
        }

        for (var d of dupes) {
          try {
            var convUpd = await supabase.from('conversations').update({ contact_id: keep.id }).eq('contact_id', d.id);
            if (!convUpd.error && convUpd.count) fkRedirects += convUpd.count;
            var msgUpd = await supabase.from('messages').update({ contact_id: keep.id }).eq('contact_id', d.id);
            if (!msgUpd.error && msgUpd.count) fkRedirects += msgUpd.count;
          } catch (fkErr) { errors.push({ dup_id: d.id, fk_error: fkErr.message }); }

          var del = await supabase.from('contacts').delete().eq('id', d.id);
          if (!del.error) contactsDeleted++;
          else errors.push({ dup_id: d.id, delete_error: del.error.message });
        }
        groupsMerged++;

        // ── Merge associated leads for this email ──────────────────────────
        try {
          // 1. Collect every lead id referenced by the contact group, plus any
          //    lead whose email matches (case-insensitive).
          var leadIdSet = new Set();
          grp.forEach(function(c) { if (c.pipeline_lead_id) leadIdSet.add(c.pipeline_lead_id); });

          var leadsByEmail = await supabase.from('leads')
            .select('*')
            .eq('tenant_id', tid)
            .ilike('email', key)
            .order('created_at', { ascending: true });
          (leadsByEmail.data || []).forEach(function(l) { leadIdSet.add(l.id); });

          if (leadIdSet.size < 2) continue; // 0 or 1 leads — nothing to merge

          // 2. Load full records for all candidate leads, sort oldest-first
          var leadIds = Array.from(leadIdSet);
          var leadRes = await supabase.from('leads').select('*').in('id', leadIds).order('created_at', { ascending: true });
          var leads = leadRes.data || [];
          if (leads.length < 2) continue;

          var leadKeep = leads[0];
          var leadDupes = leads.slice(1);
          console.log('[Dedup]   Lead group', key, '— keep', leadKeep.id, 'dupes', leadDupes.map(function(l) { return l.id; }).join(','));

          // 3. Merge notes: append each dupe's notes to the kept lead's notes
          var mergedNotes = (leadKeep.notes || '').trim();
          leadDupes.forEach(function(ld) {
            if (ld.notes && ld.notes.trim()) {
              mergedNotes += (mergedNotes ? '\n\n' : '') + '[Merged from lead ' + ld.id.substring(0, 8) + ']: ' + ld.notes.trim();
            }
          });

          // 4. Fill missing fields from newer dupes
          var leadFill = { notes: mergedNotes };
          LEAD_FILLABLE.forEach(function(f) {
            if (isEmpty(leadKeep[f])) {
              for (var ld of leadDupes) {
                if (!isEmpty(ld[f])) { leadFill[f] = ld[f]; break; }
              }
            }
          });
          await supabase.from('leads').update(leadFill).eq('id', leadKeep.id);

          // 5. Redirect FK references from dupes → keep
          for (var ld of leadDupes) {
            try {
              var seqUpd = await supabase.from('lead_sequences').update({ lead_id: leadKeep.id }).eq('lead_id', ld.id);
              if (!seqUpd.error && seqUpd.count) fkRedirects += seqUpd.count;

              var cpUpd = await supabase.from('contacts').update({ pipeline_lead_id: leadKeep.id }).eq('pipeline_lead_id', ld.id);
              if (!cpUpd.error && cpUpd.count) fkRedirects += cpUpd.count;
            } catch (lfkErr) { errors.push({ lead_dup_id: ld.id, fk_error: lfkErr.message }); }

            var lDel = await supabase.from('leads').delete().eq('id', ld.id);
            if (!lDel.error) leadsDeleted++;
            else errors.push({ lead_dup_id: ld.id, delete_error: lDel.error.message });
          }
          leadsMerged++;
        } catch (ldErr) { errors.push({ group: key, lead_merge_error: ldErr.message }); }
      }
      return {
        groupsMerged: groupsMerged,
        contactsDeleted: contactsDeleted,
        fkRedirects: fkRedirects,
        leadsMerged: leadsMerged,
        leadsDeleted: leadsDeleted,
        errors: errors,
      };
    }

    try {
      var totalGroups = 0, totalDeleted = 0, totalFk = 0, totalLeadsMerged = 0, totalLeadsDeleted = 0, allErrors = [], tenantsProcessed = 0;
      if (allTenants) {
        var tres = await supabase.from('tenants').select('id, name');
        var tenants = tres.data || [];
        console.log('[Dedup] Processing', tenants.length, 'tenants');
        for (var t of tenants) {
          try {
            var r = await dedupOneTenant(t.id);
            totalGroups += r.groupsMerged;
            totalDeleted += r.contactsDeleted;
            totalFk += r.fkRedirects;
            totalLeadsMerged += r.leadsMerged || 0;
            totalLeadsDeleted += r.leadsDeleted || 0;
            if (r.errors.length > 0) allErrors.push({ tenant_id: t.id, tenant_name: t.name, errors: r.errors });
            tenantsProcessed++;
          } catch (te) { allErrors.push({ tenant_id: t.id, error: te.message }); }
        }
      } else {
        var single = await dedupOneTenant(tenantId);
        totalGroups = single.groupsMerged;
        totalDeleted = single.contactsDeleted;
        totalFk = single.fkRedirects;
        totalLeadsMerged = single.leadsMerged || 0;
        totalLeadsDeleted = single.leadsDeleted || 0;
        allErrors = single.errors;
        tenantsProcessed = 1;
      }

      console.log('[Dedup] Done. groups:', totalGroups, 'contacts deleted:', totalDeleted, 'leads merged:', totalLeadsMerged, 'leads deleted:', totalLeadsDeleted, 'fk:', totalFk, 'errors:', allErrors.length);
      return res.status(200).json({
        success: true,
        groups_merged: totalGroups,
        contacts_deleted: totalDeleted,
        leads_merged: totalLeadsMerged,
        leads_deleted: totalLeadsDeleted,
        fk_rows_redirected: totalFk,
        tenants_processed: tenantsProcessed,
        errors: allErrors,
      });
    } catch (err) {
      console.error('[Dedup] Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action: ' + action });
};
