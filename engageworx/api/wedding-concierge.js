// api/wedding-concierge.js — Core wedding concierge AI endpoint
// Inputs: tenant_id, surface, wedding_id, conversation_id, user_message, contact_meta
// Loads chatbot config + KB + couple context, calls Anthropic, returns response + prefix

var { createClient } = require('@supabase/supabase-js');
var { assembleSystemPrompt } = require('./_lib/assemble-system-prompt');

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var supabase = getSupabase();
  var { tenant_id, surface, wedding_id, conversation_id, user_message, contact_meta } = req.body || {};

  if (!tenant_id || !surface || !user_message) {
    return res.status(400).json({ error: 'tenant_id, surface, and user_message required' });
  }

  try {
    var result = await generateConciergeResponse(supabase, {
      tenantId: tenant_id,
      surface: surface,
      weddingId: wedding_id,
      conversationId: conversation_id,
      userMessage: user_message,
      contactMeta: contact_meta || {},
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[wedding-concierge] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// Exported for use by email-inbound-concierge without HTTP overhead
module.exports.generateConciergeResponse = generateConciergeResponse;

async function generateConciergeResponse(supabase, opts) {
  var tenantId = opts.tenantId;
  var surface = opts.surface;
  var weddingId = opts.weddingId;
  var conversationId = opts.conversationId;
  var userMessage = opts.userMessage;
  var contactMeta = opts.contactMeta || {};

  // 1. Load chatbot config (structured fields + legacy system_prompt)
  var { data: config } = await supabase.from('chatbot_configs')
    .select('system_prompt, tenant_business_context, ai_model, max_tokens, ai_persona, ai_voice, ai_scope, ai_escalation_instructions, ai_custom_instructions, coordinator_names')
    .eq('tenant_id', tenantId)
    .eq('surface', surface)
    .maybeSingle();

  if (!config) throw new Error('No chatbot config for tenant=' + tenantId + ' surface=' + surface);

  // 2. Load KB articles
  // Surface-scoped retrieval: only articles tagged for THIS responder's surface
  // (surfaces[] membership), not the legacy single `surface` column. This is the gate
  // that stops e.g. enquiry-only pricing articles leaking into concierge drafts.
  // `surface` here is the responding chatbot_config's surface (opts.surface), not a literal.
  var { data: kbArticles } = await supabase.from('wedding_kb_articles')
    .select('title, content')
    .eq('tenant_id', tenantId)
    .overlaps('surfaces', [surface])
    .eq('is_published', true)
    .order('created_at');

  // 3. Load wedding context if available
  var weddingContext = '';
  if (weddingId) {
    try {
      var { data: wedding } = await supabase.from('weddings')
        .select('display_name, wedding_date, status, meta, primary_contact_id, partner_contact_id')
        .eq('id', weddingId).single();

      if (wedding) {
        var daysUntil = wedding.wedding_date
          ? Math.ceil((new Date(wedding.wedding_date) - new Date()) / 86400000)
          : null;

        // Load venue config for freeze calculation
        var { data: venueConfig } = await supabase.from('wedding_venue_configs')
          .select('freeze_weeks_before').eq('tenant_id', tenantId).maybeSingle();

        var freezeState = 'open';
        if (wedding.wedding_date && venueConfig && venueConfig.freeze_weeks_before) {
          var freezeDate = new Date(wedding.wedding_date);
          freezeDate.setDate(freezeDate.getDate() - (venueConfig.freeze_weeks_before * 7));
          freezeState = new Date() >= freezeDate ? 'frozen' : 'open';
        }

        // Load plan
        var { data: plan } = await supabase.from('wedding_plans')
          .select('ceremony, evening, guests').eq('wedding_id', weddingId).maybeSingle();

        // Load suppliers
        var { data: suppliers } = await supabase.from('wedding_suppliers')
          .select('category, name, status').eq('wedding_id', weddingId).eq('status', 'confirmed');

        // Load contact names
        var coupleNames = [];
        if (wedding.primary_contact_id) {
          var { data: p1 } = await supabase.from('contacts').select('first_name').eq('id', wedding.primary_contact_id).maybeSingle();
          if (p1 && p1.first_name) coupleNames.push(p1.first_name);
        }
        if (wedding.partner_contact_id) {
          var { data: p2 } = await supabase.from('contacts').select('first_name').eq('id', wedding.partner_contact_id).maybeSingle();
          if (p2 && p2.first_name) coupleNames.push(p2.first_name);
        }

        weddingContext = '\n\n--- THIS COUPLE\'S WEDDING ---\n';
        weddingContext += 'Couple: ' + (coupleNames.join(' & ') || wedding.display_name || 'Unknown') + '\n';
        weddingContext += 'Wedding date: ' + (wedding.wedding_date || 'TBC') + '\n';
        if (daysUntil !== null) weddingContext += 'Days until wedding: ' + daysUntil + '\n';
        weddingContext += 'Status: ' + wedding.status + '\n';
        weddingContext += 'Change freeze: ' + freezeState + '\n';

        if (plan) {
          if (plan.ceremony) weddingContext += 'Ceremony: ' + JSON.stringify(plan.ceremony) + '\n';
          if (plan.guests) weddingContext += 'Guests: ' + JSON.stringify(plan.guests) + '\n';
        }

        if (suppliers && suppliers.length > 0) {
          weddingContext += 'Confirmed suppliers: ' + suppliers.map(function(s) { return s.category + ': ' + s.name; }).join(', ') + '\n';
        }
      }
    } catch (wErr) {
      console.warn('[wedding-concierge] Wedding context load error:', wErr.message);
    }
  }

  // 4. Load conversation history (last 10 turns)
  var conversationHistory = [];
  if (conversationId) {
    var { data: msgs } = await supabase.from('messages')
      .select('direction, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (msgs && msgs.length > 0) {
      conversationHistory = msgs.reverse().map(function(m) {
        return { role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.body };
      });
    }
  }

  // 5. Compose system prompt (structured fields → legacy fallback)
  var systemPrompt = assembleSystemPrompt(config) || '';
  if (config.tenant_business_context) {
    systemPrompt += '\n\n--- VENUE FACTS ---\n' + config.tenant_business_context;
  }
  if (kbArticles && kbArticles.length > 0) {
    systemPrompt += '\n\n--- KNOWLEDGE BASE ---\n';
    kbArticles.forEach(function(a) {
      systemPrompt += '\n## ' + a.title + '\n' + a.content + '\n';
    });
  }
  if (weddingContext) {
    systemPrompt += weddingContext;
  }
  if (contactMeta.name) {
    systemPrompt += '\n\nThe person messaging you is: ' + contactMeta.name + (contactMeta.email ? ' (' + contactMeta.email + ')' : '');
  }

  // 6. Build messages array
  var messages = conversationHistory.concat([{ role: 'user', content: userMessage }]);

  // 7. Call Anthropic
  var apiKey = process.env.ANTHROPIC_API_KEY || process.env.REACT_APP_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  var model = config.ai_model || 'claude-sonnet-4-6';
  var maxTokens = config.max_tokens || 2000;

  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messages,
    }),
  });

  if (!response.ok) {
    var errText = await response.text();
    throw new Error('Anthropic ' + response.status + ': ' + errText.substring(0, 200));
  }

  var data = await response.json();
  var aiText = (data.content || []).find(function(b) { return b.type === 'text'; });
  var fullResponse = aiText ? aiText.text.trim() : '';

  // 8. Parse prefix
  var prefix = null;
  var body = fullResponse;
  var prefixMatch = fullResponse.match(/^\[(RESOLVED|PENDING|ESCALATE)\]\s*/i);
  if (prefixMatch) {
    prefix = prefixMatch[1].toUpperCase();
    body = fullResponse.substring(prefixMatch[0].length).trim();
  }

  return {
    response: body,
    prefix: prefix,
    full_response: fullResponse,
    model: model,
    kb_article_count: (kbArticles || []).length,
    has_wedding_context: !!weddingId,
  };
}
