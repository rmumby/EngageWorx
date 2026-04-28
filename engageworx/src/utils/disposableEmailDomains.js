// Starter list of common disposable email providers.
// Replace with full list from disposable-email-domains repo.
const DISPOSABLE_DOMAINS = new Set([
  'mailnow.io',
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  'yopmail.com',
  '10minutemail.com',
  '10minutemail.net',
  'throwawaymail.com',
  'getnada.com',
  'maildrop.cc',
  'sharklasers.com',
  'trashmail.com',
  'fakeinbox.com',
  'mintemail.com',
  'spambox.us',
  'dispostable.com',
  'mohmal.com',
  'emailondeck.com',
  'mailcatch.com',
  'inboxbear.com',
  'mailpoof.com',
  'tempinbox.com',
  'spamgourmet.com',
  'incognitomail.com',
  'mvrht.com',
  'tempmailo.com',
]);

export function isDisposableEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}

export function getEmailDomain(email) {
  return email?.split('@')[1]?.toLowerCase().trim() || null;
}
