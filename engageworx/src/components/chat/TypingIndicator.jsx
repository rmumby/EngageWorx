/**
 * TypingIndicator — animated 3-dot typing indicator.
 *
 * Props:
 *   avatar       — content for the avatar circle (string/node), or null for no avatar
 *   colors       — { primary } theme object
 *   animationName — CSS animation name (caller must inject the @keyframes)
 */
export default function TypingIndicator({
  avatar = null,
  colors = {},
  animationName = "typingDot",
  style: styleOverride,
}) {
  const primary = colors.primary || "#00C9FF";

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", ...styleOverride }}>
      {avatar !== null && (
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: `${primary}33`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, color: primary, fontWeight: 800, flexShrink: 0,
        }}>
          {avatar}
        </div>
      )}
      <div style={{
        background: `${primary}15`,
        border: `1px solid ${primary}33`,
        borderRadius: "14px 14px 14px 4px",
        padding: "12px 18px",
      }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[0, 1, 2].map(d => (
            <div key={d} style={{
              width: 6, height: 6, borderRadius: "50%",
              background: primary, opacity: 0.5,
              animation: `${animationName} 1.4s infinite ${d * 0.2}s`,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Inject this string inside a <style> tag to power the animation.
 * Consumers that already have the keyframes can skip this.
 */
export const typingKeyframes = `
@keyframes typingDot {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-4px); }
}`;
