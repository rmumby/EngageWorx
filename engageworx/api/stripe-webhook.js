import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const sig = req.headers["stripe-signature"];
  const buf = await buffer(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  const { type, data } = event;
  console.log("Stripe event:", type);

  try {
    switch (type) {
      case "checkout.session.completed": {
        const session = data.object;
        const tenantId = session.metadata?.tenantId;
        if (tenantId) {
          await supabase.from("tenants").update({
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            payment_status: "active",
          }).eq("id", tenantId);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = data.object;
        const tenantId = invoice.subscription_details?.metadata?.tenantId;
        if (tenantId) {
          await supabase.from("tenants").update({
            payment_status: "active",
            sms_usage: 0, // Reset monthly usage
          }).eq("id", tenantId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = data.object;
        const tenantId = invoice.subscription_details?.metadata?.tenantId;
        if (tenantId) {
          await supabase.from("tenants").update({
            payment_status: "past_due",
          }).eq("id", tenantId);
          // Send warning email via Resend
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "billing@engwx.com",
              to: invoice.customer_email,
              subject: "Action Required: Payment Failed",
              html: `<p>Your EngageWorx payment failed. Please update your payment method to avoid service interruption. <a href="https://portal.engwx.com/billing">Update payment method</a></p>`,
            }),
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = data.object;
        const tenantId = subscription.metadata?.tenantId;
        if (tenantId) {
          await supabase.from("tenants").update({
            status: "suspended",
            payment_status: "cancelled",
          }).eq("id", tenantId);
        }
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
