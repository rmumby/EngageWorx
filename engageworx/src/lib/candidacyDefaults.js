// Candidacy message defaults — single source of truth.
// Imported by frontend (AIChatbot.js placeholders) and backend (sms.js, candidacy-approve.js fallbacks).
// Empty config fields fall back to these strings. Tenants override by filling in the template field.

var CANDIDACY_DEFAULTS = {
  CANDIDACY_ACK:      'Got your photo \u2014 someone from our team will take a look and follow up with you shortly.',
  CANDIDACY_APPROVE:  'Great news \u2014 you look like a great candidate! Can I get your name so we can get you set up?',
  CANDIDACY_REJECT:   'Thanks for sharing that. Based on what we can see, this may not be the right fit right now \u2014 but we\u2019d be glad to talk through the options with you.',
  CANDIDACY_NAME_ASK: 'Could you share your name so we can get you set up?',
  CANDIDACY_COMPLETE: 'Thanks! Our team will be in touch to get you scheduled.',
};

module.exports = CANDIDACY_DEFAULTS;
