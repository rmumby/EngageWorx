import { useRef, useEffect } from "react";

/**
 * ChatInput — unified chat input bar.
 *
 * Supports two submit modes:
 *   "enter"    — Enter sends, Shift+Enter newlines  (chat / preview)
 *   "cmdEnter" — Cmd/Ctrl+Enter sends              (helpdesk / agent)
 *
 * Optional mode toggle for reply vs internal-note.
 */
export default function ChatInput({
  value,
  onChange,
  onSend,
  placeholder = "Type a message...",
  submitMode = "enter",
  disabled = false,
  sending = false,
  rows = 2,
  colors = {},
  sendLabel = "Send",
  sendingLabel = "...",
  // Mode toggle (reply vs internal note)
  mode,            // "reply" | "internal" | undefined
  onModeChange,    // (mode) => void
  modeOptions,     // [{ id, label, icon }] — e.g. [{ id: "reply", label: "Reply", icon: "↩" }]
  // Toolbar extras rendered before input
  toolbar,
  autoFocus = false,
  style: styleOverride,
}) {
  const ref = useRef(null);
  const primary = colors.primary || "#00C9FF";
  const accent = colors.accent || primary;

  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, [autoFocus]);

  const handleKeyDown = (e) => {
    if (submitMode === "enter" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled && !sending) onSend();
    }
    if (submitMode === "cmdEnter" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (value.trim() && !disabled && !sending) onSend();
    }
  };

  const canSend = value.trim() && !disabled && !sending;

  return (
    <div style={styleOverride}>
      {/* Mode toggle */}
      {modeOptions && onModeChange && (
        <div style={{ display: "flex", gap: 0, marginBottom: 10, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden", width: "fit-content" }}>
          {modeOptions.map((opt) => (
            <button key={opt.id} onClick={() => onModeChange(opt.id)} style={{
              padding: "6px 14px", fontSize: 12,
              background: mode === opt.id ? accent : "transparent",
              color: mode === opt.id ? "#fff" : "rgba(255,255,255,0.4)",
              border: "none", cursor: "pointer", fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {opt.icon && <span style={{ marginRight: 4 }}>{opt.icon}</span>}{opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar (canned responses, action buttons, etc.) */}
      {toolbar}

      {/* Input row */}
      <div style={{ display: "flex", gap: 8 }}>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          style={{
            flex: 1,
            background: "rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            padding: "10px 14px",
            color: "#fff",
            fontSize: 14,
            fontFamily: "'DM Sans', sans-serif",
            resize: "none",
            lineHeight: 1.4,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          style={{
            background: canSend
              ? `linear-gradient(135deg, ${primary}, ${accent})`
              : "rgba(255,255,255,0.06)",
            border: "none",
            borderRadius: 10,
            padding: "0 20px",
            color: canSend ? "#000" : "rgba(255,255,255,0.2)",
            fontWeight: 700,
            cursor: canSend ? "pointer" : "not-allowed",
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
            transition: "all 0.2s",
            alignSelf: "stretch",
          }}
        >
          {sending ? sendingLabel : sendLabel}
        </button>
      </div>
    </div>
  );
}
