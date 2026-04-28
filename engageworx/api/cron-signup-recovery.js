// api/cron-signup-recovery.js
// Runs every hour via Vercel Cron
// Finds users who signed up but have no tenant after 1 hour
// Creates Pipeline lead + Contact + enrolls in abandoned checkout sequence

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
      .select('id, email, full_name, company_name, plan, created_at')
      .is('tenant_id', null)
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

    for (const user of (orphanUsers || [])) {
      try {
        // Check if already in Pipeline
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('email', user.email)
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`[Cron] Skipping ${user.email} — already in Pipeline`);
          results.skipped++;
          continue;
        }

        // Create Pipeline lead
        const { data: lead, error: leadErr } = await supabase
          .from('leads')
          .insert({
            name: user.full_name || user.email,
            company: user.company_name || '',
            email: user.email,
            type: 'Direct Business',
            urgency: 'Hot',
            stage: 'inquiry',
            billing_status: 'abandoned',
            source: 'abandoned_checkout',
            notes: `Signed up ${new Date(user.created_at).toLocaleDateString()} — no payment completed. Auto-detected by hourly cron.`,
            last_action_at: new Date().toISOString().split('T')[0],
            last_activity_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (leadErr) throw leadErr;
        const leadId = lead.id;

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
            first_name: nameParts[0] || user.email,
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
        if (seqId) {
          try {
            // Check for existing active enrollment
            var existingEnrol = await supabase.from('lead_sequences').select('id, sequence_id, sequences(name)').eq('lead_id', leadId).eq('status', 'active').maybeSingle();
            if (existingEnrol.data && existingEnrol.data.sequence_id === seqId) {
              console.log('[Cron] Lead', leadId, 'already enrolled in recovery sequence — skipping');
            } else {
              if (existingEnrol.data) {
                var oldName = (existingEnrol.data.sequences && existingEnrol.data.sequences.name) || 'unknown';
                await supabase.from('lead_sequences').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', existingEnrol.data.id);
                console.log('[cron-signup-recovery] Cancelled existing enrollment in', oldName, 'for lead', leadId, 'to make room for recovery');
                // Audit log
                try {
                  await supabase.from('lead_sequence_events').insert({ tenant_id: SP_TENANT_ID, lead_id: leadId, sequence_id: existingEnrol.data.sequence_id, event_type: 'cancelled', reason: 'Replaced by Abandoned Checkout Recovery (more specific to lead state)' });
                } catch (logErr) { console.warn('[cron-signup-recovery] Audit log error:', logErr.message); }
              }
              const { data: firstStep } = await supabase.from('sequence_steps').select('delay_days').eq('sequence_id', seqId).eq('step_number', 1).maybeSingle();
              const startDate = new Date();
              if (firstStep && firstStep.delay_days > 0) startDate.setDate(startDate.getDate() + firstStep.delay_days);
              var enrolResult = await supabase.from('lead_sequences').upsert({
                tenant_id: SP_TENANT_ID, lead_id: leadId, sequence_id: seqId,
                current_step: 0, status: 'active', enrolled_at: new Date().toISOString(), next_step_at: startDate.toISOString(),
              }, { onConflict: 'lead_id,sequence_id' });
              if (enrolResult.error) throw enrolResult.error;
              // Audit log
              try {
                await supabase.from('lead_sequence_events').insert({ tenant_id: SP_TENANT_ID, lead_id: leadId, sequence_id: seqId, event_type: 'enrolled', reason: 'Orphan signup detected — abandoned checkout recovery' });
              } catch (logErr) { console.warn('[cron-signup-recovery] Audit log error:', logErr.message); }
            }
          } catch (enrolErr) {
            console.error('[cron-signup-recovery] Enrol error for lead', leadId, ':', enrolErr.message);
            // Notify admin on trigger failure
            try {
              if (process.env.SENDGRID_API_KEY) {
                var sgNotify = require('@sendgrid/mail');
                sgNotify.setApiKey(process.env.SENDGRID_API_KEY);
                await sgNotify.send({ to: process.env.PLATFORM_ADMIN_EMAIL || 'rob@engwx.com', from: { email: 'notifications@engwx.com', name: 'EngageWorx' }, subject: '[Cron] Signup recovery enrol failed — ' + user.email, html: '<p>Lead ID: ' + leadId + '</p><p>Email: ' + user.email + '</p><p>Error: ' + enrolErr.message + '</p>' });
              }
            } catch (notifyErr) {}
          }
        }

        // Send recovery email via SendGrid
        try {
          const sgMail = require('@sendgrid/mail');
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          const firstName = (user.full_name || '').split(' ')[0] || 'there';
          await sgMail.send({
            to: user.email,
            from: { email: (process.env.PLATFORM_FROM_EMAIL || 'hello@engwx.com'), name: 'Rob at EngageWorx' },
            subject: 'Did you have any questions about EngageWorx?',
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
              <p style="font-size:15px;color:#1e293b;line-height:1.7;">Hi ${firstName},</p>
              <p style="font-size:15px;color:#1e293b;line-height:1.7;">I noticed you signed up for EngageWorx but didn't complete the payment step — no worries at all.</p>
              <p style="font-size:15px;color:#1e293b;line-height:1.7;">If you had any questions or hit a snag, just reply to this email and I'll get back to you personally.</p>
              <div style="text-align:center;margin:28px 0;">
                <a href="https://portal.engwx.com" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:800;font-size:15px;">Complete Signup →</a>
              </div>
              <div style="text-align:center;margin:0 0 24px;">
                <a href="https://calendly.com/rob-engwx/30min" style="display:inline-block;border:2px solid #00C9FF;color:#00C9FF;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">Book a Quick Call →</a>
              </div>
              <p style="font-size:13px;color:#64748b;">Rob Mumby · Founder & CEO, EngageWorx · +1 (786) 982-7800 · engwx.com</p>
            </div>`,
          });
        } catch (emailErr) {
          console.log(`[Cron] Recovery email failed for ${user.email}:`, emailErr.message);
        }

        console.log(`[Cron] Processed: ${user.email} → lead ${leadId}`);
        results.processed++;

      } catch (userErr) {
        console.error(`[Cron] Error processing ${user.email}:`, userErr.message);
        results.errors.push({ email: user.email, error: userErr.message });
      }
    }

    return res.status(200).json({
      success: true,
      ...results,
      seqId,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[Cron] Fatal error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};
