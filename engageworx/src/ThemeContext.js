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
  bg: '#F5F7FA', surface: '#FFFFFF', border: '#E2E8F0',
  text: '#1A202C', muted: '#718096',
  primary: '#0099CC', accent: '#9B59B6',
  inputBg: '#FFFFFF', inputBorder: '#CBD5E0',
  cardBg: '#FFFFFF', cardBorder: '#E2E8F0',
  badgeBg: '#EDF2F7',
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

  return (
    <ThemeContext.Provider value={{ theme: theme, isDark: isDark, mode: mode, preference: preference, toggleTheme: toggleTheme, setThemeMode: setThemeMode }}>
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
