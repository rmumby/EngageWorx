// src/lib/statusChip.js
// Single source of truth for status-pill legibility. Each status maps to a color FAMILY; every family
// has a light + dark variant = tinted background + a saturated, readable text shade from the same hue.
// Replaces the per-component hardcoded chip color maps (no more grey-on-grey).
//
//   import { statusChipStyle } from '../lib/statusChip';
//   var s = statusChipStyle(status, isDark);   // -> { background, color, border }
//   <span style={{ ...s, borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>…</span>

var FAMILIES = {
  // hue:        { light: [bg, text],            dark: [bg, text] }
  purple:  { light: ['#EFE9FB', '#6B3FA0'], dark: ['rgba(168,85,247,0.22)', '#D7C3FA'] },
  amber:   { light: ['#FEF3E2', '#B45309'], dark: ['rgba(245,158,11,0.22)', '#FCD9A0'] },
  green:   { light: ['#E6F4EA', '#1E7E48'], dark: ['rgba(34,197,94,0.22)',  '#A7E8C0'] },
  red:     { light: ['#FCE8E8', '#B42318'], dark: ['rgba(239,68,68,0.22)',  '#F3B4B4'] },
  blue:    { light: ['#E6F0FB', '#1D4ED8'], dark: ['rgba(59,130,246,0.22)', '#A9C8F5'] },
  neutral: { light: ['#EEF1F4', '#475467'], dark: ['rgba(148,163,184,0.22)','#C3CCD8'] },
};

// Status → family. Lowercased + non-alphanumerics normalized so 'pending_agent', 'draft_pending_review',
// 'IN_PROGRESS' etc. all resolve. Unknown statuses fall back to neutral.
var STATUS_FAMILY = {
  draft: 'purple',
  pending: 'amber', pending_agent: 'amber', pending_review: 'amber', draft_pending_review: 'amber',
  pending_upstream: 'amber', in_progress: 'blue', submitted: 'blue', info: 'blue',
  active: 'green', agent_active: 'blue', approved: 'green', verified: 'green', connected: 'green',
  live: 'green', published: 'green', resolved: 'green', success: 'green', done: 'green',
  rejected: 'red', failed: 'red', suspended: 'red', error: 'red', disconnected: 'red', blocked: 'red',
  closed: 'neutral', expired: 'neutral', unknown: 'neutral', disabled: 'neutral', pending_general: 'neutral',
};

export function statusChipStyle(status, isDark) {
  var key = String(status == null ? '' : status).toLowerCase().trim();
  var family = STATUS_FAMILY[key] || 'neutral';
  var pair = FAMILIES[family][isDark ? 'dark' : 'light'];
  return {
    background: pair[0],
    color: pair[1],
    border: '1px solid ' + pair[0],
  };
}

export default statusChipStyle;
