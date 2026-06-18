// src/components/PortalShell.jsx
// Shared portal shell extracted from the super-admin "Service Provider" layout in App.jsx so the SA,
// CSP, and (later) tenant portals render an identical sidebar + chrome instead of three hand-aligned
// copies that drift. Phase 2a: CSPPortal consumes this; the SA inline block and CustomerPortal
// migrate onto it in Phase 2b.
//
// Theme is supplied by the caller via `C` / `isDark` (from ThemeContext), so every shell shares ONE
// theme source. The shell owns only chrome (sidebar, nav, footer controls, content frame). Content —
// including any action buttons — is the caller's `children`; the shell never restyles them, so the
// 2b button-inversion swap can flip all shells together without touching this file.
//
// Slots: `header` (brand/identity node), `bell` (notifications node, rendered in header area is the
// caller's job — pass it inside `header`), `footerExtra` (e.g. SA's Demo Mode toggle), `themeToggle`
// (the <ThemeToggle/> element). Props mirror the SA shell's state (collapsed / mobile / active page).

export default function PortalShell(props) {
  var C = props.C || {};
  var isDark = props.isDark;
  var navItems = props.navItems || [];
  var activePage = props.activePage;
  var onNav = props.onNav || function () {};
  var collapsed = !!props.collapsed;
  var onToggleCollapse = props.onToggleCollapse || function () {};
  var isMobile = !!props.isMobile;
  var sidebarOpen = !!props.sidebarOpen;
  var onOpenSidebar = props.onOpenSidebar || function () {};
  var onCloseSidebar = props.onCloseSidebar || function () {};
  var onSignOut = props.onSignOut || function () {};
  // Pages that own their own scroll (e.g. Live Inbox) opt out of the frame's scroll.
  var contentOverflowY = props.contentScroll === false ? 'hidden' : 'auto';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text, overflow: 'hidden', position: 'relative' }}>
      {isMobile && !sidebarOpen && (
        <button onClick={onOpenSidebar} style={{ position: 'fixed', top: 12, left: 12, zIndex: 200, background: C.surface, border: '1px solid ' + C.border, borderRadius: 8, padding: '8px 12px', color: C.text, cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>☰</button>
      )}
      {isMobile && sidebarOpen && (
        <div onClick={onCloseSidebar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 99 }} />
      )}

      {/* Sidebar */}
      <div style={{ width: collapsed ? 64 : 240, boxSizing: 'border-box', background: C.bg, borderRight: '1px solid ' + C.divider, display: 'flex', flexDirection: 'column', padding: collapsed ? '24px 8px' : '24px 16px', flexShrink: 0, position: 'fixed', height: '100vh', zIndex: 100, transform: isMobile && !sidebarOpen ? 'translateX(-100%)' : 'translateX(0)', transition: 'all 0.25s ease', overflow: 'hidden' }}>
        <div style={{ marginBottom: 32, paddingLeft: collapsed ? 0 : 8, textAlign: collapsed ? 'center' : 'left' }}>
          {props.header}
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
          {navItems.map(function (item) {
            var active = activePage === item.id;
            return (
              <button key={item.id} onClick={function () { onNav(item.id); if (isMobile) onCloseSidebar(); }} title={collapsed ? item.label : undefined} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 12,
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '11px 0' : '11px 12px', borderRadius: 9, border: 'none',
                background: active ? (isDark ? C.primary + '18' : C.primary + '22') : 'transparent',
                color: active ? C.primary : C.muted,
                cursor: 'pointer', fontSize: collapsed ? 20 : 14, fontWeight: active ? 700 : 400,
                marginBottom: 4, textAlign: collapsed ? 'center' : 'left',
                borderLeft: active ? '3px solid ' + C.primary : '3px solid transparent',
                transition: 'all 0.2s',
              }}>
                <span style={{ fontSize: collapsed ? 20 : 17 }}>{item.icon}</span>
                {!collapsed && item.label}
              </button>
            );
          })}
        </nav>

        {props.footerExtra}

        {/* Light/Dark toggle */}
        {!collapsed ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 9, marginBottom: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: 12, color: C.muted }}>🌙 Dark Mode</span>
            {props.themeToggle}
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginBottom: 6 }}>{props.themeToggle}</div>
        )}

        {/* Sign out */}
        {!collapsed ? (
          <button onClick={onSignOut} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9, marginBottom: 6, background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.2)', color: '#FF3B30', cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>
            <span>⏻</span><span>Sign Out</span>
          </button>
        ) : (
          <button onClick={onSignOut} title="Sign Out" style={{ width: '100%', padding: '8px 0', borderRadius: 9, marginBottom: 6, border: 'none', background: 'rgba(255,59,48,0.08)', color: '#FF3B30', cursor: 'pointer', fontSize: 16, fontFamily: "'DM Sans', sans-serif", textAlign: 'center' }}>⏻</button>
        )}

        {/* Collapse toggle */}
        <button onClick={onToggleCollapse} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} style={{ width: '100%', padding: '6px 0', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif", textAlign: 'center', flexShrink: 0 }}>{collapsed ? '»' : '«'}</button>
      </div>

      {/* Content frame — matches the SA layout (fixed, offset by sidebar width). Children own padding. */}
      <div style={{ position: 'fixed', top: 0, left: isMobile ? 0 : (collapsed ? 64 : 240), right: 0, bottom: 0, overflowY: contentOverflowY, transition: 'left 0.25s ease', display: 'flex', flexDirection: 'column', background: C.bg, zIndex: 50 }}>
        {props.children}
      </div>
    </div>
  );
}
