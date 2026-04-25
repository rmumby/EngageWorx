// api/platform-config.js — Public GET for platform_config (plans, industries, platform_name)
// Does NOT expose sensitive fields like email templates or escalation rule defaults

var { getPlatformConfig } = require('./_lib/platform-config');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    var pc = await getPlatformConfig();
    return res.status(200).json({
      platform_name: pc.platform_name,
      portal_url: pc.portal_url,
      support_email: pc.support_email,
      plans: pc.plans || [],
      industries: pc.industries || [],
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
