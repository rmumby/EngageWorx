// api/sales-advisor.js
// Authenticated, lead-grounded "Next Actions" advisor for the pipeline dashboard.
// POST { lead_id }. Verifies the caller's session and that they own the lead's tenant
// (or are superadmin), fetches the lead + its real CRM context server-side, asks Claude
// Sonnet for grounded next actions, and returns ONLY a cleaned { actions: string[], risk }
// — never the raw Anthropic envelope. Uses the server-only ANTHROPIC_API_KEY.

import { createClient } from "@supabase/supabase-js";

const PORTAL_ORIGIN = process.env.PORTAL_ORIGIN || "https://portal.engwx.com";

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function daysSince(d) {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", PORTAL_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = getSupabase();

  // Auth: valid portal session.
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing auth" });
  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  const user = authData ? authData.user : null;
  if (authErr || !user) return res.status(401).json({ error: "Invalid auth" });

  const leadId = (req.body || {}).lead_id;
  if (!leadId) return res.status(400).json({ error: "lead_id required" });

  // Fetch the lead, then authorize the caller against its tenant.
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, tenant_id, name, company, email, phone, notes, urgency, qualified, pipeline_stage_id, last_action_at, last_activity_at, next_action, next_action_date")
    .eq("id", leadId).maybeSingle();
  if (leadErr || !lead) return res.status(404).json({ error: "Lead not found" });

  // Authorization: superadmin, or an active member of the lead's tenant.
  // A non-owner gets the SAME response as a missing lead (identical 404 body below) so lead
  // IDs cannot be probed for existence — most-restrictive default. Superadmin path unchanged.
  const { data: prof } = await supabase.from("user_profiles").select("role").eq("id", user.id).maybeSingle();
  const isSA = prof && prof.role === "superadmin";
  if (!isSA) {
    const { data: membership } = await supabase.from("tenant_members").select("id")
      .eq("tenant_id", lead.tenant_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!membership) return res.status(404).json({ error: "Lead not found" });
  }

  // Real context — all reads scoped to the lead's tenant.
  let stageKey = "unknown";
  if (lead.pipeline_stage_id) {
    const { data: st } = await supabase.from("pipeline_stages").select("stage_key")
      .eq("id", lead.pipeline_stage_id).maybeSingle();
    if (st && st.stage_key) stageKey = st.stage_key;
  }
  const { data: contacts } = await supabase.from("contacts")
    .select("first_name, last_name, title, email")
    .eq("tenant_id", lead.tenant_id).eq("pipeline_lead_id", lead.id).limit(10);
  const { data: seqRows } = await supabase.from("lead_sequences")
    .select("status, sequence_id")
    .eq("tenant_id", lead.tenant_id).eq("lead_id", lead.id).limit(10);

  let sequences = [];
  if (seqRows && seqRows.length) {
    const ids = seqRows.map((s) => s.sequence_id).filter(Boolean);
    const { data: seqDefs } = await supabase.from("sequences").select("id, name")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const nameById = {};
    (seqDefs || []).forEach((s) => { nameById[s.id] = s.name; });
    sequences = seqRows.map((s) => (nameById[s.sequence_id] || "sequence") + " (" + (s.status || "active") + ")");
  }

  const contactLines = (contacts || []).map((c) => {
    const nm = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    return "- " + (nm || c.email || "unnamed") + (c.title ? ", " + c.title : "");
  }).join("\n") || "none on file";

  const stale = daysSince(lead.last_action_at);
  const staleVal = stale == null ? daysSince(lead.last_activity_at) : stale;

  const context =
    "LEAD CONTEXT (real CRM data — ground every suggestion in this; do not invent facts):\n" +
    "Name: " + (lead.name || "unknown") + "\n" +
    "Company: " + (lead.company || "unknown") + "\n" +
    "Pipeline stage: " + stageKey + "\n" +
    "Qualified: " + (lead.qualified ? "yes" : "no") + "\n" +
    "Urgency: " + (lead.urgency || "unspecified") + "\n" +
    "Days since last action: " + (staleVal == null ? "unknown" : staleVal) + "\n" +
    "Planned next action: " + (lead.next_action || "none") +
      (lead.next_action_date ? " (by " + lead.next_action_date + ")" : "") + "\n" +
    "Active sequences: " + (sequences.length ? sequences.join(", ") : "none") + "\n" +
    "Contacts:\n" + contactLines + "\n" +
    "Notes: " + String(lead.notes || "none").slice(0, 1200) + "\n";

  const system =
    "You are a sharp B2B sales advisor. Use ONLY the provided lead context — never invent " +
    "statistics, names, or facts not present. If context is thin, give pragmatic actions based on " +
    "the stage and recency rather than fabricating detail. Respond with STRICT JSON only, no " +
    'markdown: {"actions":["...","...","..."],"risk":"..."} — exactly 3 specific, concrete next ' +
    "actions and one sentence naming the single biggest risk or opportunity.";

  let data;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 700,
        system,
        messages: [{ role: "user", content: context + "\nReturn the JSON now." }],
      }),
    });
    data = await response.json();
  } catch (err) {
    console.error("[sales-advisor] upstream error:", err.message);
    return res.status(502).json({ error: "Advisor request failed" });
  }

  // Parse the model output into a cleaned shape. The raw Anthropic envelope is never returned.
  const text = (data && Array.isArray(data.content) ? data.content : [])
    .filter((b) => b && b.type === "text").map((b) => b.text).join("\n").trim();

  let actions = [];
  let risk = "";
  try {
    let jsonStr = text;
    if (jsonStr.indexOf("```") !== -1) {
      const parts = jsonStr.replace(/```json/gi, "```").split("```");
      if (parts.length > 1) jsonStr = parts[1];
    }
    const m = jsonStr.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : jsonStr);
    if (Array.isArray(parsed.actions)) {
      actions = parsed.actions.map((a) => String(a).trim()).filter(Boolean).slice(0, 5);
    }
    if (parsed.risk) risk = String(parsed.risk).trim();
  } catch (e) {
    // Fallback: salvage bullet-ish lines so the UI still gets actions.
    actions = text.split("\n").map((l) => l.replace(/^[-*\d.)\s]+/, "").trim()).filter(Boolean).slice(0, 3);
  }

  return res.status(200).json({ actions, risk });
}
