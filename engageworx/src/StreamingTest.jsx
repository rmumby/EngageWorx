/**
 * StreamingTest — Phase 2 end-to-end streaming test page.
 *
 * Demonstrates useClaudeStream + ChatThread working together.
 * Access: add activeTab === "streaming-test" to App.jsx nav, or
 *         render <StreamingTest tenantId={...} /> directly.
 *
 * NOT a production component — remove or gate behind admin flag after Phase 2 verification.
 */
import { useState } from 'react';
import { ChatThread, ChatInput } from './components/chat';
import useClaudeStream from './hooks/useClaudeStream';

export default function StreamingTest({ tenantId, C = {} }) {
  var primary = C.primary || '#00C9FF';
  var accent = C.accent || primary;
  var colors = { primary: primary, accent: accent, muted: 'rgba(255,255,255,0.4)' };

  var [systemPrompt, setSystemPrompt] = useState(
    'You are a helpful AI assistant. Keep responses concise — 2-3 sentences max. You are being used to test a streaming integration.'
  );
  var [inputValue, setInputValue] = useState('');

  var MAX_TOKENS_CAP = 2000;
  var [maxTokens, setMaxTokens] = useState(512);

  var { messages, send, isStreaming, error, reset } = useClaudeStream({
    tenantId: tenantId,
    system: systemPrompt,
    maxTokens: Math.min(maxTokens, MAX_TOKENS_CAP),
  });

  function handleSend() {
    if (!inputValue.trim() || isStreaming) return;
    send(inputValue);
    setInputValue('');
  }

  // Map to unified shape (useClaudeStream already returns {role, content})
  var threadMessages = messages.map(function (m, i) {
    return {
      id: i,
      role: m.role,
      content: m.content,
      metadata: m.role === 'assistant' ? { botName: 'Claude', avatar: '🤖' } : {},
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ color: '#fff', margin: 0, fontSize: 20, fontWeight: 800 }}>
              🧪 Streaming Test — Phase 2
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.35)', margin: '4px 0 0', fontSize: 12 }}>
              End-to-end: useClaudeStream → /api/ai-stream → Anthropic SSE → ChatThread
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isStreaming && (
              <span style={{ color: primary, fontSize: 12, fontWeight: 700 }}>
                ● Streaming...
              </span>
            )}
            <button onClick={reset} style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '6px 14px', color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif",
            }}>
              Reset
            </button>
          </div>
        </div>

        {/* Tenant ID display */}
        <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
            Tenant: <span style={{ color: primary, fontFamily: 'monospace' }}>{tenantId || 'NONE'}</span>
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
            Model: <span style={{ color: '#FFD600', fontFamily: 'monospace' }}>claude-sonnet-4-20250514</span>
          </span>
        </div>

        {/* System prompt */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            System Prompt
          </div>
          <textarea
            value={systemPrompt}
            onChange={function (e) { setSystemPrompt(e.target.value); }}
            rows={2}
            style={{
              width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: '8px 12px', color: 'rgba(255,255,255,0.6)', fontSize: 12,
              fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Max tokens control */}
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Max Tokens
          </span>
          <input
            type="range" min={64} max={MAX_TOKENS_CAP} step={64} value={maxTokens}
            onChange={function (e) { setMaxTokens(parseInt(e.target.value)); }}
            style={{ width: 160, accentColor: primary }}
          />
          <span style={{ fontSize: 12, color: primary, fontWeight: 700, fontFamily: 'monospace' }}>
            {maxTokens}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
            (cap: {MAX_TOKENS_CAP})
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '10px 24px', background: 'rgba(255,59,48,0.1)',
          borderBottom: '1px solid rgba(255,59,48,0.2)', color: '#FF3B30',
          fontSize: 13, fontWeight: 600,
        }}>
          Error: {error}
        </div>
      )}

      {/* Chat thread */}
      <ChatThread
        messages={threadMessages}
        isTyping={isStreaming}
        typingAvatar="🤖"
        colors={colors}
        botName="Claude"
        showAvatars={true}
        maxWidth="75%"
        emptyState={
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🧪</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
              Streaming Test Ready
            </div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, maxWidth: 400, margin: '0 auto', lineHeight: 1.5 }}>
              Type a message below to test the full pipeline:<br />
              Client → /api/ai-stream → Anthropic → SSE → ChatThread
            </div>
            {!tenantId && (
              <div style={{
                marginTop: 16, padding: '10px 16px', background: 'rgba(255,59,48,0.1)',
                border: '1px solid rgba(255,59,48,0.2)', borderRadius: 8,
                color: '#FF3B30', fontSize: 12, display: 'inline-block',
              }}>
                No tenant_id — you must be logged in with a tenant context
              </div>
            )}
          </div>
        }
      />

      {/* Input */}
      <div style={{ padding: '12px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          placeholder={tenantId ? 'Type a test message...' : 'Sign in first — tenant_id required'}
          submitMode="enter"
          rows={1}
          disabled={!tenantId || isStreaming}
          colors={colors}
        />
      </div>
    </div>
  );
}
