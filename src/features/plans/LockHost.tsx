/**
 * 09-16: the app-wide host for the lock. It renders nothing and does two jobs.
 *
 * 1. The first time the app sees a lock for a (household, coveredUntil) pair it opens the explainer once (D-03, D-18).
 * 2. It replays the writes the server refused while the plan was lapsed (D-40, UI-SPEC 9d). A replay starts when the lock
 *    lifts while the app is open (writable false to true), once per session when the first plan load already says
 *    writable and the store is not empty (the cold-start case), and on each return to the foreground. Replays never
 *    overlap (an in-flight ref), run serially in WRITE_SCOPE and stop at the first PT402 (T-09-59). A replay that is
 *    refused again does not loop: the next one waits for the next transition, foreground or session.
 *
 * The lock lifts only when the server's plan record says writable (UI-SPEC 9e); nothing here unlocks optimistically.
 */
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { getLockedWrites, hydrateLockedWrites, replayLockedWrites, useLockedWrites } from '@/data/sync/lockedWrites';
import { showToast } from '@/state/undoToast';
import { PLAN_ENDED_HREF } from './routes';
import { usePlanState } from './usePlanState';

const SEEN_PREFIX = 'fincwin:plan-ended-shown:';

export function LockHost() {
  const qc = useQueryClient();
  const plan = usePlanState();
  const writes = useLockedWrites();

  // The latest plan, read by the foreground listener and the replay helper without re-subscribing.
  const planRef = useRef(plan);
  useEffect(() => {
    planRef.current = plan;
  });
  const inFlight = useRef<Promise<void> | null>(null);
  const didSessionReplay = useRef(false);
  const prevWritable = useRef<boolean | null>(null);

  const runReplay = useCallback(
    (_reason: 'unlock' | 'session' | 'foreground'): void => {
      const p = planRef.current;
      if (inFlight.current !== null) return;
      if (!p.writable || p.loading) return;
      if (getLockedWrites().length === 0) return;
      didSessionReplay.current = true;
      const run = (async () => {
        try {
          await hydrateLockedWrites();
          const { synced } = await replayLockedWrites(qc);
          if (synced > 0) showToast({ kind: 'info', text: { key: 'lock.savedOffline.synced' } });
        } catch {
          // A failed replay keeps every entry; the next trigger tries again.
        } finally {
          inFlight.current = null;
        }
      })();
      inFlight.current = run;
    },
    [qc],
  );

  // (a) the lock lifts while the app is open: a loaded not-writable state turns writable.
  useEffect(() => {
    if (plan.loading) return;
    const was = prevWritable.current;
    prevWritable.current = plan.writable;
    if (was === false && plan.writable) runReplay('unlock');
  }, [plan.loading, plan.writable, runReplay]);

  // (b) cold start: already writable on the first load, kept writes on the phone, no transition ever seen.
  useEffect(() => {
    if (didSessionReplay.current) return;
    if (plan.loading || !plan.writable || writes.length === 0) return;
    runReplay('session');
  }, [plan.loading, plan.writable, writes.length, runReplay]);

  // (c) a return to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') runReplay('foreground');
    });
    return () => sub.remove();
  }, [runReplay]);

  // The explainer opens once per (household, coveredUntil) the first time a lock is seen.
  const locked = !plan.loading && plan.status === 'locked';
  const pair = `${plan.householdId ?? ''}:${plan.coveredUntil ?? ''}`;
  const shownFor = useRef<string | null>(null);
  useEffect(() => {
    if (!locked || shownFor.current === pair) return;
    shownFor.current = pair;
    let cancelled = false;
    void (async () => {
      try {
        const key = `${SEEN_PREFIX}${pair}`;
        if ((await AsyncStorage.getItem(key)) !== null) return;
        await AsyncStorage.setItem(key, '1');
        if (!cancelled) router.push(PLAN_ENDED_HREF);
      } catch {
        // Storage trouble must not trap the person on the explainer; the banner still links to it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locked, pair]);

  return null;
}
