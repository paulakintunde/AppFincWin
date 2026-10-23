// 05-29 (D-09, D-10, D-11): how the check flow reaches the Go ahead / Wait / Pass writes. features/decide may not import
// them (depcruise fx-fetch-never-from-reads: the write path pulls in the rate fetch door), so the app route provides them:
// app/(app)/decide/check/[id].tsx mounts CommitMutationsProvider (src/shell/decide), tests provide spies. The default
// writes nothing and refuses Go ahead, so a screen mounted without a provider shows the "can't be written" reason
// instead of crashing or pretending to commit.
import { createContext, useContext } from 'react';
import type { BuiltinCategoryKey } from '@/engine/categorize';
import type { Assessment, RunningCostCategory, RunningCosts } from '@/engine/decide';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { CheckInputs } from '../snapshot/types';

export interface GoAheadContext {
  householdId: string;
  currency: string;
  timeZone: string;
  /** 'YYYY-MM-DD': the date a line is written for when "When you need it" is empty. */
  today: string;
  cashAccountId: string;
  cardAccountId: string | null;
  debtCategoryId: string | null;
  savingsCategoryId: string | null;
  transferCategoryId: string | null;
  investAccount: { id: string; currency: string } | null;
  replacedSeries: readonly { id: string; version: number }[];
  /** WR-A11: the user's category id for each running-cost prompt (D-33), from runningCostCategoryIds. */
  runningCostCategoryIds?: Readonly<Partial<Record<RunningCostCategory, string>>>;
}

/** WR-A11: the built-in category a running-cost prompt's series is filed under. Loss of value is non-cash: none. */
export const RUNNING_COST_BUILTIN: Readonly<Partial<Record<RunningCostCategory, BuiltinCategoryKey>>> = {
  insurance: 'Insurance',
  fuel: 'Transport',
  maintenance: 'Transport',
  registration: 'Transport',
  // D-92: there is no Education built-in, so books_materials stays unmapped (its Go ahead line falls back as unmapped prompts do)
  property_tax: 'Tax',
  home_insurance: 'Insurance',
  utilities: 'Utilities',
  service_charge: 'Housing',
  accommodation: 'Housing',
  travel: 'Transport',
};

/** The category id for each running-cost prompt, from the user's built-in category ids (a missing one is left out). */
export function runningCostCategoryIds(
  builtinIds: ReadonlyMap<BuiltinCategoryKey, string>
): Partial<Record<RunningCostCategory, string>> {
  const out: Partial<Record<RunningCostCategory, string>> = {};
  for (const [prompt, key] of Object.entries(RUNNING_COST_BUILTIN) as [RunningCostCategory, BuiltinCategoryKey][]) {
    const id = builtinIds.get(key);
    if (id !== undefined) out[prompt] = id;
  }
  return out;
}

export type GoAheadAssessment = Pick<Assessment, 'state' | 'plan' | 'size' | 'mineDayOne' | 'mineMonthly' | 'mineRunning' | 'newMonthly'>;

export interface GoAheadWriteArgs {
  inputs: CheckInputs;
  assessment: GoAheadAssessment;
  running: RunningCosts | null;
  ctx: GoAheadContext;
}

export interface GoAheadArgs extends GoAheadWriteArgs {
  checkId: string;
  ownerId: string;
  homeCurrency: string;
}

type CheckRef = Pick<DecideCheckRow, 'id' | 'created_by' | 'household_id' | 'name' | 'inputs'>;
export type OutcomeVerdict = 'fits' | 'adjust' | 'no' | 'missing';

export interface CommitMutations {
  /** Writes the Go ahead; returns the undo step id. */
  goAhead(args: GoAheadArgs): string;
  /** True when 05-20's buildGoAheadWrite accepts these arguments (it throws, by design, when a category or account is missing). */
  canWrite(args: GoAheadWriteArgs): boolean;
  waitAndSave(args: {
    check: CheckRef;
    verdict: OutcomeVerdict;
    currency: string;
    monthlyAmount: number;
    readyBy: string | null;
    today: string;
    goalTarget: number | null;
    coolingOff: boolean;
  }): Promise<{ reminder: 'set' | 'off' | 'none' }>;
  pass(args: { check: CheckRef; verdict: OutcomeVerdict; coolingOff: boolean }): void;
}

const INERT: CommitMutations = {
  goAhead: () => '',
  canWrite: () => false,
  waitAndSave: () => Promise.resolve({ reminder: 'none' }),
  pass: () => undefined,
};

export const CommitMutationsContext = createContext<CommitMutations>(INERT);

export function useCommitMutations(): CommitMutations {
  return useContext(CommitMutationsContext);
}
