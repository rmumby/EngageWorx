/**
 * MessageBubble — unified chat message primitive.
 *
 * Unified message shape:
 *   { role, content, timestamp?, metadata? }
 *
 * role:      "user" | "assistant" | "agent" | "system"
 * content:   string (plain text or HTML when metadata.isHtml is true)
 * timestamp: Date | string | null
 * metadata:  {
 *   authorName?,   — display name above/beside bubble
 *   avatar?,       — string or node for avatar circle
 *   isInternal?,   — internal note (dashed border, lock badge)
 *   isEscalation?, — escalation marker
 *   delivered?,    — delivery receipt
 *   read?,         — read receipt
 *   isHtml?,       — render content with dangerouslySetInnerHTML
 *   botName?,      — label shown inside assistant bubbles
 * }
 */
export default function MessageBubble({
  role,
  content,
  timestamp,
  metadata = {},
  align,
  colors = {},
  showAvatar = false,
  maxWidth = "70%",
  style: styleOverride,
}) {
  const {
    authorName,
    avatar,
    isInternal,
    isEscalation,
    delivered,
    read,
    isHtml,
    botName,
  } = metadata;

  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isSystem = role === "system";

  // Alignment: explicit prop wins, otherwise user/agent right, assistant/system left
  const resolvedAlign = align || (isUser ? "right" : isAssistant || isSystem ? "left" : "right");
  const isLeft = resolvedAlign === "left";

  // Theme colors with sensible defaults
  const primary = colors.primary || "#00C9FF";
  const accent = colors.accent || primary;
  const muted = colors.muted || "rgba(255,255,255,0.4)";

  // System messages render as plain italic text
  if (isSystem) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, ...styleOverride }}>
        <div style={{ fontSize: 12, color: muted, fontStyle: "italic" }}>{content}</div>
      </div>
    );
  }

  // Background per role + state
  const bgMap = {
    user: "rgba(255,255,255,0.08)",
    assistant: `${primary}15`,
    agent: `${primary}22`,
  };
  let bg = bgMap[role] || "rgba(255,255,255,0.06)";
  if (isInternal) bg = "rgba(99,102,241,0.08)";
  if (isEscalation) bg = "rgba(245,158,11,0.12)";

  // Border
  let border = isUser
    ? "1px solid rgba(255,255,255,0.1)"
    : `1px solid ${primary}33`;
  if (isInternal) border = "1px dashed rgba(99,102,241,0.3)";
  if (isEscalation) border = "1px solid rgba(245,158,11,0.3)";

  // Border radius — tail on sender side
  const borderRadius = isLeft ? "14px 14px 14px 4px" : "14px 14px 4px 14px";

  // Format timestamp
  let timeStr = null;
  if (timestamp) {
    if (timestamp instanceof Date) {
      timeStr = timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else {
      timeStr = String(timestamp);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isLeft ? "flex-start" : "flex-end", gap: 4, ...styleOverride }}>
      {/* Author line */}
      {(authorName || role) && (
        <div style={{ fontSize: 11, color: muted, paddingLeft: 4, paddingRight: 4 }}>
          {isInternal && <span style={{ color: "#f59e0b", marginRight: 4 }}>🔒 Internal —</span>}
          {authorName || role}
          {isAssistant && <span style={{ color: "#06b6d4", marginLeft: 6 }}>🤖 AI</span>}
          {timeStr && <span style={{ marginLeft: 6 }}>· {timeStr}</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexDirection: isLeft ? "row" : "row-reverse" }}>
        {/* Avatar */}
        {showAvatar && avatar && (
          <div style={{
            width: 26, height: 26, borderRadius: "50%",
            background: `${primary}33`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, flexShrink: 0, color: primary, fontWeight: 800,
          }}>
            {avatar}
          </div>
        )}
        {showAvatar && !avatar && <div style={{ width: 26, flexShrink: 0 }} />}

        {/* Bubble */}
        <div style={{
          maxWidth,
          background: bg,
          border,
          borderRadius,
          padding: "10px 14px",
          color: "rgba(255,255,255,0.85)",
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {isEscalation && (
            <div style={{ fontSize: 10, color: "#f59e0b", marginBottom: 4, fontWeight: 600 }}>🚨 ESCALATION TRIGGERED</div>
          )}
          {isInternal && (
            <div style={{ fontSize: 10, color: "#6366f1", marginBottom: 4, fontWeight: 600 }}>🔒 INTERNAL NOTE — Not visible to customer</div>
          )}
          {isAssistant && botName && (
            <div style={{ color: primary, fontSize: 9, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>🤖 {botName}</div>
          )}
          {isHtml
            ? <div style={{ whiteSpace: "normal", padding: "4px 0", overflowX: "auto", maxWidth: "100%", display: "block", width: "100%" }} dangerouslySetInnerHTML={{ __html: content }} />
            : content}
        </div>
      </div>

      {/* Delivery status / timestamp footer (for inbox-style views) */}
      {(delivered !== undefined || (timeStr && !authorName)) && (
        <div style={{ display: "flex", justifyContent: isLeft ? "flex-start" : "flex-end", gap: 6, alignItems: "center", paddingLeft: showAvatar ? 34 : 0, paddingRight: showAvatar ? 34 : 0 }}>
          {timeStr && !authorName && <span style={{ color: "rgba(255,255,255,0.15)", fontSize: 9 }}>{timeStr}</span>}
          {delivered && (
            <span style={{ color: read ? primary : "rgba(255,255,255,0.2)", fontSize: 10 }}>
              {read ? "✓✓" : "✓"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
