import { useState } from 'react';

// ── API DOCUMENTATION ──────────────────────────────────────────
var COLORS = {
  bg: '#0a0d14',
  surface: '#12151e',
  border: '#1e2235',
  primary: '#00c9ff',
  text: '#e8f0f8',
  muted: '#6b7b92',
  green: '#00e676',
  orange: '#ff9800',
  red: '#ff5252',
  purple: '#7c4dff',
  code: '#1a1f2e',
};

var ENDPOINTS = [
  {
    method: 'POST',
    path: '/v1/messages/sms',
    title: 'Send SMS',
    description: 'Send an SMS message to a single recipient or broadcast to multiple numbers.',
    request: JSON.stringify({
      to: "+17865551234",
      body: "Your appointment is confirmed for tomorrow at 2 PM.",
      from: "+17869827800",
      webhook_url: "https://yoursite.com/webhook"
    }, null, 2),
    response: JSON.stringify({
      id: "msg_01HZ3K9F7XQBN4CMJT8P",
      status: "queued",
      to: "+17865551234",
      from: "+17869827800",
      segments: 1,
      cost: "$0.0075",
      created_at: "2026-03-18T14:30:00Z"
    }, null, 2),
    params: [
      { name: 'to', type: 'string', required: true, desc: 'Recipient phone number (E.164 format)' },
      { name: 'body', type: 'string', required: true, desc: 'Message content (max 1600 chars)' },
      { name: 'from', type: 'string', required: false, desc: 'Sender number (defaults to tenant number)' },
      { name: 'media_url', type: 'string', required: false, desc: 'URL of media attachment (MMS)' },
      { name: 'webhook_url', type: 'string', required: false, desc: 'URL for delivery status callbacks' },
    ],
  },
  {
    method: 'POST',
    path: '/v1/messages/email',
    title: 'Send Email',
    description: 'Send a transactional or marketing email with optional HTML body and attachments.',
    request: JSON.stringify({
      to: "customer@example.com",
      subject: "Your order has shipped",
      body: "Hi Sarah, your order #4582 has shipped and will arrive by Friday.",
      from_name: "Acme Store",
      reply_to: "support@acme.com"
    }, null, 2),
    response: JSON.stringify({
      id: "eml_02JA8M3NXRP7QD",
      status: "sent",
      to: "customer@example.com",
      from: "noreply@acme.com",
      created_at: "2026-03-18T14:30:00Z"
    }, null, 2),
    params: [
      { name: 'to', type: 'string', required: true, desc: 'Recipient email address' },
      { name: 'subject', type: 'string', required: true, desc: 'Email subject line' },
      { name: 'body', type: 'string', required: true, desc: 'Plain text body' },
      { name: 'html', type: 'string', required: false, desc: 'HTML body (overrides plain text)' },
      { name: 'from_name', type: 'string', required: false, desc: 'Sender display name' },
      { name: 'reply_to', type: 'string', required: false, desc: 'Reply-to address' },
    ],
  },
  {
    method: 'POST',
    path: '/v1/messages/whatsapp',
    title: 'Send WhatsApp Message',
    description: 'Send WhatsApp messages using pre-approved templates or free-form text within the 24-hour window.',
    request: JSON.stringify({
      to: "+5511999887766",
      template: "order_confirmation",
      template_vars: { "1": "Sarah", "2": "#4582", "3": "Friday" },
      language: "en"
    }, null, 2),
    response: JSON.stringify({
      id: "wa_03KC9N4PXSQ8RE",
      status: "sent",
      to: "+5511999887766",
      template: "order_confirmation",
      created_at: "2026-03-18T14:30:00Z"
    }, null, 2),
    params: [
      { name: 'to', type: 'string', required: true, desc: 'Recipient WhatsApp number (E.164)' },
      { name: 'body', type: 'string', required: false, desc: 'Free-form text (24h window only)' },
      { name: 'template', type: 'string', required: false, desc: 'Pre-approved template name' },
      { name: 'template_vars', type: 'object', required: false, desc: 'Template variable substitutions' },
      { name: 'language', type: 'string', required: false, desc: 'Template language code (default: en)' },
    ],
  },
  {
    method: 'POST',
    path: '/v1/ai/chat',
    title: 'AI Chatbot',
    description: 'Send a message to the AI chatbot and receive an intelligent response with intent classification and sentiment analysis.',
    request: JSON.stringify({
      message: "What are your business hours?",
      conversation_id: "conv_01HZ3K9F7XQ",
      channel: "sms",
      context: { customer_name: "Sarah", account_type: "premium" }
    }, null, 2),
    response: JSON.stringify({
      reply: "Our office is open Monday through Friday, 9 AM to 6 PM Eastern. Is there anything specific I can help you with?",
      intent: "hours_inquiry",
      confidence: 0.94,
      sentiment: "neutral",
      escalate: false,
      conversation_id: "conv_01HZ3K9F7XQ"
    }, null, 2),
    params: [
      { name: 'message', type: 'string', required: true, desc: 'Customer message text' },
      { name: 'conversation_id', type: 'string', required: false, desc: 'Conversation thread ID for context' },
      { name: 'channel', type: 'string', required: false, desc: 'Source channel (sms, email, whatsapp, voice, web)' },
      { name: 'context', type: 'object', required: false, desc: 'Additional context (customer info, metadata)' },
    ],
  },
  {
    method: 'GET',
    path: '/v1/contacts',
    title: 'List Contacts',
    description: 'Retrieve a paginated list of contacts with optional search and filtering.',
    request: null,
    response: JSON.stringify({
      data: [
        { id: "ct_01HZ3K9F7XQ", first_name: "Sarah", last_name: "Johnson", phone: "+17865551234", email: "sarah@example.com", tags: ["VIP"], created_at: "2026-02-15T10:00:00Z" },
        { id: "ct_02JA8M3NXRP", first_name: "Marcus", last_name: "Chen", phone: "+17865555678", email: "marcus@example.com", tags: ["New"], created_at: "2026-03-01T09:00:00Z" }
      ],
      total: 2,
      page: 1,
      per_page: 50
    }, null, 2),
    params: [
      { name: 'page', type: 'integer', required: false, desc: 'Page number (default: 1)' },
      { name: 'per_page', type: 'integer', required: false, desc: 'Results per page (default: 50, max: 200)' },
      { name: 'search', type: 'string', required: false, desc: 'Search by name, email, or phone' },
      { name: 'tag', type: 'string', required: false, desc: 'Filter by tag' },
    ],
  },
  {
    method: 'POST',
    path: '/v1/campaigns',
    title: 'Create Campaign',
    description: 'Create and optionally launch a multi-channel campaign with scheduling and audience targeting.',
    request: JSON.stringify({
      name: "Spring Sale 2026",
      channel: "sms",
      body: "Spring Sale! 20% off everything this weekend. Shop now at acme.com/spring",
      audience: { tags: ["customers"], exclude_tags: ["unsubscribed"] },
      schedule: "2026-03-22T10:00:00Z",
      status: "scheduled"
    }, null, 2),
    response: JSON.stringify({
      id: "cmp_04LD5P6QYTU9SF",
      name: "Spring Sale 2026",
      status: "scheduled",
      audience_count: 1247,
      scheduled_at: "2026-03-22T10:00:00Z",
      estimated_cost: "$9.35",
      created_at: "2026-03-18T14:30:00Z"
    }, null, 2),
    params: [
      { name: 'name', type: 'string', required: true, desc: 'Campaign name' },
      { name: 'channel', type: 'string', required: true, desc: 'Channel: sms, email, whatsapp, rcs' },
      { name: 'body', type: 'string', required: true, desc: 'Message content' },
      { name: 'audience', type: 'object', required: true, desc: 'Audience targeting rules' },
      { name: 'schedule', type: 'string', required: false, desc: 'Send time (ISO 8601). Omit for immediate' },
      { name: 'status', type: 'string', required: false, desc: 'draft, scheduled, or active' },
    ],
  },
];

var WEBHOOKS = [
  { event: 'message.sent', desc: 'Message queued for delivery' },
  { event: 'message.delivered', desc: 'Message confirmed delivered to recipient' },
  { event: 'message.failed', desc: 'Message delivery failed' },
  { event: 'message.replied', desc: 'Recipient replied to a message' },
  { event: 'contact.created', desc: 'New contact added' },
  { event: 'campaign.completed', desc: 'Campaign finished sending' },
  { event: 'call.completed', desc: 'Voice call ended with recording/transcript' },
  { event: 'ai.escalated', desc: 'AI chatbot escalated to human agent' },
];

function CodeBlock(props) {
  var code = props.code;
  var lang = props.lang || 'json';
  return (
    <pre style={{ background: COLORS.code, border: '1px solid ' + COLORS.border, borderRadius: 8, padding: '14px 18px', fontSize: 13, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", color: COLORS.text, overflow: 'auto', margin: 0, lineHeight: 1.6 }}>
      <code>{code}</code>
    </pre>
  );
}

function MethodBadge(props) {
  var method = props.method;
  var colors = { GET: COLORS.green, POST: COLORS.primary, PUT: COLORS.orange, DELETE: COLORS.red };
  var color = colors[method] || COLORS.muted;
  return (
    <span style={{ background: color + '22', color: color, border: '1px solid ' + color + '44', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5 }}>{method}</span>
  );
}

export default function ApiDocs(props) {
  var onBack = props.onBack;
  var expandedState = useState(null);
  var expanded = expandedState[0];
  var setExpanded = expandedState[1];

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: "'DM Sans', sans-serif", color: COLORS.text }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');`}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid ' + COLORS.border, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div onClick={function() { if (onBack) onBack(); else window.location.href = '/'; }} style={{ cursor: 'pointer' }}>
          <span style={{ fontSize: 22, fontWeight: 800 }}>Engage<span style={{ color: COLORS.primary }}>Worx</span></span>
          <span style={{ color: COLORS.muted, fontSize: 14, marginLeft: 12 }}>API Reference</span>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <span onClick={function() { if (onBack) onBack(); else window.location.href = '/'; }} style={{ color: COLORS.muted, cursor: 'pointer', fontSize: 14 }}>Home</span>
          <a href="/blog" style={{ color: COLORS.muted, fontSize: 14, textDecoration: 'none' }}>Blog</a>
          <a href="https://portal.engwx.com" style={{ background: 'linear-gradient(135deg, #00c9ff, #e040fb)', color: '#000', padding: '8px 20px', borderRadius: 6, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Get API Key</a>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Hero */}
        <div style={{ marginBottom: 48 }}>
          <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 12, letterSpacing: -1 }}>API Reference</h1>
          <p style={{ color: COLORS.muted, fontSize: 17, lineHeight: 1.7, maxWidth: 640 }}>
            Build powerful customer communications into your application. Send SMS, email, WhatsApp, and voice — with AI-powered chatbot built in.
          </p>
        </div>

        {/* Quick Start */}
        <div style={{ background: COLORS.surface, border: '1px solid ' + COLORS.border, borderRadius: 12, padding: 28, marginBottom: 40 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Quick Start</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Base URL</div>
              <CodeBlock code="https://api.engwx.com/v1" />
            </div>
            <div>
              <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Authentication</div>
              <CodeBlock code={'Authorization: Bearer ewx_live_your_api_key'} />
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ color: COLORS.muted, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Send your first SMS</div>
            <CodeBlock code={'curl -X POST https://api.engwx.com/v1/messages/sms \\\n  -H "Authorization: Bearer ewx_live_your_api_key" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "to": "+17865551234",\n    "body": "Hello from EngageWorx!"\n  }\''} lang="bash" />
          </div>
        </div>

        {/* Authentication */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Authentication</h2>
          <p style={{ color: COLORS.muted, fontSize: 15, lineHeight: 1.7, marginBottom: 16 }}>
            All API requests require a Bearer token in the Authorization header. Generate API keys from your EngageWorx portal under Settings &rarr; API Keys.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { prefix: 'ewx_live_', label: 'Production', desc: 'Live messages, real charges', color: COLORS.green },
              { prefix: 'ewx_test_', label: 'Staging', desc: 'Sandbox testing, no charges', color: COLORS.orange },
              { prefix: 'ewx_dev_', label: 'Development', desc: 'Local development', color: COLORS.purple },
            ].map(function(env) {
              return (
                <div key={env.label} style={{ background: COLORS.surface, border: '1px solid ' + COLORS.border, borderRadius: 8, padding: 16 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: env.color, marginBottom: 6 }}>{env.prefix}...</div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{env.label}</div>
                  <div style={{ color: COLORS.muted, fontSize: 12 }}>{env.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Endpoints */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Endpoints</h2>
          <div style={{ display: 'grid', gap: 12 }}>
            {ENDPOINTS.map(function(ep, i) {
              var isOpen = expanded === i;
              return (
                <div key={i} style={{ background: COLORS.surface, border: '1px solid ' + (isOpen ? COLORS.primary + '44' : COLORS.border), borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                  <div onClick={function() { setExpanded(isOpen ? null : i); }} style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <MethodBadge method={ep.method} />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: COLORS.primary }}>{ep.path}</span>
                    <span style={{ color: COLORS.muted, fontSize: 13, marginLeft: 8 }}>{ep.title}</span>
                    <span style={{ marginLeft: 'auto', color: COLORS.muted, fontSize: 16, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▾</span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '0 20px 20px', borderTop: '1px solid ' + COLORS.border }}>
                      <p style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.6, margin: '16px 0' }}>{ep.description}</p>

                      {/* Parameters */}
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ color: COLORS.text, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Parameters</div>
                        <div style={{ display: 'grid', gap: 1 }}>
                          {ep.params.map(function(p) {
                            return (
                              <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '140px 70px 50px 1fr', gap: 8, alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: COLORS.primary }}>{p.name}</span>
                                <span style={{ fontSize: 11, color: COLORS.muted }}>{p.type}</span>
                                <span style={{ fontSize: 10, color: p.required ? COLORS.orange : COLORS.muted, fontWeight: 700 }}>{p.required ? 'REQ' : 'OPT'}</span>
                                <span style={{ fontSize: 12, color: COLORS.muted }}>{p.desc}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Request/Response */}
                      <div style={{ display: 'grid', gridTemplateColumns: ep.request ? '1fr 1fr' : '1fr', gap: 16 }}>
                        {ep.request && (
                          <div>
                            <div style={{ color: COLORS.text, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Request Body</div>
                            <CodeBlock code={ep.request} />
                          </div>
                        )}
                        <div>
                          <div style={{ color: COLORS.text, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Response</div>
                          <CodeBlock code={ep.response} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Webhooks */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Webhooks</h2>
          <p style={{ color: COLORS.muted, fontSize: 15, lineHeight: 1.7, marginBottom: 16 }}>
            Receive real-time notifications when events occur. Configure webhook endpoints in your portal under Settings &rarr; Webhooks.
          </p>
          <div style={{ background: COLORS.surface, border: '1px solid ' + COLORS.border, borderRadius: 10, overflow: 'hidden' }}>
            {WEBHOOKS.map(function(wh, i) {
              return (
                <div key={wh.event} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px', borderBottom: i < WEBHOOKS.length - 1 ? '1px solid ' + COLORS.border : 'none' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: COLORS.primary, minWidth: 180 }}>{wh.event}</span>
                  <span style={{ color: COLORS.muted, fontSize: 13 }}>{wh.desc}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rate Limits */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Rate Limits & Plans</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            {[
              { plan: 'Starter', rate: '100 req/min', messages: '1,000 SMS/mo', desc: 'For small businesses getting started' },
              { plan: 'Growth', rate: '500 req/min', messages: '5,000 SMS/mo', desc: 'For growing teams and campaigns' },
              { plan: 'Pro', rate: '2,000 req/min', messages: '20,000 SMS/mo', desc: 'For high-volume operations' },
              { plan: 'Enterprise & CSP', rate: 'Custom', messages: 'Custom volume', desc: 'Custom rate limits, white-label & multi-tenant' },
            ].map(function(tier) {
              return (
                <div key={tier.plan} style={{ background: COLORS.surface, border: '1px solid ' + (tier.plan === 'Enterprise & CSP' ? COLORS.primary + '44' : COLORS.border), borderRadius: 10, padding: 20 }}>
                  <div style={{ color: COLORS.primary, fontWeight: 800, fontSize: 15, marginBottom: 8 }}>{tier.plan}</div>
                  <div style={{ color: COLORS.text, fontSize: 13, marginBottom: 4 }}>{tier.rate}</div>
                  <div style={{ color: COLORS.muted, fontSize: 12, marginBottom: 8 }}>{tier.messages}</div>
                  <div style={{ color: COLORS.muted, fontSize: 11, lineHeight: 1.4 }}>{tier.desc}</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, padding: 16, background: 'rgba(0,201,255,0.05)', border: '1px solid rgba(0,201,255,0.15)', borderRadius: 8 }}>
            <div style={{ color: COLORS.primary, fontSize: 13, fontWeight: 600 }}>Service Providers & Enterprise</div>
            <div style={{ color: COLORS.muted, fontSize: 13, marginTop: 4 }}>CSPs and large enterprises receive customized rate limits, volume pricing, and white-label access. Contact us at <a href="mailto:hello@engwx.com" style={{ color: COLORS.primary, textDecoration: 'none' }}>hello@engwx.com</a> or call <a href="tel:+17869827800" style={{ color: COLORS.primary, textDecoration: 'none' }}>+1 (786) 982-7800</a> to discuss partner pricing.</div>
          </div>
        </div>

        {/* SDKs */}
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>SDKs & Libraries</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            {[
              { lang: 'Node.js', status: 'Available', color: COLORS.green },
              { lang: 'Python', status: 'Coming Soon', color: COLORS.orange },
              { lang: 'PHP', status: 'Coming Soon', color: COLORS.orange },
              { lang: 'cURL', status: 'Available', color: COLORS.green },
            ].map(function(sdk) {
              return (
                <div key={sdk.lang} style={{ background: COLORS.surface, border: '1px solid ' + COLORS.border, borderRadius: 8, padding: 16, textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{sdk.lang}</div>
                  <div style={{ color: sdk.color, fontSize: 12, fontWeight: 600 }}>{sdk.status}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div style={{ background: 'linear-gradient(135deg, rgba(0,201,255,0.08), rgba(224,64,251,0.08))', border: '1px solid rgba(0,201,255,0.25)', borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Ready to integrate?</h2>
          <p style={{ color: COLORS.muted, fontSize: 15, marginBottom: 24 }}>Get your API key and start sending messages in under 5 minutes.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <a href="https://portal.engwx.com" style={{ background: 'linear-gradient(135deg, #00c9ff, #e040fb)', color: '#000', padding: '12px 28px', borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>Get API Key</a>
            <a href="mailto:hello@engwx.com" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '12px 28px', borderRadius: 8, fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>Talk to Sales</a>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid ' + COLORS.border, padding: 24, textAlign: 'center', color: COLORS.muted, fontSize: 13 }}>
        &copy; 2026 EngageWorx &middot; API v1 &middot; <a href="mailto:hello@engwx.com" style={{ color: COLORS.primary, textDecoration: 'none' }}>hello@engwx.com</a> &middot; <a href="tel:+17869827800" style={{ color: COLORS.primary, textDecoration: 'none' }}>+1 (786) 982-7800</a>
      </div>
    </div>
  );
}
