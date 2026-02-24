import { createClient } from "@supabase/supabase-js";

async function sendSMS(to, from, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { From, To, Body, MessageSid } = req.body;

  try {
    // Find or create contact
    let { data: contact } = await supabase
      .from("contacts")
      .select("*")
      .eq("phone", From)
      .single();

    if (!contact) {
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({ phone: From, status: "active" })
        .select()
        .single();
      contact = newContact;
    }

    // Find or create conversation
    let { data: conversation } = await supabase
      .from("conversations")
      .select("*")
      .eq("contact_id", contact.id)
      .eq("status", "open")
      .single();

    if (!conversation) {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          contact_id: contact.id,
          channel: "SMS",
          status: "open",
        })
        .select()
        .single();
      conversation = newConv;
    }

    // Classify intent
    const classifyRes = await fetch(`https://portal.engwx.com/api/classify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: Body, conversationId: conversation.id }),
      }
    );
   let intent = "general", sentiment = "neutral";
try {
  const classifyData = await classifyRes.json();
  intent = classifyData.intent || "general";
  sentiment = classifyData.sentiment || "neutral";
} catch(e) {
  console.log("Classify failed, using defaults");
}

    // Store inbound message
    await supabase.from("conversation_messages").insert({
      conversation_id: conversation.id,
      direction: "inbound",
      content: Body,
      intent,
      sentiment,
      channel: "SMS",
    });

    // Handle opt-out immediately
    if (intent === "opt_out") {
      await supabase
        .from("contacts")
        .update({ status: "unsubscribed" })
        .eq("id", contact.id);

      const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
   await sendSMS(From, To, reply);

      return res.status(200).send("<Response></Response>");
    }

    // Escalate complaints to human agent
    if (intent === "complaint" || sentiment === "very_negative") {
      await supabase
        .from("conversations")
        .update({ status: "escalated" })
        .eq("id", conversation.id);

      return res.status(200).send("<Response></Response>");
    }

    // Get bot response
    const respondRes = await fetch(`https://portal.engwx.com/api/respond`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: Body,
          intent,
          sentiment,
          conversationId: conversation.id,
          contactId: contact.id,
        }),
      }
    );
    const { reply } = await respondRes.json();

    // Send reply via Twilio
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  await sendSMS(From, To, reply);

    // Store outbound reply
    await supabase.from("conversation_messages").insert({
      conversation_id: conversation.id,
      direction: "outbound",
      content: reply,
      channel: "SMS",
    });

    res.status(200).send("<Response></Response>");
  } catch (err) {
    console.error("Inbound error:", err);
    res.status(500).json({ error: err.message });
  }
}
