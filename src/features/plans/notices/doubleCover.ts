// 09-19 (Owner P4 2026-11-19): two plans cover one home after a takeover. Both payers pick which plan stays; the server
// (09-05) answers null to everyone else and refuses a pick from anyone but the two payers (42501). The app never cancels a
// store subscription: the payer whose plan is not picked is told to do that in their store.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import { useAuth } from '@/features/auth/AuthProvider';
import { supabase } from '@/services/supabase';
import type { PlanKey } from '../types';
import type { DoubleCoverState } from './planNotices';

export type { DoubleCoverState } from './planNotices';

export const DOUBLE_COVER_KEY = (householdId: string | null | undefined) => ['plans', 'doubleCover', householdId ?? 'none'] as const;

interface SideRow {
  payer_id: string;
  plan_key: PlanKey;
  fits: boolean;
}

interface DoubleCoverRow {
  household_id: string;
  since: string;
  choose_by: string;
  chosen_payer: string | null;
  chosen_by: DoubleCoverState['chosenBy'];
  new: SideRow;
  old: SideRow;
}

/** Pure: the server jsonb to the camel-case state; anything malformed is treated as "no choice to make". */
export function toDoubleCoverState(row: unknown): DoubleCoverState | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Partial<DoubleCoverRow>;
  if (!r.household_id || !r.new || !r.old || !r.new.payer_id || !r.old.payer_id) return null;
  return {
    householdId: r.household_id,
    since: r.since ?? '',
    chooseBy: r.choose_by ?? '',
    chosenPayer: r.chosen_payer ?? null,
    chosenBy: r.chosen_by ?? null,
    newSide: { payerId: r.new.payer_id, planKey: r.new.plan_key, fits: r.new.fits === true },
    oldSide: { payerId: r.old.payer_id, planKey: r.old.plan_key, fits: r.old.fits === true },
  };
}

export function useDoubleCover(householdId: string | null | undefined) {
  return useQuery({
    queryKey: DOUBLE_COVER_KEY(householdId),
    queryFn: async (): Promise<DoubleCoverState | null> => {
      const { data, error } = await supabase.rpc('plan_double_cover_state');
      if (error) throw error;
      return toDoubleCoverState(data);
    },
    enabled: Boolean(householdId),
  });
}

export class DoubleCoverRefused extends Error {
  constructor(public readonly reason: string) {
    super('double_cover_refused:' + reason);
  }
}

/**
 * The pick. Online only: no mutationKey default, so a pick made offline fails at once instead of waiting in the queue
 * (networkMode 'always': it is tried now, never paused and replayed later). Refreshes the choice and the plan when it settles.
 */
export function useChooseDoubleCover(householdId: string | null | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id;
  return useMutation({
    networkMode: 'always',
    mutationFn: async (keepPayer: string) => {
      const { data, error } = await supabase.rpc('plan_double_cover_choose', { p_household: householdId, p_keep_payer: keepPayer });
      if (error) throw error;
      const res = data as { ok?: boolean; reason?: string } | null;
      if (!res || res.ok !== true) throw new DoubleCoverRefused(res?.reason ?? 'unknown');
      return res;
    },
    onSettled: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: DOUBLE_COVER_KEY(householdId) }),
        userId ? qc.invalidateQueries({ queryKey: queryKeys.planState(userId) }) : Promise.resolve(),
      ]);
    },
  });
}
