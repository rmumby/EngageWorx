// api/gmail-oauth-start.js — Initiate Google OAuth for Gmail Drafts integration
// POST { } (JWT required)
// Returns { url } — redirect user to this URL to start OAuth

var { createClient } = require('@supabase/supabase-js');
var crypto = require('crypto');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
  if (!jwt) return res.status(401).json({ error: 'Authentication required' });

  var supabase = getSupabase();
  var { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !userData || !userData.user) return res.status(401).json({ error: 'Invalid token' });
  var userId = userData.user.id;

  var clientId = process.env.GOOGLE_CLIENT_ID;
  var redirectUri = process.env.GOOGLE_REDIRECT_URI || (process.env.PORTAL_BASE_URL || 'https://portal.engwx.com') + '/api/gmail-oauth-callback';
  if (!clientId) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID not configured' });

  // CSRF state token: ties callback to this user's session
  var statePayload = JSON.stringify({ userId: userId, nonce: crypto.randomBytes(16).toString('hex'), ts: Date.now() });
  var stateToken = Buffer.from(statePayload).toString('base64url');

  // Store state temporarily for callback verification (5 min TTL)
  await supabase.from('user_gmail_tokens').upsert({
    user_id: userId,
    refresh_token: '__pending_oauth__',
    access_token: stateToken,
    email_address: '__pending__',
    token_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  }, { onConflict: 'user_id' });

  var scope = 'https://www.googleapis.com/auth/gmail.modify';
  var authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scope,
    access_type: 'offline',
    prompt: 'consent',
    state: stateToken,
  }).toString();

  return res.status(200).json({ url: authUrl });
};
