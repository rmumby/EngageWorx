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
  return '<?xml version="1.0" encoding="UTF-8"?><Response>' + body + '</Response>';
}

function say(text, voice = 'Polly.Amy') {
  // Sanitize voice name - extract just "Polly.Name" from any format
  var cleanVoice = 'Polly.Amy';
  if (voice && typeof voice === 'string') {
    var match = voice.match(/Polly\.\w+/);
    if (match) cleanVoice = match[0];
  }
  return '<Say voice="' + cleanVoice + '">' + escapeXml(text) + '</Say>';
}

function escapeXml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
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
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(200).end('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Method not allowed.</Say></Response>');
  }

  var action = req.query.action || 'inbound';
  var body = req.body || {};
  console.log('📞 Voice webhook:', action, 'To:', body.To, 'From:', body.From);

  // Helper to build safe XML strings
  function xml(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  if (action === 'inbound') {
    // Look up voice config for this number
    var voiceConfig = null;
    var config = {};
    var tenantId = null;
    try {
      voiceConfig = await getVoiceConfig(body.To || '');
      config = voiceConfig ? (voiceConfig.config_encrypted || {}) : {};
      tenantId = voiceConfig ? (voiceConfig.tenant_id || (voiceConfig.tenant ? voiceConfig.tenant.id : null)) : null;
    } catch (e) {
      console.warn('Voice config lookup error:', e.message);
    }

    // Extract voice setting - sanitize to just Polly.Name
    var voice = 'Polly.Joanna';
    if (config.tts_voice) {
      var voiceMatch = String(config.tts_voice).match(/Polly\.\w+/);
      if (voiceMatch) voice = voiceMatch[0];
    }

    var greeting = xml(config.greeting || 'Thank you for calling. ');
    var departments = config.departments || [];
    
    // Build IVR menu text
    var menuParts = [];
    for (var i = 0; i < departments.length; i++) {
      var dept = departments[i];
      if (dept.description) {
        menuParts.push('Press ' + dept.digit + ' ' + xml(dept.description));
      } else if (dept.name) {
        menuParts.push('Press ' + dept.digit + ' for ' + xml(dept.name));
      }
    }
    var menuText = menuParts.join('. ');
    if (menuText) menuText = menuText + '. ';

    // Log the call
    if (tenantId) {
      try {
        await supabase.from('calls').insert({
          tenant_id: tenantId,
          call_sid: body.CallSid,
          from_number: body.From,
          to_number: body.To,
          direction: 'inbound',
          status: 'ringing',
          started_at: new Date().toISOString(),
        });
      } catch (e) { console.warn('Call log error:', e.message); }
    }

    // Build TwiML
    var twimlStr = '<?xml version="1.0" encoding="UTF-8"?><Response>';
    
    if (menuText) {
      // IVR menu
      twimlStr += '<Gather numDigits="1" timeout="8" action="/api/twilio-voice?action=route&amp;tenant=' + (tenantId || '') + '" method="POST">';
      twimlStr += '<Say voice="' + voice + '">This call may be recorded for quality purposes. ' + greeting + menuText + 'Or stay on the line to leave a message.</Say>';
      twimlStr += '</Gather>';
    } else {
      twimlStr += '<Say voice="' + voice + '">This call may be recorded for quality purposes. ' + greeting + '</Say>';
    }
    
    // Fallback to voicemail
    twimlStr += '<Say voice="' + voice + '">Please leave a message after the tone.</Say>';
    twimlStr += '<Record maxLength="120" playBeep="true" action="/api/twilio-voice?action=voicemail-complete&amp;tenant=' + (tenantId || '') + '" transcribe="true" transcribeCallback="/api/twilio-voice?action=transcription&amp;tenant=' + (tenantId || '') + '" />';
    twimlStr += '<Say voice="' + voice + '">Goodbye.</Say><Hangup/></Response>';

    return res.status(200).end(twimlStr);
  }

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

          return res.status(200).end(twiml(
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
          // Show all departments
          .map(d => `Press ${d.digit} ${d.description || ('for ' + d.name)}`)
          .join('. ');

        const recordingNotice = config.recording_enabled !== false
          ? 'This call may be recorded for quality purposes. '
          : '';

        const ivrPrompt = `${recordingNotice}${greeting}${menuOptions}. Or stay on the line to leave a message.`;

        return res.status(200).end(twiml(
          `<Gather numDigits="1" timeout="8" ` +
          `action="/api/twilio-voice?action=route&tenant=${tenantId}" method="POST">` +
          say(ivrPrompt, voice) +
          `</Gather>` +
          // No input → offer voicemail
          say('We did not receive your selection. Please leave a message after the tone.', voice) +
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

          return res.status(200).end(twiml(
            say(`Connecting you to ${dept.name} now. Please hold.`, voice) +
            `<Dial callerId="${body.To}" timeout="30" ` +
            `action="/api/twilio-voice?action=dial-complete&tenant=${tId}&dept=${encodeURIComponent(dept.name)}">` +
            `<Number>${fullNumber}</Number>` +
            `</Dial>`
          ));
        }

        // Invalid digit
        return res.status(200).end(twiml(
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
          return res.status(200).end(twiml('<Hangup/>'));
        }

        // Nobody answered → offer voicemail
        await supabase.from('calls').update({
          disposition: 'voicemail',
        }).eq('call_sid', CallSid);

        return res.status(200).end(twiml(
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
        var vmCallSid = body.CallSid;
        var vmRecordingUrl = body.RecordingUrl;
        var vmRecordingDuration = body.RecordingDuration;
        var vmTenantId = req.query.tenant;
        console.log('📞 Voicemail complete:', vmCallSid, 'duration:', vmRecordingDuration);

        // Update call record
        try {
          await supabase.from('calls').update({
            recording_url: vmRecordingUrl ? (vmRecordingUrl + '.mp3') : null,
            disposition: 'voicemail',
            status: 'completed',
          }).eq('call_sid', vmCallSid);
        } catch (e) { console.warn('Call update error:', e.message); }

        // Send voicemail email directly via Resend
        try {
          var vmEmail = 'rob@engwx.com';
          // Look up voicemail email from config
          if (vmTenantId) {
            var vcResult = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', vmTenantId).eq('channel', 'voice').single();
            if (vcResult.data && vcResult.data.config_encrypted && vcResult.data.config_encrypted.voicemail_email) {
              vmEmail = vcResult.data.config_encrypted.voicemail_email;
            }
          }

          var RESEND_KEY = process.env.RESEND_API_KEY;
          if (RESEND_KEY) {
            var callerNum = body.From || 'Unknown';
            var vmDate = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' });
            var vmDur = vmRecordingDuration ? (Math.floor(vmRecordingDuration / 60) + 'm ' + (vmRecordingDuration % 60) + 's') : 'Unknown';
            var vmHtml = '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9fafb">'
              + '<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">'
              + '<h1 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px">New Voicemail</h1>'
              + '<p style="color:#6b7280;font-size:14px;margin:0 0 24px">EngageWorx Voice</p>'
              + '<div style="background:#f3f4f6;border-radius:8px;padding:20px;margin-bottom:24px">'
              + '<p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Caller:</strong> ' + callerNum + '</p>'
              + '<p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Date:</strong> ' + vmDate + '</p>'
              + '<p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Duration:</strong> ' + vmDur + '</p>'
              + '</div>';
            if (vmRecordingUrl) {
              vmHtml += '<div style="margin-bottom:24px"><a href="' + vmRecordingUrl + '.mp3" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Listen to Recording</a></div>';
            }
            vmHtml += '<div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px"><p style="color:#9ca3af;font-size:12px;margin:0">EngageWorx Voice | <a href="https://portal.engwx.com" style="color:#2563eb;text-decoration:none">Log in to portal</a></p></div></div></div>';

            var vmEmailRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'EngageWorx Voicemail <voicemail@engwx.com>',
                to: [vmEmail],
                subject: 'New voicemail from ' + callerNum,
                html: vmHtml,
              }),
            });
            var vmEmailResult = await vmEmailRes.json();
            console.log('📧 Voicemail email sent to ' + vmEmail + ':', JSON.stringify(vmEmailResult));
          } else {
            console.warn('RESEND_API_KEY not configured');
          }
        } catch (emailErr) {
          console.error('Voicemail email error:', emailErr.message);
        }

        return res.status(200).end('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Thank you for your message. Someone will get back to you shortly. Goodbye.</Say><Hangup/></Response>');
      }

      // ═══════════════════════════════════════════════════════════════
      // TRANSCRIPTION — Twilio sends transcript asynchronously
      // ═══════════════════════════════════════════════════════════════
      case 'transcription': {
        var txCallSid = body.CallSid;
        var txText = body.TranscriptionText;
        var txTenantId = req.query.tenant;
        console.log('📞 Transcription received for', txCallSid, ':', (txText || '').substring(0, 50));

        if (txText) {
          // Update call with transcript
          try {
            await supabase.from('calls').update({ transcript: txText }).eq('call_sid', txCallSid);
          } catch (e) { console.warn('Transcript update error:', e.message); }

          // Send transcript email via Resend
          try {
            var txEmail = 'rob@engwx.com';
            var txCallerNum = body.From || 'Unknown';
            
            // Look up voicemail email and caller number from config/calls
            if (txTenantId) {
              try {
                var txVcResult = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', txTenantId).eq('channel', 'voice').single();
                if (txVcResult.data && txVcResult.data.config_encrypted && txVcResult.data.config_encrypted.voicemail_email) {
                  txEmail = txVcResult.data.config_encrypted.voicemail_email;
                }
              } catch (e) { /* use default */ }
            }
            
            // Get caller number from calls table
            try {
              var txCallResult = await supabase.from('calls').select('from_number, recording_url').eq('call_sid', txCallSid).single();
              if (txCallResult.data) {
                txCallerNum = txCallResult.data.from_number || txCallerNum;
              }
            } catch (e) { /* use body.From */ }

            var TX_RESEND_KEY = process.env.RESEND_API_KEY;
            if (TX_RESEND_KEY) {
              var txDate = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' });
              var txHtml = '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9fafb">'
                + '<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">'
                + '<h1 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px">Voicemail Transcript</h1>'
                + '<p style="color:#6b7280;font-size:14px;margin:0 0 24px">EngageWorx Voice</p>'
                + '<div style="background:#f3f4f6;border-radius:8px;padding:20px;margin-bottom:24px">'
                + '<p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Caller:</strong> ' + txCallerNum + '</p>'
                + '<p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Date:</strong> ' + txDate + '</p>'
                + '</div>'
                + '<div style="margin-bottom:24px">'
                + '<h2 style="font-size:14px;font-weight:700;color:#111827;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Transcript</h2>'
                + '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px">'
                + '<p style="color:#92400e;font-size:14px;line-height:1.6;margin:0">' + txText + '</p>'
                + '</div></div>';
              if (txCallResult && txCallResult.data && txCallResult.data.recording_url) {
                txHtml += '<div style="margin-bottom:24px"><a href="' + txCallResult.data.recording_url + '" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Listen to Recording</a></div>';
              }
              txHtml += '<div style="border-top:1px solid #e5e7eb;padding-top:16px;margin-top:8px"><p style="color:#9ca3af;font-size:12px;margin:0">EngageWorx Voice | <a href="https://portal.engwx.com" style="color:#2563eb;text-decoration:none">Log in to portal</a></p></div></div></div>';

              var txEmailRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + TX_RESEND_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: 'EngageWorx Voicemail <voicemail@engwx.com>',
                  to: [txEmail],
                  subject: 'Voicemail transcript from ' + txCallerNum,
                  html: txHtml,
                }),
              });
              var txEmailResult = await txEmailRes.json();
              console.log('📧 Transcript email sent to ' + txEmail + ':', JSON.stringify(txEmailResult));
            }
          } catch (emailErr) {
            console.error('Transcript email error:', emailErr.message);
          }
        }

        return res.status(200).end('OK');
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

        return res.status(200).end('OK');
      }

      default:
        return res.status(200).end('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">An error occurred. Goodbye.</Say><Hangup/></Response>');
    }

  } catch (err) {
    console.error('Voice webhook error:', err);
    return res.status(200).end('<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">We are experiencing technical difficulties. Please try again later. Goodbye.</Say><Hangup/></Response>');
  }
};
