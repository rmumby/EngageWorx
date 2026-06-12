// api/_lib/set-password-link.js
// Shared onboarding primitive for invite-tenant and invite-member.
//
// Ensures the auth user exists (email pre-confirmed, with an unguessable random secret the
// recipient NEVER sees), then mints a single-use recovery link that lands on the portal's
// /auth/callback set-password form (AuthCallback.jsx detects type=recovery and shows the
// password form). No plaintext password is ever emailed, returned, or displayed in the UI.
//
// White-label aware: the link's redirect host comes from the caller's resolved portal_url
// (CSP override or platform default). That host MUST be in the auth provider's allowed
// Redirect URLs or the link will fail on click — keep new white-label portal domains
// allow-listed when they are onboarded.

var crypto = require('crypto');

// Internal-only secret so the account is never password-less between createUser and the
// recipient setting their own password via the recovery link. Satisfies the min-length
// policy with mixed character classes; it is discarded and never surfaced anywhere.
function randomSecret() {
  return crypto.randomBytes(24).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) + 'Aa1!';
}

// Resolve the /auth/callback target for the recovery redirect from the resolved portal_url.
function callbackUrl(portalUrl) {
  var base = (portalUrl || process.env.PORTAL_URL || 'https://portal.engwx.com').replace(/\/+$/, '');
  return base + '/auth/callback';
}

// Ensures an auth user for `email` and returns a fresh set-password (recovery) link.
// opts: { email, portal_url, user_id?, user_metadata? }
// Returns { user_id, action_link, created, error }.
async function ensureUserWithSetPasswordLink(supabase, opts) {
  var email = (opts.email || '').trim().toLowerCase();
  if (!email) return { user_id: null, action_link: null, created: false, error: 'email required' };
  var redirectTo = callbackUrl(opts.portal_url);
  var userId = opts.user_id || null;
  var created = false;

  // 1. Ensure an email-confirmed auth user exists.
  if (!userId) {
    var createRes = await supabase.auth.admin.createUser({
      email: email,
      password: randomSecret(),
      email_confirm: true,
      user_metadata: opts.user_metadata || {},
    });
    if (createRes.error) {
      // Likely already in auth but without a profile row — resolve the id.
      var listRes = await supabase.auth.admin.listUsers();
      if (listRes.data && listRes.data.users) {
        var found = listRes.data.users.find(function (u) { return u.email && u.email.toLowerCase() === email; });
        if (found) userId = found.id;
      }
      if (userId && opts.user_metadata) {
        await supabase.auth.admin.updateUserById(userId, { email_confirm: true, user_metadata: opts.user_metadata });
      }
    } else {
      userId = createRes.data.user.id;
      created = true;
    }
  } else if (opts.user_metadata) {
    await supabase.auth.admin.updateUserById(userId, { email_confirm: true, user_metadata: opts.user_metadata });
  }

  if (!userId) return { user_id: null, action_link: null, created: false, error: 'could not resolve auth user' };

  // 2. Mint the set-password (recovery) link — generated, not auto-sent; we send it ourselves
  //    via the branded platform email.
  var linkRes = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: email,
    options: { redirectTo: redirectTo },
  });
  if (linkRes.error) return { user_id: userId, action_link: null, created: created, error: linkRes.error.message };
  var props = (linkRes.data && linkRes.data.properties) || {};
  return { user_id: userId, action_link: props.action_link || null, created: created, error: null };
}

// Code-side branded "set your password" email — used by invite-member and the resend
// endpoint when no tenant-configured template is present. The tenant-onboarding path uses
// the richer config-driven welcome_email_html_template instead.
function setPasswordEmailHtml(vars) {
  var tenantName = vars.tenant_name || vars.platform_name || 'your account';
  var greetingName = vars.first_name || 'there';
  var roleLine = vars.role
    ? 'You\'ve been added as <strong>' + vars.role + '</strong> on ' + tenantName + '.'
    : 'Your ' + tenantName + ' account is ready.';
  return '<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;">' +
    '<h2 style="color:#1e293b;margin:0 0 16px;">Welcome to ' + tenantName + '</h2>' +
    '<p style="color:#475569;font-size:15px;line-height:1.6;">Hi ' + greetingName + ',</p>' +
    '<p style="color:#475569;font-size:15px;line-height:1.6;">' + roleLine +
    ' Set your password using the secure link below to access your account.</p>' +
    '<div style="text-align:center;margin:24px 0;">' +
    '<a href="' + vars.set_password_link + '" style="display:inline-block;background:linear-gradient(135deg,#00C9FF,#E040FB);color:#000;font-weight:800;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;">Set Your Password</a>' +
    '</div>' +
    '<p style="color:#94a3b8;font-size:13px;line-height:1.6;">This is a single-use secure link. If it expires before you use it, ask your administrator to resend it. Once set, sign in any time at ' +
    '<a href="' + (vars.portal_url || 'https://portal.engwx.com') + '" style="color:#00C9FF;">' + (vars.portal_url || 'https://portal.engwx.com') + '</a>.</p>' +
    '</div>';
}

module.exports = {
  ensureUserWithSetPasswordLink: ensureUserWithSetPasswordLink,
  callbackUrl: callbackUrl,
  setPasswordEmailHtml: setPasswordEmailHtml,
};
