import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import './themes/tokens.css';

var DARK = {
  bg: '#0D1117', surface: '#161B22', border: '#30363D', divider: '#30363D',
  text: '#F0F6FC', muted: '#ABB4BF',
  primary: '#00C9FF', accent: '#E040FB',
  inputBg: '#FFFFFF', inputBorder: '#30363D', inputText: '#0D1117',
  cardBg: '#161B22', cardBorder: '#30363D',
  badgeBg: 'rgba(255,255,255,0.06)',
  mode: 'dark',
};

var LIGHT = {
  bg: '#F6F8FA', surface: '#FFFFFF', border: '#E8EAF0', divider: '#E8EAF0',
  text: '#0D1117', muted: '#6B7280',
  primary: '#0077B6', accent: '#7C3AED',
  inputBg: '#FFFFFF', inputBorder: '#E8EAF0', inputText: '#0D1117',
  cardBg: '#FFFFFF', cardBorder: '#E8EAF0',
  badgeBg: '#F6F8FA',
  mode: 'light',
};

var ThemeContext = createContext({ theme: DARK, isDark: true, toggleTheme: function() {}, setThemeMode: function() {} });

export function ThemeProvider({ children }) {
  // Check OS preference
  var getOSPreference = function() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    // No OS signal available (SSR / no matchMedia) → fall back to light, not dark.
    return 'light';
  };

  // Theme default is LIGHT pre-auth for every tenant. We deliberately do NOT read a global
  // localStorage key here: a shared host (portal.engwx.com) means a global key bleeds one user's
  // choice into the next login. The per-user preference is applied post-auth (profile effect below),
  // keyed by user id. (SP admins are still locked to dark there until Phase 2b.)
  var userKey = function(uid) { return 'ew_theme_pref:' + uid; };

  var [userId, setUserId] = useState(null);
  var [mode, setMode] = useState('light'); // 'dark', 'light' — default light pre-auth
  var [preference, setPreference] = useState('light'); // 'auto', 'dark', 'light' — default light pre-auth

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

  // Persist ONLY to a per-user key (never a global key — that bled across logins on the shared host).
  // Pre-auth (userId null) we don't write at all; the default stays light.
  var setThemeMode = useCallback(function(newPref) {
    setPreference(newPref);
    setMode(newPref === 'auto' ? getOSPreference() : newPref);
    if (userId) { try { localStorage.setItem(userKey(userId), newPref); } catch(e) {} }
  }, [userId]);

  var toggleTheme = useCallback(function() {
    var newMode = mode === 'dark' ? 'light' : 'dark';
    setMode(newMode);
    setPreference(newMode);
    if (userId) { try { localStorage.setItem(userKey(userId), newMode); } catch(e) {} }
  }, [mode, userId]);

  // Sync preference from user_profiles on mount (async, localStorage is fast fallback)
  var [profileLoaded, setProfileLoaded] = useState(false);
  useEffect(function() {
    (async function() {
      try {
        var { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);
        var { data: profile } = await supabase
          .from('user_profiles')
          .select('theme_preference, role')
          .eq('id', user.id)
          .maybeSingle();
        // SP admins are locked to dark regardless of stored preference (lock removed in Phase 2b).
        var isSPAdmin = profile && (profile.role === 'superadmin' || profile.role === 'super_admin' || profile.role === 'sp_admin');
        if (isSPAdmin) {
          setMode('dark');
          setPreference('dark');
        } else {
          // Apply this user's choice: per-user localStorage on this device first, else the
          // server-synced user_profiles preference, else keep the light default. Keyed per user id,
          // so nothing bleeds between logins on the shared host. (No new server sync this round.)
          var localPref = null;
          try { localPref = localStorage.getItem(userKey(user.id)); } catch (e) {}
          var serverPref = profile && profile.theme_preference ? (profile.theme_preference === 'system' ? 'auto' : profile.theme_preference) : null;
          var chosen = localPref || serverPref;
          if (chosen === 'dark' || chosen === 'light' || chosen === 'auto') {
            setPreference(chosen);
            setMode(chosen === 'auto' ? getOSPreference() : chosen);
          }
        }
      } catch (e) { /* light default already applied */ }
      setProfileLoaded(true);
    })();
  }, []);

  // Persist preference changes to user_profiles via RPC (fire-and-forget)
  useEffect(function() {
    if (!profileLoaded) return; // Don't persist the initial load
    var mappedPref = preference === 'auto' ? 'system' : preference;
    supabase.rpc('save_user_theme_preference', { p_preference: mappedPref }).then(function() {}).catch(function() {});
  }, [preference, profileLoaded]);

  var theme = mode === 'dark' ? DARK : LIGHT;
  var isDark = mode === 'dark';

  // Sync data-theme attribute (activates CSS token system) + body class + background
  useEffect(function() {
    if (typeof document !== 'undefined') {
      // data-theme drives tokens.css variable resolution
      var themeAttr = preference === 'auto' || preference === 'system' ? 'system' : mode;
      document.documentElement.setAttribute('data-theme', themeAttr);

      document.body.classList.toggle('dark-mode', isDark);
      document.body.classList.toggle('light-mode', !isDark);
      // Body background uses brand CSS variables set by BrandingContext
      // Visible page bg is set HERE on body (not via the token bg). Use the structural page tokens —
      // dark = true ink #0D1117 (was brandPrimary's navy), light = #F6F8FA — so the page matches the
      // card/surface tokens instead of bleeding the brand color across the whole background.
      document.body.style.background = isDark ? '#0D1117' : '#F6F8FA';
      document.body.style.color = isDark ? '#F0F6FC' : '#0D1117';
    }
  }, [isDark, mode, preference]);

  // Global CSS overrides for light mode — forces readable text on white backgrounds
  var isPortalHost = (typeof window !== 'undefined') && (window.location.hostname.startsWith('portal.') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  var lightModeCSS = (!isDark && isPortalHost) ? (
    <style dangerouslySetInnerHTML={{ __html: `
      /* ═══ LIGHT MODE — BLANKET OVERRIDES ═══ */

      /* Force all text to be dark unless it's a primary/accent/status color */
      body, body * {
        --lm-text: #0D1117;
        --lm-muted: #6B7280;
        --lm-label: #6b7280;
        --lm-bg: #F6F8FA;
        --lm-surface: #ffffff;
        --lm-border: #E8EAF0;
      }

      /* ═══ NEW TOKEN PALETTE — token-consumers now emit these dark hexes; map to light.
         (color: #0D1117 is intentionally NOT overridden — it's already the correct dark text.) ═══ */
      [style*="background: #0D1117"], [style*="background:#0D1117"] { background: #F6F8FA !important; }
      [style*="background: #161B22"], [style*="background:#161B22"] { background: #FFFFFF !important; box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important; }
      [style*="border: 1px solid #30363D"], [style*="border-color: #30363D"],
      [style*="border: 1px solid #30363d"], [style*="border-color: #30363d"] { border-color: #E8EAF0 !important; }
      [style*="color: #F0F6FC"], [style*="color:#F0F6FC"] { color: #0D1117 !important; }
      [style*="color: #8B949E"], [style*="color:#8B949E"] { color: #6B7280 !important; }

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
      { color: #0D1117 !important; }

      /* Portal text colors → dark */
      div[style*="color: #E8F4FD"], span[style*="color: #E8F4FD"],
      div[style*="color:#E8F4FD"], span[style*="color:#E8F4FD"],
      div[style*="color: #e2e8f0"], span[style*="color: #e2e8f0"],
      div[style*="color: #FFF0E8"], div[style*="color: #E8FFF2"], div[style*="color: #EDE8FF"],
      h1[style*="color: #E8F4FD"], h2[style*="color: #E8F4FD"], h3[style*="color: #E8F4FD"],
      p[style*="color: #E8F4FD"]
      { color: #0D1117 !important; }

      /* Muted text → readable gray */
      div[style*="color: #6B8BAE"], span[style*="color: #6B8BAE"],
      div[style*="color:#6B8BAE"], span[style*="color:#6B8BAE"],
      p[style*="color: #6B8BAE"], button[style*="color: #6B8BAE"],
      div[style*="color: #8B6B55"], div[style*="color: #4B8B65"], div[style*="color: #6B5B8B"]
      { color: #6B7280 !important; }

      /* Semi-transparent white text (labels, subtitles) */
      [style*="rgba(255, 255, 255, 0.4)"], [style*="rgba(255,255,255,0.4)"]
      { color: #6B7280 !important; }
      [style*="rgba(255, 255, 255, 0.5)"], [style*="rgba(255,255,255,0.5)"]
      { color: #6B7280 !important; }
      [style*="rgba(255, 255, 255, 0.6)"], [style*="rgba(255,255,255,0.6)"]
      { color: #6B7280 !important; }
      [style*="rgba(255, 255, 255, 0.7)"], [style*="rgba(255,255,255,0.7)"]
      { color: #6B7280 !important; }
      [style*="rgba(255, 255, 255, 0.8)"], [style*="rgba(255,255,255,0.8)"]
      { color: #0D1117 !important; }
      [style*="rgba(255, 255, 255, 0.9)"], [style*="rgba(255,255,255,0.9)"]
      { color: #0D1117 !important; }

      /* ═══ BACKGROUNDS ═══ */
      /* Main dark backgrounds → light */
      [style*="background: #080d1a"], [style*="background:#080d1a"],
      [style*="background: rgb(8, 13, 26)"],
      [style*="background: #000000"], [style*="background:#000000"],
      [style*="background: rgb(0, 0, 0)"],
      [style*="background: #050810"], [style*="background:#050810"],
      [style*="background: #0c0a10"], [style*="background: #080d10"],
      [style*="background: #0a0810"]
      { background: #F6F8FA !important; }

      /* Surface/panel backgrounds → white */
      [style*="background: #0d1425"], [style*="background:#0d1425"],
      [style*="background: rgb(13, 20, 37)"],
      [style*="background: #0a0a0a"], [style*="background:#0a0a0a"],
      [style*="background: #0d1220"], [style*="background:#0d1220"],
      [style*="background: #141018"], [style*="background: #0d1518"],
      [style*="background: #110e1c"]
      { background: #ffffff !important; }

      /* Semi-transparent white/dark backgrounds (cards, panels) */
      [style*="background: rgba(255, 255, 255, 0.02)"], [style*="background: rgba(255,255,255,0.02)"]
      { background: #F6F8FA !important; }
      [style*="background: rgba(255, 255, 255, 0.03)"], [style*="background: rgba(255,255,255,0.03)"]
      { background: #ffffff !important; box-shadow: 0 1px 3px rgba(0,0,0,0.06) !important; }
      [style*="background: rgba(255, 255, 255, 0.04)"], [style*="background: rgba(255,255,255,0.04)"]
      { background: #f3f4f6 !important; }
      [style*="background: rgba(255, 255, 255, 0.05)"], [style*="background: rgba(255,255,255,0.05)"]
      { background: #f3f4f6 !important; }
      [style*="background: rgba(255, 255, 255, 0.06)"], [style*="background: rgba(255,255,255,0.06)"]
      { background: #E8EAF0 !important; }

      /* Dark input backgrounds */
      [style*="background: rgba(0, 0, 0, 0.3)"], [style*="background: rgba(0,0,0,0.3)"]
      { background: #ffffff !important; border-color: #9CA3AF !important; color: #1a1a1a !important; }
      [style*="background: rgba(0, 0, 0, 0.2)"], [style*="background: rgba(0,0,0,0.2)"]
      { background: #F9FAFB !important; color: #1a1a1a !important; }
      [style*="background: rgba(0, 0, 0, 0.4)"], [style*="background: rgba(0,0,0,0.4)"]
      { background: #ffffff !important; color: #1a1a1a !important; }

      /* ═══ BORDERS ═══ */
      [style*="border: 1px solid #182440"], [style*="border-color: #182440"],
      [style*="border: 1px solid #1a1a1a"], [style*="border-color: #1a1a1a"],
      [style*="border: 1px solid #1a2540"], [style*="border-color: #1a2540"]
      { border-color: #E8EAF0 !important; }

      [style*="border: 1px solid rgba(255, 255, 255"], [style*="border: 1px solid rgba(255,255,255"]
      { border-color: #E8EAF0 !important; }

      [style*="border-right: 1px solid"], [style*="border-bottom: 1px solid"]
      { border-color: #E8EAF0 !important; }

      /* ═══ LIVE INBOX SPECIFIC ═══ */
      [style*="background: rgba(0, 0, 0, 0.15)"],
      [style*="background: rgba(0,0,0,0.15)"] { background: #f3f4f6 !important; }
      [style*="background: rgba(0, 0, 0, 0.2)"],
      [style*="background: rgba(0,0,0,0.2)"] { background: #E8EAF0 !important; }
      [style*="background: rgba(0, 0, 0, 0.1)"],
      [style*="background: rgba(0,0,0,0.1)"] { background: #F6F8FA !important; }
      [style*="border: 1px solid rgba(255, 255, 255, 0.04)"],
      [style*="border-bottom: 1px solid rgba(255, 255, 255, 0.04)"],
      [style*="border-bottom: 1px solid rgba(255,255,255,0.04)"] { border-color: #E8EAF0 !important; }
      [style*="border: 1px solid rgba(255, 255, 255, 0.06)"],
      [style*="border-right: 1px solid rgba(255, 255, 255, 0.06)"],
      [style*="border-right: 1px solid rgba(255,255,255,0.06)"],
      [style*="border-top: 1px solid rgba(255, 255, 255, 0.06)"],
      [style*="border-top: 1px solid rgba(255,255,255,0.06)"] { border-color: #E8EAF0 !important; }
      [style*="color: rgba(255, 255, 255, 0.25)"],
      [style*="color: rgba(255,255,255,0.25)"] { color: #6B7280 !important; }
      [style*="color: rgba(255, 255, 255, 0.3)"],
      [style*="color: rgba(255,255,255,0.3)"] { color: #6B7280 !important; }

      /* ═══ PIPELINE / LEAD DETAIL ═══ */
      [style*="background: #0f172a"], [style*="background:#0f172a"]
      { background: #ffffff !important; border-color: #E8EAF0 !important; }
      [style*="color: #f1f5f9"], [style*="color:#f1f5f9"]
      { color: #0D1117 !important; }
      [style*="color: #8899aa"], [style*="color:#8899aa"]
      { color: #6B7280 !important; }
      [style*="color: #9aaabb"], [style*="color:#9aaabb"]
      { color: #6B7280 !important; }
      [style*="color: #b0bec5"], [style*="color:#b0bec5"]
      { color: #6B7280 !important; }
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
      { color: #6B7280 !important; }
      [style*="color: #6b7280"], [style*="color:#6b7280"],
      [style*="color: #6B7280"], [style*="color:#6B7280"]
      { color: #6B7280 !important; }
      [style*="color: #94a3b8"], [style*="color:#94a3b8"],
      [style*="color: #94A3B8"], [style*="color:#94A3B8"]
      { color: #6B7280 !important; }
      [style*="color: #cbd5e1"], [style*="color:#cbd5e1"],
      [style*="color: #CBD5E1"], [style*="color:#CBD5E1"]
      { color: #6B7280 !important; }
      [style*="color: #aaa"], [style*="color:#aaa"]
      { color: #6B7280 !important; }
      [style*="color: #999"], [style*="color:#999"]
      { color: #6B7280 !important; }
      [style*="color: #888"], [style*="color:#888"]
      { color: #6B7280 !important; }
      [style*="color: #777"], [style*="color:#777"]
      { color: #6B7280 !important; }
      [style*="color: rgb(156"], [style*="color:rgb(156"]
      { color: #6B7280 !important; }
      [style*="color: rgb(107"], [style*="color:rgb(107"]
      { color: #6B7280 !important; }
      [style*="color: rgb(148"], [style*="color:rgb(148"]
      { color: #6B7280 !important; }
      [style*="color: rgb(203"], [style*="color:rgb(203"]
      { color: #6B7280 !important; }
      [style*="color: rgba(255, 255, 255, 0.15)"], [style*="color: rgba(255,255,255,0.15)"]
      { color: #6b7280 !important; }
      [style*="color: rgba(255, 255, 255, 0.2)"], [style*="color: rgba(255,255,255,0.2)"]
      { color: #6b7280 !important; }
      [style*="color: rgba(255, 255, 255, 0.35)"], [style*="color: rgba(255,255,255,0.35)"]
      { color: #6B7280 !important; }
      [style*="color: rgba(255, 255, 255, 0.85)"], [style*="color: rgba(255,255,255,0.85)"]
      { color: #0D1117 !important; }

      /* ═══ FORM ELEMENTS ═══ */
      select, input, textarea {
        color: #0D1117 !important;
        background: #ffffff !important;
        border-color: #E8EAF0 !important;
      }
      select option { color: #0D1117; background: #ffffff; }

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
      { color: #0D1117 !important; }

      /* Force readable text everywhere via broad selectors */
      [style*="color: rgb(255, 255, 255)"] { color: #0D1117 !important; }
      [style*="color: rgb(232, 244, 253)"] { color: #0D1117 !important; }
      [style*="color: rgb(226, 232, 240)"] { color: #0D1117 !important; }
      [style*="color: rgb(107, 139, 174)"] { color: #6B7280 !important; }
      [style*="color: rgb(107, 91, 139)"] { color: #6B7280 !important; }

      /* ═══ TABLE OVERRIDES ═══ */
      table { border-color: #E8EAF0 !important; }
      th, td { border-color: #E8EAF0 !important; }
      th[style*="background: #0A0D14"], th[style*="background:#0A0D14"],
      th[style*="background: #0a0d14"], td[style*="background: #0a0d14"],
      tr[style*="background: #0A0D14"], tr[style*="background: #0a0d14"]
      { background: #E8EAF0 !important; }

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
        color: #0D1117;
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

  var darkModeCSS = (isDark && isPortalHost) ? (
    <style dangerouslySetInnerHTML={{ __html: `
      /* ═══ DARK MODE — PERSISTENT SCROLLBAR ═══ */
      ::-webkit-scrollbar { width: 8px; }
      ::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.35); }
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
    // Track original inline styles so we can restore them on cleanup
    var originals = new Map();
    function saveOriginal(el, prop) {
      var key = el;
      if (!originals.has(key)) originals.set(key, {});
      var saved = originals.get(key);
      if (!(prop in saved)) {
        saved[prop] = el.style.getPropertyValue(prop) || null;
      }
    }
    function setWithTracking(el, prop, val) {
      saveOriginal(el, prop);
      el.style.setProperty(prop, val, 'important');
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
          if (lum > 0.75) setWithTracking(el, 'color', '#0D1117');
          else if (lum > 0.55) setWithTracking(el, 'color', '#6B7280');
          else if (lum > 0.45) setWithTracking(el, 'color', '#6B7280');
        }
        if (c && c.startsWith('rgba(255, 255, 255,')) {
          var a = parseFloat(c.split(',')[3]);
          if (a < 0.4) setWithTracking(el, 'color', '#6b7280');
          else if (a < 0.7) setWithTracking(el, 'color', '#6B7280');
          else setWithTracking(el, 'color', '#0D1117');
        }
        var bgRgb = parseRGB(bg);
        if (bgRgb && luminance(bgRgb) < 0.15) setWithTracking(el, 'background-color', '#F6F8FA');
        else if (bgRgb && luminance(bgRgb) < 0.25) setWithTracking(el, 'background-color', '#ffffff');
        if (bg && bg.startsWith('rgba(255, 255, 255,')) { var ba = parseFloat(bg.split(',')[3]); if (ba < 0.08) setWithTracking(el, 'background-color', '#ffffff'); }
        if (bg && bg.startsWith('rgba(0, 0, 0,')) { var ba2 = parseFloat(bg.split(',')[3]); if (ba2 >= 0.1) setWithTracking(el, 'background-color', ba2 > 0.25 ? '#f3f4f6' : '#F6F8FA'); }
      }
    }
    var t1 = setTimeout(fixColors, 100);
    var t2 = setTimeout(fixColors, 500);
    var t3 = setTimeout(fixColors, 1500);
    var t4 = setTimeout(fixColors, 3000);
    var interval = setInterval(fixColors, 2000);
    var t5 = setTimeout(function() { clearInterval(interval); }, 10000);
    var observer = new MutationObserver(function() { setTimeout(fixColors, 50); });
    observer.observe(document.body, { childList: true, subtree: true });
    return function() {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); clearInterval(interval); observer.disconnect();
      // Restore original inline styles for every element fixColors touched
      originals.forEach(function(saved, el) {
        Object.keys(saved).forEach(function(prop) {
          if (saved[prop]) {
            el.style.setProperty(prop, saved[prop]);
          } else {
            el.style.removeProperty(prop);
          }
        });
      });
      originals.clear();
    };
  }, [isDark, mode]);

  return (
    <ThemeContext.Provider value={{ theme: theme, isDark: isDark, mode: mode, preference: preference, toggleTheme: toggleTheme, setThemeMode: setThemeMode }}>
      {lightModeCSS}
      {darkModeCSS}
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
    border: LIGHT.border, divider: LIGHT.divider,
    text: LIGHT.text,
    muted: LIGHT.muted,
    inputBg: LIGHT.inputBg,
    inputBorder: LIGHT.inputBorder,
    inputText: LIGHT.inputText,
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
