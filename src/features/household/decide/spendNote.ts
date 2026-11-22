// 08.1-23 (CMP-F19, owner 2026-11-21 Q6, Q12): which spending rule a check counts, as the line on Who pays and on a Household answer.
// PURE. The hook that reads it live is useSpendNote.
import type { SpendRuleKind } from '@/engine/household';
import type { SpendView } from '../rules/spendRuleView';

export interface SpendNote {
  /** the rule actually counted (out-of-date set shares count bring) */
  readonly counted: SpendRuleKind;
  readonly outOfDate: boolean;
  /** the viewer's whole percent under a set or bill split; null under bring */
  readonly myPercent: number | null;
  /** the household's live joint accounts, by name */
  readonly jointAccounts: readonly { readonly id: string; readonly name: string }[];
}

export function spendNoteOf(view: SpendView | null, jointAccounts: readonly { readonly id: string; readonly name: string }[]): SpendNote | null {
  if (view === null) return null;
  return { counted: view.counted, outOfDate: view.outOfDate, myPercent: view.myPercent, jointAccounts: jointAccounts.map((a) => ({ id: a.id, name: a.name })) };
}

/** A line as a copy key and its values. */
export type NoteLine = { readonly key: string; readonly values?: Readonly<Record<string, string | number>> };

/** Q12: the Who pays helper. Household names the rule; Just me with a joint account says only the viewer's part counts. */
export function whoPaysLineOf(note: SpendNote | null | undefined, scope: 'me' | 'household'): NoteLine | null {
  if (note === null || note === undefined) return null;
  if (scope === 'me') {
    if (note.jointAccounts.length === 0) return null;
    return note.jointAccounts.length === 1
      ? { key: 'decide.screens.stepper.whoPays.jointMe', values: { account: note.jointAccounts[0]?.name ?? '' } }
      : { key: 'decide.screens.stepper.whoPays.jointMeMany' };
  }
  if (note.counted === 'bring' || note.myPercent === null) return { key: 'decide.screens.stepper.whoPays.helperBring' };
  return { key: 'decide.screens.stepper.whoPays.helperShares', values: { percent: note.myPercent } };
}

/** Q6, Q12: the answer's rule line, and the out-of-date line under it when set shares need updating. */
export function answerLinesOf(note: SpendNote | null | undefined): NoteLine[] {
  if (note === null || note === undefined) return [];
  const rule: NoteLine =
    note.counted === 'bring' || note.myPercent === null
      ? { key: 'decide.screens.answer.household.ruleBring' }
      : note.counted === 'bill'
        ? { key: 'decide.screens.answer.household.ruleBill', values: { percent: note.myPercent } }
        : { key: 'decide.screens.answer.household.ruleShares', values: { percent: note.myPercent } };
  return note.outOfDate ? [rule, { key: 'decide.screens.answer.household.outOfDate' }] : [rule];
}
