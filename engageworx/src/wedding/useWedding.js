// src/wedding/useWedding.js
//
// Loads everything the wedding portal needs for a given wedding ID.
//
// Round 1 (parallel): wedding row + plan + suppliers + menu
// Round 2 (parallel, depends on tenant_id from round 1): venue config + tenant
//
// Returns a single object the components can consume. No retries, no caching
// beyond React state — keep this dumb. SWR/React Query can come later.
//
// AUTH NOTE: this v1 assumes either (a) a coordinator (tenant_member) session,
// or (b) a couple session that satisfies the wedding_users RLS check. If
// neither, RLS will return empty/error and the caller should render the
// "not found / no access" branch. Couple-side magic-link auth lands in a
// future session — see brief §3.

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
// ^ TODO(claude-code): adjust import path to wherever supabaseClient lives.
//   The EngageWorx convention is a single client exported from one module
//   (brief §6). Do not call createClient() inside this file.

import { computeFreezeState } from './freeze';

export function useWedding(weddingId) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    wedding: null,
    plan: null,
    suppliers: [],
    menuChoices: [],
    venueConfig: null,
    tenant: null,
    freezeState: 'open',
    daysToWedding: null,
    daysToFreeze: null,
  });

  useEffect(() => {
    if (!weddingId) return;
    let cancelled = false;

    (async () => {
      try {
        // ─── Round 1: wedding-scoped data in parallel ──────────────────────
        const [weddingRes, planRes, suppliersRes, menuRes] = await Promise.all([
          supabase
            .from('weddings')
            .select('*')
            .eq('id', weddingId)
            .maybeSingle(),
          supabase
            .from('wedding_plans')
            .select('*')
            .eq('wedding_id', weddingId)
            .maybeSingle(),
          supabase
            .from('wedding_suppliers')
            .select('*')
            .eq('wedding_id', weddingId)
            .order('category', { ascending: true }),
          supabase
            .from('wedding_menu_choices')
            .select('*')
            .eq('wedding_id', weddingId),
        ]);

        if (cancelled) return;

        if (weddingRes.error) throw weddingRes.error;
        if (!weddingRes.data) {
          setState((s) => ({
            ...s,
            loading: false,
            error: { code: 'not_found', message: 'Wedding not found, or you don’t have access.' },
          }));
          return;
        }

        const wedding = weddingRes.data;
        const plan = planRes.data || null;
        const suppliers = suppliersRes.data || [];
        const menuChoices = menuRes.data || [];

        // ─── Round 2: tenant-scoped data in parallel ───────────────────────
        const [tenantRes, venueRes] = await Promise.all([
          supabase
            .from('tenants')
            .select('id, name, branding')
            .eq('id', wedding.tenant_id)
            .maybeSingle(),
          supabase
            .from('wedding_venue_configs')
            .select('*')
            .eq('tenant_id', wedding.tenant_id)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        const tenant = tenantRes.data || null;
        const venueConfig = venueRes.data || null;

        // Freeze period: prefer venue config, fall back to default 6 weeks.
        const freezeWeeks = venueConfig?.freeze_weeks_before ?? 6;
        const freezeDate =
          wedding.freeze_date ||
          (wedding.wedding_date
            ? new Date(
                new Date(wedding.wedding_date).getTime() -
                  freezeWeeks * 7 * 86_400_000
              )
            : null);

        const { state: freezeState, daysToWedding, daysToFreeze } =
          computeFreezeState(wedding.wedding_date, freezeDate);

        setState({
          loading: false,
          error: null,
          wedding: { ...wedding, tenant }, // attach tenant for convenience
          plan,
          suppliers,
          menuChoices,
          venueConfig,
          tenant,
          freezeState,
          daysToWedding,
          daysToFreeze,
        });
      } catch (err) {
        if (cancelled) return;
        // Don’t leak Supabase internals into the UI per EngageWorx
        // error-hygiene convention. Log full detail, surface a clean message.
        // eslint-disable-next-line no-console
        console.error('[useWedding] load failed', err);
        setState((s) => ({
          ...s,
          loading: false,
          error: { code: 'load_failed', message: 'We couldn’t load this wedding right now.' },
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [weddingId]);

  return state;
}
