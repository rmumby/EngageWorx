// api/cron-signup-recovery.js
// Runs every 6h via Vercel Cron
// Finds users who signed up but have no tenant after 1 hour
// Creates Pipeline lead + Contact + enrolls in abandoned checkout sequence
// Does NOT send email directly — the sequence engine handles all outreach.
// recovery_email_sent_at is set after successful enrollment to prevent re-processing.

const { createClient } = require('@supabase/supabase-js');

const SP_TENANT_ID = (process.env.SP_TENANT_ID || 'c1bc59a8-5235-4921-9755-02514b574387');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  // Allow Vercel cron or manual trigger with secret
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET || 'ew-cron-2026';
  if (req.method !== 'GET' || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = getSupabase();
  const results = { processed: 0, skipped: 0, errors: [] };

  try {
    // Find users with no tenant_id created more than 1 hour ago
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: orphanUsers, error } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, company_name, plan, created_at, recovery_email_sent_at')
      .is('tenant_id', null)
      .is('recovery_email_sent_at', null)
      .lt('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    console.log(`[Cron] Found ${(orphanUsers || []).length} users without tenant`);

    // Find abandoned checkout sequence
    const { data: abandonSeqs } = await supabase
      .from('sequences')
      .select('id, name')
      .eq('tenant_id', SP_TENANT_ID)
      .ilike('name', '%abandon%')
      .limit(1);
    const seqId = abandonSeqs && abandonSeqs[0] ? abandonSeqs[0].id : null;

    var MAX_AGE_DAYS = 14;
    var staleOrphans = [];

    for (const user of (orphanUsers || [])) {
      try {
        // GUARD 2: Max lead age for recovery
        var signupAge = (Date.now() - new Date(user.created_at).getTime()) / 86400000;
        if (signupAge > MAX_AGE_DAYS) {
          console.log('[Cron] Skipping', user.email, '— signup', Math.round(signupAge), 'days old (max', MAX_AGE_DAYS + ')');
          staleOrphans.push({ email: user.email, age: Math.round(signupAge), created_at: user.created_at });
          results.skipped++;
          continue;
        }

        // Find or create Pipeline lead
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('email', user.email)
          .limit(1);

        var leadId;
        if (existing && existing.length > 0) {
          leadId = existing[0].id;
          console.log('[Cron] Lead exists for', user.email, '— using', leadId);
        } else {
          const { data: lead, error: leadErr } = await supabase
            .from('leads')
            .insert({
              name: user.full_name || null,
              company: user.company_name || '',
              email: user.email,
              type: 'Direct Business',
              urgency: 'Hot',
              stage: 'inquiry',
              billing_status: 'abandoned',
              source: 'abandoned_checkout',
              notes: 'Signed up ' + new Date(user.created_at).toLocaleDateString() + ' — no payment completed. Auto-detected by hourly cron.',
              last_action_at: new Date().toISOString().split('T')[0],
              last_activity_at: new Date().toISOString(),
            })
            .select('id')
            .single();

          if (leadErr) throw leadErr;
          leadId = lead.id;
          console.log('[Cron] Created lead for', user.email, '→', leadId);
        }

        // Create Contact (dedup on email)
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', user.email)
          .eq('tenant_id', SP_TENANT_ID)
          .single();

        if (!existingContact) {
          const nameParts = (user.full_name || '').trim().split(' ');
          await supabase.from('contacts').insert({
            first_name: nameParts[0] || null,
            last_name: nameParts.slice(1).join(' ') || null,
            email: user.email,
            company_name: user.company_name || null,
            pipeline_lead_id: leadId,
            tenant_id: SP_TENANT_ID,
            status: 'active',
            source: 'abandoned_checkout',
          });
        }

        // Enrol in abandoned checkout sequence (cancel-and-replace if needed)
        // Sequence engine handles all outreach — no direct email from this cron.
        var enrolled = false;
        if (seqId) {
          try {
            var existingEnrol = await supabase.from('lead_sequences').select('id, sequence_id, sequences(name)').eq('lead_id', leadId).eq('status', 'active').maybeSingle();
            if (existingEnrol.data && existingEnrol.data.sequence_id === seqId) {
              console.log('[Cron] Lead', leadId, 'already enrolled in recovery sequence — skipping');
              enrolled = true;
            } else {
              if (existingEnrol.data) {
                var oldName = (existingEnrol.data.sequences && existingEnrol.data.sequences.name) || 'unknown';
                await supabase.from('lead_sequences').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', existingEnrol.data.id);
                console.log('[cron-signup-recovery] Cancelled existing enrollment in', oldName, 'for lead', leadId);
                try {
                  await supabase.from('lead_sequence_events').insert({ tenant_id: SP_TENANT_ID, lead_id: leadId, sequence_id: existingEnrol.data.sequence_id, event_type: 'cancelled', reason: 'Replaced by Abandoned Checkout Recovery (more specific to lead state)' });
                } catch (logErr) {}
              }
              const { data: firstStep } = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', seqId).eq('step_number', 1).maybeSingle();
              const startDate = new Date();
              if (firstStep && firstStep.delay_days > 0) startDate.setDate(startDate.getDate() + firstStep.delay_days);
              var _safeEnrol = require('./_lib/safe-enrol-sequence');
              var enrolResult = await _safeEnrol.safeEnrolSequence(supabase, { tenant_id: SP_TENANT_ID, lead_id: leadId, sequence_id: seqId, next_step_at: startDate.toISOString() });
              if (!enrolResult.enrolled && enrolResult.reason === 'upsert_error') throw new Error(enrolResult.error);
              enrolled = enrolResult.enrolled;
              try {
                await supabase.from('lead_sequence_events').insert({ tenant_id: SP_TENANT_ID, lead_id: leadId, sequence_id: seqId, event_type: 'enrolled', reason: 'Orphan signup detected — abandoned checkout recovery' });
              } catch (logErr) {}
            }
          } catch (enrolErr) {
            console.error('[cron-signup-recovery] Enrol error for lead', leadId, ':', enrolErr.message);
          }
        } else {
          // No sequence found — still mark as processed to avoid infinite loop
          console.warn('[cron-signup-recovery] No abandoned checkout sequence found — marking processed anyway');
          enrolled = true;
        }

        // Mark user as processed ONLY on successful enrollment — retry on next tick if failed
        if (enrolled) {
          await supabase.from('user_profiles').update({ recovery_email_sent_at: new Date().toISOString() }).eq('id', user.id);
          console.log('[Cron] Enrolled for outreach via sequence:', user.email, '→ lead', leadId);
        } else {
          console.warn('[cron-signup-recovery]', user.email, '— enrollment failed, will retry next tick');
        }

        console.log(`[Cron] Processed: ${user.email} → lead ${leadId}`);
        results.processed++;

      } catch (userErr) {
        console.error(`[Cron] Error processing ${user.email}:`, userErr.message);
        results.errors.push({ email: user.email, error: userErr.message });
      }
    }

    // Log stale orphans (admin notification deferred to send-notification.js)
    if (staleOrphans.length > 0) {
      console.warn('[cron-signup-recovery] ADMIN ALERT:', staleOrphans.length, 'stale orphan(s) older than', MAX_AGE_DAYS, 'days — need manual review');
    }

    return res.status(200).json({
      success: true,
      ...results,
      stale_orphans: staleOrphans.length,
      seqId,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[Cron] Fatal error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};
