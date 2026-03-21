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
  // This overrides hardcoded dark-mode inline styles throughout the app
  var lightModeCSS = !isDark ? (
    <style dangerouslySetInnerHTML={{ __html: `
      /* Light mode global overrides */
      [style*="color: #fff"], [style*="color: rgb(255, 255, 255)"],
      [style*="color:#fff"] { color: #111827 !important; }
      [style*="color: #E8F4FD"], [style*="color: rgb(232, 244, 253)"],
      [style*="color:#E8F4FD"] { color: #111827 !important; }
      [style*="color: #e2e8f0"], [style*="color:#e2e8f0"] { color: #111827 !important; }
      [style*="color: #FFF0E8"] { color: #111827 !important; }
      [style*="color: #E8FFF2"] { color: #111827 !important; }
      [style*="color: #EDE8FF"] { color: #111827 !important; }

      /* Muted text */
      [style*="color: #6B8BAE"], [style*="color:#6B8BAE"],
      [style*="color: rgb(107, 139, 174)"] { color: #4B5563 !important; }
      [style*="color: #8B6B55"] { color: #4B5563 !important; }
      [style*="color: #4B8B65"] { color: #4B5563 !important; }
      [style*="color: #6B5B8B"] { color: #4B5563 !important; }

      /* Semi-transparent white text used for labels */
      [style*="color: rgba(255, 255, 255, 0.4)"],
      [style*="color: rgba(255,255,255,0.4)"] { color: #6B7280 !important; }
      [style*="color: rgba(255, 255, 255, 0.5)"],
      [style*="color: rgba(255,255,255,0.5)"] { color: #6B7280 !important; }
      [style*="color: rgba(255, 255, 255, 0.6)"],
      [style*="color: rgba(255,255,255,0.6)"] { color: #4B5563 !important; }
      [style*="color: rgba(255, 255, 255, 0.7)"],
      [style*="color: rgba(255,255,255,0.7)"] { color: #374151 !important; }
      [style*="color: rgba(255, 255, 255, 0.8)"],
      [style*="color: rgba(255,255,255,0.8)"] { color: #1F2937 !important; }

      /* Background overrides for dark panels */
      [style*="background: #080d1a"], [style*="background:#080d1a"],
      [style*="background: rgb(8, 13, 26)"] { background: #F0F2F5 !important; }
      [style*="background: #0d1425"], [style*="background:#0d1425"],
      [style*="background: rgb(13, 20, 37)"] { background: #FFFFFF !important; }
      [style*="background: #0a0d14"], [style*="background:#0a0d14"] { background: #E5E7EB !important; }
      [style*="background: #050810"], [style*="background:#050810"] { background: #F0F2F5 !important; }
      [style*="background: #0d1220"], [style*="background:#0d1220"] { background: #FFFFFF !important; }
      [style*="background: #0c0a10"] { background: #F0F2F5 !important; }
      [style*="background: #141018"] { background: #FFFFFF !important; }
      [style*="background: #080d10"] { background: #F0F2F5 !important; }
      [style*="background: #0d1518"] { background: #FFFFFF !important; }
      [style*="background: #0a0810"] { background: #F0F2F5 !important; }
      [style*="background: #110e1c"] { background: #FFFFFF !important; }

      /* Semi-transparent dark backgrounds used for cards */
      [style*="background: rgba(255, 255, 255, 0.03)"],
      [style*="background: rgba(255,255,255,0.03)"] { background: #FFFFFF !important; border-color: #D1D9E6 !important; }
      [style*="background: rgba(255, 255, 255, 0.02)"],
      [style*="background: rgba(255,255,255,0.02)"] { background: #F9FAFB !important; }
      [style*="background: rgba(255, 255, 255, 0.04)"],
      [style*="background: rgba(255,255,255,0.04)"] { background: #F3F4F6 !important; }
      [style*="background: rgba(255, 255, 255, 0.05)"],
      [style*="background: rgba(255,255,255,0.05)"] { background: #F3F4F6 !important; }
      [style*="background: rgba(255, 255, 255, 0.06)"],
      [style*="background: rgba(255,255,255,0.06)"] { background: #E5E7EB !important; }

      /* Border overrides */
      [style*="border-color: #182440"], [style*="border: 1px solid #182440"],
      [style*="border-color: rgba(255, 255, 255, 0.07)"],
      [style*="border-color: rgba(255,255,255,0.07)"] { border-color: #D1D9E6 !important; }
      [style*="border: 1px solid rgba(255, 255, 255, 0.08)"],
      [style*="border: 1px solid rgba(255,255,255,0.08)"] { border-color: #D1D9E6 !important; }
      [style*="border: 1px solid rgba(255, 255, 255, 0.06)"],
      [style*="border: 1px solid rgba(255,255,255,0.06)"] { border-color: #D1D9E6 !important; }
      [style*="border: 1px solid rgba(255, 255, 255, 0.1)"],
      [style*="border: 1px solid rgba(255,255,255,0.1)"] { border-color: #D1D9E6 !important; }
      [style*="border: 1px solid rgba(255, 255, 255, 0.12)"],
      [style*="border: 1px solid rgba(255,255,255,0.12)"] { border-color: #D1D9E6 !important; }

      /* Input backgrounds */
      [style*="background: rgba(0, 0, 0, 0.3)"],
      [style*="background: rgba(0,0,0,0.3)"] { background: #FFFFFF !important; border-color: #9CA3AF !important; color: #111827 !important; }
      [style*="background: rgba(0, 0, 0, 0.2)"],
      [style*="background: rgba(0,0,0,0.2)"] { background: #F9FAFB !important; color: #111827 !important; }

      /* Select and input text */
      select, input, textarea { color: #111827 !important; }
    ` }} />
  ) : null;

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
