// /api/twilio-voice.js — Vercel Serverless Function
// Handles inbound voice calls: IVR menu, business hours routing, voicemail
//
// Twilio webhook flow:
//   1. Caller dials tenant number → Twilio POSTs to /api/twilio-voice
//   2. We check business hours → IVR menu (during hours) or voicemail (after hours)
//   3. IVR: caller presses digit → /api/twilio-voice?action=route → <Dial> to department
//   4. Voicemail: greeting → <Record> → /api/twilio-voice?action=voicemail-complete
//   5. Call ends → /api/twilio-voice?action=status → update call record

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
);

// ─── TwiML helpers ───────────────────────────────────────────────────
function twiml(body) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

function say(text, voice = 'Polly.Amy') {
  // Polly.Amy = British English female — good default for UK business
  return `<Say voice="${voice}">${escapeXml(text)}</Say>`;
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Business hours check (with date overrides for events/weddings) ───
function isBusinessHours(config) {
  const tz = config.timezone || 'Europe/London';
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const day = now.getDay(); // 0=Sun, 6=Sat
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentMinutes = hour * 60 + minute;

  // Check for date-specific overrides first (e.g., weddings, events, holidays)
  const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const overrides = config.hours_overrides || [];
  const todayOverride = overrides.find(o => o.date === today);
  
  if (todayOverride) {
    // Override found for today
    if (todayOverride.closed) return false; // Explicitly closed all day
    const ovStart = (parseInt(todayOverride.open) || 0) * 60;
    const ovEnd = (parseInt(todayOverride.close) || 0) * 60;
    return currentMinutes >= ovStart && currentMinutes < ovEnd;
  }

  // Default schedule (supports half-hours: 9.5 = 9:30)
  const startHour = parseFloat(config.business_hours_start) || 9;
  const endHour = parseFloat(config.business_hours_end) || 17;
  const startMinutes = Math.round(startHour * 60);
  const endMinutes = Math.round(endHour * 60);

  // Weekdays only by default
  const workDays = config.work_days || [1, 2, 3, 4, 5];
  if (!workDays.includes(day)) return false;
  if (currentMinutes < startMinutes || currentMinutes >= endMinutes) return false;

  return true;
}

// ─── Load tenant voice config ────────────────────────────────────────
async function getVoiceConfig(toNumber) {
  // Look up tenant by the called number
  const { data, error } = await supabase
    .from('channel_configs')
    .select('*, tenant:tenant_id(id, name)')
    .eq('channel', 'voice')
    .eq('enabled', true);

  if (error || !data || data.length === 0) return null;

  // Match by phone number in config (handles country_code + phone_number or full number)
  const match = data.find(c => {
    const cfg = c.config_encrypted || {};
    const countryCode = cfg.phone_country?.match(/\+\d+/)?.[0] || '+44';
    const localNum = (cfg.phone_number || '').replace(/[\s\-\(\)]/g, '').replace(/^0+/, '');
    if (!localNum) return false; // Skip configs with no phone number
    const fullConfigNumber = `${countryCode}${localNum}`;
    
    const normalizedTo = toNumber.replace(/[\s\-\(\)]/g, '');
    return fullConfigNumber === normalizedTo || 
           normalizedTo.endsWith(localNum.slice(-9)) ||
           normalizedTo.endsWith(fullConfigNumber.slice(-10));
  });

  if (!match) return data[0]; // Fallback to first voice config
  return match;
}

// ─── Main handler ────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml');

  if (req.method !== 'POST') {
    return res.status(405).send(twiml(say('Method not allowed.')));
  }

  const action = req.query.action || 'inbound';
  const body = req.body || {};
  console.log('📞 Voice webhook:', action, 'To:', body.To, 'From:', body.From);

  try {
    switch (action) {

      // ═══════════════════════════════════════════════════════════════
      // INBOUND CALL — Entry point
      // ═══════════════════════════════════════════════════════════════
      case 'inbound': {
        const { CallSid, From, To, CallStatus } = body;

        // Load voice config for this number
        const voiceConfig = await getVoiceConfig(To);
        const config = voiceConfig?.config_encrypted || {};
        const tenantId = voiceConfig?.tenant?.id || voiceConfig?.tenant_id;
        const voice = config.tts_voice || 'Polly.Amy';

        // Log the call
        if (tenantId) {
          try {
            await supabase.from('calls').insert({
              tenant_id: tenantId,
              call_sid: CallSid,
              from_number: From,
              to_number: To,
              direction: 'inbound',
              status: 'ringing',
              started_at: new Date().toISOString(),
            });
          } catch (callLogErr) {
            console.warn('Call log error (non-fatal):', callLogErr.message);
          }
        }

        // Business hours check
        const greeting = config.greeting || 'Thank you for calling. ';
        const afterHoursGreeting = config.after_hours_greeting ||
          'Thank you for calling. Our office is currently closed. Please leave a message after the tone and we will return your call on the next business day.';

        if (!isBusinessHours(config)) {
          // ── After hours → Voicemail ──
          const recordingNotice = config.recording_enabled !== false
            ? 'This call may be recorded for quality purposes. '
            : '';

          return res.send(twiml(
            say(`${recordingNotice}${afterHoursGreeting}`, voice) +
            `<Record maxLength="120" playBeep="true" ` +
            `action="/api/twilio-voice?action=voicemail-complete&tenant=${tenantId}" ` +
            `transcribe="true" ` +
            `transcribeCallback="/api/twilio-voice?action=transcription&tenant=${tenantId}" />` +
            say('We did not receive a message. Goodbye.', voice) +
            '<Hangup/>'
          ));
        }

        // ── During hours → IVR Menu ──
        const departments = config.departments || [
          { digit: '1', name: 'Sales', number: '' },
          { digit: '2', name: 'Support', number: '' },
          { digit: '3', name: 'Bookings', number: '' },
        ];

        const menuOptions = departments
          .filter(d => d.number) // Only show departments with numbers configured
          .map(d => `Press ${d.digit} ${d.description || ('for ' + d.name)}`)
          .join('. ');

        const recordingNotice = config.recording_enabled !== false
          ? 'This call may be recorded for quality purposes. '
          : '';

        const ivrPrompt = `${recordingNotice}${greeting}${menuOptions}. Or stay on the line to leave a message.`;

        return res.send(twiml(
          `<Gather numDigits="1" timeout="8" ` +
          `action="/api/twilio-voice?action=route&tenant=${tenantId}" method="POST">` +
          say(ivrPrompt, voice) +
          `</Gather>` +
          // No input → offer voicemail
          say('We didn\'t receive your selection. Please leave a message after the tone.', voice) +
          `<Record maxLength="120" playBeep="true" ` +
          `action="/api/twilio-voice?action=voicemail-complete&tenant=${tenantId}" ` +
          `transcribe="true" ` +
          `transcribeCallback="/api/twilio-voice?action=transcription&tenant=${tenantId}" />` +
          '<Hangup/>'
        ));
      }

      // ═══════════════════════════════════════════════════════════════
      // ROUTE — IVR digit pressed, route to department
      // ═══════════════════════════════════════════════════════════════
      case 'route': {
        const { Digits, CallSid } = body;
        const tenantId = req.query.tenant;

        // Load config
        const { data: callRow } = await supabase
          .from('calls')
          .select('tenant_id')
          .eq('call_sid', CallSid)
          .single();

        const tId = tenantId || callRow?.tenant_id;
        let config = {};
        if (tId) {
          const { data: vc } = await supabase
            .from('channel_configs')
            .select('config_encrypted')
            .eq('tenant_id', tId)
            .eq('channel', 'voice')
            .single();
          config = vc?.config_encrypted || {};
        }

        const voice = config.tts_voice || 'Polly.Amy';
        const departments = config.departments || [];
        const dept = departments.find(d => d.digit === Digits);

        if (dept && dept.number) {
          // Assemble full E.164 number from country code + local number
          const countryCode = dept.country || '+44';
          const localNum = dept.number.replace(/[\s\-\(\)]/g, '').replace(/^0+/, '');
          const fullNumber = localNum.startsWith('+') ? localNum : `${countryCode}${localNum}`;

          // Update call record
          await supabase.from('calls').update({
            status: 'in-progress',
            intent: `department:${dept.name}`,
            disposition: 'transferred',
          }).eq('call_sid', CallSid);

          // Log the routing
          await supabase.from('call_messages').insert({
            call_id: (await supabase.from('calls').select('id').eq('call_sid', CallSid).single()).data?.id,
            role: 'system',
            content: `Caller pressed ${Digits} — routing to ${dept.name} (${fullNumber})`,
            intent: `route:${dept.name}`,
          });

          return res.send(twiml(
            say(`Connecting you to ${dept.name} now. Please hold.`, voice) +
            `<Dial callerId="${body.To}" timeout="30" ` +
            `action="/api/twilio-voice?action=dial-complete&tenant=${tId}&dept=${encodeURIComponent(dept.name)}">` +
            `<Number>${fullNumber}</Number>` +
            `</Dial>`
          ));
        }

        // Invalid digit
        return res.send(twiml(
          say('Sorry, that is not a valid option. Please try again.', voice) +
          `<Redirect method="POST">/api/twilio-voice?action=inbound</Redirect>`
        ));
      }

      // ═══════════════════════════════════════════════════════════════
      // DIAL-COMPLETE — Nobody answered the transfer
      // ═══════════════════════════════════════════════════════════════
      case 'dial-complete': {
        const { DialCallStatus, CallSid } = body;
        const tenantId = req.query.tenant;
        const deptName = decodeURIComponent(req.query.dept || 'the team');

        let config = {};
        if (tenantId) {
          const { data: vc } = await supabase
            .from('channel_configs')
            .select('config_encrypted')
            .eq('tenant_id', tenantId)
            .eq('channel', 'voice')
            .single();
          config = vc?.config_encrypted || {};
        }
        const voice = config.tts_voice || 'Polly.Amy';

        if (DialCallStatus === 'completed' || DialCallStatus === 'answered') {
          // Call was answered — just end cleanly
          return res.send(twiml('<Hangup/>'));
        }

        // Nobody answered → offer voicemail
        await supabase.from('calls').update({
          disposition: 'voicemail',
        }).eq('call_sid', CallSid);

        return res.send(twiml(
          say(`Sorry, ${deptName} is unavailable right now. Please leave a message after the tone and someone will call you back.`, voice) +
          `<Record maxLength="120" playBeep="true" ` +
          `action="/api/twilio-voice?action=voicemail-complete&tenant=${tenantId}" ` +
          `transcribe="true" ` +
          `transcribeCallback="/api/twilio-voice?action=transcription&tenant=${tenantId}" />` +
          '<Hangup/>'
        ));
      }

      // ═══════════════════════════════════════════════════════════════
      // VOICEMAIL-COMPLETE — Recording finished
      // ═══════════════════════════════════════════════════════════════
      case 'voicemail-complete': {
        const { CallSid, RecordingUrl, RecordingDuration, RecordingSid } = body;
        const tenantId = req.query.tenant;

        // Update call record with recording
        await supabase.from('calls').update({
          recording_url: RecordingUrl ? `${RecordingUrl}.mp3` : null,
          disposition: 'voicemail',
          status: 'completed',
        }).eq('call_sid', CallSid);

        // Log the voicemail
        const { data: callData } = await supabase
          .from('calls')
          .select('id, from_number, to_number, tenant_id')
          .eq('call_sid', CallSid)
          .single();

        if (callData) {
          await supabase.from('call_messages').insert({
            call_id: callData.id,
            role: 'caller',
            content: `[Voicemail — ${RecordingDuration || 0}s] ${RecordingUrl || ''}`,
            intent: 'voicemail',
          });

          // ── Send voicemail notification email ──
          try {
            const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://portal.engwx.com';
            await fetch(`${baseUrl}/api/send-voicemail-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tenant_id: callData.tenant_id || tenantId,
                caller_number: callData.from_number,
                recording_url: RecordingUrl ? `${RecordingUrl}.mp3` : null,
                duration_seconds: parseInt(RecordingDuration) || 0,
                call_sid: CallSid,
              }),
            });
          } catch (emailErr) {
            console.error('Voicemail email error:', emailErr);
          }
        }

        return res.send(twiml(
          say('Thank you for your message. Someone will get back to you shortly. Goodbye.', 'Polly.Amy') +
          '<Hangup/>'
        ));
      }

      // ═══════════════════════════════════════════════════════════════
      // TRANSCRIPTION — Twilio sends transcript asynchronously
      // ═══════════════════════════════════════════════════════════════
      case 'transcription': {
        const { CallSid, TranscriptionText, RecordingSid } = body;
        const tenantId = req.query.tenant;

        if (TranscriptionText) {
          // Update the call with transcript
          await supabase.from('calls').update({
            transcript: TranscriptionText,
          }).eq('call_sid', CallSid);

          // Also update the voicemail message
          const { data: callData } = await supabase
            .from('calls')
            .select('id')
            .eq('call_sid', CallSid)
            .single();

          if (callData) {
            await supabase.from('call_messages').insert({
              call_id: callData.id,
              role: 'system',
              content: `[Transcript] ${TranscriptionText}`,
              intent: 'transcription',
            });

            // Send follow-up email with transcript
            try {
              const { data: callRecord } = await supabase
                .from('calls')
                .select('tenant_id, from_number, recording_url')
                .eq('call_sid', CallSid)
                .single();

              if (callRecord) {
                const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://portal.engwx.com';
                await fetch(`${baseUrl}/api/send-voicemail-email`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    tenant_id: callRecord.tenant_id || tenantId,
                    caller_number: callRecord.from_number,
                    recording_url: callRecord.recording_url,
                    transcript: TranscriptionText,
                    call_sid: CallSid,
                  }),
                });
              }
            } catch (emailErr) {
              console.error('Transcript email error:', emailErr);
            }
          }
        }

        return res.status(200).send('OK');
      }

      // ═══════════════════════════════════════════════════════════════
      // STATUS — Call status callback (ringing, in-progress, completed)
      // ═══════════════════════════════════════════════════════════════
      case 'status': {
        const { CallSid, CallStatus, CallDuration, Timestamp } = body;

        const updates = { status: CallStatus };
        if (CallDuration) updates.duration_seconds = parseInt(CallDuration);
        if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'no-answer' || CallStatus === 'busy') {
          updates.ended_at = new Date().toISOString();
          if (CallStatus === 'no-answer') updates.disposition = 'abandoned';
          if (CallStatus === 'busy') updates.disposition = 'abandoned';
        }

        await supabase.from('calls').update(updates).eq('call_sid', CallSid);

        return res.status(200).send('OK');
      }

      default:
        return res.send(twiml(say('An error occurred. Goodbye.')));
    }

  } catch (err) {
    console.error('Voice webhook error:', err);
    return res.send(twiml(say('We are experiencing technical difficulties. Please try again later. Goodbye.')));
  }
};
