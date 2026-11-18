/**
 * HH-11: the channel lifecycle for the signed-in household. Mounted once in the app layout.
 *
 * Realtime does not replay events missed while a socket was down, so every (re)subscribe, every return to the app and every
 * return online refetches the shared reads (RESEARCH Pattern 6 rule 4; the 08-08 spike found the first event after SUBSCRIBED
 * can arrive late). The effect is keyed on the household and viewer ids so a household change re-subscribes, and its cleanup
 * always removes the channel. The client retries a dropped socket itself with its own backoff; the status line shows
 * "paused" meanwhile.
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/supabase';
import { queryKeys } from '../keys';
import { useHouseholdMembers } from '../queries/household';
import { applyRealtimeEvent } from './applyEvent';
import { openHouseholdChannel } from './channel';
import { setRealtimeStatus } from './realtimeStatus';

/** Refetch everything a missed event could have changed. */
export function refetchSharedReads(qc: QueryClient, householdId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.transactionsRoot(householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.accounts(householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.settlements(householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.householdEvents(householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.householdMembers(householdId) });
  void qc.invalidateQueries({ queryKey: queryKeys.householdDetail(householdId) });
}

export function useHouseholdRealtime(householdId: string | null | undefined, viewerId: string | null | undefined): void {
  const qc = useQueryClient();
  const { data: members } = useHouseholdMembers(householdId);
  // No channel for a household of one: nobody else can change anything.
  const needed = Boolean(householdId) && Boolean(viewerId) && (members?.length ?? 0) >= 2;

  useEffect(() => {
    if (!needed || !householdId || !viewerId) {
      setRealtimeStatus('live');
      return;
    }
    let active = true;
    setRealtimeStatus('connecting');
    const refetch = () => refetchSharedReads(qc, householdId);

    const channel = openHouseholdChannel(
      householdId,
      (payload) => applyRealtimeEvent(qc, payload, { activeHouseholdId: householdId, viewerId }),
      (status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('live');
          refetch(); // first subscribe and every re-subscribe
        } else {
          setRealtimeStatus('paused');
        }
      },
    );

    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') refetch();
    });
    const online = onlineManager.subscribe((isOnline) => {
      if (isOnline) refetch();
    });
    const { data: auth } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session?.access_token) void supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      active = false;
      app.remove();
      online();
      auth.subscription.unsubscribe();
      channel.close();
      setRealtimeStatus('live');
    };
  }, [needed, householdId, viewerId, qc]);
}
