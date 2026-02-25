import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const C = {
  bg: "#0A0E1A",
  surface: "#111827",
  surfaceAlt: "#1a2235",
  border: "#1e2d45",
  accent: "#00C9FF",
  accent2: "#E040FB",
  accent3: "#00E676",
  accent4: "#FF6B35",
  warning: "#FFD600",
  text: "#E8F4FD",
  muted: "#6B8BAE",
  dim: "#3A5068",
};

function Badge({ children, color }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>{children}</span>
  );
}

// Add/Edit Contact Modal
function ContactModal({ contact, onSave, onClose }) {
  const [form, setForm] = useState({
    first_name: contact?.first_name || "",
    last_name: contact?.last_name || "",
    phone: contact?.phone || "",
    email: contact?.email || "",
    tags: contact?.tags?.join(", ") || "",
    notes: contact?.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.phone.trim() && !form.email.trim()) return;
    setSaving(true);
    let phone = form.phone.replace(/[\s\-\(\)\.]/g, "");
if (phone.length === 10 && !phone.startsWith("+")) phone = "+1" + phone;
if (phone.length === 11 && phone.startsWith("1") && !phone.startsWith("+")) phone = "+" + phone;
await onSave({
  ...form,
  phone,
  tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
});
    setSaving(false);
  };

  const inputStyle = {
    width: "100%", background: C.bg, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 14,
    boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif",
    outline: "none",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: 28, width: 440, maxHeight: "90vh", overflow: "auto",
        boxShadow: `0 20px 60px rgba(0,0,0,0.5)`,
      }}>
        <h3 style={{ color: C.text, margin: "0 0 20px", fontSize: 18, fontWeight: 800 }}>
          {contact ? "Edit Contact" : "Add Contact"}
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>First Name</label>
            <input style={inputStyle} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="John" />
          </div>
          <div>
            <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Last Name</label>
            <input style={inputStyle} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Doe" />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Phone *</label>
          <input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1234567890" />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Email</label>
          <input style={inputStyle} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Tags (comma separated)</label>
          <input style={inputStyle} value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="VIP, newsletter, lead" />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 }}>Notes</label>
          <textarea style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this contact..." />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSave} disabled={saving || (!form.phone.trim() && !form.email.trim())} style={{
            flex: 1, background: saving ? C.border : `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
            border: "none", borderRadius: 8, padding: "11px 20px",
            color: saving ? C.muted : "#000", fontWeight: 800, cursor: saving ? "not-allowed" : "pointer", fontSize: 14,
          }}>
            {saving ? "Saving..." : contact ? "Update Contact" : "Add Contact"}
          </button>
          <button onClick={onClose} style={{
            background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "11px 20px",
            color: C.muted, cursor: "pointer", fontSize: 14,
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// CSV Import Modal
function ImportModal({ onImport, onClose }) {
  const [csvData, setCsvData] = useState(null);
  const [preview, setPreview] = useState([]);
  const [mapping, setMapping] = useState({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  const requiredFields = ["phone"];
  const optionalFields = ["first_name", "last_name", "email", "tags", "notes"];
  const allFields = [...requiredFields, ...optionalFields];

  const parseCSV = (text) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return { headers: [], rows: [] };

    // Handle both comma and tab delimiters
    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));
    const rows = lines.slice(1).map(line => {
      const values = [];
      let current = "";
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') { inQuotes = !inQuotes; }
        else if (char === delimiter && !inQuotes) { values.push(current.trim()); current = ""; }
        else { current += char; }
      }
      values.push(current.trim());
      return values;
    }).filter(row => row.some(cell => cell.length > 0));

    return { headers, rows };
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers, rows } = parseCSV(ev.target.result);
      setCsvData({ headers, rows });
      setPreview(rows.slice(0, 5));

      // Auto-map columns
      const autoMap = {};
      headers.forEach((h, i) => {
        const lower = h.toLowerCase().replace(/[^a-z]/g, "");
        if (lower.includes("phone") || lower.includes("mobile") || lower.includes("cell")) autoMap[i] = "phone";
        else if (lower.includes("first") || lower === "fname") autoMap[i] = "first_name";
        else if (lower.includes("last") || lower === "lname") autoMap[i] = "last_name";
        else if (lower.includes("email") || lower.includes("mail")) autoMap[i] = "email";
        else if (lower.includes("tag") || lower.includes("group") || lower.includes("list")) autoMap[i] = "tags";
        else if (lower.includes("note") || lower.includes("comment")) autoMap[i] = "notes";
      });
      setMapping(autoMap);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvData) return;
    setImporting(true);

    const contacts = csvData.rows.map(row => {
      const contact = {};
      Object.entries(mapping).forEach(([colIdx, field]) => {
        if (field && row[colIdx]) {
          contact[field] = row[colIdx].replace(/^["']|["']$/g, "").trim();
        }
      });
      // Parse tags
      if (contact.tags) {
        contact.tags = contact.tags.split(/[,;|]/).map(t => t.trim()).filter(Boolean);
      }
      return contact;
    }).filter(c => c.phone); // Must have phone

    const res = await onImport(contacts);
    setResult(res);
    setImporting(false);
  };

  const hasPhoneMapping = Object.values(mapping).includes("phone");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: 28, width: 640, maxHeight: "90vh", overflow: "auto",
        boxShadow: `0 20px 60px rgba(0,0,0,0.5)`,
      }}>
        <h3 style={{ color: C.text, margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>Import Contacts from CSV</h3>
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 20px" }}>Upload a CSV file with phone numbers and contact info</p>

        {result ? (
          <div>
            <div style={{
              background: result.failed > 0 ? C.accent4 + "11" : C.accent3 + "11",
              border: `1px solid ${result.failed > 0 ? C.accent4 : C.accent3}33`,
              borderRadius: 10, padding: 16, marginBottom: 20, textAlign: "center",
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>{result.failed > 0 ? "⚠️" : "✅"}</div>
              <div style={{ color: C.text, fontSize: 16, fontWeight: 800 }}>{result.imported} contacts imported</div>
              {result.failed > 0 && <div style={{ color: C.accent4, fontSize: 13, marginTop: 4 }}>{result.failed} failed (duplicates or invalid)</div>}
              {result.skipped > 0 && <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{result.skipped} skipped (no phone number)</div>}
            </div>
            <button onClick={onClose} style={{
              width: "100%", background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
              border: "none", borderRadius: 8, padding: "11px 20px",
              color: "#000", fontWeight: 800, cursor: "pointer", fontSize: 14,
            }}>Done</button>
          </div>
        ) : !csvData ? (
          <div>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${C.border}`, borderRadius: 12,
                padding: "40px 20px", textAlign: "center", cursor: "pointer",
                transition: "all 0.2s", marginBottom: 16,
              }}
              onMouseOver={e => e.currentTarget.style.borderColor = C.accent}
              onMouseOut={e => e.currentTarget.style.borderColor = C.border}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
              <div style={{ color: C.text, fontSize: 15, fontWeight: 700 }}>Click to upload CSV file</div>
              <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Supports .csv and .tsv files</div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFile} style={{ display: "none" }} />

            <div style={{ background: C.bg, borderRadius: 8, padding: 14, border: `1px solid ${C.border}` }}>
              <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Expected format</div>
              <code style={{ color: C.accent, fontSize: 12, lineHeight: 1.6 }}>
                phone, first_name, last_name, email, tags<br/>
                +15551234567, John, Doe, john@example.com, VIP<br/>
                +15559876543, Jane, Smith, jane@test.com, "lead, newsletter"
              </code>
            </div>

            <button onClick={onClose} style={{
              width: "100%", marginTop: 16, background: "transparent", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "11px 20px",
              color: C.muted, cursor: "pointer", fontSize: 14,
            }}>Cancel</button>
          </div>
        ) : (
          <div>
            {/* Column Mapping */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Map your columns</div>
              <div style={{ display: "grid", gap: 8 }}>
                {csvData.headers.map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 140, color: C.text, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h}
                    </div>
                    <div style={{ color: C.dim, fontSize: 16 }}>→</div>
                    <select
                      value={mapping[i] || ""}
                      onChange={e => setMapping({ ...mapping, [i]: e.target.value })}
                      style={{
                        flex: 1, background: C.bg, border: `1px solid ${C.border}`,
                        borderRadius: 6, padding: "6px 10px", color: C.text, fontSize: 13,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      <option value="">— Skip —</option>
                      {allFields.map(f => (
                        <option key={f} value={f}>{f.replace("_", " ")}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                Preview ({csvData.rows.length} rows total, showing first 5)
              </div>
              <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {csvData.headers.map((h, i) => (
                        <th key={i} style={{ padding: "8px 10px", background: C.bg, color: mapping[i] ? C.accent : C.dim, textAlign: "left", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                          {mapping[i] ? `✓ ${mapping[i].replace("_", " ")}` : h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{ padding: "6px 10px", color: C.text, borderBottom: `1px solid ${C.border}08`, whiteSpace: "nowrap", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {!hasPhoneMapping && (
              <div style={{ background: "#FF000011", border: "1px solid #FF000033", borderRadius: 8, padding: 10, marginBottom: 12, color: "#FF6B6B", fontSize: 12 }}>
                ⚠️ You must map at least one column to "phone" to import contacts.
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleImport} disabled={importing || !hasPhoneMapping} style={{
                flex: 1, background: importing || !hasPhoneMapping ? C.border : `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
                border: "none", borderRadius: 8, padding: "11px 20px",
                color: importing || !hasPhoneMapping ? C.muted : "#000", fontWeight: 800,
                cursor: importing || !hasPhoneMapping ? "not-allowed" : "pointer", fontSize: 14,
              }}>
                {importing ? "Importing..." : `Import ${csvData.rows.length} Contacts`}
              </button>
              <button onClick={() => { setCsvData(null); setPreview([]); setMapping({}); }} style={{
                background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "11px 16px",
                color: C.muted, cursor: "pointer", fontSize: 13,
              }}>Back</button>
              <button onClick={onClose} style={{
                background: "transparent", border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "11px 16px",
                color: C.muted, cursor: "pointer", fontSize: 13,
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContactManager({ tenantId }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editContact, setEditContact] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [page, setPage] = useState(0);
  const perPage = 25;

  useEffect(() => { loadContacts(); }, [tenantId]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadContacts = async () => {
    setLoading(true);
    try {
      let query = supabase.from("contacts").select("*").order("created_at", { ascending: false }).limit(1000);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw error;
      setContacts(data || []);
    } catch (err) {
      console.error("Load contacts error:", err);
    }
    setLoading(false);
  };

  const saveContact = async (formData) => {
    try {
      if (editContact) {
        const { error } = await supabase.from("contacts")
          .update({ ...formData, updated_at: new Date().toISOString() })
          .eq("id", editContact.id);
        if (error) throw error;
        showToast("Contact updated!");
      } else {
        const { error } = await supabase.from("contacts")
          .insert({ ...formData, tenant_id: tenantId || null });
        if (error) throw error;
        showToast("Contact added!");
      }
      setShowAddModal(false);
      setEditContact(null);
      loadContacts();
    } catch (err) {
      showToast("Error: " + err.message, "error");
    }
  };

  const deleteContacts = async (ids) => {
    if (!window.confirm(`Delete ${ids.length} contact${ids.length > 1 ? "s" : ""}? This cannot be undone.`)) return;
    try {
      const { error } = await supabase.from("contacts").delete().in("id", ids);
      if (error) throw error;
      setSelected(new Set());
      showToast(`${ids.length} contact${ids.length > 1 ? "s" : ""} deleted`);
      loadContacts();
    } catch (err) {
      showToast("Delete error: " + err.message, "error");
    }
  };

  const importContacts = async (contactsArray) => {
    let imported = 0, failed = 0, skipped = 0;

    // Batch insert in chunks of 50
    const chunks = [];
    for (let i = 0; i < contactsArray.length; i += 50) {
      chunks.push(contactsArray.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      const rows = chunk.map(c => ({
        tenant_id: tenantId || null,
        phone: (() => {
  let p = (c.phone || "").replace(/[\s\-\(\)\.]/g, "");
  if (p.length === 10 && !p.startsWith("+")) p = "+1" + p;
  if (p.length === 11 && p.startsWith("1") && !p.startsWith("+")) p = "+" + p;
  return p;
})(),
        first_name: c.first_name || null,
        last_name: c.last_name || null,
        email: c.email || null,
        tags: c.tags || [],
        notes: c.notes || null,
      }));

      const { data, error } = await supabase.from("contacts").insert(rows).select();
      if (error) {
        // Try one by one for this chunk
        for (const row of rows) {
          const { error: singleErr } = await supabase.from("contacts").insert(row);
          if (singleErr) failed++;
          else imported++;
        }
      } else {
        imported += (data?.length || chunk.length);
      }
    }

    loadContacts();
    return { imported, failed, skipped };
  };

  // Get all unique tags
  const allTags = [...new Set(contacts.flatMap(c => c.tags || []))].sort();

  // Filter contacts
  const filtered = contacts.filter(c => {
    const matchesSearch = !search || [c.first_name, c.last_name, c.phone, c.email]
      .filter(Boolean).some(f => f.toLowerCase().includes(search.toLowerCase()));
    const matchesTag = !selectedTag || (c.tags || []).includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const allSelected = paged.length > 0 && paged.every(c => selected.has(c.id));

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      color: C.text,
    }}>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes toastIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        input:focus, select:focus { outline: none; border-color: ${C.accent} !important; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.type === "error" ? "#FF000022" : C.accent3 + "22",
          border: `1px solid ${toast.type === "error" ? "#FF000044" : C.accent3 + "44"}`,
          borderRadius: 10, padding: "12px 20px",
          color: toast.type === "error" ? "#FF6B6B" : C.accent3,
          fontSize: 14, fontWeight: 600,
          animation: "toastIn 0.3s ease",
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
        }}>
          {toast.type === "error" ? "❌ " : "✅ "}{toast.msg}
        </div>
      )}

      {showAddModal && (
        <ContactModal contact={editContact} onSave={saveContact} onClose={() => { setShowAddModal(false); setEditContact(null); }} />
      )}

      {showImportModal && (
        <ImportModal onImport={importContacts} onClose={() => setShowImportModal(false)} />
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <div style={{ animation: "slideUp 0.4s ease both", marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.accent3 + "15", border: `1px solid ${C.accent3}33`, borderRadius: 20, padding: "5px 14px", marginBottom: 12 }}>
                <span style={{ fontSize: 14 }}>👥</span>
                <span style={{ color: C.accent3, fontSize: 12, fontWeight: 700 }}>{contacts.length} Contacts</span>
              </div>
              <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, color: C.text }}>Contact Management</h1>
              <p style={{ color: C.muted, fontSize: 14, marginTop: 4 }}>Manage your audience — import, add, tag, and organize contacts</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowImportModal(true)} style={{
                background: C.accent + "22", border: `1px solid ${C.accent}44`,
                borderRadius: 8, padding: "10px 18px",
                color: C.accent, fontWeight: 700, cursor: "pointer", fontSize: 13,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                📄 Import CSV
              </button>
              <button onClick={() => { setEditContact(null); setShowAddModal(true); }} style={{
                background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
                border: "none", borderRadius: 8, padding: "10px 18px",
                color: "#000", fontWeight: 800, cursor: "pointer", fontSize: 13,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                + Add Contact
              </button>
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div style={{
          display: "flex", gap: 12, marginBottom: 20,
          animation: "slideUp 0.4s ease 0.05s both",
        }}>
          <div style={{ flex: 1, position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.dim, fontSize: 16 }}>🔍</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search by name, phone, or email..."
              style={{
                width: "100%", background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "11px 14px 11px 42px", color: C.text, fontSize: 14,
                boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>

          {allTags.length > 0 && (
            <select
              value={selectedTag}
              onChange={e => { setSelectedTag(e.target.value); setPage(0); }}
              style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "11px 14px", color: C.text, fontSize: 13,
                fontFamily: "'DM Sans', sans-serif", minWidth: 140,
              }}
            >
              <option value="">All Tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          {selected.size > 0 && (
            <button onClick={() => deleteContacts([...selected])} style={{
              background: "#FF000022", border: "1px solid #FF000044",
              borderRadius: 10, padding: "11px 18px",
              color: "#FF6B6B", fontWeight: 700, cursor: "pointer", fontSize: 13,
            }}>
              🗑 Delete {selected.size}
            </button>
          )}
        </div>

        {/* Contacts Table */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 14, overflow: "hidden",
          animation: "slideUp 0.4s ease 0.1s both",
        }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: C.dim }}>Loading contacts...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
              <div style={{ color: C.text, fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
                {search || selectedTag ? "No contacts match your search" : "No contacts yet"}
              </div>
              <div style={{ color: C.muted, fontSize: 14, marginBottom: 20 }}>
                {search || selectedTag ? "Try a different search or clear filters" : "Import a CSV or add contacts manually to get started"}
              </div>
              {!search && !selectedTag && (
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button onClick={() => setShowImportModal(true)} style={{
                    background: C.accent + "22", border: `1px solid ${C.accent}44`,
                    borderRadius: 8, padding: "10px 20px",
                    color: C.accent, fontWeight: 700, cursor: "pointer", fontSize: 13,
                  }}>📄 Import CSV</button>
                  <button onClick={() => { setEditContact(null); setShowAddModal(true); }} style={{
                    background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
                    border: "none", borderRadius: 8, padding: "10px 20px",
                    color: "#000", fontWeight: 800, cursor: "pointer", fontSize: 13,
                  }}>+ Add Contact</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ padding: "12px 14px", textAlign: "left", width: 40 }}>
                      <input type="checkbox" checked={allSelected} onChange={e => {
                        if (e.target.checked) {
                          setSelected(new Set(paged.map(c => c.id)));
                        } else {
                          setSelected(new Set());
                        }
                      }} />
                    </th>
                    <th style={{ padding: "12px 14px", textAlign: "left", color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Contact</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Phone</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Email</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Tags</th>
                    <th style={{ padding: "12px 14px", textAlign: "left", color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Added</th>
                    <th style={{ padding: "12px 14px", width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(c => (
                    <tr key={c.id} style={{
                      borderBottom: `1px solid ${C.border}08`,
                      background: selected.has(c.id) ? C.accent + "08" : "transparent",
                      transition: "background 0.15s",
                    }}
                      onMouseOver={e => { if (!selected.has(c.id)) e.currentTarget.style.background = C.surfaceAlt; }}
                      onMouseOut={e => { if (!selected.has(c.id)) e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ padding: "10px 14px" }}>
                        <input type="checkbox" checked={selected.has(c.id)} onChange={e => {
                          const next = new Set(selected);
                          e.target.checked ? next.add(c.id) : next.delete(c.id);
                          setSelected(next);
                        }} />
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: `linear-gradient(135deg, ${C.accent}44, ${C.accent2}44)`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: C.accent, fontWeight: 800, fontSize: 13,
                          }}>
                            {(c.first_name?.[0] || c.phone?.[0] || "?").toUpperCase()}
                          </div>
                          <div>
                            <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>
                              {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", color: C.text, fontSize: 13 }}>{c.phone || "—"}</td>
                      <td style={{ padding: "10px 14px", color: C.muted, fontSize: 13 }}>{c.email || "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {(c.tags || []).slice(0, 3).map(t => (
                            <Badge key={t} color={C.accent}>{t}</Badge>
                          ))}
                          {(c.tags || []).length > 3 && <Badge color={C.dim}>+{c.tags.length - 3}</Badge>}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", color: C.dim, fontSize: 12 }}>
                        {c.created_at ? new Date(c.created_at).toLocaleDateString("en", { month: "short", day: "numeric" }) : "—"}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => { setEditContact(c); setShowAddModal(true); }} style={{
                            background: "transparent", border: "none", cursor: "pointer",
                            color: C.muted, fontSize: 14, padding: 4,
                          }} title="Edit">✏️</button>
                          <button onClick={() => deleteContacts([c.id])} style={{
                            background: "transparent", border: "none", cursor: "pointer",
                            color: C.muted, fontSize: 14, padding: 4,
                          }} title="Delete">🗑</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 14px", borderTop: `1px solid ${C.border}`,
                }}>
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    Showing {page * perPage + 1}–{Math.min((page + 1) * perPage, filtered.length)} of {filtered.length}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button disabled={page === 0} onClick={() => setPage(page - 1)} style={{
                      background: page === 0 ? C.border : C.surfaceAlt, border: `1px solid ${C.border}`,
                      borderRadius: 6, padding: "6px 12px", color: page === 0 ? C.dim : C.text,
                      cursor: page === 0 ? "not-allowed" : "pointer", fontSize: 12,
                    }}>← Prev</button>
                    <span style={{ padding: "6px 12px", color: C.muted, fontSize: 12 }}>
                      Page {page + 1} of {totalPages}
                    </span>
                    <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} style={{
                      background: page >= totalPages - 1 ? C.border : C.surfaceAlt, border: `1px solid ${C.border}`,
                      borderRadius: 6, padding: "6px 12px", color: page >= totalPages - 1 ? C.dim : C.text,
                      cursor: page >= totalPages - 1 ? "not-allowed" : "pointer", fontSize: 12,
                    }}>Next →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
