// 05.3-13 (DSV-13): the writes the v3 record sheets may call. features may not reach the write path (depcruise
// fx-fetch-never-from-reads), so this context is supplied by src/shell/decide/V3RecordProvider.tsx. Types only.
import { createContext, useContext } from 'react';
import type { Evaluation } from '@/engine/decide/v3';
import type { DecideCheckRow, StoredSeenV3 } from '@/db/decideChecks';

/** Where and under what names Record as bought writes (defined here so features never import the write path). */
export interface BoughtContext {
  householdId: string;
  /** The currency of the check (the cash account's). */
  currency: string;
  timeZone: string;
  /** 'YYYY-MM-DD'. */
  today: string;
  cashAccountId: string | null;
  debtCategoryId: string | null;
  runningCostCategoryId: string | null;
  name: string;
  /** The loan's rate as percent text (e.g. '7.5'), or null/'' when there is none. */
  aprText?: string | null;
}

export interface RecordArgs {
  check: DecideCheckRow;
  evaluation: Evaluation;
  seen: StoredSeenV3;
  ctx: BoughtContext;
}

export interface RecordMutations {
  /** True when the bought write can be built for these arguments (a dry run). */
  canRecordBought(args: RecordArgs): boolean;
  /** Saves answer_v3, then writes the purchase. Null when nothing was sent (refused, or one is already queued). */
  recordBought(args: RecordArgs): { stepId: string } | null;
  /** Saves answer_v3, then Wait and save. */
  planIt(args: RecordArgs & { goalTarget: number | null; reminderOn: boolean }): Promise<{ reminder: 'set' | 'off' | 'none' }>;
  /** Saves answer_v3, then Pass. */
  notBuying(args: RecordArgs): void;
}

const INERT: RecordMutations = {
  canRecordBought: () => false,
  recordBought: () => null,
  planIt: () => Promise.resolve({ reminder: 'none' }),
  notBuying: () => undefined,
};

export const RecordMutationsContext = createContext<RecordMutations>(INERT);

export function useRecordMutations(): RecordMutations {
  return useContext(RecordMutationsContext);
}
