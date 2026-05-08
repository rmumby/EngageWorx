// src/wedding/WeddingPortalShell.jsx
//
// Layout shell for the wedding portal. Renders:
//   - left sidebar (venue logo, couple block, nav, AI Concierge button)
//   - top freeze banner (only when state !== 'open')
//   - top bar (page title + progress pill)
//   - main content area (children)
//
// All venue/couple text comes from props — no hardcoding (EngageWorx §5).
// Other nav items are stubbed disabled buttons until their routes are wired up.
//
// Vendor-confidentiality (EngageWorx §5): the demo had “Powered by Claude”
// in the concierge header. This shell uses neutral copy in the AI button label
// (“AI Concierge”). When the concierge panel itself ships, it must stay neutral.

import React from 'react';
import './wedding-portal.css';
import { formatGBDateShort } from './freeze';

const NAV_GROUPS = [
  {
    label: 'Planning',
    items: [
      { id: 'dashboard', label: 'Dashboard', glyph: '◈' },
      { id: 'plan', label: 'Wedding Plan', glyph: '◷', disabled: true },
      { id: 'timings', label: 'Day Timings', glyph: '⏱', disabled: true },
    ],
  },
  {
    label: 'Your Day',
    items: [
      { id: 'suppliers', label: 'Suppliers', glyph: '◇', disabled: true },
      { id: 'menu', label: 'Menu', glyph: '◑', disabled: true },
      { id: 'seating', label: 'Seating', glyph: '◻', badge: 'Always open', disabled: true },
    ],
  },
  {
    label: 'More',
    items: [
      { id: 'changes', label: 'Change Requests', glyph: '✎', disabled: true },
      { id: 'blog', label: 'News & Blog', glyph: '✦', disabled: true },
      { id: 'docs', label: 'Documents', glyph: '◫', disabled: true },
    ],
  },
];

function FreezeBanner({ freezeState, freezeDate }) {
  if (freezeState === 'open') return null;

  const text =
    freezeState === 'frozen'
      ? 'We’re in the final preparations for your day. To keep everything running smoothly, your coordinator is looking after any updates from here — just reach out and we’ll take care of it.'
      : `A gentle reminder — if there’s anything you’d like to update, now is a lovely time to do it. From ${formatGBDateShort(freezeDate)}, your coordinator takes over final preparations.`;

  return (
    <div className="wp-freeze-banner">
      <span className="wp-freeze-icon">✦</span>
      <span className="wp-freeze-txt">{text}</span>
      <button className="wp-freeze-req" type="button" disabled>
        Request a Change →
      </button>
    </div>
  );
}

export default function WeddingPortalShell({
  // Branding / venue
  venueName,        // e.g. "Delamere Manor"
  // Couple
  coupleNames,      // e.g. "Vicky & Ryan"
  weddingDate,      // ISO string or Date
  venueLocation,    // e.g. "Cheshire"
  daysToWedding,    // number
  // Page chrome
  pageTitle = 'Overview',
  planPct = 0,
  // Freeze
  freezeState = 'open',
  freezeDate = null,
  // Active nav
  activeNavId = 'dashboard',
  // Body
  children,
}) {
  const dateLabel = weddingDate ? formatGBDateShort(weddingDate) : '';
  const headerLine =
    venueLocation && dateLabel
      ? `${dateLabel} · ${venueLocation}`
      : dateLabel || venueLocation || '';

  return (
    <div className="wp-root">
      {/* SIDEBAR */}
      <nav className="wp-sb">
        <div className="wp-sb-logo">
          <span className="wp-sb-crest">{venueName || 'Wedding Venue'}</span>
          <h1 className="wp-sb-h1">
            Wedding<br />Portal
          </h1>
        </div>

        <div className="wp-sb-couple">
          <div className="wp-sb-names">{coupleNames || '—'}</div>
          <div className="wp-sb-date">{headerLine}</div>
          <div className="wp-days-pill">
            <div className="wp-days-n">{daysToWedding != null && daysToWedding > 0 ? daysToWedding : 0}</div>
            <div className="wp-days-l">days to go</div>
          </div>
        </div>

        <div className="wp-nav">
          {NAV_GROUPS.map((group) => (
            <React.Fragment key={group.label}>
              <div className="wp-nav-s">{group.label}</div>
              {group.items.map((item) => {
                const isActive = item.id === activeNavId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`wp-nav-i${isActive ? ' active' : ''}`}
                    disabled={item.disabled && !isActive}
                    title={item.disabled ? 'Coming soon' : undefined}
                  >
                    <span>{item.glyph}</span> {item.label}
                    {item.badge && <span className="wp-nb-g">{item.badge}</span>}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        <div className="wp-sb-foot">
          <button type="button" className="wp-ai-btn" disabled title="Coming soon">
            ✦ AI Concierge
          </button>
        </div>
      </nav>

      {/* MAIN */}
      <div className="wp-main">
        <FreezeBanner freezeState={freezeState} freezeDate={freezeDate} />

        <div className="wp-topbar">
          <div className="wp-pg-title">{pageTitle}</div>
          <div className="wp-prog-pill">
            <div className="wp-prog-bar">
              <div
                className="wp-prog-fill"
                style={{ width: `${Math.max(0, Math.min(100, planPct))}%` }}
              />
            </div>
            <span className="wp-prog-txt">{Math.round(planPct)}% complete</span>
          </div>
        </div>

        <div className="wp-views">
          <div className="wp-view">{children}</div>
        </div>
      </div>
    </div>
  );
}
