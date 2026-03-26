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
  bg: '#F0F2F5', surface: '#FFFFFF', border: '#D1D9E6',
  text: '#111827', muted: '#4B5563',
  primary: '#0077B6', accent: '#7C3AED',
  inputBg: '#FFFFFF', inputBorder: '#9CA3AF',
  cardBg: '#FFFFFF', cardBorder: '#D1D9E6',
  badgeBg: '#E5E7EB',
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

  // Global CSS overrides for light mode — forces readable text on white backgrounds
  var isPortalHost = (typeof window !== 'undefined') && (window.location.hostname.startsWith('portal.') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  var lightModeCSS = (!isDark && isPortalHost) ? (
    <style dangerouslySetInnerHTML={{ __html: `
      /* ═══ LIGHT MODE — BLANKET OVERRIDES ═══ */

      /* Force all text to be dark unless it's a primary/accent/status color */
      body, body * {
        --lm-text: #111827;
        --lm-muted: #4B5563;
        --lm-label: #6B7280;
        --lm-bg: #F0F2F5;
        --lm-surface: #FFFFFF;
        --lm-border: #D1D9E6;
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
      { color: #4B5563 !important; }

      /* Semi-transparent white text (labels, subtitles) */
      [style*="rgba(255, 255, 255, 0.4)"], [style*="rgba(255,255,255,0.4)"]
      { color: #6B7280 !important; }
      [style*="rgba(255, 255, 255, 0.5)"], [style*="rgba(255,255,255,0.5)"]
      { color: #6B7280 !important; }
      [style*="rgba(255, 255, 255, 0.6)"], [style*="rgba(255,255,255,0.6)"]
      { color: #4B5563 !important; }
      [style*="rgba(255, 255, 255, 0.7)"], [style*="rgba(255,255,255,0.7)"]
      { color: #374151 !important; }
      [style*="rgba(255, 255, 255, 0.8)"], [style*="rgba(255,255,255,0.8)"]
      { color: #1F2937 !important; }
      [style*="rgba(255, 255, 255, 0.9)"], [style*="rgba(255,255,255,0.9)"]
      { color: #111827 !important; }

      /* ═══ BACKGROUNDS ═══ */
      /* Main dark backgrounds → light */
      [style*="background: #080d1a"], [style*="background:#080d1a"],
      [style*="background: rgb(8, 13, 26)"],
      [style*="background: #050810"], [style*="background:#050810"],
      [style*="background: #0c0a10"], [style*="background: #080d10"],
      [style*="background: #0a0810"]
      { background: #F0F2F5 !important; }

      /* Surface/panel backgrounds → white */
      [style*="background: #0d1425"], [style*="background:#0d1425"],
      [style*="background: rgb(13, 20, 37)"],
      [style*="background: #0d1220"], [style*="background:#0d1220"],
      [style*="background: #141018"], [style*="background: #0d1518"],
      [style*="background: #110e1c"]
      { background: #FFFFFF !important; }

      /* Semi-transparent white/dark backgrounds (cards, panels) */
      [style*="background: rgba(255, 255, 255, 0.02)"], [style*="background: rgba(255,255,255,0.02)"]
      { background: #F9FAFB !important; }
      [style*="background: rgba(255, 255, 255, 0.03)"], [style*="background: rgba(255,255,255,0.03)"]
      { background: #FFFFFF !important; box-shadow: 0 1px 3px rgba(0,0,0,0.08) !important; }
      [style*="background: rgba(255, 255, 255, 0.04)"], [style*="background: rgba(255,255,255,0.04)"]
      { background: #F3F4F6 !important; }
      [style*="background: rgba(255, 255, 255, 0.05)"], [style*="background: rgba(255,255,255,0.05)"]
      { background: #F3F4F6 !important; }
      [style*="background: rgba(255, 255, 255, 0.06)"], [style*="background: rgba(255,255,255,0.06)"]
      { background: #E5E7EB !important; }

      /* Dark input backgrounds */
      [style*="background: rgba(0, 0, 0, 0.3)"], [style*="background: rgba(0,0,0,0.3)"]
      { background: #FFFFFF !important; border-color: #9CA3AF !important; color: #111827 !important; }
      [style*="background: rgba(0, 0, 0, 0.2)"], [style*="background: rgba(0,0,0,0.2)"]
      { background: #F9FAFB !important; color: #111827 !important; }
      [style*="background: rgba(0, 0, 0, 0.4)"], [style*="background: rgba(0,0,0,0.4)"]
      { background: #FFFFFF !important; color: #111827 !important; }

      /* ═══ BORDERS ═══ */
      [style*="border: 1px solid #182440"], [style*="border-color: #182440"],
      [style*="border: 1px solid #1a2540"], [style*="border-color: #1a2540"]
      { border-color: #D1D9E6 !important; }

      [style*="border: 1px solid rgba(255, 255, 255"], [style*="border: 1px solid rgba(255,255,255"]
      { border-color: #D1D9E6 !important; }

      [style*="border-right: 1px solid"], [style*="border-bottom: 1px solid"]
      { border-color: #D1D9E6 !important; }

      /* ═══ LIVE INBOX SPECIFIC ═══ */
      [style*="background: rgba(0, 0, 0, 0.15)"],
      [style*="background: rgba(0,0,0,0.15)"] { background: #F3F4F6 !important; }
      [style*="background: rgba(0, 0, 0, 0.2)"],
      [style*="background: rgba(0,0,0,0.2)"] { background: #E5E7EB !important; }
      [style*="background: rgba(0, 0, 0, 0.1)"],
      [style*="background: rgba(0,0,0,0.1)"] { background: #F9FAFB !important; }
      [style*="border: 1px solid rgba(255, 255, 255, 0.04)"],
      [style*="border-bottom: 1px solid rgba(255, 255, 255, 0.04)"],
      [style*="border-bottom: 1px solid rgba(255,255,255,0.04)"] { border-color: #E5E7EB !important; }
      [style*="border: 1px solid rgba(255, 255, 255, 0.06)"],
      [style*="border-right: 1px solid rgba(255, 255, 255, 0.06)"],
      [style*="border-right: 1px solid rgba(255,255,255,0.06)"],
      [style*="border-top: 1px solid rgba(255, 255, 255, 0.06)"],
      [style*="border-top: 1px solid rgba(255,255,255,0.06)"] { border-color: #D1D9E6 !important; }
      [style*="color: rgba(255, 255, 255, 0.25)"],
      [style*="color: rgba(255,255,255,0.25)"] { color: #9CA3AF !important; }
      [style*="color: rgba(255, 255, 255, 0.3)"],
      [style*="color: rgba(255,255,255,0.3)"] { color: #6B7280 !important; }

      /* ═══ FORM ELEMENTS ═══ */
      select, input, textarea {
        color: #111827 !important;
        background: #FFFFFF !important;
        border-color: #9CA3AF !important;
      }

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
      [style*="color: rgb(107, 139, 174)"] { color: #4B5563 !important; }
      [style*="color: rgb(107, 91, 139)"] { color: #4B5563 !important; }

      /* ═══ TABLE OVERRIDES ═══ */
      table { border-color: #D1D9E6 !important; }
      th, td { border-color: #D1D9E6 !important; }
      th[style*="background: #0A0D14"], th[style*="background:#0A0D14"],
      th[style*="background: #0a0d14"], td[style*="background: #0a0d14"],
      tr[style*="background: #0A0D14"], tr[style*="background: #0a0d14"]
      { background: #E5E7EB !important; }

      /* ═══ SCROLLBAR ═══ */
      ::-webkit-scrollbar { width: 8px; }
      ::-webkit-scrollbar-track { background: #F0F2F5; }
      ::-webkit-scrollbar-thumb { background: #9CA3AF; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #6B7280; }

      /* ═══ PLACEHOLDER TEXT ═══ */
      ::placeholder { color: #9CA3AF !important; opacity: 1 !important; }
    ` }} />
  ) : null;

  // JS-based light mode override — catches React compiled inline styles
  // ONLY runs on portal (not marketing site engwx.com)
  useEffect(function() {
    if (isDark) return;
    var hostname = window.location.hostname;
    var isPortal = hostname.startsWith('portal.') || hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isPortal) return; // Don't override landing page colors
    function fixColors() {
      var allElements = document.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, button, label, a, td, th, pre, code, li, nav');
      for (var i = 0; i < allElements.length; i++) {
        var el = allElements[i];
        var cs = window.getComputedStyle(el);
        var c = cs.color;
        var bg = cs.backgroundColor;
        // White/near-white text → dark
        if (c === 'rgb(255, 255, 255)' || c === 'rgb(232, 244, 253)' || c === 'rgb(226, 232, 240)' || c === 'rgb(255, 240, 232)' || c === 'rgb(232, 255, 242)' || c === 'rgb(237, 232, 255)') el.style.setProperty('color', '#111827', 'important');
        // Muted text
        if (c === 'rgb(107, 139, 174)' || c === 'rgb(139, 107, 85)' || c === 'rgb(75, 139, 101)' || c === 'rgb(107, 91, 139)') el.style.setProperty('color', '#4B5563', 'important');
        // Semi-transparent white
        if (c && c.startsWith('rgba(255, 255, 255,')) { var a = parseFloat(c.split(',')[3]); if (a < 0.5) el.style.setProperty('color', '#6B7280', 'important'); else el.style.setProperty('color', '#111827', 'important'); }
        // Dark bgs
        if (bg === 'rgb(8, 13, 26)' || bg === 'rgb(5, 8, 16)' || bg === 'rgb(10, 13, 20)' || bg === 'rgb(12, 10, 16)' || bg === 'rgb(8, 13, 16)' || bg === 'rgb(10, 8, 16)') el.style.setProperty('background-color', '#F0F2F5', 'important');
        if (bg === 'rgb(13, 20, 37)' || bg === 'rgb(13, 18, 32)' || bg === 'rgb(20, 16, 24)' || bg === 'rgb(13, 21, 24)' || bg === 'rgb(17, 14, 28)') el.style.setProperty('background-color', '#FFFFFF', 'important');
        if (bg && bg.startsWith('rgba(255, 255, 255,')) { var ba = parseFloat(bg.split(',')[3]); if (ba < 0.08) el.style.setProperty('background-color', '#FFFFFF', 'important'); }
        if (bg && bg.startsWith('rgba(0, 0, 0,')) { var ba2 = parseFloat(bg.split(',')[3]); if (ba2 >= 0.1) el.style.setProperty('background-color', ba2 > 0.25 ? '#F3F4F6' : '#F9FAFB', 'important'); }
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
    return function() { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); clearInterval(interval); observer.disconnect(); };
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
  if (!themeObj || themeObj.mode === 'dark') return portalColors; // dark mode = use existing colors
  // Light mode: override bg, surface, border, text, muted while keeping primary/accent
  return Object.assign({}, portalColors, {
    bg: LIGHT.bg,
    surface: LIGHT.surface,
    border: LIGHT.border,
    text: LIGHT.text,
    muted: LIGHT.muted,
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
