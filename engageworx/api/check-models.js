// api/check-models.js
// Fetches the live model list from Anthropic API and compares against the
// portal's configured model set. Used by SP Admin → Settings → Modules → AI Models.
//
// GET /api/check-models → { available: [...], configured: [...], missing: [...], new: [...] }

var CONFIGURED_MODELS = [
  { id: 'claude-opus-4-7',   label: 'Claude Opus 4.7',   tier: 'Most Capable' },
  { id: 'claude-opus-4-6',   label: 'Claude Opus 4.6',   tier: 'Most Capable' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6',  tier: 'Recommended' },
  { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',   tier: 'Fast' },
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  try {
    var r = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    var data = await r.json();
    var available = (data.data || []).map(function(m) {
      return { id: m.id, display_name: m.display_name || m.id, created_at: m.created_at };
    });

    var availableIds = new Set(available.map(function(m) { return m.id; }));
    var configuredIds = new Set(CONFIGURED_MODELS.map(function(m) { return m.id; }));

    // Models we reference that Anthropic no longer lists
    var missing = CONFIGURED_MODELS.filter(function(m) { return !availableIds.has(m.id); });
    // Models Anthropic lists that we don't reference yet
    var newModels = available.filter(function(m) { return !configuredIds.has(m.id) && /claude/i.test(m.id); });

    return res.status(200).json({
      configured: CONFIGURED_MODELS,
      available: available.filter(function(m) { return /claude/i.test(m.id); }),
      missing: missing,
      new_models: newModels,
      total_available: available.length,
    });
  } catch (err) {
    console.error('[check-models] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
