// /api/twilio-voice.js — Vercel Serverless Function
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
);

function twiml(body) {
  return '<?xml version="1.0" encoding="UTF-8"?><Response>' + body + '</Response>';
}

function say(text, voice) {
  voice = voice || 'Polly.Joanna';
  var cleanVoice = 'Polly.Joanna';
  if (voice && typeof voice === 'string') {
    var m = voice.match(/Polly\.\w+/);
    if (m) cleanVoice = m[0];
  }
  return '<Say voice="' + cleanVoice + '">' + escapeXml(String(text || '')) + '</Say>';
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function isBusinessHours(config) {
  var tz = config.timezone || 'Europe/London';
  var now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  var day = now.getDay();
  var currentMinutes = now.getHours() * 60 + now.getMinutes();
  var today = now.toISOString().split('T')[0];
  var overrides = config.hours_overrides || [];
  var todayOverride = overrides.find(function(o) { return o.date === today; });
  if (todayOverride) {
    if (todayOverride.closed) return false;
    return currentMinutes >= (parseInt(todayOverride.open) || 0) * 60 && currentMinutes < (parseInt(todayOverride.close) || 0) * 60;
  }
  var startMinutes = Math.round((parseFloat(config.business_hours_start) || 9) * 60);
  var endMinutes = Math.round((parseFloat(config.business_hours_end) || 17) * 60);
  var workDays = config.work_days || [1, 2, 3, 4, 5];
  if (!workDays.includes(day)) return false;
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

async function getVoiceConfig(toNumber) {
  var result = await supabase.from('channel_configs').select('*, tenant:tenant_id(id, name)').eq('channel', 'voice').eq('enabled', true);
  if (result.error || !result.data || result.data.length === 0) return null;
  var match = result.data.find(function(c) {
    var cfg = c.config_encrypted || {};
    var countryCode = (cfg.phone_country || '').match(/\+\d+/);
    countryCode = countryCode ? countryCode[0] : '+44';
    var localNum = (cfg.phone_number || '').replace(/[\s\-\(\)]/g, '').replace(/^0+/, '');
    if (!localNum) return false;
    var fullConfigNumber = countryCode + localNum;
    var normalizedTo = toNumber.replace(/[\s\-\(\)]/g, '');
    return fullConfigNumber === normalizedTo || normalizedTo.endsWith(localNum.slice(-9)) || normalizedTo.endsWith(fullConfigNumber.slice(-10));
  });
  return match || null; // Never fall back to another tenant's config
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');

  if (req.method !== 'POST') {
    return res.status(200).end(twiml('<Say>Method not allowed.</Say>'));
  }

  var action = req.query.action || 'inbound';
  var body = req.body || {};
  console.log('📞 Voice webhook:', action, 'To:', body.To, 'From:', body.From);

  try {

    // ═══════════════════════════════════════════════════════════════
    // INBOUND — Entry point for all calls
    // ═══════════════════════════════════════════════════════════════
    if (action === 'inbound') {
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

      console.log('📞 INBOUND config:', JSON.stringify({ tenantId: tenantId, hasConfig: !!voiceConfig, isOpen: isBusinessHours(config) }));

      // No config found — safe fallback voicemail
      if (!voiceConfig) {
        return res.status(200).end(twiml(
          say('Thank you for calling EngageWorx. Please leave a message after the tone and we will get back to you shortly.', 'Polly.Joanna') +
          '<Record maxLength="120" playBeep="true" action="/api/twilio-voice?action=voicemail-complete&amp;tenant=c1bc59a8-5235-4921-9755-02514b574387" transcribe="true" transcribeCallback="/api/twilio-voice?action=transcription&amp;tenant=c1bc59a8-5235-4921-9755-02514b574387" />' +
          '<Hangup/>'
        ));
      }

      var voice = 'Polly.Joanna';
      if (config.tts_voice) {
        var vm = String(config.tts_voice).match(/Polly\.\w+/);
        if (vm) voice = vm[0];
      }

      // Log the call
      if (tenantId) {
        try {
          await supabase.from('calls').insert({
            tenant_id: tenantId, call_sid: body.CallSid, from_number: body.From,
            to_number: body.To, direction: 'inbound', status: 'ringing', started_at: new Date().toISOString(),
          });
        } catch (e) { console.warn('Call log error:', e.message); }
      }

      var greeting = config.greeting || 'Thank you for calling.';
      var afterHoursGreeting = config.after_hours_greeting || 'Thank you for calling. We are currently closed. Please leave a message after the tone and we will get back to you as soon as possible.';
      var recordingNotice = config.recording_enabled !== 'Disabled' ? 'This call may be recorded for quality purposes. ' : '';

      // After hours → voicemail
      if (!isBusinessHours(config)) {
        return res.status(200).end(twiml(
          say(recordingNotice + afterHoursGreeting, voice) +
          '<Record maxLength="120" playBeep="true" ' +
          'action="/api/twilio-voice?action=voicemail-complete&amp;tenant=' + (tenantId || '') + '" ' +
          'transcribe="true" ' +
          'transcribeCallback="/api/twilio-voice?action=transcription&amp;tenant=' + (tenantId || '') + '" />' +
          say('We did not receive a message. Goodbye.', voice) +
          '<Hangup/>'
        ));
      }

      // During hours → IVR
      var departments = config.departments || [
        { digit: '1', name: 'Sales', number: '', description: 'for sales enquiries' },
        { digit: '2', name: 'Support', number: '', description: 'for support' },
      ];
      var menuOptions = departments.map(function(d) {
        return 'Press ' + d.digit + ' ' + (d.description || 'for ' + d.name);
      }).join('. ');
      var ivrPrompt = recordingNotice + greeting + ' ' + menuOptions + '. Or stay on the line to leave a message.';

      return res.status(200).end(twiml(
        '<Gather numDigits="1" timeout="8" action="/api/twilio-voice?action=route&amp;tenant=' + (tenantId || '') + '" method="POST">' +
        say(ivrPrompt, voice) +
        '</Gather>' +
        say('We did not receive your selection. Please leave a message after the tone.', voice) +
        '<Record maxLength="120" playBeep="true" ' +
        'action="/api/twilio-voice?action=voicemail-complete&amp;tenant=' + (tenantId || '') + '" ' +
        'transcribe="true" ' +
        'transcribeCallback="/api/twilio-voice?action=transcription&amp;tenant=' + (tenantId || '') + '" />' +
        '<Hangup/>'
      ));
    }

    // ═══════════════════════════════════════════════════════════════
    // ROUTE — IVR digit pressed
    // ═══════════════════════════════════════════════════════════════
    if (action === 'route') {
      var digits = body.Digits;
      var callSid = body.CallSid;
      var routeTenantId = req.query.tenant;
      var routeConfig = {};
      if (routeTenantId) {
        var vc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', routeTenantId).eq('channel', 'voice').single();
        routeConfig = (vc.data && vc.data.config_encrypted) ? vc.data.config_encrypted : {};
      }
      var routeVoice = 'Polly.Joanna';
      if (routeConfig.tts_voice) { var rvm = String(routeConfig.tts_voice).match(/Polly\.\w+/); if (rvm) routeVoice = rvm[0]; }
      var depts = routeConfig.departments || [];
      var dept = depts.find(function(d) { return d.digit === digits; });

      if (dept && dept.number) {
        var countryCode = dept.country || '+44';
        var localNum = dept.number.replace(/[\s\-\(\)]/g, '').replace(/^0+/, '');
        var fullNumber = localNum.startsWith('+') ? localNum : countryCode + localNum;
        await supabase.from('calls').update({ status: 'in-progress', disposition: 'transferred' }).eq('call_sid', callSid);
        return res.status(200).end(twiml(
          say('Connecting you to ' + dept.name + ' now. Please hold.', routeVoice) +
          '<Dial callerId="' + escapeXml(body.To || '') + '" timeout="30" action="/api/twilio-voice?action=dial-complete&amp;tenant=' + (routeTenantId || '') + '&amp;dept=' + encodeURIComponent(dept.name) + '">' +
          '<Number>' + escapeXml(fullNumber) + '</Number>' +
          '</Dial>'
        ));
      }

      // No number configured or invalid digit → voicemail
      return res.status(200).end(twiml(
        say('We were unable to connect your call. Please leave a message after the tone.', routeVoice) +
        '<Record maxLength="120" playBeep="true" action="/api/twilio-voice?action=voicemail-complete&amp;tenant=' + (routeTenantId || '') + '" transcribe="true" transcribeCallback="/api/twilio-voice?action=transcription&amp;tenant=' + (routeTenantId || '') + '" />' +
        '<Hangup/>'
      ));
    }

    // ═══════════════════════════════════════════════════════════════
    // DIAL-COMPLETE — Transfer result
    // ═══════════════════════════════════════════════════════════════
    if (action === 'dial-complete') {
      var dialStatus = body.DialCallStatus;
      var dialCallSid = body.CallSid;
      var dialTenantId = req.query.tenant;
      var deptName = decodeURIComponent(req.query.dept || 'the team');
      var dialConfig = {};
      if (dialTenantId) {
        var dvc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', dialTenantId).eq('channel', 'voice').single();
        dialConfig = (dvc.data && dvc.data.config_encrypted) ? dvc.data.config_encrypted : {};
      }
      var dialVoice = 'Polly.Joanna';
      if (dialConfig.tts_voice) { var dvm = String(dialConfig.tts_voice).match(/Polly\.\w+/); if (dvm) dialVoice = dvm[0]; }

      if (dialStatus === 'completed' || dialStatus === 'answered') {
        return res.status(200).end(twiml('<Hangup/>'));
      }
      await supabase.from('calls').update({ disposition: 'voicemail' }).eq('call_sid', dialCallSid);
      return res.status(200).end(twiml(
        say('Sorry, ' + deptName + ' is unavailable right now. Please leave a message after the tone and someone will call you back.', dialVoice) +
        '<Record maxLength="120" playBeep="true" action="/api/twilio-voice?action=voicemail-complete&amp;tenant=' + (dialTenantId || '') + '" transcribe="true" transcribeCallback="/api/twilio-voice?action=transcription&amp;tenant=' + (dialTenantId || '') + '" />' +
        '<Hangup/>'
      ));
    }

    // ═══════════════════════════════════════════════════════════════
    // VOICEMAIL-COMPLETE — Recording finished
    // ═══════════════════════════════════════════════════════════════
    if (action === 'voicemail-complete') {
      var vmCallSid = body.CallSid;
      var vmRecordingUrl = body.RecordingUrl;
      var vmRecordingDuration = body.RecordingDuration;
      var vmTenantId = req.query.tenant;
      console.log('📞 Voicemail complete:', vmCallSid, 'duration:', vmRecordingDuration);

      try {
        await supabase.from('calls').update({
          recording_url: vmRecordingUrl ? (vmRecordingUrl + '.mp3') : null,
          disposition: 'voicemail', status: 'completed',
        }).eq('call_sid', vmCallSid);
      } catch (e) { console.warn('Call update error:', e.message); }

      try {
        var vmEmail = 'rob@engwx.com';
        var sendVmEmail = true;
        if (vmTenantId) {
          var vmVc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', vmTenantId).eq('channel', 'voice').single();
          if (vmVc.data && vmVc.data.config_encrypted) {
            if (vmVc.data.config_encrypted.voicemail_email) vmEmail = vmVc.data.config_encrypted.voicemail_email;
            if (vmVc.data.config_encrypted.send_transcript_email === 'Disabled') sendVmEmail = false;
          }
        }
        var RESEND_KEY = process.env.RESEND_API_KEY;
        if (RESEND_KEY && sendVmEmail) {
          var callerNum = body.From || 'Unknown';
          var vmDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
          var vmDur = vmRecordingDuration ? (Math.floor(vmRecordingDuration / 60) + 'm ' + (vmRecordingDuration % 60) + 's') : 'Unknown';
          var vmHtml = '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9fafb"><div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb"><h1 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px">New Voice Message</h1><p style="color:#6b7280;font-size:14px;margin:0 0 24px">EngageWorx Voice System</p><div style="background:#f3f4f6;border-radius:8px;padding:20px;margin-bottom:24px"><p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Caller:</strong> ' + callerNum + '</p><p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Date:</strong> ' + vmDate + '</p><p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Duration:</strong> ' + vmDur + '</p></div>';
          if (vmRecordingUrl) vmHtml += '<div style="margin-bottom:24px"><a href="' + vmRecordingUrl + '.mp3" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Listen to Recording</a></div>';
          vmHtml += '<div style="border-top:1px solid #e5e7eb;padding-top:16px"><p style="color:#9ca3af;font-size:12px;margin:0">EngageWorx Voice | <a href="https://portal.engwx.com" style="color:#2563eb;text-decoration:none">Log in to portal</a></p></div></div></div>';
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'EngageWorx <hello@engwx.com>', to: [vmEmail], subject: 'New voice message from ' + callerNum, html: vmHtml }),
          });
          console.log('📧 Voicemail email sent to', vmEmail);
        }
      } catch (emailErr) { console.error('Voicemail email error:', emailErr.message); }

      return res.status(200).end(twiml(
        say('Thank you for your message. Someone will get back to you shortly. Goodbye.', 'Polly.Joanna') +
        '<Hangup/>'
      ));
    }

    // ═══════════════════════════════════════════════════════════════
    // TRANSCRIPTION — Twilio sends transcript asynchronously
    // ═══════════════════════════════════════════════════════════════
    if (action === 'transcription') {
      var txCallSid = body.CallSid;
      var txText = body.TranscriptionText;
      var txTenantId = req.query.tenant;
      console.log('📞 Transcription received for', txCallSid, ':', (txText || '').substring(0, 50));

      if (txText) {
        try { await supabase.from('calls').update({ transcript: txText }).eq('call_sid', txCallSid); } catch (e) {}

        try {
          var txEmail = 'rob@engwx.com';
          var sendTxEmail = true;
          if (txTenantId) {
            var txVc = await supabase.from('channel_configs').select('config_encrypted').eq('tenant_id', txTenantId).eq('channel', 'voice').single();
            if (txVc.data && txVc.data.config_encrypted) {
              if (txVc.data.config_encrypted.voicemail_email) txEmail = txVc.data.config_encrypted.voicemail_email;
              if (txVc.data.config_encrypted.send_transcript_email === 'Disabled') sendTxEmail = false;
            }
          }
          var txCallerNum = body.From || 'Unknown';
          try {
            var txCall = await supabase.from('calls').select('from_number, recording_url').eq('call_sid', txCallSid).single();
            if (txCall.data) txCallerNum = txCall.data.from_number || txCallerNum;
          } catch (e) {}

          var TX_KEY = process.env.RESEND_API_KEY;
          if (TX_KEY && sendTxEmail) {
            var txDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' });
            var txHtml = '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f9fafb"><div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb"><h1 style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px">Voice Call Transcript</h1><p style="color:#6b7280;font-size:14px;margin:0 0 24px">EngageWorx Voice System</p><div style="background:#f3f4f6;border-radius:8px;padding:20px;margin-bottom:24px"><p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Caller:</strong> ' + txCallerNum + '</p><p style="margin:6px 0;color:#6b7280;font-size:14px"><strong>Date:</strong> ' + txDate + '</p></div><div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:24px"><p style="color:#92400e;font-size:14px;line-height:1.6;margin:0">' + escapeXml(txText) + '</p></div><div style="border-top:1px solid #e5e7eb;padding-top:16px"><p style="color:#9ca3af;font-size:12px;margin:0">EngageWorx Voice | <a href="https://portal.engwx.com" style="color:#2563eb;text-decoration:none">Log in to portal</a></p></div></div></div>';
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + TX_KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({ from: 'EngageWorx <hello@engwx.com>', to: [txEmail], subject: 'Voice call transcript from ' + txCallerNum, html: txHtml }),
            });
            console.log('📧 Transcript email sent to', txEmail);
          }
        } catch (emailErr) { console.error('Transcript email error:', emailErr.message); }
      }
      return res.status(200).end(twiml('<Response/>'));
    }

    // ═══════════════════════════════════════════════════════════════
    // STATUS — Call status callback
    // ═══════════════════════════════════════════════════════════════
    if (action === 'status') {
      var statusCallSid = body.CallSid;
      var callStatus = body.CallStatus;
      var updates = { status: callStatus };
      if (body.CallDuration) updates.duration_seconds = parseInt(body.CallDuration);
      if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'no-answer' || callStatus === 'busy') {
        updates.ended_at = new Date().toISOString();
        if (callStatus === 'no-answer' || callStatus === 'busy') updates.disposition = 'abandoned';
      }
      try { await supabase.from('calls').update(updates).eq('call_sid', statusCallSid); } catch (e) {}
      return res.status(200).end(twiml('<Response/>'));
    }

    // Default
    return res.status(200).end(twiml(say('Thank you for calling EngageWorx. Goodbye.', 'Polly.Joanna') + '<Hangup/>'));

  } catch (err) {
    console.error('Voice webhook error:', err.message, err.stack);
    return res.status(200).end(twiml(
      say('We are experiencing technical difficulties. Please try again later. Goodbye.', 'Polly.Joanna') + '<Hangup/>'
    ));
  }
};
