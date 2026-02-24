import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

export default function AdminTenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");

  useEffect(() => { fetchTenants(); }, [filter]);

  const fetchTenants = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .eq("status", filter)
      .order("created_at", { ascending: false });
    setTenants(data || []);
    setLoading(false);
  };

  const approveTenant = async (tenant) => {
    await supabase.from("tenants").update({ status: "active" }).eq("id", tenant.id);

    // Send welcome email
    await fetch("/api/send-welcome-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: tenant.id }),
    });

    fetchTenants();
  };

  const rejectTenant = async (tenant) => {
    await supabase.from("tenants").update({ status: "rejected" }).eq("id", tenant.id);
    fetchTenants();
  };

  const suspendTenant = async (tenant) => {
    await supabase.from("tenants").update({ status: "suspended" }).eq("id", tenant.id);
    fetchTenants();
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.logo}>
          <span style={{ color: "#e2e8f0" }}>Engage</span>
          <span style={{ color: "#0ea5e9" }}>Worx</span>
          <span style={styles.adminBadge}>Admin</span>
        </div>
        <h1 style={styles.title}>Tenant Management</h1>
      </div>

      <div style={styles.filters}>
        {["pending", "active", "suspended", "rejected"].map(f => (
          <button key={f} style={{ ...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {}) }}
            onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.loading}>Loading tenants...</div>
      ) : tenants.length === 0 ? (
        <div style={styles.empty}>No {filter} tenants</div>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <div style={styles.col}>Business</div>
            <div style={styles.col}>Plan</div>
            <div style={styles.col}>Twilio</div>
            <div style={styles.col}>Payment</div>
            <div style={styles.col}>Signed up</div>
            <div style={styles.col}>Actions</div>
          </div>
          {tenants.map(tenant => (
            <div key={tenant.id} style={styles.tableRow}>
              <div style={styles.col}>
                <div style={styles.tenantName}>{tenant.name}</div>
                <div style={styles.tenantSlug}>/{tenant.slug}</div>
              </div>
              <div style={styles.col}>
                <span style={styles.planBadge}>{tenant.plan}</span>
              </div>
              <div style={styles.col}>
                <span style={{ color: tenant.twilio_option === "managed" ? "#0ea5e9" : "#a78bfa", fontSize: 12 }}>
                  {tenant.twilio_option === "managed" ? "Managed" : "Own"}
                </span>
              </div>
              <div style={styles.col}>
                <span style={{
                  color: tenant.payment_status === "active" ? "#4ade80" :
                    tenant.payment_status === "past_due" ? "#fb923c" : "#64748b",
                  fontSize: 12
                }}>
                  {tenant.payment_status || "pending"}
                </span>
              </div>
              <div style={styles.col}>
                <span style={{ color: "#64748b", fontSize: 12 }}>
                  {new Date(tenant.created_at).toLocaleDateString()}
                </span>
              </div>
              <div style={{ ...styles.col, display: "flex", gap: 8 }}>
                {filter === "pending" && (
                  <>
                    <button style={styles.approveBtn} onClick={() => approveTenant(tenant)}>Approve</button>
                    <button style={styles.rejectBtn} onClick={() => rejectTenant(tenant)}>Reject</button>
                  </>
                )}
                {filter === "active" && (
                  <button style={styles.rejectBtn} onClick={() => suspendTenant(tenant)}>Suspend</button>
                )}
                {filter === "suspended" && (
                  <button style={styles.approveBtn} onClick={() => approveTenant(tenant)}>Reactivate</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#0f172a", padding: 40, fontFamily: "'DM Sans', sans-serif" },
  header: { marginBottom: 32 },
  logo: { fontSize: 24, fontWeight: 800, marginBottom: 8 },
  adminBadge: { background: "#1e293b", color: "#64748b", fontSize: 12, padding: "2px 8px", borderRadius: 4, marginLeft: 8, fontWeight: 500 },
  title: { color: "#e2e8f0", fontSize: 28, fontWeight: 700, margin: 0 },
  filters: { display: "flex", gap: 8, marginBottom: 24 },
  filterBtn: { background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "8px 16px", color: "#64748b", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  filterBtnActive: { background: "#0c2a3f", border: "1px solid #0ea5e9", color: "#0ea5e9" },
  loading: { color: "#64748b", textAlign: "center", padding: 40 },
  empty: { color: "#64748b", textAlign: "center", padding: 40 },
  table: { background: "#0f1b2d", border: "1px solid #1e3a5f", borderRadius: 12, overflow: "hidden" },
  tableHeader: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 2fr", padding: "12px 20px", background: "#0c1628", borderBottom: "1px solid #1e3a5f" },
  tableRow: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 2fr", padding: "16px 20px", borderBottom: "1px solid #1e293b", alignItems: "center" },
  col: { color: "#94a3b8", fontSize: 13 },
  tenantName: { color: "#e2e8f0", fontSize: 14, fontWeight: 600 },
  tenantSlug: { color: "#475569", fontSize: 12 },
  planBadge: { background: "#1e293b", color: "#94a3b8", padding: "2px 8px", borderRadius: 4, fontSize: 12 },
  approveBtn: { background: "#064e3b", border: "1px solid #4ade80", color: "#4ade80", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  rejectBtn: { background: "#450a0a", border: "1px solid #dc2626", color: "#fca5a5", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
};
