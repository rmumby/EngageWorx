// src/wedding/freeze.js
//
// Pure freeze-state computation. No side effects, no DB calls.
//
// Per wedding-portal-brief.md §5: freeze state is computed, never stored as a
// flag. The `weddings.freeze_date` column is the materialised value of
// (wedding_date - venue.freeze_weeks_before) and used for query-time speed,
// but the *state* — open / warning / frozen — is always derived live.
//
// Per the demo HTML (delamere-portal-v4-demo.html, line ~640):
//   - 'open'    : more than 14 days before freeze date
//   - 'warning' : 14 days or fewer before freeze, but not yet frozen
//   - 'frozen'  : on or after the freeze date

const MS_PER_DAY = 86_400_000;

/**
 * Parse a date value as local (not UTC).
 * 'YYYY-MM-DD' strings parsed via split to avoid UTC-midnight shift.
 * Date objects passed through unchanged.
 */
export function toLocalDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  var s = String(d);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  return new Date(d);
}

/**
 * @param {Date | string} weddingDate     - 'YYYY-MM-DD' or Date
 * @param {Date | string} freezeDate      - 'YYYY-MM-DD' or Date
 * @param {Date}          [now=new Date()] - injectable for testing
 * @returns {{ state: 'open'|'warning'|'frozen', daysToWedding: number, daysToFreeze: number }}
 */
export function computeFreezeState(weddingDate, freezeDate, now = new Date()) {
  const wedding = toLocalDate(weddingDate);
  const freeze = toLocalDate(freezeDate);

  const daysToWedding = Math.ceil((wedding - now) / MS_PER_DAY);
  const daysToFreeze = Math.ceil((freeze - now) / MS_PER_DAY);

  const isFrozen = now >= freeze;
  const isWarning = !isFrozen && daysToFreeze <= 14;

  const state = isFrozen ? 'frozen' : isWarning ? 'warning' : 'open';

  return { state, daysToWedding, daysToFreeze };
}

/** UK date format: "27 May 2026" */
export function formatGBDate(d, opts = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!d) return '';
  return toLocalDate(d).toLocaleDateString('en-GB', opts);
}

/** UK date format short: "15 March" */
export function formatGBDateShort(d) {
  return formatGBDate(d, { day: 'numeric', month: 'long' });
}
