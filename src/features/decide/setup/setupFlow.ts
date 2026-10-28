/**
 * Pure setup-flow model (plan 05.2-21). No React, no I/O.
 *
 * Source: UI-SPEC "Flow, sections and branching" and "Rough marking".
 * D-03: six needed steps, account use first in "Your money now".
 * D-15: the season screen is asked of everyone (optional).
 * D-16: season comes before the counting method; method is only for
 *       changing income.
 *
 * Answered / rough / not started / done are derived from stored data and
 * never stored themselves.
 */

export const SETUP_STEP_KEYS = [
  'welcome',
  'paid',
  'pay',
  'season',
  'method',
  'other',
  'regular',
  'loans',
  'saving',
  'everyday',
  'unusual',
  'accountUse',
  'emergency',
  'envelopes',
  'unspent',
  'share',
  'detail',
  'reminders',
  'summary',
] as const;

export type SetupStepKey = (typeof SETUP_STEP_KEYS)[number];
export type SetupSection = 'income' | 'regular' | 'spending' | 'money' | 'answers';

export interface SetupFacts {
  /** decide_settings.income_types (the six setup values). */
  readonly incomeTypes: readonly string[] | null;
  /** A live income series of kind salary exists. */
  readonly hasRegularPaySeries: boolean;
  readonly method: 'match' | 'spread' | 'steady' | 'balance' | null;
  readonly spreadMonths: number | null;
  readonly steadyAmount: number | null;
  readonly holdMonths: number | null;
  readonly fullMonthsOfRecords: number;
  /** Accounts that hold money (not credit, not loan). */
  readonly moneyAccountIds: readonly string[];
  /** Accounts with a stored use (non-null). */
  readonly accountIdsWithUse: readonly string[];
  readonly everydayOverride: number | null;
  readonly unspentAnchorSet: boolean;
  /** Any rough_* figure typed with fewer than 3 months of records. */
  readonly roughTyped: boolean;
  readonly setupDoneAt: string | null;
}

const STANDALONE: readonly SetupStepKey[] = ['paid', 'pay', 'season', 'method', 'other'];

export function sectionOf(step: SetupStepKey): SetupSection | null {
  switch (step) {
    case 'paid':
    case 'pay':
    case 'season':
    case 'method':
    case 'other':
      return 'income';
    case 'regular':
    case 'loans':
    case 'saving':
      return 'regular';
    case 'everyday':
    case 'unusual':
      return 'spending';
    case 'accountUse':
    case 'emergency':
    case 'envelopes':
    case 'unspent':
      return 'money';
    case 'share':
    case 'detail':
    case 'reminders':
      return 'answers';
    default:
      return null;
  }
}

function hasAny(types: readonly string[] | null, wanted: readonly string[]): boolean {
  return types !== null && wanted.some((w) => types.includes(w));
}

export function isNeeded(step: SetupStepKey, facts: SetupFacts): boolean {
  switch (step) {
    case 'paid':
    case 'regular':
    case 'everyday':
    case 'unspent':
      return true;
    case 'pay':
      return hasAny(facts.incomeTypes, ['salary_or_wages', 'pension_or_benefits']);
    case 'method':
      return hasAny(facts.incomeTypes, ['commission_or_tips', 'freelance', 'own_business', 'none']);
    case 'accountUse':
      return facts.moneyAccountIds.length > 0;
    default:
      return false;
  }
}

/** Whether a step is on the path at all (needed or optional). */
function isVisible(step: SetupStepKey, facts: SetupFacts): boolean {
  if (step === 'pay' || step === 'method' || step === 'accountUse') return isNeeded(step, facts);
  if (step === 'unusual') return facts.fullMonthsOfRecords >= 2;
  return true;
}

export function visibleSteps(facts: SetupFacts, mode: 'full' | 'standalone'): SetupStepKey[] {
  return SETUP_STEP_KEYS.filter(
    (k) => (mode === 'full' || STANDALONE.includes(k)) && isVisible(k, facts),
  );
}

function methodAnswered(facts: SetupFacts): boolean {
  switch (facts.method) {
    case 'match':
      return true;
    case 'spread':
      return facts.spreadMonths !== null;
    case 'steady':
      return facts.steadyAmount !== null;
    case 'balance':
      return facts.holdMonths !== null;
    default:
      return false;
  }
}

export function isAnswered(step: SetupStepKey, facts: SetupFacts): boolean {
  switch (step) {
    case 'paid':
      return facts.incomeTypes !== null && facts.incomeTypes.length > 0;
    case 'pay':
      return facts.hasRegularPaySeries;
    case 'method':
      return methodAnswered(facts);
    case 'everyday':
      return facts.everydayOverride !== null || facts.fullMonthsOfRecords >= 3;
    case 'accountUse':
      return facts.moneyAccountIds.every((id) => facts.accountIdsWithUse.includes(id));
    case 'unspent':
      return facts.unspentAnchorSet;
    default:
      // regular always works on Next; optional steps have nothing to miss.
      return true;
  }
}

export function remainingNeeded(facts: SetupFacts): SetupStepKey[] {
  return visibleSteps(facts, 'full').filter((k) => isNeeded(k, facts) && !isAnswered(k, facts));
}

export function firstUnansweredNeeded(facts: SetupFacts): SetupStepKey | null {
  return remainingNeeded(facts)[0] ?? null;
}

export function setupStatus(facts: SetupFacts): 'not_started' | 'rough' | 'done' {
  if (facts.setupDoneAt === null && facts.incomeTypes === null) return 'not_started';
  const overrideRough = facts.everydayOverride !== null && facts.fullMonthsOfRecords < 3;
  if (remainingNeeded(facts).length > 0 || overrideRough || facts.roughTyped) return 'rough';
  return 'done';
}
