// src/lib/markdownToHtml.js — Client-side markdown → sanitized HTML
// Mirrors api/_lib/markdown-to-html.js (same conversion logic).
// Sanitization via DOMPurify — real DOM-based, not regex.
// NOTE: Two converters exist (this + api/_lib/markdown-to-html.js) — keep in sync.

var DOMPurify = require('dompurify');

// Convert AI-generated markdown to HTML
// Handles: **bold**, *italic*, bullet lists (- item / • item), paragraph breaks.
// Safe no-op on plain text (wraps in <p>, no other changes).
function markdownToHtml(text) {
  if (!text) return '';
  var mdLines = text.split('\n');
  var htmlLines = [];
  var inList = false;
  for (var li = 0; li < mdLines.length; li++) {
    var line = mdLines[li].replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    var bulletMatch = line.match(/^[-•]\s+(.+)$/);
    if (bulletMatch) {
      if (!inList) { htmlLines.push('<ul style="margin:4px 0 8px;padding-left:20px;">'); inList = true; }
      htmlLines.push('<li style="margin:0 0 2px;">' + bulletMatch[1] + '</li>');
    } else {
      if (inList) { htmlLines.push('</ul>'); inList = false; }
      htmlLines.push(line);
    }
  }
  if (inList) htmlLines.push('</ul>');

  var joined = htmlLines.join('\n');
  var paragraphs = joined.split(/\n\n+/).filter(function(p) { return p.trim(); });
  return paragraphs.map(function(p) {
    p = p.trim();
    if (p.indexOf('<ul') !== -1) return p;
    return '<p style="margin:0 0 10px;">' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

// DOMPurify-based sanitizer.
// Two configs: tight (markdown output — no style needed) and permissive (inbound email HTML).
var MD_PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'strong', 'em', 'b', 'i', 'ul', 'li', 'br'],
  ALLOWED_ATTR: [],
};

var EMAIL_PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'br', 'a', 'span', 'div', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'img', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'hr', 'pre', 'code'],
  ALLOWED_ATTR: ['style', 'href', 'src', 'alt', 'width', 'height', 'align', 'valign', 'colspan', 'rowspan', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
};

// Sanitize markdown-converted HTML (tight — no style attribute, no links)
function sanitizeHtml(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, MD_PURIFY_CONFIG);
}

// Sanitize inbound email HTML (permissive — preserves layout for display)
function sanitizeEmailHtml(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, EMAIL_PURIFY_CONFIG);
}

module.exports = { markdownToHtml: markdownToHtml, sanitizeHtml: sanitizeHtml, sanitizeEmailHtml: sanitizeEmailHtml };
