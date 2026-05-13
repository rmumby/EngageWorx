// api/cron-digest-scheduled.js — RETIRED (2026-05-13)
// Scheduled email_actions execution replaced by Action Board send path
// (api/action-items/send.js). No-op handler kept for legacy callers.

module.exports = async function handler(req, res) {
  return res.status(200).json({
    success: true,
    retired: true,
    reason: 'Digest scheduled actions sunset 2026-05-13 — use Action Board',
  });
};
