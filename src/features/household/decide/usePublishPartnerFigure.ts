// 08.1-07 (CMP-F19, D-36, T-08.1-23): the viewer's own device publishes one rounded "left so far" total for the people who
// have switched on "count my money". Only with an enabled opt-in of the viewer's own; rounded DOWN to a multiple of 1000
// minor units; when the app comes to the front, at most once an hour. Never an item, never a line.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useHouseholdId } from '@/data/queries/household';
import { useDecideV3 } from '@/data/queries/decideV3';
import { usePartnerOptins } from '@/data/queries/partnerMoney';
import { publishPartnerFigure } from '@/db/partnerOptins';
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

export function usePublishPartnerFigure(): void {
  const { user } = useAuth();
  const userId = user?.id;
  const householdId = useHouseholdId(userId).data ?? null;
  const optins = usePartnerOptins(userId, householdId).data;
  const { prepared } = useDecideV3();
  const hasOptIn = useMemo(() => (optins ?? []).some((o) => o.owner_id === userId && o.enabled), [optins, userId]);
  const figure = useMemo(
    () => (prepared === null ? null : { left: roundDownToStep(Number(monthPicture(prepared).leftAfterPlans)), currency: prepared.inputs.currency as string }),
    [prepared],
  );
  const last = useRef<number | null>(null);
  const inFlight = useRef(false);
  const latest = useRef({ hasOptIn, figure });
  latest.current = { hasOptIn, figure };

  const tryPublish = useCallback(() => {
    const { hasOptIn: on, figure: f } = latest.current;
    const now = Date.now();
    if (f === null || inFlight.current || !mayPublish(on, now, last.current)) return;
    inFlight.current = true;
    publishPartnerFigure(supabase, f.left, f.currency)
      .then((res) => {
        if (res.ok) last.current = now;
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
    tryPublish();
  }, [hasOptIn, figure, tryPublish]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tryPublish();
    });
    return () => sub.remove();
  }, [tryPublish]);
}
