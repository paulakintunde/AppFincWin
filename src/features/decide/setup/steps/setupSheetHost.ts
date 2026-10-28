/**
 * Plan 05.2-24: the one place the Regular payments and Loans steps ask for an editor sheet.
 *
 * The app has no stand-alone series or debt editor to mount from a step (series are edited in the entry sheet,
 * debts inside the check flow). Rather than build two new sheets inside a step plan, the steps call this registry;
 * the screen that hosts the setup registers the sheets it has. With nothing registered a call does nothing.
 */
import type { RecurringCandidate } from '@/engine/decide/v3';
import type { DebtRow } from '@/db/debts';
import type { RecurringSeriesRow } from '@/db/rows';

export type RegularPreset = 'rent' | 'utilities' | 'phone' | 'insurance' | 'childcare' | 'subscriptions' | 'transport' | 'other';
export type DebtKindChoice = 'card' | 'car' | 'student' | 'personal' | 'mortgage' | 'bnpl' | 'other';

export interface SetupSheetActions {
  /** Edit a confirmed series, or a found payment that is not yet a series. */
  editRegular(target: { series: RecurringSeriesRow } | { candidate: RecurringCandidate }): void;
  /** Open the series sheet for a new regular payment with the kind prefilled. */
  addRegular(preset: RegularPreset): void;
  editDebt(debt: DebtRow): void;
  addDebt(kind: DebtKindChoice): void;
}

const NONE: SetupSheetActions = {
  editRegular: () => undefined,
  addRegular: () => undefined,
  editDebt: () => undefined,
  addDebt: () => undefined,
};

let current: SetupSheetActions = NONE;

/** Registers the host's sheets; returns the function that removes them. */
export function registerSetupSheetActions(actions: Partial<SetupSheetActions>): () => void {
  const previous = current;
  current = { ...NONE, ...actions };
  return () => {
    if (current !== previous) current = previous;
  };
}

export function setupSheetActions(): SetupSheetActions {
  return current;
}
