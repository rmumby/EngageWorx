// api/ai-advisor.js
// Authenticated server-side proxy for Anthropic Messages API calls from portal clients.
// Keeps the API key server-side. Requires a valid portal session (Bearer token) plus an
// active tenant membership (or superadmin) — this closes the previously OPEN, unauthenticated
// proxy that ran arbitrary prompts on our key from any origin.
//
// Response shape is intentionally unchanged (callers read data.content); per-caller envelope
// cleaning is handled as each caller is migrated.

import { createClient } from "@supabase/supabase-js";

const PORTAL_ORIGIN = process.env.PORTAL_ORIGIN || "https://portal.engwx.com";

function getSupabase() {
  return createClient(
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", PORTAL_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = getSupabase();

  // Auth: require a valid portal session.
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing auth" });
  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  const user = authData ? authData.user : null;
  if (authErr || !user) return res.status(401).json({ error: "Invalid auth" });

  // Authorization: superadmin, or an active member of at least one tenant. This is a
  // generic proxy (no per-tenant resource in the request to scope to), so any legitimate
  // logged-in portal user is allowed; anonymous/public callers are not.
  try {
    const { data: prof } = await supabase.from("user_profiles").select("role").eq("id", user.id).maybeSingle();
    const isSA = prof && prof.role === "superadmin";
    if (!isSA) {
      const { data: membership } = await supabase
        .from("tenant_members").select("id")
        .eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
      if (!membership) return res.status(403).json({ error: "Not authorized" });
    }
  } catch (e) {
    return res.status(403).json({ error: "Not authorized" });
  }

  try {
    const { messages, system, max_tokens = 1000 } = req.body || {};
    if (!messages) return res.status(400).json({ error: "messages required" });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens,
        ...(system ? { system } : {}),
        messages,
      }),
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("AI advisor proxy error:", err.message);
    return res.status(500).json({ error: "AI request failed" });
  }
}
