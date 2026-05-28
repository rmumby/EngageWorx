// api/_lib/seed-demo-tenant.js — Populate a demo tenant with synthetic data
// Called from create-sandbox.js / csp.js when is_demo=true, or standalone via scripts/.
// Every row tagged source='demo_seed' (or metadata.seed='demo_seed') for idempotent teardown.
// Uses service-role client. Explicit tenant_id on every row.

var { createClient } = require('@supabase/supabase-js');

var DEMO_TAG = 'demo_seed';

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Date helpers — spread data across ~30 days
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }
function hoursAgo(n) { return new Date(Date.now() - n * 3600000).toISOString(); }

async function seedDemoTenant(tenantId, supabaseOverride) {
  var supabase = supabaseOverride || getSupabase();

  // Idempotency: check if already seeded
  var { count } = await supabase.from('leads').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('source', DEMO_TAG);
  if (count > 0) {
    console.log('[seedDemoTenant] Already seeded for tenant', tenantId, '— skipping');
    return { seeded: false, reason: 'already_seeded' };
  }

  // 1. Load existing pipeline_stages (seeded by PR #58 at creation)
  var { data: stages } = await supabase.from('pipeline_stages')
    .select('id, stage_key, stage_type').eq('tenant_id', tenantId).order('display_order');
  if (!stages || stages.length === 0) {
    console.warn('[seedDemoTenant] No pipeline_stages for tenant', tenantId);
    return { seeded: false, reason: 'no_stages' };
  }
  var stageMap = {};
  stages.forEach(function(s) { stageMap[s.stage_key] = s.id; });
  var leadStageId = stageMap['lead'] || stages[0].id;
  var qualStageId = stageMap['active_qualified'] || leadStageId;
  var demoStageId = stageMap['active_demo_scheduled'] || qualStageId;
  var pricingStageId = stageMap['active_pricing_sent'] || demoStageId;
  var negotiatingStageId = stageMap['active_negotiating'] || pricingStageId;
  var wonStageId = stageMap['closed_won'] || stages[stages.length - 2].id;
  var lostStageId = stageMap['closed_lost'] || stages[stages.length - 1].id;

  // 2. Seed contacts (~20)
  var contacts = [
    { first_name: 'Sarah', last_name: 'Chen', email: 'sarah.chen@example.com', phone: '+15550101001', company: 'Brightpath Dental', status: 'active', tags: ['VIP'] },
    { first_name: 'Marcus', last_name: 'Williams', email: 'marcus.w@example.com', phone: '+15550101002', company: 'Williams & Co', status: 'active', tags: ['Enterprise'] },
    { first_name: 'Emily', last_name: 'Rodriguez', email: 'emily.r@example.com', phone: '+15550101003', company: 'Coastal Realty', status: 'active', tags: [] },
    { first_name: 'James', last_name: 'Thompson', email: 'james.t@example.com', phone: '+15550101004', company: 'TechFlow Solutions', status: 'active', tags: ['VIP', 'Enterprise'] },
    { first_name: 'Aisha', last_name: 'Patel', email: 'aisha.p@example.com', phone: '+15550101005', company: 'Patel Consulting', status: 'active', tags: [] },
    { first_name: 'David', last_name: 'Kim', email: 'david.kim@example.com', phone: '+15550101006', company: 'Summit Digital', status: 'active', tags: [] },
    { first_name: 'Lisa', last_name: 'Martinez', email: 'lisa.m@example.com', phone: '+15550101007', company: 'Luna Wellness', status: 'active', tags: ['VIP'] },
    { first_name: 'Ryan', last_name: 'O\'Brien', email: 'ryan.ob@example.com', phone: '+15550101008', company: 'O\'Brien Legal', status: 'active', tags: [] },
    { first_name: 'Nina', last_name: 'Johansson', email: 'nina.j@example.com', phone: '+15550101009', company: 'Nordic Design Studio', status: 'active', tags: [] },
    { first_name: 'Carlos', last_name: 'Mendez', email: 'carlos.m@example.com', phone: '+15550101010', company: 'Mendez Auto Group', status: 'active', tags: ['Enterprise'] },
    { first_name: 'Rachel', last_name: 'Green', email: 'rachel.g@example.com', phone: '+15550101011', company: 'Greenleaf Organics', status: 'active', tags: [] },
    { first_name: 'Tom', last_name: 'Baker', email: 'tom.b@example.com', phone: '+15550101012', company: 'Baker & Sons HVAC', status: 'active', tags: [] },
    { first_name: 'Priya', last_name: 'Sharma', email: 'priya.s@example.com', phone: '+15550101013', company: 'Sharma Imports', status: 'active', tags: [] },
    { first_name: 'Mike', last_name: 'Johnson', email: 'mike.j@example.com', phone: '+15550101014', company: 'Johnson Fitness', status: 'unsubscribed', tags: [] },
    { first_name: 'Sophie', last_name: 'Dubois', email: 'sophie.d@example.com', phone: '+15550101015', company: 'Maison Belle', status: 'active', tags: [] },
    { first_name: 'Alex', last_name: 'Turner', email: 'alex.t@example.com', phone: '+15550101016', company: 'Turner Media', status: 'active', tags: [] },
    { first_name: 'Olivia', last_name: 'Hart', email: 'olivia.h@example.com', phone: '+15550101017', company: 'Hart & Associates', status: 'active', tags: ['VIP'] },
    { first_name: 'Ben', last_name: 'Foster', email: 'ben.f@example.com', phone: '+15550101018', company: 'Foster Construction', status: 'active', tags: [] },
    { first_name: 'Hannah', last_name: 'Lee', email: 'hannah.l@example.com', phone: '+15550101019', company: 'Lee Photography', status: 'bounced', tags: [] },
    { first_name: 'Daniel', last_name: 'Wright', email: 'daniel.w@example.com', phone: '+15550101020', company: 'Wright Accounting', status: 'active', tags: [] },
  ];
  var { data: insertedContacts } = await supabase.from('contacts').insert(
    contacts.map(function(c) { return Object.assign({}, c, { tenant_id: tenantId, source: DEMO_TAG }); })
  ).select('id, email');
  var contactMap = {};
  (insertedContacts || []).forEach(function(c) { contactMap[c.email] = c.id; });

  // 3. Seed leads (~15 across stages)
  var leads = [
    { name: 'Sarah Chen', company: 'Brightpath Dental', email: 'sarah.chen@example.com', phone: '+15550101001', pipeline_stage_id: wonStageId, urgency: 'Hot', type: 'Direct Business', last_action_at: daysAgo(2).split('T')[0] },
    { name: 'Marcus Williams', company: 'Williams & Co', email: 'marcus.w@example.com', phone: '+15550101002', pipeline_stage_id: negotiatingStageId, urgency: 'Hot', type: 'Direct Business', last_action_at: daysAgo(1).split('T')[0] },
    { name: 'Emily Rodriguez', company: 'Coastal Realty', email: 'emily.r@example.com', phone: '+15550101003', pipeline_stage_id: pricingStageId, urgency: 'Warm', type: 'Direct Business', last_action_at: daysAgo(3).split('T')[0] },
    { name: 'James Thompson', company: 'TechFlow Solutions', email: 'james.t@example.com', phone: '+15550101004', pipeline_stage_id: demoStageId, urgency: 'Warm', type: 'White-Label / Reseller', last_action_at: daysAgo(5).split('T')[0] },
    { name: 'Aisha Patel', company: 'Patel Consulting', email: 'aisha.p@example.com', phone: '+15550101005', pipeline_stage_id: qualStageId, urgency: 'Warm', type: 'Direct Business', last_action_at: daysAgo(4).split('T')[0] },
    { name: 'David Kim', company: 'Summit Digital', email: 'david.kim@example.com', phone: '+15550101006', pipeline_stage_id: leadStageId, urgency: 'Cold', type: 'Unknown', last_action_at: daysAgo(10).split('T')[0] },
    { name: 'Lisa Martinez', company: 'Luna Wellness', email: 'lisa.m@example.com', phone: '+15550101007', pipeline_stage_id: wonStageId, urgency: 'Hot', type: 'Direct Business', last_action_at: daysAgo(15).split('T')[0] },
    { name: 'Ryan O\'Brien', company: 'O\'Brien Legal', email: 'ryan.ob@example.com', phone: '+15550101008', pipeline_stage_id: leadStageId, urgency: 'Cold', type: 'Direct Business', last_action_at: daysAgo(20).split('T')[0] },
    { name: 'Nina Johansson', company: 'Nordic Design Studio', email: 'nina.j@example.com', phone: '+15550101009', pipeline_stage_id: qualStageId, urgency: 'Warm', type: 'Agency', last_action_at: daysAgo(7).split('T')[0] },
    { name: 'Carlos Mendez', company: 'Mendez Auto Group', email: 'carlos.m@example.com', phone: '+15550101010', pipeline_stage_id: demoStageId, urgency: 'Hot', type: 'Direct Business', last_action_at: daysAgo(2).split('T')[0] },
    { name: 'Rachel Green', company: 'Greenleaf Organics', email: 'rachel.g@example.com', phone: '+15550101011', pipeline_stage_id: lostStageId, urgency: 'Cold', type: 'Direct Business', last_action_at: daysAgo(25).split('T')[0] },
    { name: 'Tom Baker', company: 'Baker & Sons HVAC', email: 'tom.b@example.com', phone: '+15550101012', pipeline_stage_id: leadStageId, urgency: 'Warm', type: 'Direct Business', last_action_at: daysAgo(8).split('T')[0] },
    { name: 'Priya Sharma', company: 'Sharma Imports', email: 'priya.s@example.com', phone: '+15550101013', pipeline_stage_id: pricingStageId, urgency: 'Warm', type: 'Direct Business', last_action_at: daysAgo(6).split('T')[0] },
    { name: 'Alex Turner', company: 'Turner Media', email: 'alex.t@example.com', phone: '+15550101014', pipeline_stage_id: negotiatingStageId, urgency: 'Hot', type: 'White-Label / Reseller', last_action_at: daysAgo(3).split('T')[0] },
    { name: 'Olivia Hart', company: 'Hart & Associates', email: 'olivia.h@example.com', phone: '+15550101015', pipeline_stage_id: qualStageId, urgency: 'Warm', type: 'Direct Business', last_action_at: daysAgo(9).split('T')[0] },
  ];
  await supabase.from('leads').insert(
    leads.map(function(l) { return Object.assign({}, l, { tenant_id: tenantId, source: DEMO_TAG, last_activity_at: new Date().toISOString() }); })
  );

  // 4. Seed conversations + messages (~12 conversations, mixed channels)
  var convTemplates = [
    { contact_email: 'sarah.chen@example.com', channel: 'email', subject: 'Pricing inquiry', status: 'active', msgs: [
      { direction: 'inbound', body: 'Hi, I\'d like to learn more about your pricing plans for a dental practice with 3 locations.', daysAgo: 5 },
      { direction: 'outbound', body: 'Thanks for reaching out, Sarah! Our Growth plan at $249/mo would be perfect for multi-location practices. Want to schedule a quick demo?', daysAgo: 5, sender_type: 'bot' },
      { direction: 'inbound', body: 'Yes please! How about Thursday at 2pm?', daysAgo: 4 },
    ]},
    { contact_email: 'marcus.w@example.com', channel: 'sms', subject: null, status: 'active', msgs: [
      { direction: 'outbound', body: 'Hi Marcus, following up on our demo last week. Any questions about the Enterprise plan?', daysAgo: 3, sender_type: 'agent' },
      { direction: 'inbound', body: 'Yes, can you send over the contract? We\'re ready to move forward.', daysAgo: 2 },
    ]},
    { contact_email: 'emily.r@example.com', channel: 'email', subject: 'Re: Feature question', status: 'active', msgs: [
      { direction: 'inbound', body: 'Does your platform support MLS integration for real estate listings?', daysAgo: 8 },
      { direction: 'outbound', body: 'Great question! We have a webhook integration that works with most MLS providers. I can walk you through the setup.', daysAgo: 7, sender_type: 'bot' },
    ]},
    { contact_email: 'james.t@example.com', channel: 'whatsapp', subject: null, status: 'active', msgs: [
      { direction: 'inbound', body: 'Hey, we\'re interested in white-labeling your platform for our agency clients. What\'s the process?', daysAgo: 6 },
      { direction: 'outbound', body: 'That\'s exactly what our CSP program is designed for. You\'d get full white-label branding, your own portal, and per-client billing. Let me send you the partner deck.', daysAgo: 6, sender_type: 'agent' },
      { direction: 'inbound', body: 'Perfect. Can we get a sandbox to test with?', daysAgo: 5 },
    ]},
    { contact_email: 'aisha.p@example.com', channel: 'sms', subject: null, status: 'waiting', msgs: [
      { direction: 'outbound', body: 'Hi Aisha! Saw you signed up for a trial. Need any help getting started?', daysAgo: 10, sender_type: 'bot' },
    ]},
    { contact_email: 'david.kim@example.com', channel: 'email', subject: 'Support: API rate limits', status: 'active', msgs: [
      { direction: 'inbound', body: 'We\'re hitting rate limits on the SMS API. Currently sending about 5000/day. Can this be increased?', daysAgo: 2 },
      { direction: 'outbound', body: 'I\'ve bumped your rate limit to 10,000/day. For sustained high-volume sending, I\'d recommend our Pro plan which includes priority queue.', daysAgo: 2, sender_type: 'agent' },
      { direction: 'inbound', body: 'Thanks, that was fast! We\'ll look into upgrading.', daysAgo: 1 },
    ]},
    { contact_email: 'lisa.m@example.com', channel: 'email', subject: 'Re: Onboarding complete', status: 'resolved', msgs: [
      { direction: 'outbound', body: 'Welcome aboard, Lisa! Your account is all set up. Here are your next steps...', daysAgo: 20, sender_type: 'bot' },
      { direction: 'inbound', body: 'Everything looks great, thank you!', daysAgo: 19 },
    ]},
    { contact_email: 'carlos.m@example.com', channel: 'whatsapp', subject: null, status: 'active', msgs: [
      { direction: 'inbound', body: 'Can we do a demo this week? We have 4 dealership locations.', daysAgo: 3 },
      { direction: 'outbound', body: 'Absolutely! I have availability Wednesday or Friday. Which works better for you?', daysAgo: 3, sender_type: 'agent' },
    ]},
    { contact_email: 'rachel.g@example.com', channel: 'email', subject: 'Cancellation request', status: 'resolved', msgs: [
      { direction: 'inbound', body: 'We\'ve decided to go in a different direction. Please cancel our account.', daysAgo: 28 },
      { direction: 'outbound', body: 'I\'m sorry to hear that. Your account has been cancelled. If anything changes, we\'re here.', daysAgo: 27, sender_type: 'agent' },
    ]},
    { contact_email: 'olivia.h@example.com', channel: 'sms', subject: null, status: 'active', msgs: [
      { direction: 'inbound', body: 'Hi, I was referred by James Thompson. Looking for a similar setup for our law firm.', daysAgo: 1 },
      { direction: 'outbound', body: 'Welcome Olivia! James is a great client. I\'d love to show you how we set things up for professional services firms. Free this week?', daysAgo: 1, sender_type: 'agent' },
    ]},
    { contact_email: 'ben.f@example.com', channel: 'email', subject: 'Billing question', status: 'active', msgs: [
      { direction: 'inbound', body: 'Our last invoice seems higher than expected. Can you check?', daysAgo: 4 },
    ]},
    { contact_email: 'daniel.w@example.com', channel: 'email', subject: 'Integration help', status: 'active', msgs: [
      { direction: 'inbound', body: 'We use QuickBooks for accounting. Is there a way to sync contacts?', daysAgo: 6 },
      { direction: 'outbound', body: 'We have a Zapier integration that connects with QuickBooks. I can help you set it up — takes about 10 minutes.', daysAgo: 5, sender_type: 'bot' },
    ]},
  ];

  for (var ci = 0; ci < convTemplates.length; ci++) {
    var ct = convTemplates[ci];
    var contactId = contactMap[ct.contact_email];
    if (!contactId) continue;

    var { data: conv } = await supabase.from('conversations').insert({
      tenant_id: tenantId, contact_id: contactId, channel: ct.channel,
      status: ct.status, subject: ct.subject,
      last_message_at: daysAgo(ct.msgs[ct.msgs.length - 1].daysAgo),
      unread_count: ct.msgs[ct.msgs.length - 1].direction === 'inbound' ? 1 : 0,
    }).select('id').single();
    if (!conv) continue;

    for (var mi = 0; mi < ct.msgs.length; mi++) {
      var m = ct.msgs[mi];
      await supabase.from('messages').insert({
        tenant_id: tenantId, conversation_id: conv.id, contact_id: contactId,
        channel: ct.channel, direction: m.direction,
        body: m.body, status: 'delivered',
        sender_type: m.sender_type || 'contact',
        created_at: daysAgo(m.daysAgo),
        metadata: { seed: DEMO_TAG },
      });
    }
  }

  // 5. Seed support tickets (~8)
  var tickets = [
    { subject: 'SMS not delivering to Vodafone numbers', category: 'technical', priority: 'high', status: 'open', contact_email: 'david.kim@example.com' },
    { subject: 'How to set up auto-responder?', category: 'support', priority: 'normal', status: 'pending', contact_email: 'emily.r@example.com' },
    { subject: 'Billing discrepancy — March invoice', category: 'billing', priority: 'normal', status: 'open', contact_email: 'ben.f@example.com' },
    { subject: 'Request: bulk contact import from CSV', category: 'feature_request', priority: 'low', status: 'resolved', contact_email: 'tom.b@example.com' },
    { subject: 'WhatsApp template rejected by Meta', category: 'technical', priority: 'high', status: 'open', contact_email: 'carlos.m@example.com' },
    { subject: 'Account upgrade to Enterprise', category: 'billing', priority: 'normal', status: 'resolved', contact_email: 'james.t@example.com' },
    { subject: 'GDPR data export request', category: 'compliance', priority: 'high', status: 'pending', contact_email: 'nina.j@example.com' },
    { subject: 'Cancellation confirmation needed', category: 'support', priority: 'normal', status: 'resolved', contact_email: 'rachel.g@example.com' },
  ];
  for (var ti = 0; ti < tickets.length; ti++) {
    var tk = tickets[ti];
    await supabase.from('support_tickets').insert({
      tenant_id: tenantId, subject: tk.subject, category: tk.category,
      priority: tk.priority, status: tk.status,
      submitter_email: tk.contact_email, submitter_name: tk.contact_email.split('@')[0],
      submitter_type: 'external', channel: 'email',
      created_at: daysAgo(Math.floor(Math.random() * 25) + 1),
      metadata: { seed: DEMO_TAG },
    });
  }

  // 5b. Seed ticket_messages for each support ticket (so Help Desk threads aren't empty)
  var ticketThreads = {
    'SMS not delivering to Vodafone numbers': [
      { role: 'user', author_name: 'David Kim', content: 'We\'re seeing about 30% failure rate on SMS to Vodafone UK numbers since yesterday. Other carriers seem fine.' },
      { role: 'ai', author_name: 'AI Support', content: 'I can see elevated delivery failures on Vodafone UK routes. This appears to be a carrier-side issue affecting multiple providers. I\'ve flagged it with our routing team for priority investigation.' },
      { role: 'agent', author_name: 'Support Team', content: 'Update: Vodafone confirmed a gateway issue on their end. Expect resolution within 4-6 hours. We\'re monitoring and will update you once delivery rates normalise.' },
    ],
    'How to set up auto-responder?': [
      { role: 'user', author_name: 'Emily Rodriguez', content: 'I want to set up an automatic response when someone texts our business number outside of hours. How do I do that?' },
      { role: 'ai', author_name: 'AI Support', content: 'You can set up an auto-responder in Settings → Channels → SMS. Toggle "Auto-Response" and set your business hours and out-of-hours message. Would you like me to walk you through it?' },
    ],
    'Billing discrepancy — March invoice': [
      { role: 'user', author_name: 'Ben Foster', content: 'Our March invoice shows 12,000 SMS but our dashboard only shows 8,400 sent. Can you reconcile?' },
    ],
    'WhatsApp template rejected by Meta': [
      { role: 'user', author_name: 'Carlos Mendez', content: 'Our appointment reminder template was rejected by Meta. The rejection reason says "insufficient information" but the template has all required fields.' },
      { role: 'ai', author_name: 'AI Support', content: 'Meta template rejections with "insufficient information" usually mean the template body needs more context about what the message is for. Try adding your business name and the purpose of the message in the first line. I can help you redraft it.' },
    ],
    'GDPR data export request': [
      { role: 'user', author_name: 'Nina Johansson', content: 'Under GDPR Article 15, I\'m requesting a full export of all personal data we\'ve stored through the platform. Please provide within 30 days.' },
      { role: 'agent', author_name: 'Support Team', content: 'Thank you for your request. We\'re preparing your data export and will deliver it within the regulatory timeframe. You\'ll receive a secure download link via email.' },
    ],
  };
  // Re-fetch the tickets we just inserted to get their IDs
  var { data: seededTickets } = await supabase.from('support_tickets')
    .select('id, subject').eq('tenant_id', tenantId).contains('metadata', { seed: DEMO_TAG });
  for (var sti = 0; sti < (seededTickets || []).length; sti++) {
    var st = seededTickets[sti];
    var threadMsgs = ticketThreads[st.subject];
    if (!threadMsgs) continue;
    for (var tmi = 0; tmi < threadMsgs.length; tmi++) {
      var tm = threadMsgs[tmi];
      await supabase.from('ticket_messages').insert({
        ticket_id: st.id,
        role: tm.role,
        author_name: tm.author_name,
        author_type: tm.role === 'user' ? 'external' : 'system',
        content: tm.content,
        metadata: { seed: DEMO_TAG },
      });
    }
  }

  // 6. Seed additional messages for analytics date-spread (~30 days, mixed channels)
  var channels = ['sms', 'email', 'whatsapp'];
  var statuses = ['delivered', 'delivered', 'delivered', 'delivered', 'opened', 'opened', 'clicked', 'replied'];
  var directions = ['outbound', 'outbound', 'outbound', 'inbound'];
  for (var ai = 0; ai < 120; ai++) {
    var day = Math.floor(Math.random() * 30);
    var hour = Math.floor(Math.random() * 14) + 8; // 8am-10pm
    var ts = new Date(Date.now() - day * 86400000);
    ts.setHours(hour, Math.floor(Math.random() * 60));
    await supabase.from('messages').insert({
      tenant_id: tenantId,
      channel: channels[ai % channels.length],
      direction: directions[ai % directions.length],
      status: statuses[ai % statuses.length],
      body: 'Demo analytics message ' + (ai + 1),
      sender_type: directions[ai % directions.length] === 'inbound' ? 'contact' : 'bot',
      created_at: ts.toISOString(),
      metadata: { seed: DEMO_TAG },
    });
  }

  console.log('[seedDemoTenant] Seeded tenant', tenantId, '— 20 contacts, 15 leads, 12 conversations, 8 tickets + thread messages, 120 analytics messages');
  return { seeded: true };
}

async function teardownDemoTenant(tenantId, supabaseOverride) {
  var supabase = supabaseOverride || getSupabase();
  // Order matters: child rows before parents (FK dependencies)
  await supabase.from('messages').delete().eq('tenant_id', tenantId).contains('metadata', { seed: DEMO_TAG });
  await supabase.from('conversations').delete().eq('tenant_id', tenantId); // conversations created inline, no tag — delete all for demo tenant
  // ticket_messages has no tenant_id — scope via parent ticket IDs
  var { data: demoTickets } = await supabase.from('support_tickets').select('id').eq('tenant_id', tenantId).contains('metadata', { seed: DEMO_TAG });
  var demoTicketIds = (demoTickets || []).map(function(t) { return t.id; });
  if (demoTicketIds.length > 0) {
    await supabase.from('ticket_messages').delete().in('ticket_id', demoTicketIds).contains('metadata', { seed: DEMO_TAG });
  }
  await supabase.from('support_tickets').delete().eq('tenant_id', tenantId).contains('metadata', { seed: DEMO_TAG });
  await supabase.from('leads').delete().eq('tenant_id', tenantId).eq('source', DEMO_TAG);
  await supabase.from('contacts').delete().eq('tenant_id', tenantId).eq('source', DEMO_TAG);
  console.log('[teardownDemoTenant] Cleaned tenant', tenantId);
}

module.exports = { seedDemoTenant: seedDemoTenant, teardownDemoTenant: teardownDemoTenant };
