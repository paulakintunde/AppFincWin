/**
 * HH-11: one Realtime channel per household. Listens to the shared-capable tables, each filtered to the household; RLS
 * decides which rows a subscriber is allowed to receive. The channel is closed on cleanup, on sign-out and when the account
 * is deleted (the wipe handler), so a stale channel never outlives its household.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { registerWipeHandler } from '@/services/storage/wipe';
import type { RealtimePayload } from './applyEvent';

export const HOUSEHOLD_CHANNEL_TABLES = [
  'transactions',
  'accounts',
  'settlements',
  'settlement_lines',
  'household_events',
  'household_former_members',
  'member_departures',
] as const;

export type ChannelStatus = 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED';

export interface OpenChannel {
  close(): void;
}

const open = new Set<{ channel: RealtimeChannel }>();

/** Opens the channel; `onStatus` fires on every status change, including each re-subscribe. */
export function openHouseholdChannel(
  householdId: string,
  onEvent: (payload: RealtimePayload) => void,
  onStatus: (status: ChannelStatus) => void,
): OpenChannel {
  const channel = supabase.channel('household:' + householdId);
  for (const table of HOUSEHOLD_CHANNEL_TABLES) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: 'household_id=eq.' + householdId },
      (p: { eventType: RealtimePayload['eventType']; new: Record<string, unknown>; old: Record<string, unknown> }) =>
        onEvent({ eventType: p.eventType, table, new: p.new ?? {}, old: p.old ?? {} }),
    );
  }
  const entry = { channel };
  open.add(entry);
  channel.subscribe((status: string) => {
    if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      onStatus(status);
    }
  });
  let closed = false;
  return {
    close() {
      if (closed) return;
      closed = true;
      open.delete(entry);
      void supabase.removeChannel(channel);
    },
  };
}

export function openChannelCount(): number {
  return open.size;
}

/** Closes every channel this module opened (sign-out, account deletion). */
export function closeAllHouseholdChannels(): void {
  for (const entry of Array.from(open)) {
    open.delete(entry);
    void supabase.removeChannel(entry.channel);
  }
}

registerWipeHandler({
  id: 'realtime-channels',
  async wipe() {
    closeAllHouseholdChannels();
  },
});
