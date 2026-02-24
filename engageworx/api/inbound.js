import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function sendSMS(to, from, body) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    }
  );
  const data = await response.json();
  console.log("SMS sent:", JSON.stringify(data));
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { From, To, Body } = req.body;
  console.log("Inbound SMS from:", From, "body:", Body);

  try {
    // Find or create contact
    let contact = null;
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("*")
      .eq("phone", From)
      .maybeSingle();

    if (existingContact) {
      contact = existingContact;
    } else {
      const { data: newContact, error: insertError } = await supabase
        .from("contacts")
        .insert({ phone: From, status: "active", first_name: "Unknown" })
        .select()
        .single();
      if (insertError) {
        console.log("Contact insert error:", insertError.message);
      } else {
        contact = newContact;
      }
    }

    // Find or create conversation
    let conversation = null;
    if (contact) {
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("*")
        .eq("contact_id", contact.id)
        .eq("status", "open")
        .maybeSingle();

      if (existingConv) {
        conversation = existingConv;
      } else {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({ contact_id: contact.id, channel: "SMS", status: "open" })
          .select()
          .single();
        conversation = newConv;
      }
    }

    // Classify intent with fallback
    let intent = "general";
    let sentiment = "neutral";
    try {
      const classifyRes = await fetch("https://portal.engwx.com/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: Body }),
      });
      if (classifyRes.ok) {
        const classifyData = await classifyRes.json();
        intent = classifyData.intent || "general";
        sentiment = classifyData.sentiment || "neutral";
      }
    } catch (e) {
      console.log("Classify error:", e.message);
    }

    console.log("Intent:", intent, "Sentiment:", sentiment);

    // Store inbound message
    if (conversation) {
      await supabase.from("conversation_messages").insert({
        conversation_id: conversation.id,
        direction: "inbound",
        content: Body,
        intent,
        sentiment,
        channel: "SMS",
      });
    }

    // Handle opt-out
    if (intent === "opt_out") {
      if (contact) {
        await supabase.from("contacts").update({ status: "unsubscribed" }).eq("id", contact.id);
      }
      await sendSMS(From, To, "You have been unsubscribed. Reply START to resubscribe.");
      return res.status(200).send("<Response></Response>");
    }

    // Get bot response with fallback
    let reply = "Thanks for your message! We'll get back to you shortly.";
    try {
      const respondRes = await fetch("https://portal.engwx.com/api/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: Body,
          intent,
          sentiment,
          conversationId: conversation?.id,
        }),
      });
      if (respondRes.ok) {
        const respondData = await respondRes.json();
        reply = respondData.reply || reply;
      }
    } catch (e) {
      console.log("Respond error:", e.message);
    }

    console.log("Sending reply:", reply);

    // Send reply
    await sendSMS(From, To, reply);

    // Store outbound message
    if (conversation) {
      await supabase.from("conversation_messages").insert({
        conversation_id: conversation.id,
        direction: "outbound",
        content: reply,
        channel: "SMS",
      });
    }

    res.status(200).send("<Response></Response>");
  } catch (err) {
    console.error("Inbound handler error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
