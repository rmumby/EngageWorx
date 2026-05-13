// api/gmail-oauth-callback.js — Handle Google OAuth callback for Gmail Drafts
// GET ?code=...&state=... (redirected from Google)
// Exchanges code for tokens, stores in user_gmail_tokens, redirects to portal

var { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('GET only');

  var code = req.query.code;
  var state = req.query.state;
  var error = req.query.error;
  var portalBase = process.env.PORTAL_BASE_URL || 'https://portal.engwx.com';

  if (error) {
    console.warn('[gmail-oauth-callback] OAuth error:', error);
    return res.redirect(portalBase + '/?gmail_connect=error&reason=' + encodeURIComponent(error));
  }

  if (!code || !state) {
    return res.redirect(portalBase + '/?gmail_connect=error&reason=missing_params');
  }

  // Verify state token — find the pending row
  var supabase = getSupabase();
  var statePayload;
  try {
    statePayload = JSON.parse(Buffer.from(state, 'base64url').toString());
  } catch (e) {
    return res.redirect(portalBase + '/?gmail_connect=error&reason=invalid_state');
  }

  var userId = statePayload.userId;
  if (!userId) return res.redirect(portalBase + '/?gmail_connect=error&reason=invalid_state');

  // Verify state matches what we stored
  var { data: pending } = await supabase.from('user_gmail_tokens')
    .select('access_token, token_expires_at')
    .eq('user_id', userId)
    .eq('refresh_token', '__pending_oauth__')
    .maybeSingle();

  if (!pending || pending.access_token !== state) {
    return res.redirect(portalBase + '/?gmail_connect=error&reason=state_mismatch');
  }

  // Check TTL (5 min)
  if (pending.token_expires_at && new Date(pending.token_expires_at) < new Date()) {
    await supabase.from('user_gmail_tokens').delete().eq('user_id', userId);
    return res.redirect(portalBase + '/?gmail_connect=error&reason=expired');
  }

  // Exchange code for tokens
  var clientId = process.env.GOOGLE_CLIENT_ID;
  var clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  var redirectUri = process.env.GOOGLE_REDIRECT_URI || portalBase + '/api/gmail-oauth-callback';

  try {
    var tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    var tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.refresh_token) {
      console.error('[gmail-oauth-callback] Token exchange failed:', tokenData);
      return res.redirect(portalBase + '/?gmail_connect=error&reason=token_exchange_failed');
    }

    // Get user's email address from Google userinfo
    var emailAddress = '';
    try {
      var profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
        headers: { 'Authorization': 'Bearer ' + tokenData.access_token },
      });
      var profileData = await profileRes.json();
      emailAddress = profileData.emailAddress || '';
    } catch (e) { console.warn('[gmail-oauth-callback] Profile fetch error:', e.message); }

    // Store tokens
    var expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    await supabase.from('user_gmail_tokens').upsert({
      user_id: userId,
      refresh_token: tokenData.refresh_token,
      access_token: tokenData.access_token,
      token_expires_at: expiresAt,
      email_address: emailAddress,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    console.log('[gmail-oauth-callback] Gmail connected for user:', userId, 'email:', emailAddress);
    return res.redirect(portalBase + '/?gmail_connect=success&email=' + encodeURIComponent(emailAddress));

  } catch (e) {
    console.error('[gmail-oauth-callback] Error:', e.message);
    return res.redirect(portalBase + '/?gmail_connect=error&reason=server_error');
  }
};
