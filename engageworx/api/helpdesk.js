var anthropicSdk = require('@anthropic-ai/sdk');
var Anthropic = anthropicSdk.default || anthropicSdk;
var { createClient } = require('@supabase/supabase-js');

var supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

var anthropic = new Anthropic({ apiKey: process.env.REACT_APP_ANTHROPIC_API_KEY });

var EW_SYSTEM_PROMPT = `You are the EngageWorx AI Support Agent — a helpful, professional, and efficient support assistant for EngageWorx, an AI-powered omnichannel customer communications platform.

ABOUT ENGAGEWORX:
- Platform: SMS, WhatsApp, Email, Voice, RCS — all in one portal at portal.engwx.com
- Pricing: Starter $99/mo (1 number, 1,000 SMS), Growth $249/mo (3 numbers, 5,000 SMS), Pro $499/mo (10 numbers, 20,000 SMS, white-label, API access). Enterprise: custom.
- SMS overage: $0.025 per message. No platform fee.
- Built-in AI chatbot powered by Claude (Anthropic)
- Multi-tenant: supports direct businesses, CSPs (white-label partners), and Agents

YOUR ROLE:
- Resolve support tickets autonomously with accurate, helpful responses
- Pull from the knowledge base context provided
- Start your response with exactly one of these signals on its own:
  [RESOLVED] — you have fully answered the issue, no follow-up needed
  [ESCALATE] — this requires a human agent
  [PENDING] — you need more information from the customer
- After the signal, write your response naturally. Be concise — 2-4 paragraphs max.
- Never reveal internal infrastructure names.
- Always be warm but efficient.

ALWAYS ESCALATE these topics:
- Billing disputes or refund requests
- Account termination requests
- Legal or compliance questions
- Abuse or fraud reports
- Security incidents
- Explicit request for a human agent
- Negative sentiment combined with an unresolved issue`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  console.log('helpdesk called:', req.method, JSON.stringify(req.query), typeof req.body);

  try {
    var body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) { body = {}; }
    }
    req.body = body || {};
  } catch(e) {
    req.body = {};
  }

  var action = (req.method === 'GET' ? req.query.action : req.body && req.body.action) || req.query.action;

  console.log('action:', action, 'body keys:', Object.keys(req.body || {}));

  try {
    if (action === 'create_ticket')  return await createTicket(req, res);
    if (action === 'ai_respond')     return await aiRespond(req, res);
    if (action === 'escalate')       return await escalateTicket(req, res);
    if (action === 'resolve')        return await resolveTicket(req, res);
    if (action === 'list_tickets')   return await listTickets(req, res);
    if (action === 'get_ticket')     return await getTicket(req, res);
    if (action === 'add_message')    return await addMessage(req, res);
    if (action === 'update_status')  return await updateStatus(req, res);
    return res.status(400).json({ error: 'Unknown action: ' + action });
  } catch (err) {
    console.error('Helpdesk handler error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};

async function createTicket(req, res) {
  var {
    tenant_id, submitter_type, submitter_name, submitter_email,
    submitter_user_id, submitter_tenant_id,
    subject, description, channel, category, priority,
    channel_message_id, metadata
  } = req.body;

  if (!subject || !description) {
    return res.status(400).json({ error: 'Subject and description are required' });
  }

  var { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({
      tenant_id: tenant_id || null,
      submitter_type: submitter_type || 'tenant',
      submitter_name: submitter_name || null,
      submitter_email: submitter_email || null,
      submitter_user_id: submitter_user_id || null,
      submitter_tenant_id: submitter_tenant_id || tenant_id || null,
      subject,
      description,
      channel: channel || 'portal',
      category: category || 'general',
      priority: priority || 'normal',
      channel_message_id: channel_message_id || null,
      status: 'open',
      metadata: metadata || {}
    })
    .select()
    .single();

  if (error) {
    console.error('createTicket insert error:', error);
    return res.status(400).json({ error: error.message });
  }

  await supabase.from('ticket_messages').insert({
    ticket_id: ticket.id,
    role: 'user',
    author_name: submitter_name || 'Customer',
    author_type: submitter_type || 'tenant',
    author_user_id: submitter_user_id || null,
    content: description
  });

  var aiResult = await runAIResponse(ticket, description, []);
  return res.status(200).json({ ticket, ai_result: aiResult });
}

async function runAIResponse(ticket, latestMessage, history) {
  try {
    var orFilter = ticket.tenant_id
      ? 'tenant_id.is.null,tenant_id.eq.' + ticket.tenant_id
      : 'tenant_id.is.null';

    var { data: kbArticles } = await supabase
      .from('helpdesk_kb_articles')
      .select('title, content')
      .eq('published', true)
      .or(orFilter)
      .limit(6);

    var kbContext = kbArticles && kbArticles.length
      ? '\n\nKNOWLEDGE BASE:\n' + kbArticles.map(function(a) { return '## ' + a.title + '\n' + a.content; }).join('\n\n')
      : '';

    var messages = history
      .filter(function(m) { return !m.is_internal; })
      .map(function(m) {
        return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content };
      });

    messages.push({
      role: 'user',
      content: 'Ticket: ' + (ticket.ticket_number || 'NEW') + '\nSubject: ' + ticket.subject + '\nCategory: ' + (ticket.category || 'general') + '\nPriority: ' + (ticket.priority || 'normal') + '\nChannel: ' + (ticket.channel || 'portal') + '\n\nCustomer message:\n' + latestMessage
    });

    var response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: EW_SYSTEM_PROMPT + kbContext,
      messages: messages
    });

    var aiText = response.content[0].text;
    var isResolved  = aiText.startsWith('[RESOLVED]');
    var isEscalated = aiText.startsWith('[ESCALATE]');
    var isPending   = aiText.startsWith('[PENDING]');

    var cleanText = aiText.replace(/^\[(RESOLVED|ESCALATE|PENDING)\]\s*/, '').trim();
    var confidence = isEscalated ? 0.2 : isPending ? 0.5 : 0.9;
    var newStatus  = isEscalated ? 'escalated' : isPending ? 'pending' : isResolved ? 'resolved' : 'ai_active';

    var updates = {
      status: newStatus,
      ai_handled: true,
      ai_confidence: confidence,
      first_response_at: new Date().toISOString()
    };
    if (isResolved)  { updates.resolved_at = new Date().toISOString(); updates.ai_resolution_summary = cleanText.substring(0, 200); }
    if (isEscalated) { updates.escalation_reason = cleanText.substring(0, 200); updates.escalation_trigger = 'ai_decision'; }

    await supabase.from('support_tickets').update(updates).eq('id', ticket.id);

    await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id,
      role: 'ai',
      author_name: 'EngageWorx AI',
      author_type: 'ai',
      content: cleanText,
      escalation_data: isEscalated ? { reason: cleanText } : null
    });

    return { status: newStatus, confidence: confidence, response: cleanText, escalated: isEscalated, resolved: isResolved };

  } catch (err) {
    console.error('runAIResponse error:', err.message);
    await supabase.from('support_tickets').update({ status: 'open', ai_handled: false }).eq('id', ticket.id);
    return { status: 'open', confidence: 0, response: null, escalated: false, resolved: false, error: err.message };
  }
}

async function aiRespond(req, res) {
  var { ticket_id, message } = req.body;

  var { data: ticket } = await supabase
    .from('support_tickets').select('*').eq('id', ticket_id).single();
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  await supabase.from('ticket_messages').insert({
    ticket_id: ticket_id,
    role: 'user',
    author_name: ticket.submitter_name || 'Customer',
    author_type: ticket.submitter_type,
    content: message
  });

  var { data: history } = await supabase
    .from('ticket_messages').select('*')
    .eq('ticket_id', ticket_id)
    .eq('is_internal', false)
    .order('created_at', { ascending: true })
    .limit(20);

  var result = await runAIResponse(ticket, message, history || []);
  return res.status(200).json(result);
}

async function listTickets(req, res) {
  var { tenant_id, status, priority, limit, offset, search } = req.query;

  var query = supabase
    .from('support_tickets')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(parseInt(limit) || 100);

  if (tenant_id)  query = query.eq('tenant_id', tenant_id);
  if (status)     query = query.eq('status', status);
  if (priority)   query = query.eq('priority', priority);
  if (search)     query = query.or('subject.ilike.%' + search + '%,ticket_number.ilike.%' + search + '%');

  var { data, error, count } = await query;
  if (error) {
    console.error('listTickets error:', error);
    return res.status(400).json({ error: error.message });
  }
  return res.status(200).json({ tickets: data || [], total: count });
}

async function getTicket(req, res) {
  var { ticket_id } = req.query;
  var { data: ticket, error: te } = await supabase.from('support_tickets').select('*').eq('id', ticket_id).single();
  if (te) return res.status(404).json({ error: te.message });
  var { data: messages } = await supabase.from('ticket_messages').select('*').eq('ticket_id', ticket_id).order('created_at', { ascending: true });
  return res.status(200).json({ ticket: ticket, messages: messages || [] });
}

async function addMessage(req, res) {
  var { ticket_id, content, role, author_name, author_type, is_internal, author_user_id } = req.body;

  var { data, error } = await supabase.from('ticket_messages').insert({
    ticket_id: ticket_id,
    content: content,
    role: role || 'agent',
    author_name: author_name || null,
    author_type: author_type || null,
    is_internal: is_internal || false,
    author_user_id: author_user_id || null
  }).select().single();

  if (error) {
    console.error('addMessage error:', error);
    return res.status(400).json({ error: error.message });
  }

  if (role === 'agent') {
    await supabase.from('support_tickets').update({
      status: 'pending',
      first_response_at: new Date().toISOString()
    }).eq('id', ticket_id);
  }

  return res.status(200).json(data);
}

async function updateStatus(req, res) {
  var { ticket_id, status, assigned_to } = req.body;
  var updates = { status: status };
  if (assigned_to)           updates.assigned_to = assigned_to;
  if (status === 'resolved') updates.resolved_at = new Date().toISOString();
  if (status === 'closed')   updates.closed_at   = new Date().toISOString();

  var { data, error } = await supabase.from('support_tickets').update(updates).eq('id', ticket_id).select().single();
  if (error) {
    console.error('updateStatus error:', error);
    return res.status(400).json({ error: error.message });
  }
  return res.status(200).json(data);
}

async function escalateTicket(req, res) {
  var { ticket_id, reason, assign_to } = req.body;
  await supabase.from('support_tickets').update({
    status: 'escalated',
    escalation_reason: reason || null,
    escalation_trigger: 'manual',
    assigned_to: assign_to || null
  }).eq('id', ticket_id);

  await supabase.from('ticket_messages').insert({
    ticket_id: ticket_id,
    role: 'system',
    author_type: 'system',
    author_name: 'System',
    content: 'Ticket escalated to human agent. Reason: ' + (reason || 'Manual escalation'),
    is_internal: true
  });

  return res.status(200).json({ success: true });
}

async function resolveTicket(req, res) {
  var { ticket_id, resolution_note } = req.body;
  await supabase.from('support_tickets').update({
    status: 'resolved',
    resolved_at: new Date().toISOString()
  }).eq('id', ticket_id);

  if (resolution_note) {
    await supabase.from('ticket_messages').insert({
      ticket_id: ticket_id,
      role: 'system',
      author_type: 'system',
      author_name: 'System',
      content: 'Resolved: ' + resolution_note,
      is_internal: true
    });
  }
  return res.status(200).json({ success: true });
}
