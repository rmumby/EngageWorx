import { useState } from 'react';

// ── BLOG POSTS DATA ──────────────────────────────────────────
// Add new posts here. Most recent first. Paste content from Penny directly.
// Use \n\n for paragraph breaks. Use **text** for bold (rendered below).
const POSTS = [
  {
    slug: "why-msps-are-adding-communications-as-a-service",
    title: "Why MSPs Are Adding Communications as a Service in 2026",
    date: "March 10, 2026",
    readTime: "6 min read",
    category: "Revenue Opportunity",
    excerpt: "The IT services market is commoditized. MSPs with 500+ clients are sitting on a goldmine of relationships but earning nothing from communications.",
    content: `The IT services market is commoditized. Every MSP offers the same managed endpoints, the same cloud migrations, the same helpdesk. Margins are shrinking, and clients see IT support as a utility, not a differentiator.

But here's what most MSPs miss: they're sitting on hundreds — sometimes thousands — of SMB relationships, and earning nothing from how those businesses communicate with their customers.

**The revenue math is simple.** If an MSP has 500 SMB clients and converts just 10% of them onto a branded messaging platform at $99/month, that's $59,400 in new annual recurring revenue. At the Growth plan ($249/month), that number jumps to $149,400. And the MSP didn't build anything — they white-labeled an existing platform.

**Why now?** Three forces are converging. First, RCS is reaching mainstream adoption, creating a premium messaging channel that most businesses don't know how to access. Second, AI chatbots have crossed the trust threshold — businesses actively want to deploy them but don't know where to start. Third, regulatory complexity around A2P 10DLC and TCPA compliance is pushing SMBs toward managed solutions rather than DIY.

**What the offering looks like.** The MSP provides each client with a branded communications portal — their logo, their colors — that includes SMS, WhatsApp, email, voice, and an AI chatbot that handles customer inquiries 24/7. The MSP manages the relationship. The platform handles the infrastructure, compliance, and AI.

**The competitive advantage is clear.** MSPs who offer communications as a service create stickier client relationships. A client who uses your RMM tool might switch to a competitor. A client whose entire customer communication system runs on your branded platform? That's a relationship that doesn't churn.

EngageWorx was built for exactly this. Six channels, AI chatbot included in every plan, white-label branding on Pro and Enterprise. Plans start at $99/month with no hidden fees.

The MSPs who figure this out first will own the next wave of recurring revenue. The ones who don't will watch their clients buy it from someone else.

**Ready to see the math for your business?** Visit engwx.com to explore the platform or start a free trial.`
  },
  {
    slug: "engageworx-vs-gohighlevel",
    title: "EngageWorx vs. GoHighLevel: Which Platform Is Right for Your Agency?",
    date: "March 10, 2026",
    readTime: "7 min read",
    category: "Comparison",
    excerpt: "GoHighLevel is a marketing CRM that includes basic messaging. EngageWorx is a communications platform purpose-built for messaging. Here's an honest comparison.",
    content: `GoHighLevel and EngageWorx both offer white-label capabilities for agencies. But they solve fundamentally different problems, and choosing the wrong one costs you months of setup and migration headaches.

**GoHighLevel is a marketing CRM that includes basic messaging.** It's excellent at what it does: CRM, funnels, website builder, appointment scheduling, reputation management, and membership sites. If you need an all-in-one marketing platform for your agency, GHL is a strong choice. SMS and email are included, but they're secondary features built on top of Twilio's infrastructure.

**EngageWorx is a communications platform purpose-built for messaging.** Six dedicated channels (SMS, MMS, WhatsApp, Email, Voice, RCS), a built-in AI chatbot studio, a visual flow builder designed for messaging automation, and analytics built for communications KPIs like delivery rates, channel mix, and cost-per-message.

**Channel support.** GHL offers SMS and email. EngageWorx offers SMS, MMS, WhatsApp, Email, Voice, and RCS. If your clients need WhatsApp Business messaging or RCS, GHL simply doesn't offer it.

**AI chatbot.** GHL offers AI as a paid add-on. EngageWorx includes AI chatbot in every plan — even the $99/month Starter. The chatbot uses Claude (Anthropic) for hybrid NLU + LLM processing with automatic escalation to human agents when confidence is low.

**Pricing transparency.** GHL plans are $97–$497/month, which sounds affordable. But real costs reach $400–$600+ after SMS usage ($0.0079/segment), AI agent fees ($0.02/min), outbound calls ($0.014/min), and the white-label mobile app ($497 setup + $1,491/quarter). EngageWorx is $99–$499/month, all-in. SMS included. AI included. White-label included on Pro. What you see is what you pay.

**Where GoHighLevel wins.** Feature breadth is unmatched. CRM, funnels, websites, calendars, reputation management, invoicing, memberships, courses — all in one platform. If your agency needs all of that, GHL delivers. The community is massive and the ecosystem is mature.

**Where EngageWorx wins.** Communications depth. When your agency's core offering to clients is customer communications — not CRM or funnels — EngageWorx provides purpose-built tools that GHL's messaging features can't match. Six channels vs. two. AI included vs. paid add-on. Transparent pricing vs. hidden costs.

**The decision framework.** If you're building a marketing agency that needs CRM + funnels + basic messaging, go with GoHighLevel. If you're building a communications offering where messaging is the product — or if you already have a CRM and need a dedicated comms platform — EngageWorx is the better fit.

**Try it yourself.** Start a free trial at engwx.com and see the difference.`
  },
];

// ── STYLES ────────────────────────────────────────────────────
const COLORS = {
  bg: '#0f0f1a',
  surface: '#1a1a2e',
  border: '#2a2a3e',
  primary: '#00c9ff',
  text: '#ffffff',
  muted: '#8888aa',
  accent: '#00c9ff',
};

// ── RENDER BOLD (**text**) ────────────────────────────────────
function renderContent(text) {
  return text.split('\n\n').map((para, i) => {
    const parts = para.split(/(\*\*.*?\*\*)/g);
    return (
      <p key={i} style={{ color: COLORS.text, fontSize: 16, lineHeight: 1.75, marginBottom: 20 }}>
        {parts.map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j} style={{ color: COLORS.primary, fontWeight: 700 }}>{part.slice(2, -2)}</strong>
            : part
        )}
      </p>
    );
  });
}

// ── BLOG INDEX ────────────────────────────────────────────────
function BlogIndex({ onSelectPost }) {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '60px 20px' }}>
      <h1 style={{ color: COLORS.text, fontSize: 36, fontWeight: 800, marginBottom: 8 }}>
        Blog
      </h1>
      <p style={{ color: COLORS.muted, fontSize: 16, marginBottom: 48 }}>
        Insights on AI-powered customer communications for businesses and service providers.
      </p>

      {POSTS.map((post) => (
        <article
          key={post.slug}
          onClick={() => onSelectPost(post.slug)}
          style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            padding: 32,
            marginBottom: 24,
            cursor: 'pointer',
            transition: 'border-color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = COLORS.primary}
          onMouseLeave={e => e.currentTarget.style.borderColor = COLORS.border}
        >
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <span style={{
              background: `${COLORS.primary}22`,
              color: COLORS.primary,
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
            }}>
              {post.category}
            </span>
            <span style={{ color: COLORS.muted, fontSize: 13 }}>
              {post.date} · {post.readTime}
            </span>
          </div>
          <h2 style={{ color: COLORS.text, fontSize: 22, fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }}>
            {post.title}
          </h2>
          <p style={{ color: COLORS.muted, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            {post.excerpt}
          </p>
        </article>
      ))}
    </div>
  );
}

// ── BLOG POST ─────────────────────────────────────────────────
function BlogPost({ slug, onBack }) {
  const post = POSTS.find(p => p.slug === slug);
  if (!post) return <div style={{ color: COLORS.text, padding: 40 }}>Post not found.</div>;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px' }}>
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          color: COLORS.primary,
          cursor: 'pointer',
          fontSize: 14,
          marginBottom: 32,
          padding: 0,
        }}
      >
        ← Back to Blog
      </button>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <span style={{
          background: `${COLORS.primary}22`,
          color: COLORS.primary,
          padding: '4px 12px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
        }}>
          {post.category}
        </span>
        <span style={{ color: COLORS.muted, fontSize: 13 }}>
          {post.date} · {post.readTime}
        </span>
      </div>

      <h1 style={{ color: COLORS.text, fontSize: 32, fontWeight: 800, lineHeight: 1.3, marginBottom: 32 }}>
        {post.title}
      </h1>

      {renderContent(post.content)}

      {/* CTA */}
      <div style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 32,
        marginTop: 48,
        textAlign: 'center',
      }}>
        <h3 style={{ color: COLORS.text, fontSize: 20, marginBottom: 8 }}>
          Ready to see EngageWorx in action?
        </h3>
        <p style={{ color: COLORS.muted, fontSize: 15, marginBottom: 20 }}>
          AI chatbot + SMS + WhatsApp + Email. One platform. From $99/mo.
        </p>
        <a
          href="https://www.engwx.com"
          style={{
            display: 'inline-block',
            background: `linear-gradient(135deg, ${COLORS.primary}, #e040fb)`,
            color: '#000',
            padding: '12px 32px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 15,
            textDecoration: 'none',
          }}
        >
          Start Free Trial
        </a>
      </div>
    </div>
  );
}

// ── MAIN BLOG COMPONENT ──────────────────────────────────────
export default function Blog({ onBack }) {
  const [selectedPost, setSelectedPost] = useState(null);

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: `1px solid ${COLORS.border}`,
      }}>
        <div
          onClick={() => { setSelectedPost(null); onBack(); }}
          style={{ cursor: 'pointer' }}
        >
          <span style={{ fontSize: 22, fontWeight: 800, color: COLORS.text }}>
            Engage<span style={{ color: COLORS.primary }}>Worx</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <span
            onClick={onBack}
            style={{ color: COLORS.muted, cursor: 'pointer', fontSize: 14 }}
          >
            Home
          </span>
          <span
            onClick={() => setSelectedPost(null)}
            style={{ color: COLORS.primary, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            Blog
          </span>
          <a
            href="https://www.engwx.com"
            style={{
              background: `linear-gradient(135deg, ${COLORS.primary}, #e040fb)`,
              color: '#000',
              padding: '8px 20px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Start Free Trial
          </a>
        </div>
      </div>

      {/* Content */}
      {selectedPost
        ? <BlogPost slug={selectedPost} onBack={() => setSelectedPost(null)} />
        : <BlogIndex onSelectPost={setSelectedPost} />
      }

      {/* Footer */}
      <div style={{
        borderTop: `1px solid ${COLORS.border}`,
        padding: '24px',
        textAlign: 'center',
        color: COLORS.muted,
        fontSize: 13,
      }}>
        © 2026 EngageWorx · AI-Powered Customer Communications · engwx.com
      </div>
    </div>
  );
}
