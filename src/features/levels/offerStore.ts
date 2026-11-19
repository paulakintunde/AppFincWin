// 09-22: the person's offer cadence, kept on the device per user under `fincwin:offers:<userId>` (D-37).
// Local only: it is a nudge preference, not a record, and the sign-out wipe clears the `fincwin:` prefix.
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMPTY_OFFER_STATE, type OfferState } from './offers';

export const offerStoreKey = (userId: string): string => `fincwin:offers:${userId}`;

export function parseOfferState(raw: string | null): OfferState {
  if (!raw) return EMPTY_OFFER_STATE;
  try {
    const v = JSON.parse(raw) as Partial<OfferState> | null;
    if (v === null || typeof v !== 'object') return EMPTY_OFFER_STATE;
    const snoozed: Record<string, string> = {};
    if (v.snoozed && typeof v.snoozed === 'object') {
      for (const [k, t] of Object.entries(v.snoozed)) if (typeof t === 'string') snoozed[k] = t;
    }
    return {
      lastShownAt: typeof v.lastShownAt === 'string' ? v.lastShownAt : null,
      snoozed,
      never: Array.isArray(v.never) ? v.never.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return EMPTY_OFFER_STATE;
  }
}

export async function readOfferState(userId: string): Promise<OfferState> {
  return parseOfferState(await AsyncStorage.getItem(offerStoreKey(userId)));
}

export async function writeOfferState(userId: string, state: OfferState): Promise<void> {
  await AsyncStorage.setItem(offerStoreKey(userId), JSON.stringify(state));
}

/** The loaded state (null until read, so nothing is offered before the cadence is known) and an updater that persists. */
export function useOfferState(userId: string | undefined): {
  state: OfferState | null;
  update: (fn: (s: OfferState) => OfferState) => void;
} {
  const [state, setState] = useState<OfferState | null>(null);
  useEffect(() => {
    let live = true;
    setState(null);
    if (userId === undefined) return undefined;
    void readOfferState(userId).then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [userId]);
  const update = useCallback(
    (fn: (s: OfferState) => OfferState) => {
      if (userId === undefined) return;
      setState((prev) => {
        const next = fn(prev ?? EMPTY_OFFER_STATE);
        void writeOfferState(userId, next);
        return next;
      });
    },
    [userId]
  );
  return { state, update };
}
