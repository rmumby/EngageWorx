// /api/create-checkout-session.js
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { priceId, email, plan, tenantName, successUrl } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      subscription_data: {
        trial_period_days: 14,
        metadata: { plan: plan || 'starter', tenant_name: tenantName || 'My Business' },
      },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || `${req.headers.origin || "https://portal.engwx.com"}?signup=success`,
      cancel_url: `${req.headers.origin || "https://portal.engwx.com"}?signup=cancelled`,
      metadata: { plan: plan || 'starter', tenant_name: tenantName || 'My Business' },
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Stripe session error:", error);
    return res.status(500).json({ error: error.message });
  }
}
