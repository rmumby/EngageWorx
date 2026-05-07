// api/cron-weekly-summary.js — Weekly summary cron
// Schedule: every hour on the hour. Matches users whose configured
// weekly_summary_day + tenant digest_send_time align with current local time.
// Dedupes via weekly_summary_last_sent_at (6-day window).

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Reuse the same timezone helpers as cron-email-digest.js
function tenantLocalHour(tz) {
  try {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hour: '2-digit', hour12: false }).formatToParts(new Date());
    var h = parts.find(function(p) { return p.type === 'hour'; });
    return h ? parseInt(h.value, 10) % 24 : null;
  } catch (e) { return null; }
}

function tenantLocalDayName(tz) {
  try {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', weekday: 'long' }).formatToParts(new Date());
    var d = parts.find(function(p) { return p.type === 'weekday'; });
    return d ? d.value.toLowerCase() : null;
  } catch (e) { return null; }
}

function parseHour(timeStr) {
  if (!timeStr) return null;
  var m = /^(\d{1,2}):/.exec(timeStr);
  return m ? parseInt(m[1], 10) : null;
}

// Stub — Day 2/3 will implement aggregation + AI synthesis + HTML rendering
async function sendDigest(supabase, user, tenant) {
  console.log('[WeeklySummary] sendDigest STUB — user:', user.user_id, 'tenant:', tenant.id);
  return { sent: false, reason: 'not_implemented' };
}

module.exports = async function handler(req, res) {
  // Auth: match cron-sequences.js pattern
  var authHeader = req.headers['authorization'];
  var cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var supabase = getSupabase();
  var counts = { checked: 0, matched: 0, sent: 0, skipped: 0, failed: 0 };

  try {
    // 1. Fetch all users with weekly summary enabled
    var prefsRes = await supabase.from('user_notification_preferences')
      .select('user_id, tenant_id, weekly_summary_day, weekly_summary_last_sent_at')
      .eq('weekly_summary_enabled', true);

    var prefs = prefsRes.data || [];
    counts.checked = prefs.length;

    if (prefs.length === 0) {
      console.log('[WeeklySummary] No users with weekly_summary_enabled — exiting.');
      return res.status(200).json({ success: true, ...counts });
    }

    // 2. Batch-load tenants for timezone + send time
    var tenantIds = [];
    prefs.forEach(function(p) { if (p.tenant_id && tenantIds.indexOf(p.tenant_id) === -1) tenantIds.push(p.tenant_id); });
    var tenantsRes = await supabase.from('tenants')
      .select('id, name, digest_send_time, digest_timezone')
      .in('id', tenantIds);
    var tenantMap = {};
    (tenantsRes.data || []).forEach(function(t) { tenantMap[t.id] = t; });

    // 3. For each user, check if now is the right time to send
    var sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();

    for (var i = 0; i < prefs.length; i++) {
      var pref = prefs[i];
      var tenant = tenantMap[pref.tenant_id];
      if (!tenant) { counts.skipped++; continue; }

      var tz = tenant.digest_timezone || 'America/New_York';
      var configuredHour = parseHour(tenant.digest_send_time || '08:00');
      var localHour = tenantLocalHour(tz);
      var localDay = tenantLocalDayName(tz);

      // Match: right day + right hour
      var dayMatch = localDay === (pref.weekly_summary_day || 'monday');
      var hourMatch = localHour === configuredHour;

      if (!dayMatch || !hourMatch) {
        counts.skipped++;
        continue;
      }

      // Dedupe: skip if sent within last 6 days
      if (pref.weekly_summary_last_sent_at && pref.weekly_summary_last_sent_at > sixDaysAgo) {
        console.log('[WeeklySummary] Skipped (sent recently):', pref.user_id, 'last:', pref.weekly_summary_last_sent_at);
        counts.skipped++;
        continue;
      }

      counts.matched++;

      // 4. Send (stub for now)
      try {
        var result = await sendDigest(supabase, pref, tenant);
        if (result.sent) {
          counts.sent++;
          await supabase.from('user_notification_preferences')
            .update({ weekly_summary_last_sent_at: new Date().toISOString() })
            .eq('user_id', pref.user_id)
            .eq('tenant_id', pref.tenant_id);
        } else {
          console.log('[WeeklySummary] Not sent:', pref.user_id, 'reason:', result.reason);
        }
      } catch (sendErr) {
        console.error('[WeeklySummary] Send error:', pref.user_id, sendErr.message);
        counts.failed++;
      }
    }

    console.log('[WeeklySummary] Complete:', counts);
    return res.status(200).json({ success: true, ...counts });
  } catch (err) {
    console.error('[WeeklySummary] Cron error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
