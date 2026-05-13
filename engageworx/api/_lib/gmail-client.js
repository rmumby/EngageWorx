// api/_lib/gmail-client.js — Authenticated Gmail API wrapper per user
// Resolves tokens from user_gmail_tokens, refreshes if expired.

async function getGmailClient(supabase, userId) {
  if (!userId) throw new Error('userId required for Gmail client');

  var { data: tokens } = await supabase.from('user_gmail_tokens')
    .select('access_token, refresh_token, token_expires_at, email_address')
    .eq('user_id', userId)
    .maybeSingle();

  if (!tokens || !tokens.refresh_token || tokens.refresh_token === '__pending_oauth__') {
    throw new Error('Gmail not connected. Connect your Gmail account in Settings.');
  }

  var accessToken = tokens.access_token;
  var isExpired = !tokens.token_expires_at || new Date(tokens.token_expires_at) < new Date(Date.now() + 60000);

  // Refresh if expired or expiring within 60s
  if (isExpired) {
    var clientId = process.env.GOOGLE_CLIENT_ID;
    var clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured');

    var refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }).toString(),
    });

    var refreshData = await refreshRes.json();
    if (!refreshRes.ok || !refreshData.access_token) {
      // Refresh failed — token may be revoked
      console.error('[gmail-client] Token refresh failed:', refreshData);
      throw new Error('Gmail connection expired. Please reconnect in Settings.');
    }

    accessToken = refreshData.access_token;
    var expiresAt = refreshData.expires_in
      ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
      : null;

    // Persist refreshed token
    await supabase.from('user_gmail_tokens').update({
      access_token: accessToken,
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
  }

  // Return a simple API wrapper
  return {
    accessToken: accessToken,
    emailAddress: tokens.email_address,
    fetch: function(path, opts) {
      opts = opts || {};
      opts.headers = Object.assign({ 'Authorization': 'Bearer ' + accessToken }, opts.headers || {});
      return fetch('https://www.googleapis.com/gmail/v1/users/me' + path, opts);
    },
  };
}

module.exports = { getGmailClient: getGmailClient };
