// src/wedding/WeddingDashboard.jsx
//
// The /weddings/:id route component. Loads wedding data and renders the
// dashboard view inside WeddingPortalShell.
//
// Replaces every hardcoded couple/venue reference from the demo with DB
// values. Falls through to clear loading / error / not-found states.
//
// Router note: this component reads the wedding ID from props in a way that
// works with both react-router v5 and v6. Mount example in
// route-mount.example.jsx; let Claude Code adapt to whichever the app uses.

import React from 'react';
import WeddingPortalShell from './WeddingPortalShell';
import { useWedding } from './useWedding';
import { deriveTasks, deriveMilestones, formatCeremonyType } from './derive';
import { formatGBDate } from './freeze';

function Loading() {
  return (
    <div className="wp-root">
      <div className="wp-loading">Loading wedding…</div>
    </div>
  );
}

function NotFoundOrNoAccess({ message }) {
  return (
    <div className="wp-root">
      <div className="wp-error">
        <div className="wp-error-title">We couldn’t open this wedding</div>
        <div>{message}</div>
      </div>
    </div>
  );
}

export default function WeddingDashboard({ weddingId: weddingIdProp, match, params }) {
  // Resolve the ID from props, react-router v5 (match.params), or v6 (params).
  const weddingId =
    weddingIdProp || params?.id || match?.params?.id;

  const {
    loading,
    error,
    wedding,
    plan,
    suppliers,
    menuChoices,
    venueConfig,
    tenant,
    freezeState,
    daysToWedding,
  } = useWedding(weddingId);

  if (loading) return <Loading />;
  if (error || !wedding) {
    return <NotFoundOrNoAccess message={error?.message || 'Wedding not found.'} />;
  }

  // ─── Derive display values ─────────────────────────────────────────────
  const venueName = tenant?.name || venueConfig?.venue_name || 'Your Venue';
  // venue_location: not in core schema; check meta then venue_config.
  const venueLocation =
    venueConfig?.venue_location ||
    wedding.meta?.venue_location ||
    null;

  const ceremonyType = formatCeremonyType(
    plan?.ceremony?.ceremony_type || wedding.meta?.ceremony_type
  );

  const dateLong = formatGBDate(wedding.wedding_date);

  const dayCount = plan?.guests?.day_count ?? 0;
  const eveCount = plan?.guests?.eve_count ?? plan?.guests?.evening_count ?? 0;

  const supplierTotal = suppliers.length;
  const supplierConfirmed = suppliers.filter((s) => s.status === 'confirmed').length;
  const suppliersAllConfirmed = supplierTotal > 0 && supplierConfirmed === supplierTotal;

  const tasks = deriveTasks({ plan, suppliers, menuChoices });
  const milestones = deriveMilestones({
    wedding: { ...wedding, tenant },
    plan,
    suppliers,
    menuChoices,
    freezeState,
  });

  // Sub-line for the days-to-go stat reflects freeze state (matches demo).
  const daysSubText =
    freezeState === 'frozen'
      ? 'freeze active'
      : freezeState === 'warning'
      ? 'freeze approaching'
      : 'planning open';

  // Bottom info card on the dashboard mirrors demo behaviour per freeze state.
  const freezeInfoCard = renderFreezeInfoCard({
    freezeState,
    freezeDate: wedding.freeze_date,
  });

  // Welcome subline: "27 May 2026 · Civil Ceremony · Delamere Manor, Cheshire"
  const welcomeSubParts = [dateLong, ceremonyType, venueName];
  if (venueLocation) welcomeSubParts[welcomeSubParts.length - 1] = `${venueName}, ${venueLocation}`;
  const welcomeSub = welcomeSubParts.filter(Boolean).join(' · ');

  return (
    <WeddingPortalShell
      venueName={venueName}
      coupleNames={wedding.display_name}
      weddingDate={wedding.wedding_date}
      venueLocation={venueLocation}
      daysToWedding={daysToWedding}
      pageTitle="Overview"
      planPct={wedding.plan_pct ?? 0}
      freezeState={freezeState}
      freezeDate={wedding.freeze_date}
      activeNavId="dashboard"
    >
      {/* WELCOME */}
      <div className="wp-welcome">
        <div className="wp-wlbl">Welcome back</div>
        <div className="wp-wtit">
          {wedding.display_name},<br />your day is taking shape.
        </div>
        <div className="wp-wsub">{welcomeSub}</div>
      </div>

      {/* STATS */}
      <div className="wp-stats">
        <div className="wp-stat">
          <div className="wp-stat-l">Day Guests</div>
          <div className="wp-stat-v">{dayCount}</div>
          <div className="wp-stat-s">+ {eveCount} evening</div>
        </div>
        <div className="wp-stat">
          <div className="wp-stat-l">Suppliers</div>
          <div className="wp-stat-v">{supplierConfirmed}</div>
          <div className="wp-stat-s">
            {suppliersAllConfirmed ? 'all confirmed' : `of ${supplierTotal} confirmed`}
          </div>
        </div>
        <div className="wp-stat">
          <div className="wp-stat-l">Days to Go</div>
          <div className="wp-stat-v">
            {daysToWedding != null && daysToWedding > 0 ? daysToWedding : 0}
          </div>
          <div className="wp-stat-s">{daysSubText}</div>
        </div>
        <div className="wp-stat">
          <div className="wp-stat-l">Plan Status</div>
          <div className="wp-stat-v">{wedding.plan_pct ?? 0}%</div>
          <div className="wp-stat-s">complete</div>
        </div>
      </div>

      {/* TWO-COL: TO DO + MILESTONES */}
      <div className="wp-two-col">
        <div className="wp-card">
          <div className="wp-card-t">
            To Do
            <button type="button" className="wp-card-lnk" disabled title="Coming soon">
              Open plan →
            </button>
          </div>
          {tasks.map((t) => (
            <div key={t.id} className="wp-task">
              <div className={`wp-tchk${t.status === 'done' ? ' done' : ''}`}>
                {t.status === 'done' ? '✓' : ''}
              </div>
              <div className={`wp-ttxt${t.status === 'done' ? ' done' : ''}`}>{t.label}</div>
              <div className={`wp-tdue${t.status === 'urgent' ? ' urg' : ''}`}>{t.due}</div>
            </div>
          ))}
        </div>

        <div className="wp-card">
          <div className="wp-card-t">Key Milestones</div>
          <div className="wp-tl">
            {milestones.map((m) => (
              <div key={m.id} className="wp-tl-item">
                <div
                  className={`wp-tl-dot${
                    m.kind === 'done' ? ' done' : m.kind === 'upcoming' ? ' up' : ''
                  }`}
                />
                <div className="wp-tl-date">{m.dateLabel}</div>
                <div className="wp-tl-ev">{m.label}</div>
                <div className="wp-tl-det">{m.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {freezeInfoCard}
    </WeddingPortalShell>
  );
}

function renderFreezeInfoCard({ freezeState, freezeDate }) {
  if (!freezeDate) return null;
  const dateStr = formatGBDate(freezeDate);

  if (freezeState === 'frozen') {
    return (
      <div className="wp-info-bar amber">
        <span>✦</span>
        <span>
          Your coordinator is now looking after the final details — just send a message
          if there’s anything you’d like to adjust. Seating remains yours to manage anytime.
        </span>
      </div>
    );
  }
  if (freezeState === 'warning') {
    return (
      <div className="wp-info-bar amber">
        <span>✦</span>
        <span>
          If there’s anything you’d like to adjust, now is a great time — your coordinator
          takes over final preparations from <strong>{dateStr}</strong>. Seating is always
          yours to manage.
        </span>
      </div>
    );
  }
  return (
    <div className="wp-info-bar green">
      <span>✓</span>
      <span>
        You can edit your plan freely until <strong>{dateStr}</strong> — your freeze date.
        Seating is always open.
      </span>
    </div>
  );
}
