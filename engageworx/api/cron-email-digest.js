// api/cron-email-digest.js — RETIRED (2026-05-13)
// Daily AI Omni Digest email replaced by Action Board.
// No-op handler kept so legacy callers get 200 instead of 404.

module.exports = async function handler(req, res) {
  return res.status(200).json({
    success: true,
    retired: true,
    reason: 'AI Omni Digest email sunset 2026-05-13 — use Action Board',
  });
};
