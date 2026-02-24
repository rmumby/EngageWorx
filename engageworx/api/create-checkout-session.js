import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { priceId, tenantId, email } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `https://portal.engwx.com/onboarding?tenant=${tenantId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://portal.engwx.com/signup?canceled=true`,
      metadata: { tenantId },
      subscription_data: {
        trial_period_days: 14,
        metadata: { tenantId },
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err.message);
    res.status(500).json({ error: err.message });
  }
}
