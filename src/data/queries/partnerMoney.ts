// 08.1-07: reads and writes for the partner opt-in, the shared safety net and the shared-bills caveat.
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchOptins,
  fetchOwnNetShares,
  partnerLastSharedLine,
  partnerMoneyTotal,
  setPartnerOptin,
  setSharedSafetyNet,
  sharedSafetyNet,
} from '@/db/partnerOptins';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

/** Every opt-in the viewer owns or is named in. */
export function usePartnerOptins(userId?: string, householdId?: string | null) {
  return useQuery({
    queryKey: queryKeys.partnerOptins(userId ?? '', householdId ?? ''),
    queryFn: () => fetchOptins(supabase, householdId as string),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}

export function useSetPartnerOptin(userId?: string, householdId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { partnerId: string; enabled: boolean }) => {
      const res = await setPartnerOptin(supabase, a.partnerId, a.enabled);
      if (!res.ok) throw new Error(res.reason);
      return res;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.partnerOptins(userId ?? '', householdId ?? '') });
      void qc.invalidateQueries({ queryKey: queryKeys.partnerMoneyRoot(userId ?? '') });
    },
  });
}

/**
 * 08.1 review C-WR-02: how long a partner's figure counts after the server last gave it. Switching sharing off is immediate on the
 * server, but nothing tells the viewer's phone, so a figure older than this is read as not shared (fail closed) until a fresh read
 * confirms it. The figure is also never written to the on-disk cache (persister.ts isNeverPersisted).
 */
export const PARTNER_MONEY_FRESH_MS = 5 * 60 * 1000;

/**
 * C-WR-02: the read options every partner-figure query uses. Always stale, so it refetches on every mount and when the app comes
 * back to the front (onlineManager.ts resumeAndRefetch); dropped from memory soon after nothing reads it.
 */
const PARTNER_MONEY_READ = { staleTime: 0, gcTime: PARTNER_MONEY_FRESH_MS, refetchOnMount: 'always', refetchOnWindowFocus: 'always' } as const;

/** The parts of a partner-figure read that say whether its figure can still be counted. */
export interface PartnerMoneyRead<T> {
  readonly data: T | undefined;
  readonly status: string;
  readonly dataUpdatedAt: number;
}

/**
 * C-WR-02 (fail closed): the figure only when the last read succeeded and the server gave it no more than PARTNER_MONEY_FRESH_MS
 * before `now`; otherwise undefined, which the Household check reads as "not shared". A failed refetch keeps the old data in the
 * cache, so an error never counts either.
 */
export function freshPartnerTotal<T>(q: PartnerMoneyRead<T>, now: number): T | undefined {
  if (q.status !== 'success' || q.data === undefined) return undefined;
  if (!(q.dataUpdatedAt > 0) || now - q.dataUpdatedAt > PARTNER_MONEY_FRESH_MS) return undefined;
  return q.data;
}

/** The partner's one rounded total, only when both sides are on. */
export function usePartnerMoneyTotal(userId: string | undefined, partnerId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.partnerMoney(userId ?? '', partnerId ?? ''),
    queryFn: () => partnerMoneyTotal(supabase, partnerId as string),
    enabled: enabled && Boolean(userId) && Boolean(partnerId),
    ...PARTNER_MONEY_READ,
  });
}

/** 08.1-10: the same one-figure read for every other member at once (a Household check pools them). Same keys as usePartnerMoneyTotal. */
export function usePartnerMoneyTotals(userId: string | undefined, partnerIds: readonly string[], enabled = true) {
  return useQueries({
    queries: partnerIds.map((partnerId) => ({
      queryKey: queryKeys.partnerMoney(userId ?? '', partnerId),
      queryFn: () => partnerMoneyTotal(supabase, partnerId),
      enabled: enabled && Boolean(userId),
      ...PARTNER_MONEY_READ,
    })),
  });
}

/** The viewer's own safety-net shares (which goal is shared). */
export function useOwnNetShares(userId?: string, householdId?: string | null) {
  return useQuery({
    queryKey: queryKeys.safetyNetShares(userId ?? '', householdId ?? ''),
    queryFn: () => fetchOwnNetShares(supabase, householdId as string),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}

export function useSetSharedSafetyNet(userId?: string, householdId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { goalId: string; enabled: boolean }) => {
      const res = await setSharedSafetyNet(supabase, a.goalId, a.enabled);
      if (!res.ok) throw new Error(res.reason);
      return res;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.safetyNetShares(userId ?? '', householdId ?? '') });
      void qc.invalidateQueries({ queryKey: queryKeys.sharedSafetyNet(userId ?? '') });
    },
  });
}

/** A net another member shared with the viewer: size and saved only. */
export function useSharedSafetyNet(userId?: string) {
  return useQuery({
    queryKey: queryKeys.sharedSafetyNet(userId ?? ''),
    queryFn: () => sharedSafetyNet(supabase),
    enabled: Boolean(userId),
  });
}

/** Dates only: the latest day each other member logged a shared line. */
export function usePartnerLastSharedLine(userId?: string, householdId?: string | null) {
  return useQuery({
    queryKey: queryKeys.partnerLastShared(userId ?? '', householdId ?? ''),
    queryFn: () => partnerLastSharedLine(supabase),
    enabled: Boolean(userId) && Boolean(householdId),
  });
}
