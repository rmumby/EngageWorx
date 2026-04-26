import { createContext, useContext, useState, useEffect, useCallback } from 'react';

var DARK = {
  bg: '#080d1a', surface: '#0d1425', border: '#182440',
  text: '#E8F4FD', muted: '#6B8BAE',
  primary: '#00C9FF', accent: '#E040FB',
  inputBg: 'rgba(0,0,0,0.3)', inputBorder: 'rgba(255,255,255,0.1)',
  cardBg: 'rgba(255,255,255,0.03)', cardBorder: 'rgba(255,255,255,0.08)',
  badgeBg: 'rgba(255,255,255,0.06)',
  mode: 'dark',
};

var LIGHT = {
  bg: '#f9fafb', surface: '#ffffff', border: '#e5e7eb',
  text: '#111827', muted: '#4b5563',
  primary: '#0077B6', accent: '#7C3AED',
  inputBg: '#ffffff', inputBorder: '#d1d5db',
  cardBg: '#ffffff', cardBorder: '#e5e7eb',
  badgeBg: '#f3f4f6',
  mode: 'light',
};

var ThemeContext = createContext({ theme: DARK, isDark: true, toggleTheme: function() {}, setThemeMode: function() {} });

export function ThemeProvider({ children }) {
  // Check OS preference
  var getOSPreference = function() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  };

  // Check saved preference, fall back to OS preference
  var getInitialMode = function() {
    try {
      var saved = localStorage.getItem('ew_theme_mode');
      if (saved === 'dark' || saved === 'light') return saved;
      if (saved === 'auto' || !saved) return getOSPreference();
    } catch (e) {}
    return 'dark';
  };

  var [mode, setMode] = useState(getInitialMode); // 'dark', 'light'
  var [preference, setPreference] = useState(function() {
    try { return localStorage.getItem('ew_theme_preference') || 'auto'; } catch(e) { return 'auto'; }
  }); // 'auto', 'dark', 'light'

  // Listen for OS preference changes when set to auto
  useEffect(function() {
    if (preference !== 'auto') return;
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var handler = function(e) { setMode(e.matches ? 'dark' : 'light'); };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
    return function() {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else if (mq.removeListener) mq.removeListener(handler);
    };
  }, [preference]);

  var setThemeMode = useCallback(function(newPref) {
    setPreference(newPref);
    try { localStorage.setItem('ew_theme_preference', newPref); } catch(e) {}
    if (newPref === 'auto') {
      var osMode = getOSPreference();
      setMode(osMode);
      try { localStorage.setItem('ew_theme_mode', osMode); } catch(e) {}
    } else {
      setMode(newPref);
      try { localStorage.setItem('ew_theme_mode', newPref); } catch(e) {}
    }
  }, []);

  var toggleTheme = useCallback(function() {
    var newMode = mode === 'dark' ? 'light' : 'dark';
    setMode(newMode);
    setPreference(newMode);
    try {
      localStorage.setItem('ew_theme_mode', newMode);
      localStorage.setItem('ew_theme_preference', newMode);
    } catch(e) {}
  }, [mode]);

  var theme = mode === 'dark' ? DARK : LIGHT;
  var isDark = mode === 'dark';

  // Sync body class for CSS targeting
  useEffect(function() {
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('dark-mode', isDark);
      document.body.classList.toggle('light-mode', !isDark);
    }
  }, [isDark]);

  // Global CSS overrides for light mode — forces readable text on white backgrounds
  var isPortalHost = (typeof window !== 'undefined') && (window.location.hostname.startsWith('portal.') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  var lightModeCSS = (!isDark && isPortalHost) ? (
    <style dangerouslySetInnerHTML={{ __html: `
      /* ═══ LIGHT MODE — BLANKET OVERRIDES ═══ */

      /* Force all text to be dark unless it's a primary/accent/status color */
      body, body * {
        --lm-text: #111827;
        --lm-muted: #4b5563;
        --lm-label: #6b7280;
        --lm-bg: #f9fafb;
        --lm-surface: #ffffff;
        --lm-border: #e5e7eb;
      }

      /* All divs and spans with white/light text → dark */
      div[style*="color: #fff"], div[style*="color:#fff"],
      div[style*="color: rgb(255, 255, 255)"],
      span[style*="color: #fff"], span[style*="color:#fff"],
      span[style*="color: rgb(255, 255, 255)"],
      p[style*="color: #fff"], p[style*="color:#fff"],
      p[style*="color: rgb(255, 255, 255)"],
      h1[style*="color: #fff"], h2[style*="color: #fff"], h3[style*="color: #fff"],
      h1[style*="color:#fff"], h2[style*="color:#fff"], h3[style*="color:#fff"],
      button[style*="color: #fff"], button[style*="color:#fff"],
      label[style*="color: #fff"], label[style*="color:#fff"]
      { color: #111827 !important; }

      /* Portal text colors → dark */
      div[style*="color: #E8F4FD"], span[style*="color: #E8F4FD"],
      div[style*="color:#E8F4FD"], span[style*="color:#E8F4FD"],
      div[style*="color: #e2e8f0"], span[style*="color: #e2e8f0"],
      div[style*="color: #FFF0E8"], div[style*="color: #E8FFF2"], div[style*="color: #EDE8FF"],
      h1[style*="color: #E8F4FD"], h2[style*="color: #E8F4FD"], h3[style*="color: #E8F4FD"],
      p[style*="color: #E8F4FD"]
      { color: #111827 !important; }

      /* Muted text → readable gray */
      div[style*="color: #6B8BAE"], span[style*="color: #6B8BAE"],
      div[style*="color:#6B8BAE"], span[style*="color:#6B8BAE"],
      p[style*="color: #6B8BAE"], button[style*="color: #6B8BAE"],
      div[style*="color: #8B6B55"], div[style*="color: #4B8B65"], div[style*="color: #6B5B8B"]
      { color: #374151 !important; }

      /* Semi-transparent white text (labels, subtitles) */
      [style*="rgba(255, 255, 255, 0.4)"], [style*="rgba(255,255,255,0.4)"]
      { color: #4b5563 !important; }
      [style*="rgba(255, 255, 255, 0.5)"], [style*="rgba(255,255,255,0.5)"]
      { color: #4b5563 !important; }
      [style*="rgba(255, 255, 255, 0.6)"], [style*="rgba(255,255,255,0.6)"]
      { color: #374151 !important; }
      [style*="rgba(255, 255, 255, 0.7)"], [style*="rgba(255,255,255,0.7)"]
      { color: #374151 !important; }
      [style*="rgba(255, 255, 255, 0.8)"], [style*="rgba(255,255,255,0.8)"]
      { color: #111827 !important; }
      [style*="rgba(255, 255, 255, 0.9)"], [style*="rgba(255,255,255,0.9)"]
      { color: #111827 !important; }

      /* ═══ BACKGROUNDS ═══ */
      /* Main dark backgrounds → light */
      [style*="background: #080d1a"], [style*="background:#080d1a"],
      [style*="background: rgb(8, 13, 26)"],
      [style*="background: #050810"], [style*="background:#050810"],
      [style*="background: #0c0a10"], [style*="background: #080d10"],
      [style*="background: #0a0810"]
      { background: #f9fafb !important; }

      /* Surface/panel backgrounds → white */
      [style*="background: #0d1425"], [style*="background:#0d1425"],
      [style*="background: rgb(13, 20, 37)"],
      [style*="background: #0d1220"], [style*="background:#0d1220"],
      [style*="background: #141018"], [style*="background: #0d1518"],
      [style*="background: #110e1c"]
      { background: #ffffff !important; }

      /* Semi-transparent white/dark backgrounds (cards, panels) */
      [style*="background: rgba(255, 255, 255, 0.02)"], [style*="background: rgba(255,255,255,0.02)"]
      { background: #f9fafb !important; }
      [style*="background: rgba(255, 255, 255, 0.03)"], [style*="background: rgba(255,255,255,0.03)"]
      { background: #ffffff !important; box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important; }
      [style*="background: rgba(255, 255, 255, 0.04)"], [style*="background: rgba(255,255,255,0.04)"]
      { background: #f3f4f6 !important; }
      [style*="background: rgba(255, 255, 255, 0.05)"], [style*="background: rgba(255,255,255,0.05)"]
      { background: #f3f4f6 !important; }
      [style*="background: rgba(255, 255, 255, 0.06)"], [style*="background: rgba(255,255,255,0.06)"]
      { background: #e5e7eb !important; }

      /* Dark input backgrounds */
      [style*="background: rgba(0, 0, 0, 0.3)"], [style*="background: rgba(0,0,0,0.3)"]
      { background: #ffffff !important; border-color: #9CA3AF !important; color: #1a1a1a !important; }
      [style*="background: rgba(0, 0, 0, 0.2)"], [style*="background: rgba(0,0,0,0.2)"]
      { background: #F9FAFB !important; color: #1a1a1a !important; }
      [style*="background: rgba(0, 0, 0, 0.4)"], [style*="background: rgba(0,0,0,0.4)"]
      { background: #ffffff !important; color: #1a1a1a !important; }

      /* ═══ BORDERS ═══ */
      [style*="border: 1px solid #182440"], [style*="border-color: #182440"],
      [style*="border: 1px solid #1a2540"], [style*="border-color: #1a2540"]
      { border-color: #e5e7eb !important; }

      [style*="border: 1px solid rgba(255, 255, 255"], [style*="border: 1px solid rgba(255,255,255"]
      { border-color: #e5e7eb !important; }

      [style*="border-right: 1px solid"], [style*="border-bottom: 1px solid"]
      { border-color: #e5e7eb !important; }

      /* ═══ LIVE INBOX SPECIFIC ═══ */
      [style*="background: rgba(0, 0, 0, 0.15)"],
      [style*="background: rgba(0,0,0,0.15)"] { background: #f3f4f6 !important; }
      [style*="background: rgba(0, 0, 0, 0.2)"],
      [style*="background: rgba(0,0,0,0.2)"] { background: #e5e7eb !important; }
      [style*="background: rgba(0, 0, 0, 0.1)"],
      [style*="background: rgba(0,0,0,0.1)"] { background: #f9fafb !important; }
      [style*="border: 1px solid rgba(255, 255, 255, 0.04)"],
      [style*="border-bottom: 1px solid rgba(255, 255, 255, 0.04)"],
      [style*="border-bottom: 1px solid rgba(255,255,255,0.04)"] { border-color: #e5e7eb !important; }
      [style*="border: 1px solid rgba(255, 255, 255, 0.06)"],
      [style*="border-right: 1px solid rgba(255, 255, 255, 0.06)"],
      [style*="border-right: 1px solid rgba(255,255,255,0.06)"],
      [style*="border-top: 1px solid rgba(255, 255, 255, 0.06)"],
      [style*="border-top: 1px solid rgba(255,255,255,0.06)"] { border-color: #e5e7eb !important; }
      [style*="color: rgba(255, 255, 255, 0.25)"],
      [style*="color: rgba(255,255,255,0.25)"] { color: #4b5563 !important; }
      [style*="color: rgba(255, 255, 255, 0.3)"],
      [style*="color: rgba(255,255,255,0.3)"] { color: #4b5563 !important; }

      /* ═══ PIPELINE / LEAD DETAIL ═══ */
      [style*="background: #0f172a"], [style*="background:#0f172a"]
      { background: #ffffff !important; border-color: #e5e7eb !important; }
      [style*="color: #f1f5f9"], [style*="color:#f1f5f9"]
      { color: #111827 !important; }
      [style*="color: #8899aa"], [style*="color:#8899aa"]
      { color: #4b5563 !important; }
      [style*="color: #9aaabb"], [style*="color:#9aaabb"]
      { color: #4b5563 !important; }
      [style*="color: #b0bec5"], [style*="color:#b0bec5"]
      { color: #374151 !important; }
      [style*="color: #a5b4fc"], [style*="color:#a5b4fc"]
      { color: #4f46e5 !important; }
      [style*="color: #fcd34d"], [style*="color:#fcd34d"]
      { color: #b45309 !important; }
      [style*="color: #34d399"], [style*="color:#34d399"]
      { color: #047857 !important; }
      [style*="background: rgba(255, 255, 255, 0.05)"], [style*="background: rgba(255,255,255,0.05)"]
      { background: #f3f4f6 !important; }

      /* ═══ AGGRESSIVE TEXT CONTRAST — catch all light grays ═══ */
      [style*="color: #9ca3af"], [style*="color:#9ca3af"],
      [style*="color: #9CA3AF"], [style*="color:#9CA3AF"]
      { color: #1f2937 !important; }
      [style*="color: #6b7280"], [style*="color:#6b7280"],
      [style*="color: #6B7280"], [style*="color:#6B7280"]
      { color: #1f2937 !important; }
      [style*="color: #94a3b8"], [style*="color:#94a3b8"],
      [style*="color: #94A3B8"], [style*="color:#94A3B8"]
      { color: #1f2937 !important; }
      [style*="color: #cbd5e1"], [style*="color:#cbd5e1"],
      [style*="color: #CBD5E1"], [style*="color:#CBD5E1"]
      { color: #374151 !important; }
      [style*="color: #aaa"], [style*="color:#aaa"]
      { color: #374151 !important; }
      [style*="color: #999"], [style*="color:#999"]
      { color: #374151 !important; }
      [style*="color: #888"], [style*="color:#888"]
      { color: #374151 !important; }
      [style*="color: #777"], [style*="color:#777"]
      { color: #374151 !important; }
      [style*="color: rgb(156"], [style*="color:rgb(156"]
      { color: #1f2937 !important; }
      [style*="color: rgb(107"], [style*="color:rgb(107"]
      { color: #1f2937 !important; }
      [style*="color: rgb(148"], [style*="color:rgb(148"]
      { color: #1f2937 !important; }
      [style*="color: rgb(203"], [style*="color:rgb(203"]
      { color: #374151 !important; }
      [style*="color: rgba(255, 255, 255, 0.15)"], [style*="color: rgba(255,255,255,0.15)"]
      { color: #6b7280 !important; }
      [style*="color: rgba(255, 255, 255, 0.2)"], [style*="color: rgba(255,255,255,0.2)"]
      { color: #6b7280 !important; }
      [style*="color: rgba(255, 255, 255, 0.35)"], [style*="color: rgba(255,255,255,0.35)"]
      { color: #4b5563 !important; }
      [style*="color: rgba(255, 255, 255, 0.85)"], [style*="color: rgba(255,255,255,0.85)"]
      { color: #111827 !important; }

      /* ═══ FORM ELEMENTS ═══ */
      select, input, textarea {
        color: #111827 !important;
        background: #ffffff !important;
        border-color: #d1d5db !important;
      }
      select option { color: #111827; background: #ffffff; }

      /* ═══ GLOBAL CATCH-ALL — override ALL white/light text on the page ═══ */
      div, span, p, h1, h2, h3, h4, h5, h6, label, a, li, td, th, button, pre, code {
        /* Only override if the computed color is very light (white-ish) */
      }

      /* Force all divs/spans with white-ish text to dark */
      div[style*="color: #fff"], div[style*="color:#fff"],
      div[style*="color: white"], div[style*="color:white"],
      span[style*="color: #fff"], span[style*="color:#fff"],
      span[style*="color: white"], span[style*="color:white"],
      p[style*="color: #fff"], p[style*="color:#fff"],
      h1[style*="color: #fff"], h2[style*="color: #fff"], h3[style*="color: #fff"],
      h1[style*="color:#fff"], h2[style*="color:#fff"], h3[style*="color:#fff"],
      button[style*="color: #fff"], button[style*="color:#fff"],
      label[style*="color: #fff"], label[style*="color:#fff"]
      { color: #111827 !important; }

      /* Force readable text everywhere via broad selectors */
      [style*="color: rgb(255, 255, 255)"] { color: #111827 !important; }
      [style*="color: rgb(232, 244, 253)"] { color: #111827 !important; }
      [style*="color: rgb(226, 232, 240)"] { color: #111827 !important; }
      [style*="color: rgb(107, 139, 174)"] { color: #374151 !important; }
      [style*="color: rgb(107, 91, 139)"] { color: #374151 !important; }

      /* ═══ TABLE OVERRIDES ═══ */
      table { border-color: #e5e7eb !important; }
      th, td { border-color: #e5e7eb !important; }
      th[style*="background: #0A0D14"], th[style*="background:#0A0D14"],
      th[style*="background: #0a0d14"], td[style*="background: #0a0d14"],
      tr[style*="background: #0A0D14"], tr[style*="background: #0a0d14"]
      { background: #e5e7eb !important; }

      /* ═══ SCROLLBAR ═══ */
      ::-webkit-scrollbar { width: 8px; }
      ::-webkit-scrollbar-track { background: #f3f4f6; }
      ::-webkit-scrollbar-thumb { background: #9ca3af; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #6b7280; }

      /* ═══ PLACEHOLDER TEXT ═══ */
      ::placeholder { color: #9ca3af !important; opacity: 1 !important; }

      /* ═══ NUCLEAR: force ALL text dark in light mode ═══ */
      body.light-mode p,
      body.light-mode span,
      body.light-mode div,
      body.light-mode h1,
      body.light-mode h2,
      body.light-mode h3,
      body.light-mode h4,
      body.light-mode h5,
      body.light-mode label,
      body.light-mode td,
      body.light-mode th,
      body.light-mode li,
      body.light-mode pre,
      body.light-mode code {
        color: #111827;
      }

      /* Re-apply primary/accent/status colors after the nuclear reset */
      body.light-mode [style*="color: #00C9FF"], body.light-mode [style*="color:#00C9FF"],
      body.light-mode [style*="color: #0077B6"], body.light-mode [style*="color:#0077B6"]
      { color: #0077B6 !important; }
      body.light-mode [style*="color: #E040FB"], body.light-mode [style*="color:#E040FB"],
      body.light-mode [style*="color: #7C3AED"], body.light-mode [style*="color:#7C3AED"]
      { color: #7C3AED !important; }
      body.light-mode [style*="color: #FF3B30"], body.light-mode [style*="color:#FF3B30"],
      body.light-mode [style*="color: #ef4444"], body.light-mode [style*="color:#ef4444"]
      { color: #dc2626 !important; }
      body.light-mode [style*="color: #00E676"], body.light-mode [style*="color:#00E676"],
      body.light-mode [style*="color: #10b981"], body.light-mode [style*="color:#10b981"]
      { color: #059669 !important; }
      body.light-mode [style*="color: #FFD600"], body.light-mode [style*="color:#FFD600"],
      body.light-mode [style*="color: #f59e0b"], body.light-mode [style*="color:#f59e0b"]
      { color: #d97706 !important; }
      body.light-mode [style*="color: #FF5252"], body.light-mode [style*="color:#FF5252"]
      { color: #dc2626 !important; }
      body.light-mode [style*="color: #6366f1"], body.light-mode [style*="color:#6366f1"]
      { color: #4f46e5 !important; }
      body.light-mode [style*="color: #25D366"], body.light-mode [style*="color:#25D366"]
      { color: #059669 !important; }
      body.light-mode [style*="color: #FF6B35"], body.light-mode [style*="color:#FF6B35"]
      { color: #ea580c !important; }

      /* Keep buttons with colored backgrounds white text */
      body.light-mode button[style*="background: linear-gradient"],
      body.light-mode button[style*="background: #10b981"],
      body.light-mode button[style*="background: #00C9FF"],
      body.light-mode button[style*="background: #FF3B30"],
      body.light-mode button[style*="background: #ef4444"] {
        color: #ffffff !important;
      }
      body.light-mode button[style*="color: #000"] {
        color: #000000 !important;
      }
    ` }} />
  ) : null;

  // JS-based light mode override — catches React compiled inline styles
  // ONLY runs on portal (not marketing site engwx.com)
  useEffect(function() {
    if (isDark) return;
    var hostname = window.location.hostname;
    var isPortal = hostname.startsWith('portal.') || hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isPortal) return; // Don't override landing page colors
    function parseRGB(c) {
      if (!c) return null;
      var m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) } : null;
    }
    function luminance(rgb) {
      return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    }
    // Skip elements that should keep their color (status colors, badges)
    var KEEP_COLORS = ['#00C9FF','#0077B6','#E040FB','#7C3AED','#FF3B30','#ef4444','#dc2626','#00E676','#10b981','#059669','#FFD600','#f59e0b','#d97706','#FF5252','#6366f1','#4f46e5','#25D366','#FF6B35','#ea580c','#FF9800'];
    function isAccentColor(rgb) {
      for (var i = 0; i < KEEP_COLORS.length; i++) {
        var hex = KEEP_COLORS[i];
        var hr = parseInt(hex.slice(1,3),16), hg = parseInt(hex.slice(3,5),16), hb = parseInt(hex.slice(5,7),16);
        if (Math.abs(rgb.r - hr) < 20 && Math.abs(rgb.g - hg) < 20 && Math.abs(rgb.b - hb) < 20) return true;
      }
      return false;
    }
    function fixColors() {
      var allElements = document.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, button, label, a, td, th, pre, code, li, nav');
      for (var i = 0; i < allElements.length; i++) {
        var el = allElements[i];
        var cs = window.getComputedStyle(el);
        var c = cs.color;
        var bg = cs.backgroundColor;
        var rgb = parseRGB(c);
        if (rgb && !isAccentColor(rgb)) {
          var lum = luminance(rgb);
          if (lum > 0.75) el.style.setProperty('color', '#111827', 'important');
          else if (lum > 0.55) el.style.setProperty('color', '#374151', 'important');
          else if (lum > 0.45) el.style.setProperty('color', '#4b5563', 'important');
        }
        // Semi-transparent white text
        if (c && c.startsWith('rgba(255, 255, 255,')) {
          var a = parseFloat(c.split(',')[3]);
          if (a < 0.4) el.style.setProperty('color', '#6b7280', 'important');
          else if (a < 0.7) el.style.setProperty('color', '#374151', 'important');
          else el.style.setProperty('color', '#111827', 'important');
        }
        // Dark backgrounds → light
        var bgRgb = parseRGB(bg);
        if (bgRgb && luminance(bgRgb) < 0.15) el.style.setProperty('background-color', '#f9fafb', 'important');
        else if (bgRgb && luminance(bgRgb) < 0.25) el.style.setProperty('background-color', '#ffffff', 'important');
        if (bg && bg.startsWith('rgba(255, 255, 255,')) { var ba = parseFloat(bg.split(',')[3]); if (ba < 0.08) el.style.setProperty('background-color', '#ffffff', 'important'); }
        if (bg && bg.startsWith('rgba(0, 0, 0,')) { var ba2 = parseFloat(bg.split(',')[3]); if (ba2 >= 0.1) el.style.setProperty('background-color', ba2 > 0.25 ? '#f3f4f6' : '#f9fafb', 'important'); }
      }
    }
    var t1 = setTimeout(fixColors, 100);
    var t2 = setTimeout(fixColors, 500);
    var t3 = setTimeout(fixColors, 1500);
    var t4 = setTimeout(fixColors, 3000);
    // Run every 2 seconds for first 10 seconds to catch late-rendering components
    var interval = setInterval(fixColors, 2000);
    var t5 = setTimeout(function() { clearInterval(interval); }, 10000);
    var observer = new MutationObserver(function() { setTimeout(fixColors, 50); });
    observer.observe(document.body, { childList: true, subtree: true });
    return function() {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); clearInterval(interval); observer.disconnect();
      // Remove ALL inline style overrides injected by fixColors
      var allElements = document.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, button, label, a, td, th, pre, code, li, nav');
      for (var i = 0; i < allElements.length; i++) {
        allElements[i].style.removeProperty('color');
        allElements[i].style.removeProperty('background-color');
      }
    };
  }, [isDark, mode]);

  return (
    <ThemeContext.Provider value={{ theme: theme, isDark: isDark, mode: mode, preference: preference, toggleTheme: toggleTheme, setThemeMode: setThemeMode }}>
      {lightModeCSS}
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

// Helper: merge portal-specific colors with theme overrides
export function getThemedColors(portalColors, themeObj) {
  if (!themeObj || themeObj.mode === 'dark') return portalColors;
  return Object.assign({}, portalColors, {
    bg: LIGHT.bg,
    surface: LIGHT.surface,
    border: LIGHT.border,
    text: LIGHT.text,
    muted: LIGHT.muted,
    inputBg: LIGHT.inputBg,
    inputBorder: LIGHT.inputBorder,
    cardBg: LIGHT.cardBg,
    cardBorder: LIGHT.cardBorder,
    badgeBg: LIGHT.badgeBg,
    mode: 'light',
  });
}

// Theme toggle button component
export function ThemeToggle({ style }) {
  var ctx = useTheme();
  return (
    <div onClick={ctx.toggleTheme} style={Object.assign({ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 10px', borderRadius: 8, fontSize: 12, color: ctx.isDark ? '#6B8BAE' : '#718096', background: ctx.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', border: '1px solid ' + (ctx.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'), transition: 'all 0.2s' }, style || {})}>
      <span>{ctx.isDark ? '🌙' : '☀️'}</span>
      <span style={{ fontWeight: 500 }}>{ctx.isDark ? 'Dark' : 'Light'}</span>
    </div>
  );
}

export default ThemeContext;
