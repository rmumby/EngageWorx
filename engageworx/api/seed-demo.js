// /api/seed-demo.js
// Seeds realistic demo data under a dedicated "demo" tenant

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
);

const DEMO_TENANT_ID = "demo-tenant-000";
const DEMO_TENANT = {
  id: DEMO_TENANT_ID,
  name: "Demo Company",
  slug: "demo",
  brand: {
    name: "Demo Company",
    primary: "#00C9FF",
    secondary: "#E040FB",
    logo: null,
  },
  plan: "enterprise",
  status: "active",
  is_demo: true,
};

const FIRST_NAMES = ["Sarah", "Mike", "Jessica", "David", "Emily", "James", "Ashley", "Chris", "Amanda", "Ryan", "Olivia", "Daniel", "Sophia", "Alex", "Rachel", "Marcus", "Lauren", "Tyler", "Nicole", "Brandon"];
const LAST_NAMES = ["Johnson", "Martinez", "Williams", "Brown", "Garcia", "Miller", "Davis", "Rodriguez", "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "White", "Harris", "Clark", "Lewis", "Young", "King"];
const COMPANIES = ["TechFlow Inc", "GreenLeaf Co", "Bright Solutions", "Peak Digital", "NovaStar", "Apex Health", "Urban Eats", "CloudNine Labs", "SwiftShip", "BlueWave"];
const INTENTS = ["support", "billing", "sales", "order_status", "returns", "pricing", "appointment", "complaint", "feedback", "general"];
const SENTIMENTS = ["positive", "positive", "positive", "neutral", "neutral", "neutral", "neutral", "negative", "negative", "positive"];
const CHANNELS = ["SMS", "SMS", "SMS", "WhatsApp", "SMS", "Email", "SMS", "RCS", "SMS", "SMS"];
const STATUSES = ["resolved", "resolved", "resolved", "open", "open", "escalated", "resolved", "resolved", "open", "resolved"];
const TAGS = ["VIP", "newsletter", "lead", "customer", "trial", "enterprise", "returning", "new", "active", "churned"];

const CUSTOMER_MESSAGES = [
  "Hi, I need help with my recent order #4521",
  "When does your store open on weekends?",
  "I'd like to cancel my subscription please",
  "Can you tell me about your premium plan pricing?",
  "My package hasn't arrived yet, it's been 5 days",
  "I love your product! Just wanted to say thanks",
  "Is there a way to upgrade my current plan?",
  "I was charged twice for my last order",
  "Do you offer bulk discounts for teams?",
  "I need to reschedule my appointment for next week",
  "Your customer service has been amazing, thank you!",
  "I'm having trouble logging into my account",
  "Can I return an item I bought 2 weeks ago?",
  "What's the difference between Basic and Pro plans?",
  "I'd like to speak with a manager please",
  "How do I update my shipping address?",
  "The product I received was damaged",
  "Do you ship internationally?",
  "I'm interested in your enterprise solution",
  "Can you send me a receipt for my last purchase?",
];

const BOT_RESPONSES = [
  "Hi there! I'd be happy to help you with your order. Let me pull up the details — could you confirm your email address?",
  "Great question! Our weekend hours are Saturday 9am-6pm and Sunday 10am-4pm. Is there anything else I can help with?",
  "I understand you'd like to cancel. Before I process that, would you like to hear about our special retention offer? We'd love to keep you!",
  "Our Premium plan is $49/month and includes unlimited messages, priority support, and advanced analytics. Want me to set up a trial?",
  "I'm sorry to hear about the delay! Let me track that for you right now. Your package is currently in transit and should arrive by tomorrow.",
  "That's so kind of you to say! We really appreciate your support. Is there anything else we can do for you today?",
  "Absolutely! You can upgrade anytime from your account settings. The Pro plan adds AI automation and priority support. Shall I walk you through it?",
  "I apologize for the billing issue! I can see the duplicate charge and I'm processing a refund right now. You should see it within 3-5 business days.",
  "Yes! We offer volume discounts starting at 10+ seats. For teams of 25+, we have custom enterprise pricing. Want me to connect you with our sales team?",
  "Of course! I can help you reschedule. What date and time work best for you next week?",
];

const CAMPAIGN_NAMES = [
  "Weekend Flash Sale",
  "New Product Launch",
  "Customer Re-engagement",
  "Holiday Special Offer",
  "VIP Exclusive Access",
  "Monthly Newsletter",
  "Abandoned Cart Reminder",
  "Birthday Rewards",
];

const CAMPAIGN_MESSAGES = [
  "FLASH SALE! 30% off everything this weekend only. Use code FLASH30 at checkout. Shop now. Reply STOP to opt out.",
  "Introducing our newest product! Be the first to try it. Early bird pricing available for 48 hours only. Reply STOP to unsubscribe.",
  "Hey {first_name}, we miss you! Come back and enjoy 20% off your next order with code COMEBACK20. Reply STOP to opt out.",
  "Holiday Special! Free shipping on all orders over $50. Plus get a mystery gift with every purchase. Reply STOP to unsubscribe.",
  "VIP EXCLUSIVE: You've been selected for early access to our new collection. Preview starts tomorrow at 9am. Reply STOP to opt out.",
  "Your monthly update is here! Check out what's new, trending, and on sale this month. Reply STOP to unsubscribe.",
  "Hi {first_name}! You left items in your cart. Complete your order now and save 15% with code SAVE15. Reply STOP to opt out.",
  "Happy Birthday, {first_name}! Here's a special gift - 25% off anything in store. Valid for 7 days. Reply STOP to unsubscribe.",
];

function randomDate(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  d.setHours(Math.floor(Math.random() * 12) + 8);
  d.setMinutes(Math.floor(Math.random() * 60));
  return d.toISOString();
}

function randomPhone() {
  return `+1${Math.floor(2000000000 + Math.random() * 7999999999)}`;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action } = req.body;

  if (action === "clear") {
    // Only clear demo tenant data — real customer data is untouched
    const { data: demoConvos } = await supabase
      .from("conversations").select("id").eq("tenant_id", DEMO_TENANT_ID);
    
    if (demoConvos && demoConvos.length > 0) {
      const convoIds = demoConvos.map(c => c.id);
      // Delete messages in batches
      for (let i = 0; i < convoIds.length; i += 50) {
        await supabase.from("conversation_messages").delete().in("conversation_id", convoIds.slice(i, i + 50));
      }
    }
    await supabase.from("conversations").delete().eq("tenant_id", DEMO_TENANT_ID);
    await supabase.from("campaigns").delete().eq("tenant_id", DEMO_TENANT_ID);
    await supabase.from("contacts").delete().eq("tenant_id", DEMO_TENANT_ID);
    // Optionally remove the demo tenant itself
    // await supabase.from("tenants").delete().eq("id", DEMO_TENANT_ID);
    return res.status(200).json({ success: true, message: "Demo data cleared (real customer data untouched)" });
  }

  try {
    const results = { contacts: 0, conversations: 0, messages: 0, campaigns: 0 };

    // ── 0. Create demo tenant if it doesn't exist ────
    const { data: existingTenant } = await supabase
      .from("tenants").select("id").eq("id", DEMO_TENANT_ID).single();

    if (!existingTenant) {
      const { error: tenantErr } = await supabase.from("tenants").insert(DEMO_TENANT);
      if (tenantErr) console.warn("Tenant insert warning:", tenantErr.message);
    }

    // ── 1. Seed Contacts ─────────────────────────────
    const contacts = [];
    for (let i = 0; i < 45; i++) {
      const firstName = pick(FIRST_NAMES);
      const lastName = pick(LAST_NAMES);
      contacts.push({
        tenant_id: DEMO_TENANT_ID,
        first_name: firstName,
        last_name: lastName,
        phone: randomPhone(),
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${pick(["gmail.com", "yahoo.com", "outlook.com", "company.com"])}`,
        tags: [pick(TAGS), ...(Math.random() > 0.5 ? [pick(TAGS)] : [])].filter((v, i, a) => a.indexOf(v) === i),
        notes: Math.random() > 0.6 ? `Works at ${pick(COMPANIES)}` : null,
        created_at: randomDate(90),
      });
    }

    const { data: insertedContacts, error: contactErr } = await supabase
      .from("contacts").insert(contacts).select("id, phone, first_name, last_name");
    if (contactErr) throw contactErr;
    results.contacts = insertedContacts.length;

    // ── 2. Seed Conversations ────────────────────────
    const conversations = [];
    for (let i = 0; i < 28; i++) {
      const contact = pick(insertedContacts);
      conversations.push({
        tenant_id: DEMO_TENANT_ID,
        contact_id: contact.id,
        contact_name: `${contact.first_name} ${contact.last_name}`,
        contact_phone: contact.phone,
        intent: pick(INTENTS),
        sentiment: pick(SENTIMENTS),
        channel: pick(CHANNELS),
        status: pick(STATUSES),
        message_count: Math.floor(Math.random() * 8) + 2,
        created_at: randomDate(14),
      });
    }

    const { data: insertedConvos, error: convoErr } = await supabase
      .from("conversations").insert(conversations).select("id, contact_name, contact_phone, created_at");
    if (convoErr) throw convoErr;
    results.conversations = insertedConvos.length;

    // ── 3. Seed Messages ─────────────────────────────
    const allMessages = [];
    for (const convo of insertedConvos) {
      const numMsgs = Math.floor(Math.random() * 6) + 2;
      const baseTime = new Date(convo.created_at);

      for (let j = 0; j < numMsgs; j++) {
        const isCustomer = j % 2 === 0;
        const msgTime = new Date(baseTime.getTime() + j * (Math.random() * 300000 + 30000));

        allMessages.push({
          conversation_id: convo.id,
          sender: isCustomer ? "customer" : (Math.random() > 0.4 ? "bot" : "agent"),
          body: isCustomer ? pick(CUSTOMER_MESSAGES) : pick(BOT_RESPONSES),
          created_at: msgTime.toISOString(),
        });
      }
    }

    for (let i = 0; i < allMessages.length; i += 50) {
      const batch = allMessages.slice(i, i + 50);
      await supabase.from("conversation_messages").insert(batch);
    }
    results.messages = allMessages.length;

    // ── 4. Seed Campaigns ────────────────────────────
    const campaigns = [];
    for (let i = 0; i < 8; i++) {
      const isSent = i < 5;
      const sentCount = isSent ? Math.floor(Math.random() * 200) + 20 : 0;
      campaigns.push({
        tenant_id: DEMO_TENANT_ID,
        name: CAMPAIGN_NAMES[i],
        description: `AI-generated campaign for ${CAMPAIGN_NAMES[i].toLowerCase()}`,
        channel: pick(["SMS", "SMS", "WhatsApp", "RCS"]),
        message_template: CAMPAIGN_MESSAGES[i],
        status: isSent ? "sent" : (i === 5 ? "sending" : "draft"),
        sent_count: sentCount,
        sent_at: isSent ? randomDate(30) : null,
        audience_filters: [pick(TAGS), pick(TAGS)],
        campaign_data: {
          name: CAMPAIGN_NAMES[i],
          channels: [pick(["SMS", "WhatsApp", "RCS"])],
          sendTime: pick(["Immediately", "Today at 10am", "Tomorrow at 9am", "Next Monday"]),
          estimatedAudience: `~${Math.floor(Math.random() * 500 + 50)} contacts`,
          audienceFilters: [pick(TAGS), "Active in last 30 days"],
          messageVariants: [{ channel: "SMS", message: CAMPAIGN_MESSAGES[i], cta: "Shop Now" }],
          complianceNotes: "Includes STOP opt-out. TCPA compliant. Consent verified via website opt-in.",
        },
        created_at: randomDate(45),
      });
    }

    const { error: campErr } = await supabase.from("campaigns").insert(campaigns);
    if (campErr) throw campErr;
    results.campaigns = campaigns.length;

    return res.status(200).json({
      success: true,
      message: "Demo data seeded under demo tenant!",
      results,
      tenant_id: DEMO_TENANT_ID,
    });

  } catch (error) {
    console.error("Seed error:", error);
    return res.status(500).json({ error: error.message });
  }
}
