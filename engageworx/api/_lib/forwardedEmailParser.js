// api/_lib/forwardedEmailParser.js — Extract original sender from forwarded emails
// Handles: X-Forwarded-For headers, Gmail/Outlook/Apple forwarded-message body patterns

var FORWARDED_MARKERS = [
  '---------- Forwarded message ----------',
  '---------- Forwarded message ---------',
  'Begin forwarded message:',
  '-----Original Message-----',
  '---- Original Message ----',
  '-----Ursprüngliche Nachricht-----',
];

// Matches "From: Name <email>" or "From: email" in a forwarded block
var FROM_LINE_RE = /^From:\s*(?:([^<\n]+?)\s*<([^>]+)>|([^\s<>@]+@[^\s<>]+))/im;
var SUBJECT_LINE_RE = /^Subject:\s*(.+)/im;

function parseForwardedEmail(body, headers, fromHeader) {
  var result = {
    originalSenderEmail: null,
    originalSenderName: null,
    originalSubject: null,
    cleanedBody: body || '',
    forwardedBy: null,
    wasForwarded: false,
  };

  if (!body && !headers) return result;

  // Parse the from header for the forwarder identity
  var forwarderEmail = null;
  var forwarderName = null;
  if (fromHeader) {
    var fm = fromHeader.match(/^([^<]+)<([^>]+)>/);
    if (fm) { forwarderName = fm[1].trim(); forwarderEmail = fm[2].trim().toLowerCase(); }
    else { forwarderEmail = fromHeader.trim().toLowerCase(); }
  }

  // ── Step 1: Check headers for original sender ───────────────────────────
  var parsedHeaders = {};
  if (typeof headers === 'string') {
    try { parsedHeaders = JSON.parse(headers); } catch (e) {
      // Parse raw header string
      headers.split('\n').forEach(function(line) {
        var m = line.match(/^([^:]+):\s*(.+)/);
        if (m) parsedHeaders[m[1].trim().toLowerCase()] = m[2].trim();
      });
    }
  } else if (headers && typeof headers === 'object') {
    parsedHeaders = headers;
  }

  // Normalize header keys to lowercase
  var normalizedHeaders = {};
  Object.keys(parsedHeaders).forEach(function(k) { normalizedHeaders[k.toLowerCase()] = parsedHeaders[k]; });

  var headerOriginal = normalizedHeaders['x-forwarded-for']
    || normalizedHeaders['x-original-from']
    || normalizedHeaders['x-original-sender'];

  if (headerOriginal) {
    var hm = headerOriginal.match(/([^<\s]+@[^>\s]+)/);
    if (hm) {
      result.originalSenderEmail = hm[1].toLowerCase();
      var nm = headerOriginal.match(/^([^<]+)</);
      if (nm) result.originalSenderName = nm[1].trim();
      result.wasForwarded = true;
      result.forwardedBy = { email: forwarderEmail, name: forwarderName };
      result.cleanedBody = body || '';
      return result;
    }
  }

  // ── Step 2: Parse body for forwarded-message patterns ───────────────────
  var bodyText = body || '';

  for (var i = 0; i < FORWARDED_MARKERS.length; i++) {
    var markerIdx = bodyText.indexOf(FORWARDED_MARKERS[i]);
    if (markerIdx === -1) continue;

    result.wasForwarded = true;
    result.forwardedBy = { email: forwarderEmail, name: forwarderName };

    // Content after the marker
    var afterMarker = bodyText.substring(markerIdx + FORWARDED_MARKERS[i].length);

    // Extract From line
    var fromMatch = FROM_LINE_RE.exec(afterMarker);
    if (fromMatch) {
      if (fromMatch[2]) {
        result.originalSenderName = fromMatch[1].trim();
        result.originalSenderEmail = fromMatch[2].trim().toLowerCase();
      } else if (fromMatch[3]) {
        result.originalSenderEmail = fromMatch[3].trim().toLowerCase();
      }
    }

    // Extract Subject line
    var subjMatch = SUBJECT_LINE_RE.exec(afterMarker);
    if (subjMatch) {
      result.originalSubject = subjMatch[1].trim().replace(/^(Fwd?|FW):\s*/i, '');
    }

    // Cleaned body: content below the forwarded metadata block
    // Find the blank line after the header block (From/Date/Subject/To lines)
    var lines = afterMarker.split('\n');
    var contentStart = 0;
    var seenFrom = false;
    for (var j = 0; j < lines.length && j < 20; j++) {
      var line = lines[j].trim();
      if (/^(From|Date|Subject|To|Cc|Sent|Reply-To):/i.test(line)) { seenFrom = true; continue; }
      if (seenFrom && line === '') { contentStart = j + 1; break; }
      if (seenFrom && !/^(From|Date|Subject|To|Cc|Sent|Reply-To):/i.test(line)) { contentStart = j; break; }
    }
    result.cleanedBody = lines.slice(contentStart).join('\n').trim();
    return result;
  }

  // ── Step 3: Check for Outlook inline forward pattern ────────────────────
  // "From: Name\nSent: Date\nTo: ...\nSubject: ..."
  var outlookMatch = bodyText.match(/^From:\s*(.+)\nSent:\s*.+\nTo:\s*.+\nSubject:\s*(.+)/im);
  if (outlookMatch) {
    result.wasForwarded = true;
    result.forwardedBy = { email: forwarderEmail, name: forwarderName };
    var outlookFrom = outlookMatch[1].trim();
    var ofm = outlookFrom.match(/([^<\s]+@[^>\s]+)/);
    if (ofm) result.originalSenderEmail = ofm[1].toLowerCase();
    var onm = outlookFrom.match(/^([^<]+)</);
    if (onm) result.originalSenderName = onm[1].trim();
    else if (!ofm) result.originalSenderName = outlookFrom;
    result.originalSubject = outlookMatch[2].trim().replace(/^(Fwd?|FW):\s*/i, '');

    var outlookIdx = bodyText.indexOf(outlookMatch[0]);
    var afterBlock = bodyText.substring(outlookIdx + outlookMatch[0].length);
    var blankLine = afterBlock.indexOf('\n\n');
    result.cleanedBody = (blankLine > -1 ? afterBlock.substring(blankLine + 2) : afterBlock).trim();
    return result;
  }

  // ── Step 4: No forwarded pattern detected — treat as direct email ──────
  result.originalSenderEmail = forwarderEmail;
  result.originalSenderName = forwarderName;
  result.cleanedBody = bodyText;

  return result;
}

// Strip Fwd:/FW: prefix from subject
function cleanSubject(subject) {
  if (!subject) return '';
  return subject.replace(/^(Fwd?|FW):\s*/i, '').trim();
}

module.exports = { parseForwardedEmail, cleanSubject };
