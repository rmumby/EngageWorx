module.exports = function handler(req, res) {
  var gmailVars = {
    GMAIL_SMTP_USER: process.env.GMAIL_SMTP_USER ? 'SET:' + process.env.GMAIL_SMTP_USER.substring(0, 5) : 'NOT SET',
    GMAIL_SMTP_PASS: process.env.GMAIL_SMTP_PASS ? 'SET (len=' + process.env.GMAIL_SMTP_PASS.length + ')' : 'NOT SET',
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ? 'SET' : 'NOT SET',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'SET' : 'NOT SET',
    total_env_keys: Object.keys(process.env).length,
  };
  res.json(gmailVars);
};
