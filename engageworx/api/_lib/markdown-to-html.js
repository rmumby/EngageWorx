// api/_lib/markdown-to-html.js — Convert AI-generated Markdown text to clean HTML
// Handles: **bold**, *italic*, bullet lists (- item / • item), paragraph breaks.
// Returns HTML string with <p>, <strong>, <em>, <ul>/<li> tags.
// Does NOT wrap in an outer <div> — caller provides their own wrapper styling.

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

module.exports = { markdownToHtml: markdownToHtml };
