// src/tcrTemplates.js — Approved TCR language templates parameterized by tenant
// Based on EngageWorx reference doc Section 10 (May 2026).
// Every template uses {businessName} as the token — replaced at render time.

export var USE_CASES = [
  { value: 'ACCOUNT_NOTIFICATION', label: 'Account Notifications', desc: 'Alerts about account status, login, password resets, billing.' },
  { value: 'CHARITY', label: 'Charity / Non-Profit', desc: 'Charitable and non-profit messaging campaigns.' },
  { value: 'CUSTOMER_CARE', label: 'Customer Care', desc: 'Two-way support conversations initiated by the customer.' },
  { value: 'DELIVERY_NOTIFICATION', label: 'Delivery Notifications', desc: 'Order and shipment status updates.' },
  { value: 'EMERGENCY', label: 'Emergency', desc: 'Emergency and public safety notifications.' },
  { value: 'HIGHER_EDUCATION', label: 'Higher Education', desc: 'University and college student notifications.' },
  { value: 'LOW_VOLUME', label: 'Low Volume', desc: 'Under 6,000 messages/month across all numbers.' },
  { value: 'MARKETING', label: 'Marketing', desc: 'Promotional messages, offers, sales.' },
  { value: 'MIXED', label: 'Mixed', desc: 'Multiple use cases. Higher scrutiny — approval may take longer.', warn: true },
  { value: 'POLITICAL', label: 'Political', desc: 'Political campaign and election messaging.' },
  { value: 'POLLING_VOTING', label: 'Polling & Voting', desc: 'Surveys, polls, voting notifications.' },
  { value: 'PUBLIC_SERVICE_ANNOUNCEMENT', label: 'Public Service Announcement', desc: 'Government and public safety announcements.' },
  { value: 'SECURITY_ALERT', label: 'Security Alerts', desc: 'Fraud alerts, suspicious activity notifications.' },
  { value: 'SOCIAL', label: 'Social', desc: 'Social networking and community notifications.' },
  { value: 'TWO_FACTOR_AUTHENTICATION', label: 'Two-Factor Authentication', desc: 'One-time passcodes for login or transaction verification.' },
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

export function optInDescription(businessName) {
  var bn = businessName || '[Your Business]';
  return 'EXAMPLE: Visit [your-website]/sms-signup, enter your phone number, and check the box to consent to receive SMS messages from ' + bn + '. Messages will include account notifications, billing updates, and service alerts. Reply STOP to opt out at any time.';
}

export function campaignDescription(businessName) {
  var bn = businessName || '[Your Business]';
  return 'EXAMPLE: ' + bn + ' sends account notifications to opted-in customers, including billing updates, security alerts, and service maintenance notices. Messages are transactional and not promotional. Customers opt-in via our signup form at [your-website]/sms-signup and can opt out by replying STOP.';
}

export function sampleMessages(businessName) {
  var bn = businessName || '[Your Business]';
  return [
    bn + ': Your appointment is confirmed for [date] at [time]. Reply STOP to opt out. Msg & data rates may apply.',
    bn + ': Reminder — your appointment is tomorrow at [time]. Reply HELP for help or STOP to opt out.',
    bn + ': Order #[number] has shipped. Track at [link]. Reply STOP to opt out.',
    bn + ': Your account statement is ready. View at [link]. Reply HELP for help or STOP to opt out.',
    bn + ': Security alert — new login from [location] at [time]. Visit [link] if not you. Reply STOP to opt out.',
  ];
}

export function optInConfirmation(businessName) {
  var bn = businessName || '[Your Business]';
  return bn + ': You\'re now subscribed to notifications. Reply HELP for help or STOP to opt out. Msg & data rates may apply.';
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
