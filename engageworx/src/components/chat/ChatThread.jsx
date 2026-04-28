import { useRef, useEffect } from "react";
import MessageBubble from "./MessageBubble";
import TypingIndicator, { typingKeyframes } from "./TypingIndicator";

/**
 * ChatThread — scroll container that renders a list of unified messages.
 *
 * Each message in `messages` must follow the unified shape:
 *   { role, content, timestamp?, metadata? }
 *
 * Props:
 *   messages       — array of unified messages
 *   isTyping       — show typing indicator at bottom
 *   typingAvatar   — avatar content for the typing indicator
 *   colors         — { primary, accent, muted } theme object
 *   emptyState     — ReactNode rendered when messages is empty
 *   botName        — label inside assistant bubbles
 *   showAvatars    — enable avatar rendering (default true)
 *   maxWidth       — max bubble width (default "70%")
 *   dateSeparator  — string or null; shows a date pill at the top
 *   renderMessage  — optional (msg, index) => ReactNode override
 */
export default function ChatThread({
  messages = [],
  isTyping = false,
  typingAvatar = "🤖",
  colors = {},
  emptyState = null,
  botName,
  showAvatars = true,
  maxWidth = "70%",
  dateSeparator = null,
  renderMessage,
  style: styleOverride,
}) {
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <>
      <div style={{
        flex: 1, overflowY: "auto", padding: "16px 20px",
        display: "flex", flexDirection: "column", gap: 10,
        ...styleOverride,
      }}>
        {/* Date separator pill */}
        {dateSeparator && (
          <div style={{ textAlign: "center", margin: "12px 0 20px" }}>
            <span style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: "4px 14px",
              fontSize: 10, color: "rgba(255,255,255,0.25)",
            }}>
              {dateSeparator}
            </span>
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && emptyState}

        {/* Messages */}
        {messages.map((msg, i) => {
          if (renderMessage) {
            const custom = renderMessage(msg, i);
            if (custom !== undefined) return custom;
          }

          // Determine avatar grouping — show avatar when sender changes
          const prev = i > 0 ? messages[i - 1] : null;
          const showAvatar = showAvatars && (!prev || prev.role !== msg.role);

          return (
            <MessageBubble
              key={msg.id || i}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              metadata={{ botName, ...msg.metadata }}
              colors={colors}
              showAvatar={showAvatar}
              maxWidth={maxWidth}
            />
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <TypingIndicator
            avatar={typingAvatar}
            colors={colors}
          />
        )}

        <div ref={endRef} />
      </div>

      {/* Keyframes — safe to include multiple times, browser dedupes */}
      <style>{typingKeyframes}</style>
    </>
  );
}
