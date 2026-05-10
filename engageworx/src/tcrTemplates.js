// src/tcrTemplates.js — Approved TCR language templates parameterized by tenant
// Based on EngageWorx reference doc Section 10 (May 2026).
// Every template uses {businessName} as the token — replaced at render time.

export var USE_CASES = [
  { value: 'ACCOUNT_NOTIFICATION', label: 'Account Notifications', desc: 'Alerts about account status, login, password resets, billing.' },
  { value: 'CUSTOMER_CARE', label: 'Customer Care', desc: 'Two-way support conversations initiated by the customer.' },
  { value: 'DELIVERY_NOTIFICATION', label: 'Delivery Notifications', desc: 'Order and shipment status updates.' },
  { value: 'MIXED', label: 'Mixed', desc: 'Multiple use cases. Higher scrutiny — approval may take longer.', warn: true },
  { value: 'MARKETING', label: 'Marketing', desc: 'Promotional messages, offers, sales.' },
  { value: '2FA', label: 'Two-Factor Authentication', desc: 'One-time passcodes for login or transaction verification.' },
  { value: 'SECURITY_ALERT', label: 'Security Alerts', desc: 'Fraud alerts, suspicious activity notifications.' },
  { value: 'POLLING_VOTING', label: 'Polling & Voting', desc: 'Surveys, polls, voting notifications.' },
  { value: 'LOW_VOLUME', label: 'Low Volume', desc: 'Under 6,000 messages/month across all numbers.' },
];

export var VERTICALS = [
  'Agriculture', 'Automotive', 'Banking', 'Construction', 'Consumer Goods',
  'Education', 'Energy', 'Entertainment', 'Financial Services', 'Food & Beverage',
  'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Legal',
  'Manufacturing', 'Media', 'Non-Profit', 'Professional Services', 'Real Estate',
  'Retail', 'Technology', 'Telecommunications', 'Transportation', 'Other',
];

export var ENTITY_TYPES = [
  { value: 'PRIVATE_PROFIT', label: 'Private / For-Profit' },
  { value: 'PUBLIC_PROFIT', label: 'Public (Stock Symbol required)' },
  { value: 'NON_PROFIT', label: 'Non-Profit' },
  { value: 'GOVERNMENT', label: 'Government' },
  { value: 'SOLE_PROPRIETOR', label: 'Sole Proprietor' },
];

export function sampleMessages(businessName) {
  var bn = businessName || '[Your Business]';
  return [
    bn + ': Your account has been updated. If you did not make this change, please contact us immediately. Reply HELP for help or STOP to opt out.',
    bn + ': Your payment of $49.99 has been processed successfully. Thank you for your continued service. Reply HELP for help or STOP to opt out.',
    bn + ': Your verification code is 482910. This code expires in 10 minutes. Do not share it with anyone.',
    bn + ': Hi! Just a reminder that your appointment is scheduled for tomorrow at 2:00 PM. Reply YES to confirm or HELP for assistance. Reply STOP to opt out.',
    bn + ': Your monthly statement is ready. Log in to your account to view details. Reply HELP for help or STOP to opt out.',
  ];
}

export function optInConfirmation(businessName) {
  var bn = businessName || '[Your Business]';
  return 'You have opted in to receive SMS messages from ' + bn + '. Msg frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to opt out.';
}

export function helpMessage(businessName) {
  var bn = businessName || '[Your Business]';
  return bn + ': For help, visit our website or contact support. Reply STOP to opt out of messages.';
}

export function stopMessage(businessName) {
  return 'You have been successfully unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe.';
}

export var URL_KEYWORDS = {
  consent: ['STOP', 'HELP', 'Msg & data rates', 'opt'],
  privacy: ['privacy', 'data', 'information'],
  smsTerms: ['STOP', 'HELP', 'message', 'SMS'],
  terms: ['terms', 'conditions', 'agreement'],
};
