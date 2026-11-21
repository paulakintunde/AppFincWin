// 08.1-07 (CMP-F19, D-36, T-08.1-23): the viewer's own device publishes one rounded "left so far" total for the people who
// have switched on "count my money". Only with an enabled opt-in of the viewer's own; rounded DOWN to a multiple of 1000
// minor units; when the app comes to the front, at most once an hour. Never an item, never a line.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useHouseholdId } from '@/data/queries/household';
import { useDecideV3 } from '@/data/queries/decideV3';
import { buildInputs } from '@/features/decide/snapshot/v3/buildInputs';
import { useHouseholdScopeSource } from './useHouseholdScopeSource';
import { useOwnNetShares, usePartnerOptins } from '@/data/queries/partnerMoney';
import { publishPartnerFigure, publishSafetyNetSaved } from '@/db/partnerOptins';
import { applyJointMoney, prepare, type Prepared } from '@/engine/decide/v3';
import { monthPicture } from '@/engine/month';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/services/supabase';

/** The server refuses anything that is not a multiple of this (partner_figures check). */
export const FIGURE_STEP = 1000;
/** At most one publish in this window. */
export const PUBLISH_EVERY_MS = 60 * 60 * 1000;

/** Rounded DOWN, so the partner never sees more than there is. A negative figure rounds away from zero. */
export function roundDownToStep(minor: number): number {
  const r = Math.floor(minor / FIGURE_STEP) * FIGURE_STEP;
  return r === 0 ? 0 : r; // never -0
}

/** True when a publish may go: an opt-in is on and the last one was an hour or more ago (or never). */
export function mayPublish(hasOptIn: boolean, nowMs: number, lastMs: number | null): boolean {
  if (!hasOptIn) return false;
  return lastMs === null || nowMs - lastMs >= PUBLISH_EVERY_MS;
}

/**
 * 08.1-22 (CMP-F19, owner 2026-11-20): the published figure is personal money only. When joint money was laid into the viewer's inputs
 * (jointBack on the household facts), the figure is worked from the same inputs with it taken back out, so a joint account is never
 * counted again in a partner's Household pool.
 */
export function personalPrepared(prepared: Prepared): Prepared {
  const back = prepared.inputs.household?.jointBack;
  return back === undefined ? prepared : prepare(applyJointMoney(prepared.inputs, back));
}

export function usePublishPartnerFigure(): void {
  const { user } = useAuth();
  const userId = user?.id;
  const householdId = useHouseholdId(userId).data ?? null;
  const optins = usePartnerOptins(userId, householdId).data;
  const { prepared: shared, source, v3 } = useDecideV3();
  // 08.1-22: with a joint account the figure is worked from inputs that carry the joint slice, then with it taken back out (personal only).
  const household = useHouseholdScopeSource(false);
  const prepared = useMemo<Prepared | null>(() => {
    if (shared === null || household.pending) return null;
    if (household.source === undefined || source === null || source === undefined) return shared;
    return prepare(buildInputs({ ...source, household: household.source }, v3 ?? null));
  }, [shared, household.pending, household.source, source, v3]);
  // 08.1-10: the shared safety net's "saved" rides the same hourly publish, so nothing else needs a call site.
  const shares = useOwnNetShares(userId, householdId).data;
  const netGoals = useMemo(() => (shares ?? []).filter((s) => s.enabled).map((s) => s.goal_id), [shares]);
  const netSaved = prepared?.inputs.safetyNet?.saved ?? null;
  const hasOptIn = useMemo(() => (optins ?? []).some((o) => o.owner_id === userId && o.enabled), [optins, userId]);
  const figure = useMemo(
    () => (prepared === null ? null : { left: roundDownToStep(Number(monthPicture(personalPrepared(prepared)).leftAfterPlans)), currency: prepared.inputs.currency as string }),
    [prepared],
  );
  const last = useRef<number | null>(null);
  const inFlight = useRef(false);
  const latest = useRef({ hasOptIn, figure, netGoals, netSaved });

  const tryPublish = useCallback(() => {
    const { hasOptIn: on, figure: f, netGoals: goals, netSaved: saved } = latest.current;
    const now = Date.now();
    if (f === null || inFlight.current || !mayPublish(on || goals.length > 0, now, last.current)) return;
    inFlight.current = true;
    const calls = [
      ...(on ? [publishPartnerFigure(supabase, f.left, f.currency)] : []),
      ...(saved === null ? [] : goals.map((g) => publishSafetyNetSaved(supabase, g, Math.max(0, roundDownToStep(Number(saved)))))),
    ];
    Promise.all(calls)
      .then((results) => {
        if (results.some((res) => res.ok)) last.current = now;
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight.current = false;
      });
  }, []);

  // Off is immediate on the server (it deletes the figure), so switching on again must be allowed to publish at once.
  useEffect(() => {
    if (!hasOptIn) last.current = null;
  }, [hasOptIn]);

  useEffect(() => {
    latest.current = { hasOptIn, figure, netGoals, netSaved };
    tryPublish();
  }, [hasOptIn, figure, netGoals, netSaved, tryPublish]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tryPublish();
    });
    return () => sub.remove();
  }, [tryPublish]);
}
