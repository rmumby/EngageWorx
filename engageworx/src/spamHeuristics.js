// Pattern: name + 4+ digits at end. Classic auto-generated bot pattern.
// Examples: glauciamaria514, jaquelinesouza199813, victorisraelmartinezperez19
const BOT_EMAIL_PATTERN = /^[a-z]{4,}\d{2,}@/i;

// Suspicious local-part length (very long alphanumeric strings)
const LONG_ALPHA_PATTERN = /^[a-z]{20,}@/i;

// Generic role-style with random digits
const GENERIC_DIGITS_PATTERN = /^(operaciones|admin|user|test|info|contact|sales|support)[a-z]*\d{2,}@/i;

export function getEmailSpamFlags(email) {
  const flags = [];
  if (!email) return flags;

  const local = email.split('@')[0];
  if (!local) return flags;

  if (BOT_EMAIL_PATTERN.test(email)) flags.push('email_name_plus_digits');
  if (LONG_ALPHA_PATTERN.test(email)) flags.push('email_long_alpha');
  if (GENERIC_DIGITS_PATTERN.test(email)) flags.push('email_role_plus_digits');

  return flags;
}

export function getNameSpamFlags(name) {
  const flags = [];
  if (!name || typeof name !== 'string') {
    flags.push('name_missing');
    return flags;
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) flags.push('name_too_short');
  if (/^[a-z]+$/i.test(trimmed) && trimmed.length < 4) flags.push('name_too_short');
  if (/^\W+$/.test(trimmed)) flags.push('name_no_letters');
  if (/(.)\1{4,}/.test(trimmed)) flags.push('name_repeated_chars'); // aaaaaa
  return flags;
}

export function getBusinessNameSpamFlags(businessName) {
  const flags = [];
  if (!businessName || typeof businessName !== 'string') {
    flags.push('business_name_missing');
    return flags;
  }
  const trimmed = businessName.trim();
  if (trimmed.length < 2) flags.push('business_name_too_short');
  if (/^[a-z]+$/i.test(trimmed) && trimmed.length < 3) flags.push('business_name_too_short');
  return flags;
}

// Composite: returns array of all flags. Empty array = clean.
export function getAllSpamFlags({ email, name, businessName }) {
  return [
    ...getEmailSpamFlags(email),
    ...getNameSpamFlags(name),
    ...getBusinessNameSpamFlags(businessName),
  ];
}
