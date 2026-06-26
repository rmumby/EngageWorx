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
import { useState } from 'react';
var { markdownToHtml, sanitizeHtml, sanitizeEmailHtml } = require('../../lib/markdownToHtml');
var { stripQuotedReply } = require('../../chat/stripQuotedReply');
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
    mediaUrls,
    tenantTz,
    channel,
  } = metadata;

  const isUser = role === "user";
  const isAssistant = role === "assistant";
  const isSystem = role === "system";

  // Alignment: explicit prop wins, otherwise user/agent right, assistant/system left
  const resolvedAlign = align || (isUser ? "right" : isAssistant || isSystem ? "left" : "right");
  const isLeft = resolvedAlign === "left";

  // Theme colors with sensible defaults
  const primary = colors.primary || "#00C9FF"; // brand-relative fallback — kept
  const accent = colors.accent || primary;
  const muted = colors.muted || "var(--theme-text-muted)";

  // Email plaintext quoted-reply / signature trimming (PLAINTEXT ONLY — never HTML emails).
  // Render the fresh reply; when a quote or signature was cut, a "show quoted text" expander
  // reveals the full original body. Gated to channel === 'email' so chat/SMS bubbles are untouched.
  const emailStrip = (channel === 'email' && !isHtml && typeof content === 'string')
    ? stripQuotedReply(content, { trimSignature: true })
    : null;
  const hasHiddenQuote = !!(emailStrip && (emailStrip.quoted || emailStrip.sigTrimmed));
  const [showQuoted, setShowQuoted] = useState(false);
  const bodyToRender = (emailStrip && !showQuoted) ? emailStrip.visible : content;

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
    user: "var(--theme-active-bg)",
    assistant: `${primary}15`,
    agent: `${primary}22`,
  };
  let bg = bgMap[role] || "var(--theme-surface-raised)";
  if (isInternal) bg = "rgba(99,102,241,0.08)";
  if (isEscalation) bg = "rgba(245,158,11,0.12)";

  // Border
  let border = isUser
    ? "1px solid var(--theme-border-strong)"
    : `1px solid ${primary}33`;
  if (isInternal) border = "1px dashed rgba(99,102,241,0.3)";
  if (isEscalation) border = "1px solid rgba(245,158,11,0.3)";

  // Border radius — tail on sender side
  const borderRadius = isLeft ? "14px 14px 14px 4px" : "14px 14px 4px 14px";

  // Format timestamp
  let timeStr = null;
  if (timestamp) {
    if (timestamp instanceof Date) {
      timeStr = timestamp.toLocaleTimeString([], Object.assign({ hour: "2-digit", minute: "2-digit" }, tenantTz ? { timeZone: tenantTz } : {}));
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
          color: "var(--theme-text)",
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
          {mediaUrls && mediaUrls.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: content ? 8 : 0 }}>
              {mediaUrls.map(function(url, idx) {
                return (
                  <a key={idx} href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block", lineHeight: 0 }}>
                    <img src={url} alt="Attachment" style={{
                      maxWidth: 240, maxHeight: 320, borderRadius: 10,
                      objectFit: "cover", cursor: "pointer",
                      border: "1px solid var(--theme-border-strong)",
                    }} />
                  </a>
                );
              })}
            </div>
          )}
          {isHtml
            ? <div style={{ whiteSpace: "normal", padding: "4px 0", overflowX: "auto", maxWidth: "100%", display: "block", width: "100%" }} dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(content) }} />
            : (isAssistant || role === 'agent')
              ? <div style={{ whiteSpace: "normal", padding: "4px 0" }} dangerouslySetInnerHTML={{ __html: sanitizeHtml(markdownToHtml(bodyToRender || '')) }} />
              : bodyToRender}
          {hasHiddenQuote && (
            <button
              type="button"
              onClick={function() { setShowQuoted(function(v) { return !v; }); }}
              style={{ background: "none", border: "none", padding: "4px 0 0", marginTop: 4, cursor: "pointer", color: muted, fontSize: 11, fontWeight: 600, fontFamily: "inherit", textAlign: isLeft ? "left" : "right" }}
            >
              {showQuoted ? "Hide quoted text" : "Show quoted text"}
            </button>
          )}
        </div>
      </div>

      {/* Delivery status / timestamp footer (for inbox-style views) */}
      {(delivered !== undefined || (timeStr && !authorName)) && (
        <div style={{ display: "flex", justifyContent: isLeft ? "flex-start" : "flex-end", gap: 6, alignItems: "center", paddingLeft: showAvatar ? 34 : 0, paddingRight: showAvatar ? 34 : 0 }}>
          {timeStr && !authorName && <span style={{ color: "var(--theme-timestamp)", fontSize: 9 }}>{timeStr}</span>}
          {delivered && (
            <span style={{ color: read ? primary : "var(--theme-disabled-text)", fontSize: 10 }}>
              {read ? "✓✓" : "✓"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
