// src/components/ui/RichEditor.jsx — Minimal contenteditable rich editor
// Toolbar: bold, italic, list, link. Outputs sanitized HTML.
// Props: value (HTML string), onChange(html), placeholder, disabled, style

import { useRef, useEffect, useCallback } from 'react';
import { useTheme } from '../../ThemeContext';
var DOMPurify = require('dompurify');

// Editor-specific sanitizer: allows links (toolbar produces <a>) + formatting tags.
// URI schemes restricted to http/https/mailto. Adds rel="noopener noreferrer" via hook.
var EDITOR_PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'br', 'a', 'div', 'span'],
  ALLOWED_ATTR: ['href', 'rel', 'target'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  ALLOW_DATA_ATTR: false,
};
// Force safe rel on all links
DOMPurify.addHook('afterSanitizeAttributes', function(node) {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer');
    node.setAttribute('target', '_blank');
  }
});
function sanitizeEditorHtml(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, EDITOR_PURIFY_CONFIG);
}

export default function RichEditor({ value, onChange, placeholder, disabled, style, maxHeight }) {
  var { theme, isDark } = useTheme();
  var editorRef = useRef(null);
  var internalUpdate = useRef(false);

  // Sync external value → editor (only when value changes externally)
  useEffect(function() {
    if (internalUpdate.current) { internalUpdate.current = false; return; }
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  var handleInput = useCallback(function() {
    if (!editorRef.current || disabled) return;
    internalUpdate.current = true;
    var html = editorRef.current.innerHTML;
    // Sanitize before passing up (editor config — allows links)
    onChange(sanitizeEditorHtml(html));
  }, [onChange, disabled]);

  function exec(cmd, val) {
    document.execCommand(cmd, false, val || null);
    editorRef.current && editorRef.current.focus();
    handleInput();
  }

  function handleLink() {
    var url = prompt('Enter URL:');
    if (url) exec('createLink', url);
  }

  var toolbarBtn = function(label, cmd) {
    return (
      <button
        type="button"
        onMouseDown={function(e) { e.preventDefault(); exec(cmd); }}
        disabled={disabled}
        style={{
          background: 'transparent', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          color: isDark ? theme.muted : '#6b7280', fontSize: 13, fontWeight: 700,
          padding: '4px 8px', borderRadius: 4, fontFamily: 'Georgia, serif',
        }}
      >{label}</button>
    );
  };

  var isEmpty = !value || value === '<br>' || value === '<div><br></div>';

  return (
    <div style={Object.assign({ border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#d1d5db'), borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }, style || {})}>
      {/* Toolbar — pinned (never scrolls with the body) */}
      <div style={{
        display: 'flex', gap: 2, padding: '4px 8px', flexShrink: 0,
        borderBottom: '1px solid ' + (isDark ? 'rgba(255,255,255,0.06)' : '#e5e7eb'),
        background: isDark ? 'rgba(255,255,255,0.02)' : '#f9fafb',
      }}>
        {toolbarBtn('B', 'bold')}
        {toolbarBtn('I', 'italic')}
        {toolbarBtn('List', 'insertUnorderedList')}
        <button
          type="button"
          onMouseDown={function(e) { e.preventDefault(); handleLink(); }}
          disabled={disabled}
          style={{
            background: 'transparent', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
            color: isDark ? theme.muted : '#6b7280', fontSize: 13, fontWeight: 700,
            padding: '4px 8px', borderRadius: 4, fontFamily: 'Georgia, serif',
          }}
        >Link</button>
      </div>
      {/* Editor — the only scrollable region; fills the bounded parent and scrolls
          internally so long content never grows the box past its container. */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          style={{
            flex: 1, minHeight: 120, overflowY: 'auto', padding: '10px 14px',
            // maxHeight is an optional standalone cap; when an ancestor bounds the
            // height (flex column), flex:1 + overflowY already scroll long content.
            ...(maxHeight ? { maxHeight: maxHeight } : {}),
            color: theme.text, fontSize: 14, lineHeight: 1.6,
            fontFamily: 'Georgia, serif',
            background: isDark ? 'rgba(0,0,0,0.3)' : '#ffffff',
            outline: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            opacity: disabled ? 0.5 : 1,
          }}
        />
        {isEmpty && placeholder && (
          <div style={{
            position: 'absolute', top: 10, left: 14,
            color: isDark ? 'rgba(255,255,255,0.25)' : '#9ca3af',
            fontSize: 14, fontFamily: 'Georgia, serif', pointerEvents: 'none',
          }}>{placeholder}</div>
        )}
      </div>
    </div>
  );
}
