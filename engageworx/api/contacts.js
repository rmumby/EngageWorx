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
    if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });

    try {
      var all = await supabase.from('contacts')
        .select('*')
        .eq('tenant_id', tenantId)
        .not('email', 'is', null)
        .order('created_at', { ascending: true });
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
        var keep = grp[0]; // oldest
        var dupes = grp.slice(1);

        // Fill in missing fields on kept from dupes
        var fillUpdate = {};
        FILLABLE.forEach(function(f) {
          if (isEmpty(keep[f])) {
            for (var d of dupes) {
              if (!isEmpty(d[f])) { fillUpdate[f] = d[f]; break; }
            }
          }
        });

        if (Object.keys(fillUpdate).length > 0) {
          try { await supabase.from('contacts').update(fillUpdate).eq('id', keep.id); }
          catch (fe) { errors.push({ keep_id: keep.id, fill_error: fe.message }); }
        }

        // Redirect FK references (conversations + messages) from dupes to kept,
        // then delete the dupes.
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

      return res.status(200).json({
        success: true,
        groups_merged: groupsMerged,
        contacts_deleted: contactsDeleted,
        fk_rows_redirected: fkRedirects,
        errors: errors,
      });
    } catch (err) {
      console.error('[Dedup] Error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action: ' + action });
};
