import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 99,
    priceId: "price_1T4QhrPEs1sluBAUvF8Jt7tx",
    numbers: 1,
    sms: "1,000",
    description: "Perfect for small businesses getting started with SMS"
  },
  {
    id: "growth",
    name: "Growth",
    price: 249,
    priceId: "price_1T4QqZPEs1sluBAUFNhNczt1",
    numbers: 3,
    sms: "5,000",
    description: "For growing businesses with higher messaging needs",
    popular: true
  },
  {
    id: "pro",
    name: "Pro",
    price: 499,
    priceId: "price_1T4QqhPEs1sluBAUNd6yUGYd",
    numbers: 10,
    sms: "20,000",
    description: "For agencies and high-volume messaging operations"
  }
];

const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

export default function SignupPage({ onBack }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("growth");
  const [twilioOption, setTwilioOption] = useState("managed");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTwilioToken, setShowTwilioToken] = useState(false);

  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    businessName: "",
    brandColor: "#0ea5e9",
    logoUrl: "",
    twilioAccountSid: "",
    twilioAuthToken: "",
    twilioPhoneNumber: "",
    teamEmails: "",
  });

  // Check if returning from Stripe checkout success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") === "success") {
      setStep(6);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSignup = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: { business_name: form.businessName }
        }
      });

      if (authError) throw authError;

      const slug = form.businessName.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({
          name: form.businessName,
          slug,
          brand_color: form.brandColor,
          logo_url: form.logoUrl || null,
          plan: selectedPlan,
          stripe_price_id: PLANS.find(p => p.id === selectedPlan)?.priceId,
          twilio_option: twilioOption,
          twilio_account_sid: twilioOption === "own" ? form.twilioAccountSid : null,
          twilio_auth_token: twilioOption === "own" ? form.twilioAuthToken : null,
          twilio_phone_number: twilioOption === "own" ? form.twilioPhoneNumber : null,
          status: "pending",
          owner_id: authData.user?.id,
        })
        .select()
        .single();

      if (tenantError) throw tenantError;

      await supabase.from("users").insert({
        tenant_id: tenant.id,
        auth_id: authData.user?.id,
        email: form.email,
        role: "owner",
      });

      if (form.teamEmails) {
        const emails = form.teamEmails.split(",").map(e => e.trim()).filter(Boolean);
        for (const email of emails) {
          await supabase.from("tenant_invites").insert({
            tenant_id: tenant.id,
            email,
            invited_by: authData.user?.id,
            status: "pending",
          });
        }
      }

      // Send admin notification
      try {
        await fetch("/api/notify-admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessName: form.businessName,
            email: form.email,
            plan: selectedPlan,
            twilioOption,
          }),
        });
      } catch (e) {
        console.log("Admin notification failed:", e);
      }

      // Move to Stripe checkout with success redirect
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId: PLANS.find(p => p.id === selectedPlan)?.priceId,
          tenantId: tenant.id,
          email: form.email,
          successUrl: window.location.origin + "?signup=success",
        }),
      });
      const { url } = await res.json();
      window.location.href = url;

    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const eyeButtonStyle = {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>
            <span style={styles.logoEngage}>Engage</span>
            <span style={styles.logoWorx}>Worx</span>
          </div>
          <p style={styles.tagline}>AI-Powered SMS Platform</p>
        </div>

        {/* Step 6 - Welcome / Pending Approval */}
        {step === 6 ? (
          <div style={styles.card}>
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 64, marginBottom: 20 }}>🎉</div>
              <h2 style={{ color: "#e2e8f0", fontSize: 28, fontWeight: 800, margin: "0 0 12px 0" }}>
                Welcome to EngageWorx!
              </h2>
              <p style={{ color: "#94a3b8", fontSize: 16, lineHeight: 1.6, margin: "0 0 24px 0" }}>
                Your account has been created and your subscription is active.
              </p>
              <div style={{
                background: "#0c2a3f",
                border: "1px solid #0ea5e9",
                borderRadius: 12,
                padding: 24,
                marginBottom: 24,
                textAlign: "left"
              }}>
                <div style={{ color: "#0ea5e9", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
                  What happens next?
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ color: "#0ea5e9", fontSize: 18, lineHeight: 1 }}>①</div>
                    <div>
                      <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>Account Review</div>
                      <div style={{ color: "#64748b", fontSize: 13 }}>Our team will review and approve your account within 24 hours.</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ color: "#0ea5e9", fontSize: 18, lineHeight: 1 }}>②</div>
                    <div>
                      <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>Phone Number Setup</div>
                      <div style={{ color: "#64748b", fontSize: 13 }}>We'll provision your SMS number and configure your AI bot.</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ color: "#0ea5e9", fontSize: 18, lineHeight: 1 }}>③</div>
                    <div>
                      <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>Welcome Email</div>
                      <div style={{ color: "#64748b", fontSize: 13 }}>You'll receive login credentials and a quick-start guide via email.</div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{
                background: "#1e293b",
                borderRadius: 10,
                padding: "14px 20px",
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                gap: 10
              }}>
                <div style={{ fontSize: 20 }}>📧</div>
                <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "left" }}>
                  Check your email for a confirmation link. If you don't see it, check your spam folder.
                </div>
              </div>
              <button style={styles.btn} onClick={() => { if (onBack) onBack(); }}>
                Go to Login →
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Progress - only show for steps 1-5 */}
            <div style={styles.progress}>
              {["Account", "Business", "Phone", "Team", "Plan"].map((label, i) => (
                <div key={i} style={styles.progressItem}>
                  <div style={{
                    ...styles.progressDot,
                    background: step > i + 1 ? "#0ea5e9" : step === i + 1 ? "#0ea5e9" : "#1e293b",
                    border: step === i + 1 ? "2px solid #38bdf8" : "2px solid #1e293b",
                  }}>
                    {step > i + 1 ? "✓" : i + 1}
                  </div>
                  <span style={{ ...styles.progressLabel, color: step === i + 1 ? "#e2e8f0" : "#475569" }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* Card */}
            <div style={styles.card}>
              {error && <div style={styles.error}>{error}</div>}

              {/* Step 1 - Account */}
              {step === 1 && (
                <div style={styles.stepContent}>
                  <h2 style={styles.stepTitle}>Create your account</h2>
                  <p style={styles.stepDesc}>Start your 14-day free trial. No credit card required yet.</p>
                  <div style={styles.field}>
                    <label style={styles.label}>Email address</label>
                    <input style={styles.input} type="email" value={form.email}
                      onChange={e => update("email", e.target.value)} placeholder="you@company.com" />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Password</label>
                    <div style={{ position: "relative" }}>
                      <input style={{ ...styles.input, width: "100%", boxSizing: "border-box", paddingRight: 44 }}
                        type={showPassword ? "text" : "password"} value={form.password}
                        onChange={e => update("password", e.target.value)} placeholder="Min 8 characters" />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} style={eyeButtonStyle}>
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Confirm password</label>
                    <div style={{ position: "relative" }}>
                      <input style={{ ...styles.input, width: "100%", boxSizing: "border-box", paddingRight: 44 }}
                        type={showConfirm ? "text" : "password"} value={form.confirmPassword}
                        onChange={e => update("confirmPassword", e.target.value)} placeholder="Repeat password" />
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={eyeButtonStyle}>
                        {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                  <button style={styles.btn} onClick={() => {
                    if (!form.email || !form.password) return setError("Please fill all fields");
                    if (form.password !== form.confirmPassword) return setError("Passwords don't match");
                    if (form.password.length < 8) return setError("Password must be at least 8 characters");
                    setError(""); setStep(2);
                  }}>Continue →</button>
                  <p style={styles.loginLink}>Already have an account? <button onClick={() => { if (onBack) onBack(); }} style={{ ...styles.link, background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>Sign in</button></p>
                </div>
              )}

              {/* Step 2 - Business */}
              {step === 2 && (
                <div style={styles.stepContent}>
                  <h2 style={styles.stepTitle}>Your business</h2>
                  <p style={styles.stepDesc}>This is how your brand appears to your customers.</p>
                  <div style={styles.field}>
                    <label style={styles.label}>Business name</label>
                    <input style={styles.input} value={form.businessName}
                      onChange={e => update("businessName", e.target.value)} placeholder="Acme Corporation" />
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Brand color</label>
                    <div style={styles.colorRow}>
                      <input type="color" value={form.brandColor}
                        onChange={e => update("brandColor", e.target.value)}
                        style={styles.colorPicker} />
                      <input style={{ ...styles.input, flex: 1 }} value={form.brandColor}
                        onChange={e => update("brandColor", e.target.value)} placeholder="#0ea5e9" />
                    </div>
                  </div>
                  <div style={styles.field}>
                    <label style={styles.label}>Logo URL <span style={styles.optional}>(optional)</span></label>
                    <input style={styles.input} value={form.logoUrl}
                      onChange={e => update("logoUrl", e.target.value)} placeholder="https://yoursite.com/logo.png" />
                  </div>
                  <div style={styles.btnRow}>
                    <button style={styles.btnBack} onClick={() => setStep(1)}>← Back</button>
                    <button style={styles.btn} onClick={() => {
                      if (!form.businessName) return setError("Business name is required");
                      setError(""); setStep(3);
                    }}>Continue →</button>
                  </div>
                </div>
              )}

              {/* Step 3 - Phone */}
              {step === 3 && (
                <div style={styles.stepContent}>
                  <h2 style={styles.stepTitle}>Phone number setup</h2>
                  <p style={styles.stepDesc}>Choose how you want to manage your SMS number.</p>
                  <div style={styles.optionCards}>
                    <div style={{ ...styles.optionCard, ...(twilioOption === "managed" ? styles.optionCardActive : {}) }}
                      onClick={() => setTwilioOption("managed")}>
                      <div style={styles.optionIcon}>📱</div>
                      <div style={styles.optionTitle}>EngageWorx Managed</div>
                      <div style={styles.optionDesc}>We provision and manage your number. Simplest option — no Twilio account needed.</div>
                    </div>
                    <div style={{ ...styles.optionCard, ...(twilioOption === "own" ? styles.optionCardActive : {}) }}
                      onClick={() => setTwilioOption("own")}>
                      <div style={styles.optionIcon}>🔧</div>
                      <div style={styles.optionTitle}>Bring Your Own Twilio</div>
                      <div style={styles.optionDesc}>Use your existing Twilio account and number. Best for enterprises.</div>
                    </div>
                  </div>

                  {twilioOption === "own" && (
                    <div style={styles.twilioFields}>
                      <div style={styles.field}>
                        <label style={styles.label}>Twilio Account SID</label>
                        <input style={styles.input} value={form.twilioAccountSid}
                          onChange={e => update("twilioAccountSid", e.target.value)} placeholder="ACxxxxxxxxxxxxxxxx" />
                      </div>
                      <div style={styles.field}>
                        <label style={styles.label}>Twilio Auth Token</label>
                        <div style={{ position: "relative" }}>
                          <input style={{ ...styles.input, width: "100%", boxSizing: "border-box", paddingRight: 44 }}
                            type={showTwilioToken ? "text" : "password"} value={form.twilioAuthToken}
                            onChange={e => update("twilioAuthToken", e.target.value)} placeholder="Your auth token" />
                          <button type="button" onClick={() => setShowTwilioToken(!showTwilioToken)} style={eyeButtonStyle}>
                            {showTwilioToken ? <EyeOffIcon /> : <EyeIcon />}
                          </button>
                        </div>
                      </div>
                      <div style={styles.field}>
                        <label style={styles.label}>Twilio Phone Number</label>
                        <input style={styles.input} value={form.twilioPhoneNumber}
                          onChange={e => update("twilioPhoneNumber", e.target.value)} placeholder="+12135551234" />
                      </div>
                    </div>
                  )}

                  <div style={styles.btnRow}>
                    <button style={styles.btnBack} onClick={() => setStep(2)}>← Back</button>
                    <button style={styles.btn} onClick={() => { setError(""); setStep(4); }}>Continue →</button>
                  </div>
                </div>
              )}

              {/* Step 4 - Team */}
              {step === 4 && (
                <div style={styles.stepContent}>
                  <h2 style={styles.stepTitle}>Invite your team</h2>
                  <p style={styles.stepDesc}>Add team members who will manage conversations. You can add more later.</p>
                  <div style={styles.field}>
                    <label style={styles.label}>Team email addresses <span style={styles.optional}>(optional)</span></label>
                    <textarea style={styles.textarea} value={form.teamEmails}
                      onChange={e => update("teamEmails", e.target.value)}
                      placeholder="agent1@company.com, agent2@company.com" rows={3} />
                    <p style={styles.hint}>Separate multiple emails with commas. They'll receive an invite email.</p>
                  </div>
                  <div style={styles.btnRow}>
                    <button style={styles.btnBack} onClick={() => setStep(3)}>← Back</button>
                    <button style={styles.btn} onClick={() => { setError(""); setStep(5); }}>Continue →</button>
                  </div>
                </div>
              )}

              {/* Step 5 - Plan */}
              {step === 5 && (
                <div style={styles.stepContent}>
                  <h2 style={styles.stepTitle}>Choose your plan</h2>
                  <p style={styles.stepDesc}>All plans include AI bot, agent inbox, and analytics. Cancel anytime.</p>
                  <div style={styles.plans}>
                    {PLANS.map(plan => (
                      <div key={plan.id}
                        style={{ ...styles.planCard, ...(selectedPlan === plan.id ? styles.planCardActive : {}) }}
                        onClick={() => setSelectedPlan(plan.id)}>
                        {plan.popular && <div style={styles.popularBadge}>Most Popular</div>}
                        <div style={styles.planName}>{plan.name}</div>
                        <div style={styles.planPrice}>${plan.price}<span style={styles.planPer}>/mo</span></div>
                        <div style={styles.planFeatures}>
                          <div style={styles.planFeature}>📱 {plan.numbers} phone number{plan.numbers > 1 ? "s" : ""}</div>
                          <div style={styles.planFeature}>💬 {plan.sms} SMS/month</div>
                          <div style={styles.planFeature}>🤖 AI bot included</div>
                          <div style={styles.planFeature}>👥 Unlimited agents</div>
                          <div style={styles.planFeature}>📊 Analytics dashboard</div>
                        </div>
                        <div style={styles.planOverage}>Overage: $0.025/SMS</div>
                      </div>
                    ))}
                  </div>
                  <div style={styles.btnRow}>
                    <button style={styles.btnBack} onClick={() => setStep(4)}>← Back</button>
                    <button style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
                      onClick={handleSignup} disabled={loading}>
                      {loading ? "Setting up..." : "Start Free Trial →"}
                    </button>
                  </div>
                  <p style={styles.hint}>14-day free trial. You won't be charged until your trial ends.</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #0c1a2e 50%, #0f172a 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 20px",
    fontFamily: "'DM Sans', sans-serif",
  },
  container: { width: "100%", maxWidth: 560 },
  header: { textAlign: "center", marginBottom: 32 },
  logo: { fontSize: 32, fontWeight: 800, letterSpacing: -1 },
  logoEngage: { color: "#e2e8f0" },
  logoWorx: { color: "#0ea5e9" },
  tagline: { color: "#64748b", fontSize: 14, marginTop: 4 },
  progress: { display: "flex", justifyContent: "center", gap: 8, marginBottom: 32, alignItems: "center" },
  progressItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  progressDot: { width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#e2e8f0" },
  progressLabel: { fontSize: 10, fontWeight: 500 },
  card: { background: "#0f1b2d", border: "1px solid #1e3a5f", borderRadius: 16, padding: 40 },
  error: { background: "#450a0a", border: "1px solid #dc2626", borderRadius: 8, padding: "12px 16px", color: "#fca5a5", fontSize: 14, marginBottom: 20 },
  stepContent: { display: "flex", flexDirection: "column", gap: 20 },
  stepTitle: { color: "#e2e8f0", fontSize: 24, fontWeight: 700, margin: 0 },
  stepDesc: { color: "#64748b", fontSize: 14, margin: 0 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { color: "#94a3b8", fontSize: 13, fontWeight: 500 },
  optional: { color: "#475569", fontWeight: 400 },
  input: { background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, outline: "none" },
  textarea: { background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, outline: "none", resize: "vertical", fontFamily: "inherit" },
  hint: { color: "#475569", fontSize: 12, margin: 0 },
  colorRow: { display: "flex", gap: 10, alignItems: "center" },
  colorPicker: { width: 44, height: 40, borderRadius: 8, border: "1px solid #334155", cursor: "pointer", padding: 2, background: "#1e293b" },
  btn: { background: "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "#fff", border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  btnBack: { background: "transparent", color: "#64748b", border: "1px solid #334155", borderRadius: 8, padding: "12px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer" },
  btnRow: { display: "flex", gap: 12, justifyContent: "space-between" },
  loginLink: { color: "#475569", fontSize: 13, textAlign: "center", margin: 0 },
  link: { color: "#0ea5e9", textDecoration: "none" },
  optionCards: { display: "flex", gap: 12 },
  optionCard: { flex: 1, background: "#1e293b", border: "2px solid #334155", borderRadius: 12, padding: 16, cursor: "pointer", transition: "all 0.2s" },
  optionCardActive: { border: "2px solid #0ea5e9", background: "#0c2a3f" },
  optionIcon: { fontSize: 24, marginBottom: 8 },
  optionTitle: { color: "#e2e8f0", fontSize: 14, fontWeight: 600, marginBottom: 4 },
  optionDesc: { color: "#64748b", fontSize: 12, lineHeight: 1.5 },
  twilioFields: { background: "#1e293b", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 16 },
  plans: { display: "flex", gap: 12 },
  planCard: { flex: 1, background: "#1e293b", border: "2px solid #334155", borderRadius: 12, padding: 16, cursor: "pointer", position: "relative", transition: "all 0.2s" },
  planCardActive: { border: "2px solid #0ea5e9", background: "#0c2a3f" },
  popularBadge: { position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#0ea5e9", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20 },
  planName: { color: "#94a3b8", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  planPrice: { color: "#e2e8f0", fontSize: 28, fontWeight: 800, marginBottom: 12 },
  planPer: { fontSize: 14, fontWeight: 400, color: "#64748b" },
  planFeatures: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 },
  planFeature: { color: "#94a3b8", fontSize: 12 },
  planOverage: { color: "#475569", fontSize: 11, borderTop: "1px solid #334155", paddingTop: 8, marginTop: 4 },
};

