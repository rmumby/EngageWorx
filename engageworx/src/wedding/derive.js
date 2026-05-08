// src/wedding/derive.js
//
// Pure helpers that derive UI content from wedding data. No side effects.
//
// The demo HTML hardcodes the To Do list and Key Milestones. In real life
// these come from the underlying state of the plan, suppliers, menu, and
// seating. Centralising the derivation here keeps the component dumb.

import { formatGBDate } from './freeze';

/**
 * Derive the To Do list shown on the dashboard.
 *
 * Each task has: { id, label, status: 'done' | 'open' | 'urgent', due }
 * Order: done first (matches demo), then open/urgent.
 *
 * Heuristics for v1 — refine as we learn what couples actually want to see:
 *   - Registrar set       → done
 *   - All suppliers conf. → done
 *   - Menu submitted (≥3) → done                  (≈ all 3 courses chosen)
 *   - First dance song    → urgent if missing
 *   - Sparkler timing     → open if not pinned
 *   - Seating plan        → "always open" pill
 */
export function deriveTasks({ plan, suppliers = [], menuChoices = [], seating = {} }) {
  const ceremony = plan?.ceremony || {};
  const evening = plan?.evening || {};

  const supplierTotal = suppliers.length;
  const supplierConfirmed = suppliers.filter((s) => s.status === 'confirmed').length;
  const allSuppliersConfirmed = supplierTotal > 0 && supplierConfirmed === supplierTotal;

  const menuSubmitted = menuChoices.length >= 3; // 3 courses

  const firstDanceSet = !!(evening.first_dance && evening.first_dance.trim());
  const sparklerPinned =
    !!(evening.sparkler_time && !/tbc|tbd/i.test(evening.sparkler_time));

  const tasks = [];

  // Done
  if (ceremony.registrar) {
    tasks.push({
      id: 'registrar',
      label: `Confirm registrar — ${ceremony.registrar}`,
      status: 'done',
      due: 'Done',
    });
  }
  if (allSuppliersConfirmed) {
    tasks.push({
      id: 'suppliers',
      label: 'All suppliers confirmed',
      status: 'done',
      due: 'Done',
    });
  }
  if (menuSubmitted) {
    tasks.push({
      id: 'menu',
      label: 'Menu choices submitted',
      status: 'done',
      due: 'Done',
    });
  }

  // Open / urgent
  if (!firstDanceSet) {
    tasks.push({
      id: 'first-dance',
      label: 'Finalise first dance song',
      status: 'urgent',
      due: 'Needed',
    });
  }
  if (!sparklerPinned) {
    tasks.push({
      id: 'sparkler',
      label: 'Confirm sparkler send-off timing',
      status: 'open',
      due: 'Open',
    });
  }
  // Seating is always open per brief §5
  tasks.push({
    id: 'seating',
    label: 'Complete seating plan',
    status: 'open',
    due: 'Always open',
  });

  return tasks;
}

/**
 * Derive Key Milestones for the dashboard timeline.
 *
 * Returns an array of:
 *   { id, label, detail, dateLabel, kind: 'done' | 'pending' | 'upcoming' }
 *
 * Mirrors the demo's six milestones. Dates and details come from data.
 */
export function deriveMilestones({ wedding, plan, suppliers = [], menuChoices = [], freezeState }) {
  const guests = plan?.guests || {};
  const supplierTotal = suppliers.length;
  const supplierConfirmed = suppliers.filter((s) => s.status === 'confirmed').length;
  const allSuppliersConfirmed = supplierTotal > 0 && supplierConfirmed === supplierTotal;

  const menuCourses = menuChoices.map((m) => m.item_name || m.name).filter(Boolean);
  const menuSummary = menuCourses.length ? menuCourses.join(' · ') : null;

  const weddingDay = wedding?.wedding_date ? new Date(wedding.wedding_date) : null;
  const checkInDay = weddingDay
    ? new Date(weddingDay.getTime() - 2 * 86_400_000)
    : null;

  const milestones = [];

  // Always shown as done if the wedding row exists
  milestones.push({
    id: 'venue-booked',
    label: 'Venue Booking Confirmed',
    detail: wedding?.tenant?.name || 'Venue',
    dateLabel: 'Completed',
    kind: 'done',
  });

  if (allSuppliersConfirmed) {
    milestones.push({
      id: 'suppliers-booked',
      label: 'All Suppliers Booked',
      detail: `${supplierConfirmed} confirmed supplier${supplierConfirmed === 1 ? '' : 's'}`,
      dateLabel: 'Completed',
      kind: 'done',
    });
  } else if (supplierTotal > 0) {
    milestones.push({
      id: 'suppliers-booked',
      label: 'Suppliers Being Booked',
      detail: `${supplierConfirmed} of ${supplierTotal} confirmed`,
      dateLabel: 'In progress',
      kind: 'pending',
    });
  }

  if (menuSummary) {
    milestones.push({
      id: 'menu-confirmed',
      label: 'Menu Confirmed',
      detail: menuSummary,
      dateLabel: 'Completed',
      kind: 'done',
    });
  }

  if (wedding?.freeze_date) {
    const isFrozen = freezeState === 'frozen';
    milestones.push({
      id: 'freeze',
      label: isFrozen ? '🔒 Change Freeze Active' : '⏳ 6-Week Change Freeze',
      detail: 'Major changes require approval after this date',
      dateLabel: formatGBDate(wedding.freeze_date),
      kind: isFrozen ? 'done' : 'pending',
    });
  }

  if (checkInDay) {
    milestones.push({
      id: 'check-in',
      label: 'Pre-Wedding Check-In',
      detail: 'Suite available from 3:00 PM',
      dateLabel: formatGBDate(checkInDay),
      kind: 'upcoming',
    });
  }

  if (weddingDay) {
    const colourScheme = guests.colour_scheme;
    milestones.push({
      id: 'wedding-day',
      label: 'Wedding Day 💐',
      detail: colourScheme
        ? `Ceremony 2:00 PM · Colour: ${colourScheme.toLowerCase()}`
        : 'Ceremony 2:00 PM',
      dateLabel: formatGBDate(weddingDay),
      kind: 'upcoming',
    });
  }

  return milestones;
}

/**
 * Title-case a ceremony type stored as 'civil' → 'Civil Ceremony'.
 * Falls through any free-text values unchanged.
 */
export function formatCeremonyType(raw) {
  if (!raw) return '';
  const map = {
    civil: 'Civil Ceremony',
    religious: 'Religious Ceremony',
    humanist: 'Humanist Ceremony',
    symbolic: 'Symbolic Ceremony',
  };
  const key = String(raw).toLowerCase();
  return map[key] || raw;
}
