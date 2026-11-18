// 08.1-07: reads and writes for the partner opt-in, the shared safety net and the shared-bills caveat.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    queryFn: () => fetchOptins(supabase),
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

/** The partner's one rounded total, only when both sides are on. */
export function usePartnerMoneyTotal(userId: string | undefined, partnerId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.partnerMoney(userId ?? '', partnerId ?? ''),
    queryFn: () => partnerMoneyTotal(supabase, partnerId as string),
    enabled: enabled && Boolean(userId) && Boolean(partnerId),
  });
}

/** The viewer's own safety-net shares (which goal is shared). */
export function useOwnNetShares(userId?: string, householdId?: string | null) {
  return useQuery({
    queryKey: queryKeys.safetyNetShares(userId ?? '', householdId ?? ''),
    queryFn: () => fetchOwnNetShares(supabase),
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
