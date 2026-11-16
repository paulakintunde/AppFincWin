// D-06 / 08: the household a user belongs to is long-lived but not immutable. Joining an invite, leaving
// or being removed changes it, so useHouseholdId keeps staleTime Infinity and a membership change calls
// resetHouseholdScope to drop the cached id and everything scoped to the old household (PATTERNS trap 4).
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { fetchCurrentHouseholdId, fetchHousehold } from '@/db/household';
import { fetchHouseholdEvents, fetchEventReadMarker } from '@/db/householdEvents';
import { fetchOpenInvites } from '@/db/householdInvites';
import { fetchFormerMembers } from '@/db/householdFormerMembers';
import { fetchHouseholdMembers } from '@/db/householdMembers';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';

export function useHouseholdId(userId?: string) {
  return useQuery({
    queryKey: queryKeys.household(userId ?? ''),
    queryFn: () => fetchCurrentHouseholdId(supabase, userId as string),
    enabled: Boolean(userId),
    staleTime: Infinity,
  });
}

export function useHousehold(householdId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.householdDetail(householdId ?? ''),
    queryFn: () => fetchHousehold(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}

/** Members in join order, with weights, colours and name settings. */
export function useHouseholdMembers(householdId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.householdMemberRows(householdId ?? ''),
    queryFn: () => fetchHouseholdMembers(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}

/** 08-15: people who left, were removed or deleted their account (the labels read this for "Sam (left)" and "Former member"). */
export function useFormerMembers(householdId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.householdFormerMembers(householdId ?? ''),
    queryFn: () => fetchFormerMembers(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
}

/** Notices newest first, plus how many are newer than the caller's read marker and not their own. */
export function useHouseholdEvents(householdId: string | null | undefined, userId?: string) {
  const events = useQuery({
    queryKey: queryKeys.householdEvents(householdId ?? ''),
    queryFn: () => fetchHouseholdEvents(supabase, householdId as string),
    enabled: Boolean(householdId),
  });
  const marker = useQuery({
    queryKey: queryKeys.householdEventReads(userId ?? ''),
    queryFn: () => fetchEventReadMarker(supabase, userId as string),
    enabled: Boolean(userId),
  });
  const readAt = marker.data ?? null;
  const unreadCount = (events.data ?? []).filter(
    (e) => e.actor_id !== userId && (readAt === null || e.created_at > readAt),
  ).length;
  return { events: events.data ?? [], unreadCount, isLoading: events.isLoading || marker.isLoading };
}

/** The owner's open invite codes; other members never fetch them. */
export function useOpenInvites(householdId: string | null | undefined, isOwner: boolean) {
  return useQuery({
    queryKey: queryKeys.householdInvites(householdId ?? ''),
    queryFn: () => fetchOpenInvites(supabase),
    enabled: Boolean(householdId) && isOwner,
  });
}

/**
 * Call after joining, leaving or removal. The cached id is invalidated so the next read finds the new household,
 * and every cache entry keyed by the old household id is removed so no screen keeps showing it.
 */
export function resetHouseholdScope(qc: QueryClient, userId: string, oldHouseholdId: string | null): void {
  if (oldHouseholdId) {
    qc.removeQueries({ predicate: (q) => q.queryKey.includes(oldHouseholdId) });
  }
  void qc.invalidateQueries({ queryKey: queryKeys.household(userId) });
  void qc.invalidateQueries({ queryKey: queryKeys.householdEventReads(userId) });
}
