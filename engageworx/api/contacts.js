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
      var errors = [];

      for (var key in groups) {
        var grp = groups[key];
        if (grp.length < 2) continue;
        var keep = grp[0];
        var dupes = grp.slice(1);
        console.log('[Dedup]   Group', key, '— keep', keep.id, 'dupes', dupes.map(function(d) { return d.id; }).join(','));

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
      }
      return { groupsMerged: groupsMerged, contactsDeleted: contactsDeleted, fkRedirects: fkRedirects, errors: errors };
    }

    try {
      var totalGroups = 0, totalDeleted = 0, totalFk = 0, allErrors = [], tenantsProcessed = 0;
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
            if (r.errors.length > 0) allErrors.push({ tenant_id: t.id, tenant_name: t.name, errors: r.errors });
            tenantsProcessed++;
          } catch (te) { allErrors.push({ tenant_id: t.id, error: te.message }); }
        }
      } else {
        var single = await dedupOneTenant(tenantId);
        totalGroups = single.groupsMerged;
        totalDeleted = single.contactsDeleted;
        totalFk = single.fkRedirects;
        allErrors = single.errors;
        tenantsProcessed = 1;
      }

      console.log('[Dedup] Done. groups:', totalGroups, 'deleted:', totalDeleted, 'fk:', totalFk, 'errors:', allErrors.length);
      return res.status(200).json({
        success: true,
        groups_merged: totalGroups,
        contacts_deleted: totalDeleted,
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
