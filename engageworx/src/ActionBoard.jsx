import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

var TIER_META = [
  { id: 'priority', label: 'Priority', icon: '🚨', flex: 2, desc: 'Needs your attention today', intensity: 1.0 },
  { id: 'engagement', label: 'Engagement', icon: '🟡', flex: 1.5, desc: 'Active and advancing', intensity: 0.7 },
  { id: 'bulk', label: 'Bulk', icon: '🟢', flex: 1, desc: 'Systematic nudges', intensity: 0.4 },
];

// Blend two hex colors. t=0 → colorA, t=1 → colorB.
function blendHex(a, b, t) {
  var parse = function(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  var ca = parse(a), cb = parse(b);
  var r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  var g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  var bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return '#' + [r, g, bl].map(function(v) { return v.toString(16).padStart(2, '0'); }).join('');
}

export default function ActionBoard({ C, currentTenantId }) {
  var primary = (C && C.primary) || '#00C9FF';
  var accent = (C && C.accent) || '#E040FB';
  var text = (C && C.text) || '#E8F4FD';
  var muted = (C && C.muted) || '#6B8BAE';
  var surface = (C && C.surface) || '#0d1425';
  var cardBg = (C && C.cardBg) || 'rgba(255,255,255,0.03)';
  var cardBorder = (C && C.cardBorder) || 'rgba(255,255,255,0.08)';
  var isDark = !C || !C.mode || C.mode === 'dark';

  // Derive tier colors from tenant brand:
  // Priority = primary (full brand), Engagement = accent (full brand),
  // Bulk = midpoint blend of primary + accent at 50% — stays colorful, reads distinct
  var bulkColor = blendHex(primary, accent, 0.5);
  var TIERS = TIER_META.map(function(t) {
    var color;
    if (t.id === 'priority') color = primary;
    else if (t.id === 'engagement') color = accent;
    else color = bulkColor;
    return Object.assign({}, t, { color: color });
  });

  var [items, setItems] = useState([]);
  var [loading, setLoading] = useState(true);
  var [lastRefresh, setLastRefresh] = useState(null);
  var [generating, setGenerating] = useState(false);
  var [expandedDraft, setExpandedDraft] = useState(null);
  var [editingItem, setEditingItem] = useState(null);
  var [editDraft, setEditDraft] = useState('');
  var [actionLoading, setActionLoading] = useState(null);
  var [snoozeOpen, setSnoozeOpen] = useState(null);
  var [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(function() {
    function handleResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', handleResize);
    return function() { window.removeEventListener('resize', handleResize); };
  }, []);

  var loadItems = useCallback(async function() {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      var now = new Date().toISOString();
      var { data, error } = await supabase.from('action_items')
        .select('*')
        .eq('tenant_id', currentTenantId)
        .eq('status', 'pending')
        .or('snooze_until.is.null,snooze_until.lt.' + now)
        .order('created_at', { ascending: false });
      if (error) console.error('[ActionBoard] load error:', error.message);
      setItems(data || []);
      setLastRefresh(new Date());
    } catch (e) { console.error('[ActionBoard] error:', e.message); }
    setLoading(false);
  }, [currentTenantId]);

  useEffect(function() { loadItems(); }, [loadItems]);

  async function getJwt() {
    try {
      var s = await supabase.auth.getSession();
      return s.data.session ? s.data.session.access_token : null;
    } catch (_) { return null; }
  }

  async function handleSend(itemId) {
    setActionLoading(itemId);
    try {
      var jwt = await getJwt();
      var r = await fetch('/api/action-items/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: JSON.stringify({ action_item_id: itemId }),
      });
      var d = await r.json();
      if (d.success) {
        setItems(function(prev) { return prev.filter(function(i) { return i.id !== itemId; }); });
      } else {
        alert('Send failed: ' + (d.error || 'Unknown error'));
      }
    } catch (e) { alert('Error: ' + e.message); }
    setActionLoading(null);
  }

  async function handleDismiss(itemId) {
    setActionLoading(itemId);
    try {
      var jwt = await getJwt();
      await fetch('/api/action-items/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: JSON.stringify({ action_item_id: itemId }),
      });
      setItems(function(prev) { return prev.filter(function(i) { return i.id !== itemId; }); });
    } catch (e) { alert('Error: ' + e.message); }
    setActionLoading(null);
  }

  async function handleSnooze(itemId, duration) {
    setActionLoading(itemId);
    setSnoozeOpen(null);
    try {
      var jwt = await getJwt();
      await fetch('/api/action-items/snooze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: JSON.stringify({ action_item_id: itemId, duration: duration }),
      });
      setItems(function(prev) { return prev.filter(function(i) { return i.id !== itemId; }); });
    } catch (e) { alert('Error: ' + e.message); }
    setActionLoading(null);
  }

  async function handleEditSave(itemId) {
    try {
      var { error } = await supabase.from('action_items').update({
        draft_body_html: editDraft,
        draft_edits_count: (items.find(function(i) { return i.id === itemId; }) || {}).draft_edits_count + 1 || 1,
      }).eq('id', itemId);
      if (error) { alert('Save error: ' + error.message); return; }
      setItems(function(prev) { return prev.map(function(i) {
        return i.id === itemId ? Object.assign({}, i, { draft_body_html: editDraft, draft_edits_count: (i.draft_edits_count || 0) + 1 }) : i;
      }); });
      setEditingItem(null);
    } catch (e) { alert('Error: ' + e.message); }
  }

  async function handleGenerate() {
    if (!currentTenantId) return;
    setGenerating(true);
    try {
      var jwt = await getJwt();
      var r = await fetch('/api/action-items/generate-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
        body: JSON.stringify({ tenant_id: currentTenantId }),
      });
      var d = await r.json();
      if (d.success) {
        alert('Generated ' + d.generated + ' new items, ' + d.skipped_dedup + ' deduped, from ' + d.stale_leads_found + ' stale leads.');
        loadItems();
      } else {
        alert('Generation error: ' + (d.error || 'Unknown'));
      }
    } catch (e) { alert('Error: ' + e.message); }
    setGenerating(false);
  }

  var byTier = {};
  TIERS.forEach(function(t) { byTier[t.id] = []; });
  items.forEach(function(item) {
    if (byTier[item.tier]) byTier[item.tier].push(item);
  });

  var totalCount = items.length;
  var refreshAgo = lastRefresh ? Math.round((Date.now() - lastRefresh.getTime()) / 60000) : null;

  // Adaptive alpha helpers
  var subtleBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  var subtleBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
  var faintText = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
  var softText = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)';
  var medText = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)';
  var hoverBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)';
  var hoverBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';

  // ── Skeleton loader ──────────────────────────────────────────────
  function renderSkeleton() {
    return [1, 2, 3].map(function(n) {
      return (
        <div key={'sk' + n} style={{ background: cardBg, borderRadius: 14, padding: 22, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 140, height: 14, background: cardBorder, borderRadius: 6, animation: 'shimmer 1.5s infinite' }} />
            <div style={{ width: 80, height: 14, background: cardBg, borderRadius: 6, animation: 'shimmer 1.5s infinite 0.2s' }} />
          </div>
          <div style={{ width: '90%', height: 10, background: cardBg, borderRadius: 4, marginBottom: 8, animation: 'shimmer 1.5s infinite 0.4s' }} />
          <div style={{ width: '60%', height: 10, background: cardBg, borderRadius: 4, animation: 'shimmer 1.5s infinite 0.6s' }} />
        </div>
      );
    });
  }

  // ── Action card ──────────────────────────────────────────────────
  function renderCard(item) {
    var isExpanded = expandedDraft === item.id;
    var isEditing = editingItem === item.id;
    var isActioning = actionLoading === item.id;
    var tierInfo = TIERS.find(function(t) { return t.id === item.tier; }) || TIERS[0];
    var recipients = item.draft_recipients || [];
    var isSnoozeOpen = snoozeOpen === item.id;

    return (
      <div key={item.id}
        style={{
          background: cardBg,
          borderTop: '3px solid ' + tierInfo.color,
          border: '1px solid ' + cardBorder,
          borderRadius: 14,
          padding: isMobile ? 16 : 22,
          marginBottom: 12,
          transition: 'all 0.2s ease',
          opacity: isActioning ? 0.5 : 1,
        }}
        onMouseEnter={function(e) { if (!isMobile) { e.currentTarget.style.background = hoverBg; e.currentTarget.style.borderColor = hoverBorder; } }}
        onMouseLeave={function(e) { e.currentTarget.style.background = cardBg; e.currentTarget.style.borderColor = cardBorder; }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: text, fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{item.title}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {item.suggested_action && (
                <span style={{
                  background: tierInfo.color + '15', color: tierInfo.color,
                  border: '1px solid ' + tierInfo.color + '33',
                  borderRadius: 6, padding: '3px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                }}>{item.suggested_action}</span>
              )}
              {item.is_vip_action && (
                <span style={{
                  background: 'rgba(255,214,0,0.12)', color: '#FFD600',
                  border: '1px solid rgba(255,214,0,0.3)',
                  borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 700,
                }}>⭐ VIP</span>
              )}
            </div>
          </div>
          {item.stage_advance_type === 'mechanical' && (
            <span style={{ fontSize: 9, color: primary, background: primary + '12', border: '1px solid ' + primary + '33', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>auto-advance</span>
          )}
        </div>

        {/* Context */}
        {item.context && (
          <div style={{ color: softText, fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{item.context}</div>
        )}

        {/* Recipients */}
        {recipients.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {recipients.map(function(r, i) {
              return (
                <span key={i} style={{
                  background: primary + '12', border: '1px solid ' + primary + '33',
                  borderRadius: 6, padding: '3px 10px', fontSize: 11, color: medText,
                }}>
                  {r.name ? r.name + ' · ' : ''}<span style={{ color: primary }}>{r.email}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Draft preview */}
        {item.draft_subject && (
          <div onClick={function() { if (!isEditing) setExpandedDraft(isExpanded ? null : item.id); }} style={{ cursor: isEditing ? 'default' : 'pointer', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: faintText, fontSize: 11, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              <span style={{ color: faintText, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Subject</span>
              <span style={{ color: medText, fontSize: 13, fontWeight: 600 }}>{item.draft_subject}</span>
            </div>
            {isExpanded && !isEditing && item.draft_body_html && (
              <div style={{
                marginTop: 10, marginLeft: 18,
                background: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.04)',
                borderLeft: '3px solid ' + tierInfo.color + '44',
                borderRadius: '0 10px 10px 0', padding: '14px 18px',
                fontSize: 13, color: medText, lineHeight: 1.7,
              }} dangerouslySetInnerHTML={{ __html: item.draft_body_html }} />
            )}
          </div>
        )}

        {/* Edit mode */}
        {isEditing && (
          <div style={{ marginBottom: 14 }}>
            <textarea
              value={editDraft}
              onChange={function(e) { setEditDraft(e.target.value); }}
              rows={10}
              style={{
                width: '100%', background: isDark ? 'rgba(0,0,0,0.3)' : '#fff',
                border: '1px solid ' + subtleBorder, borderRadius: 10,
                padding: 16, color: text, fontSize: 13, lineHeight: 1.6,
                fontFamily: "'DM Sans', sans-serif", resize: 'vertical',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={function() { handleEditSave(item.id); }} style={{
                background: 'linear-gradient(135deg, ' + primary + ', ' + accent + ')',
                border: 'none', borderRadius: 8, padding: '10px 20px',
                color: isDark ? '#000' : '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13,
                fontFamily: "'DM Sans', sans-serif",
              }}>Save Draft</button>
              <button onClick={function() { setEditingItem(null); }} style={{
                background: subtleBg, border: '1px solid ' + subtleBorder,
                borderRadius: 8, padding: '10px 16px', color: softText,
                cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
              }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!isEditing && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <button onClick={function() { handleSend(item.id); }} disabled={isActioning || recipients.length === 0}
              style={{
                background: (isActioning || recipients.length === 0) ? subtleBg : 'linear-gradient(135deg, ' + primary + ', ' + accent + ')',
                border: 'none', borderRadius: 10, padding: isMobile ? '12px 0' : '10px 22px',
                color: (isActioning || recipients.length === 0) ? faintText : (isDark ? '#000' : '#fff'),
                fontWeight: 700, cursor: (isActioning || recipients.length === 0) ? 'not-allowed' : 'pointer',
                fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                flex: isMobile ? '1' : 'none', transition: 'all 0.2s',
              }}>
              {isActioning ? 'Sending...' : 'Approve & Send'}
            </button>

            <button onClick={function() { setEditingItem(item.id); setEditDraft(item.draft_body_html || ''); setExpandedDraft(item.id); }}
              style={{
                background: subtleBg, border: '1px solid ' + subtleBorder,
                borderRadius: 10, padding: '10px 16px', color: softText,
                cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                transition: 'all 0.2s',
              }}
              onMouseEnter={function(e) { e.currentTarget.style.borderColor = hoverBorder; e.currentTarget.style.color = text; }}
              onMouseLeave={function(e) { e.currentTarget.style.borderColor = subtleBorder; e.currentTarget.style.color = softText; }}
            >✏️ Edit</button>

            {/* Styled snooze dropdown */}
            <div style={{ position: 'relative' }}>
              <button onClick={function() { setSnoozeOpen(isSnoozeOpen ? null : item.id); }}
                style={{
                  background: subtleBg, border: '1px solid ' + subtleBorder,
                  borderRadius: 10, padding: '10px 16px', color: softText,
                  cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                  transition: 'all 0.2s',
                }}
                onMouseEnter={function(e) { e.currentTarget.style.borderColor = hoverBorder; e.currentTarget.style.color = text; }}
                onMouseLeave={function(e) { e.currentTarget.style.borderColor = subtleBorder; e.currentTarget.style.color = softText; }}
              >⏰ Snooze</button>
              {isSnoozeOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 10,
                  background: surface, border: '1px solid ' + hoverBorder,
                  borderRadius: 10, overflow: 'hidden', minWidth: 140,
                  boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.15)',
                }}>
                  {[{ label: '1 day', value: '1d' }, { label: '3 days', value: '3d' }, { label: '1 week', value: '1w' }].map(function(opt) {
                    return (
                      <div key={opt.value}
                        onClick={function() { handleSnooze(item.id, opt.value); }}
                        style={{
                          padding: '10px 16px', cursor: 'pointer', fontSize: 13, color: softText,
                          transition: 'background 0.15s', borderBottom: '1px solid ' + cardBorder,
                        }}
                        onMouseEnter={function(e) { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = text; }}
                        onMouseLeave={function(e) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = softText; }}
                      >{opt.label}</div>
                    );
                  })}
                </div>
              )}
            </div>

            <button onClick={function() { handleDismiss(item.id); }} disabled={isActioning}
              style={{
                background: 'none', border: '1px solid ' + cardBorder,
                borderRadius: 10, padding: '10px 14px', color: faintText,
                cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                transition: 'all 0.2s',
              }}
              onMouseEnter={function(e) { e.currentTarget.style.borderColor = 'rgba(255,59,48,0.3)'; e.currentTarget.style.color = '#FF3B30'; }}
              onMouseLeave={function(e) { e.currentTarget.style.borderColor = cardBorder; e.currentTarget.style.color = faintText; }}
            >Dismiss</button>
          </div>
        )}
      </div>
    );
  }

  // ── Tier empty state ─────────────────────────────────────────────
  function renderTierEmpty(tier) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 16px' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg, ' + tier.color + '22, ' + tier.color + '08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, margin: '0 auto 12px',
        }}>{tier.icon}</div>
        <div style={{ color: faintText, fontSize: 13, lineHeight: 1.5 }}>
          No {tier.label.toLowerCase()} actions
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? '20px 16px' : '28px 32px', fontFamily: "'DM Sans', sans-serif", maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 28, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 14 : 0 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: text, margin: 0 }}>
            <span style={{ background: 'linear-gradient(135deg, ' + primary + ', ' + accent + ')', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AI</span> Action Board
            {totalCount > 0 && <span style={{ color: muted, fontSize: 14, fontWeight: 500, marginLeft: 10 }}>· {totalCount} action{totalCount !== 1 ? 's' : ''}</span>}
          </h1>
          <p style={{ color: faintText, marginTop: 4, fontSize: 13 }}>
            {lastRefresh ? 'Last refreshed ' + (refreshAgo === 0 ? 'just now' : refreshAgo + 'm ago') : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleGenerate} disabled={generating}
            style={{
              background: generating ? subtleBg : 'linear-gradient(135deg, ' + primary + '22, ' + accent + '22)',
              border: '1px solid ' + (generating ? subtleBorder : primary + '44'),
              borderRadius: 10, padding: '10px 18px',
              color: generating ? faintText : primary,
              cursor: generating ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.2s',
            }}>
            {generating ? 'Generating...' : '⚡ Generate Now'}
          </button>
          <button onClick={loadItems} disabled={loading}
            style={{
              background: subtleBg, border: '1px solid ' + subtleBorder,
              borderRadius: 10, padding: '10px 14px', color: muted,
              cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.2s',
            }}
            onMouseEnter={function(e) { e.currentTarget.style.borderColor = hoverBorder; }}
            onMouseLeave={function(e) { e.currentTarget.style.borderColor = subtleBorder; }}
          >🔄</button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && items.length === 0 && (
        <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: '2fr 1.5fr 1fr', gap: 24 }}>
          {TIERS.map(function(tier) {
            return <div key={tier.id}>{renderSkeleton()}</div>;
          })}
        </div>
      )}

      {/* Three columns (desktop) / stacked sections (mobile) */}
      {!loading && (
        <div style={{
          display: isMobile ? 'flex' : 'grid',
          gridTemplateColumns: '2fr 1.5fr 1fr',
          flexDirection: 'column',
          gap: 24,
          alignItems: 'flex-start',
        }}>
          {TIERS.map(function(tier) {
            var tierItems = byTier[tier.id] || [];
            var collapsed = tier.id === 'bulk' && tierItems.length > 5 && !isMobile;

            return (
              <div key={tier.id} style={{ width: isMobile ? '100%' : 'auto' }}>
                {/* Column header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                  paddingBottom: 12, borderBottom: '2px solid ' + tier.color + '22',
                }}>
                  <span style={{ fontSize: 18 }}>{tier.icon}</span>
                  <span style={{ color: text, fontWeight: 700, fontSize: 16 }}>{tier.label}</span>
                  {tierItems.length > 0 && (
                    <span style={{
                      background: tier.color + '18', color: tier.color,
                      border: '1px solid ' + tier.color + '33',
                      borderRadius: 12, padding: '2px 10px',
                      fontSize: 11, fontWeight: 700,
                    }}>{tierItems.length}</span>
                  )}
                  <span style={{ flex: 1 }} />
                  {!isMobile && <span style={{ color: faintText, fontSize: 11 }}>{tier.desc}</span>}
                </div>

                {/* Items or empty */}
                {tierItems.length === 0
                  ? renderTierEmpty(tier)
                  : (
                    <div style={{ maxHeight: isMobile ? 'none' : 'calc(100vh - 200px)', overflowY: isMobile ? 'visible' : 'auto', paddingRight: isMobile ? 0 : 4 }}>
                      {(collapsed ? tierItems.slice(0, 3) : tierItems).map(renderCard)}
                      {collapsed && (
                        <div style={{ textAlign: 'center', padding: '12px 0' }}>
                          <button style={{
                            background: 'none', border: '1px solid ' + cardBorder,
                            borderRadius: 8, padding: '6px 16px', color: faintText,
                            cursor: 'pointer', fontSize: 11, fontFamily: "'DM Sans', sans-serif",
                          }}>Show {tierItems.length - 3} more</button>
                        </div>
                      )}
                    </div>
                  )
                }
              </div>
            );
          })}
        </div>
      )}

      {/* Global empty state */}
      {totalCount === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg, ' + primary + '22, ' + accent + '22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, margin: '0 auto 20px',
          }}>✅</div>
          <div style={{ color: text, fontWeight: 700, fontSize: 20, marginBottom: 8 }}>You're all caught up</div>
          <div style={{ color: muted, fontSize: 14, maxWidth: 440, margin: '0 auto', lineHeight: 1.6 }}>
            The system will surface what needs your attention as it comes up — stale leads, escalations, and engagement opportunities.
          </div>
          <button onClick={handleGenerate} disabled={generating}
            style={{
              marginTop: 20,
              background: 'linear-gradient(135deg, ' + primary + '22, ' + accent + '22)',
              border: '1px solid ' + primary + '33',
              borderRadius: 10, padding: '12px 24px',
              color: primary, fontWeight: 700, cursor: 'pointer',
              fontSize: 14, fontFamily: "'DM Sans', sans-serif",
            }}>
            {generating ? 'Checking...' : '⚡ Check for stale leads now'}
          </button>
        </div>
      )}

      {/* Shimmer animation */}
      <style>{'\n@keyframes shimmer { 0% { opacity: 0.3; } 50% { opacity: 0.6; } 100% { opacity: 0.3; } }\n'}</style>
    </div>
  );
}
