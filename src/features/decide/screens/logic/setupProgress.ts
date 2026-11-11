// 06.1-17 (D-10, D-11, D-23): the six Decide setup items and when each is done. Pure: facts in, progress out. The hook that
// gathers the facts from the records is outside this folder (setup/useSetupProgress.ts). Money is minor units; the screens format it.

export type SetupItemId = 'pay' | 'bills' | 'debts' | 'net' | 'rules' | 'records';

export const SETUP_ORDER: readonly SetupItemId[] = ['pay', 'bills', 'debts', 'net', 'rules', 'records'];

/** Days a latest entry may be old and still count as "this month has been logged lately" (D-11, inclusive). */
export const RECORDS_FRESH_DAYS = 10;

export interface SetupDebtFact {
  name: string;
  dueDay: number | null;
}

export interface SetupFacts {
  /** A confirmed pay series and an income profile are both present. */
  hasPay: boolean;
  payAmountMinor: number | null;
  payDay: number | null;
  /** The "These bills are right" flag (D-23). */
  billsRightAnswered: boolean;
  billsCount: number;
  billsMonthlyMinor: number;
  debts: readonly SetupDebtFact[];
  /** The "No other debts" flag (D-23). */
  noDebtsAnswered: boolean;
  /** A flagged safety-net goal with a size. */
  netSizeMinor: number | null;
  /** The "Not set yet" flag (D-23). */
  netNotSetAnswered: boolean;
  /** Rules the person saved that are switched on. */
  rulesOn: number;
  /** The "No rules" flag (D-23). */
  noRulesAnswered: boolean;
  /** The previous calendar month is complete (not marked under-logged). */
  lastMonthComplete: boolean;
  /** The newest entry dated in the current month, or null. */
  newestEntryThisMonth: string | null;
  /** Every everyday-capable account says what it is for. */
  accountsAllHaveUse: boolean;
  /** The date the records run up to, for the open line. */
  recordsUpTo: string | null;
}

export interface SetupStatus {
  key: string;
  values: Record<string, string | number>;
}

export interface SetupItem {
  id: SetupItemId;
  done: boolean;
  status: SetupStatus;
}

export interface SetupProgress {
  items: SetupItem[];
  doneCount: number;
  next: SetupItemId | null;
  allDone: boolean;
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** D-11: the newest entry this month is today or at most 10 days old. */
export function loggedLately(newest: string | null, today: string): boolean {
  return newest !== null && dayNumber(today) - dayNumber(newest) <= RECORDS_FRESH_DAYS;
}

function payItem(f: SetupFacts): SetupItem {
  return f.hasPay
    ? { id: 'pay', done: true, status: { key: 'payDone', values: { amountMinor: f.payAmountMinor ?? 0, day: f.payDay ?? 0 } } }
    : { id: 'pay', done: false, status: { key: 'open', values: {} } };
}

function billsItem(f: SetupFacts): SetupItem {
  return f.billsRightAnswered
    ? { id: 'bills', done: true, status: { key: 'billsDone', values: { count: f.billsCount, monthlyMinor: f.billsMonthlyMinor } } }
    : { id: 'bills', done: false, status: { key: 'open', values: {} } };
}

function debtsItem(f: SetupFacts): SetupItem {
  if (f.debts.length === 0) {
    return f.noDebtsAnswered
      ? { id: 'debts', done: true, status: { key: 'debtsNone', values: {} } }
      : { id: 'debts', done: false, status: { key: 'open', values: {} } };
  }
  const missing = f.debts.filter((d) => d.dueDay === null);
  if (missing.length > 0) {
    return { id: 'debts', done: false, status: { key: 'debtsOpen', values: { count: missing.length, debt: missing[0]!.name } } };
  }
  const first = f.debts[0]!;
  return { id: 'debts', done: true, status: { key: 'debtsDone', values: { debt: first.name, day: first.dueDay as number } } };
}

function netItem(f: SetupFacts): SetupItem {
  if (f.netSizeMinor !== null) return { id: 'net', done: true, status: { key: 'netDone', values: { amountMinor: f.netSizeMinor } } };
  return f.netNotSetAnswered
    ? { id: 'net', done: true, status: { key: 'netNotSet', values: {} } }
    : { id: 'net', done: false, status: { key: 'open', values: {} } };
}

function rulesItem(f: SetupFacts): SetupItem {
  if (f.rulesOn > 0) return { id: 'rules', done: true, status: { key: 'rulesDone', values: { count: f.rulesOn } } };
  return f.noRulesAnswered
    ? { id: 'rules', done: true, status: { key: 'rulesNone', values: {} } }
    : { id: 'rules', done: false, status: { key: 'open', values: {} } };
}

function recordsItem(f: SetupFacts, today: string): SetupItem {
  const date = f.recordsUpTo ?? today;
  const done = f.lastMonthComplete && loggedLately(f.newestEntryThisMonth, today) && f.accountsAllHaveUse;
  return done
    ? { id: 'records', done: true, status: { key: 'recordsDone', values: { date } } }
    : { id: 'records', done: false, status: { key: 'recordsOpen', values: { date } } };
}

/** The six items in order, how many are done and which comes next. Month count never holds the banner open (D-11). */
export function setupProgress(facts: SetupFacts, today: string): SetupProgress {
  const items = [payItem(facts), billsItem(facts), debtsItem(facts), netItem(facts), rulesItem(facts), recordsItem(facts, today)];
  const doneCount = items.filter((i) => i.done).length;
  const open = items.find((i) => !i.done);
  return { items, doneCount, next: open ? open.id : null, allDone: doneCount === items.length };
}
