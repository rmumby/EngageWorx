import { useState, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';

/**
 * useClaudeStream — SSE consumer for /api/ai-stream
 *
 * Returns:
 *   messages    — conversation array in unified shape [{role, content}]
 *   send        — (userMessage: string) => void — appends user msg + streams assistant reply
 *   isStreaming  — boolean, true while SSE stream is open
 *   error       — string | null
 *   reset       — () => void — clears messages and error
 *
 * Options:
 *   tenantId    — required, scoped to this tenant
 *   system      — system prompt string
 *   maxTokens   — max response tokens (default 1024)
 *   onDone      — (fullText: string) => void — called when stream completes
 */
export default function useClaudeStream({
  tenantId,
  system = '',
  maxTokens = 1024,
  onDone,
} = {}) {
  var [messages, setMessages] = useState([]);
  var [isStreaming, setIsStreaming] = useState(false);
  var [error, setError] = useState(null);
  var abortRef = useRef(null);

  var reset = useCallback(function () {
    setMessages([]);
    setError(null);
    setIsStreaming(false);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  var send = useCallback(async function (userMessage) {
    if (!userMessage.trim() || !tenantId) return;
    setError(null);

    // Append user message
    var userMsg = { role: 'user', content: userMessage.trim() };
    var updatedMessages;
    setMessages(function (prev) {
      updatedMessages = prev.concat([userMsg]);
      return updatedMessages;
    });

    // Get auth token
    var session;
    try {
      var result = await supabase.auth.getSession();
      session = result.data.session;
    } catch (e) {
      // ignore
    }
    if (!session || !session.access_token) {
      setError('Not authenticated — please sign in');
      return;
    }

    // Start streaming
    setIsStreaming(true);
    var controller = new AbortController();
    abortRef.current = controller;

    // Add placeholder assistant message
    var assistantIdx;
    setMessages(function (prev) {
      assistantIdx = prev.length;
      return prev.concat([{ role: 'assistant', content: '' }]);
    });

    var fullText = '';

    try {
      var res = await fetch('/api/ai-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          messages: updatedMessages.map(function (m) {
            return { role: m.role, content: m.content };
          }),
          system: system,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        var errData;
        try { errData = await res.json(); } catch (_) { errData = {}; }
        throw new Error(errData.error || 'AI request failed (' + res.status + ')');
      }

      // Read SSE stream
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;

        buffer += decoder.decode(chunk.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop();

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (!line.startsWith('data: ')) continue;

          var payload;
          try { payload = JSON.parse(line.slice(6)); } catch (_) { continue; }

          if (payload.type === 'delta') {
            fullText += payload.text;
            // Update assistant message in place
            setMessages(function (prev) {
              var next = prev.slice();
              next[assistantIdx] = { role: 'assistant', content: fullText };
              return next;
            });
          } else if (payload.type === 'error') {
            setError(payload.error);
          }
          // 'done' type — stream will close naturally
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    }

    setIsStreaming(false);
    abortRef.current = null;

    if (onDone && fullText) {
      onDone(fullText);
    }
  }, [tenantId, system, maxTokens, onDone]);

  return { messages: messages, send: send, isStreaming: isStreaming, error: error, reset: reset };
}
