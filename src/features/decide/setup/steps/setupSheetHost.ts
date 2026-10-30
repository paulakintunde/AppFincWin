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
  addRegular(preset: RegularPreset, name: string | null): void;
  editDebt(debt: DebtRow): void;
  addDebt(kind: DebtKindChoice): void;
  /** 05.2-28: open the account-use step in edit mode (the Unspent money notes: "Set them"). */
  editAccountUse(): void;
  /**
   * 05.3-34 (refine): change a series' amount from today on, as one undoable edit. Returns the undo step id, or null when
   * no host is registered or the write could not be made. Lives behind the registry because the series write path
   * reaches the FX fetch door, which Decide features must not (depcruise fx-fetch-never-from-reads).
   */
  updateSeriesAmount(input: { series: RecurringSeriesRow; amount: number; labelKey: 'payUpdated' | 'seriesEdited'; ownerId: string; from: string }): string | null;
  /** 05.3-34 (refine): pause a series from `from` (user-led, Undo-able). Same return rule as updateSeriesAmount. */
  pauseSeries(input: { series: RecurringSeriesRow; from: string; ownerId: string }): string | null;
}

const NONE: SetupSheetActions = {
  editRegular: () => undefined,
  addRegular: (_preset, _name) => undefined,
  editDebt: () => undefined,
  addDebt: () => undefined,
  editAccountUse: () => undefined,
  updateSeriesAmount: () => null,
  pauseSeries: () => null,
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
