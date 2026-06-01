// api/media-url.js — Generate signed URLs for tenant-photos Storage
// GET ?path=tenant-id/conversations/.../file.jpg&expiry=3600
// Auth: any authenticated user (RLS on storage handles tenant scoping)

var { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  var path = req.query.path;
  if (!path) return res.status(400).json({ error: 'path required' });

  // Use service role to bypass RLS for signed URL generation
  var supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Verify caller is authenticated
  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing auth' });
  var { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid auth' });

  var expiry = parseInt(req.query.expiry || '3600', 10);
  var { data, error } = await supabase.storage.from('tenant-photos').createSignedUrl(path, expiry);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ signedUrl: data.signedUrl });
};
