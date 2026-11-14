// 06.1-17 (D-10, D-11, D-23): gathers the setup facts from the Decide inputs, the settings flags and the debt names, then hands them
// to the pure setupProgress rules. Read only: nothing here writes.
import { useMemo, useState } from 'react';
import { useDebts, useDecideSettings } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import type { ReadinessItem, V3Account, V3Inputs } from '@/engine/decide/v3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { rulesOnOf } from '../logic/rulesShown';
import { setupProgress, type SetupFacts, type SetupProgress } from '../logic/setupProgress';
import { decideBillSetOf, decideBillsTotal, type DecideBillSet } from './items/itemLogic';

export interface SetupProgressState extends SetupProgress {
  loading: boolean;
  /** 06.1-54 (C-20): a read failed with nothing cached; the checklist shows the error card, never a count. */
  error: boolean;
  /** Reads again after an error. */
  retry: () => void;
  /** The currency the minor-unit figures in the status lines are in. */
  currency: string;
  /** The date the progress was judged on. */
  today: string;
}

const EMPTY: SetupProgress = { items: [], doneCount: 0, next: null, allDone: false };
const NO_DAY = '';
const NO_ITEMS: readonly ReadinessItem[] = [];
/** No settings row yet: every setup flag is unanswered. */
const NO_SETTINGS = { answered_no_debts_at: null, answered_net_not_set_at: null, answered_no_rules_at: null, answered_bills_right_at: null } as const;

function previousMonth(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Accounts that can carry everyday money: cards and savings are not asked "what is it for" here. */
function everydayCapable(a: V3Account): boolean {
  return a.kind !== 'card' && a.kind !== 'savings';
}

/** Exported for tests: the facts the pure rules read, from the inputs and flags. */
export function setupFactsFrom(
  inputs: V3Inputs,
  flags: { noDebts: boolean; netNotSet: boolean; noRules: boolean; billsRight: boolean },
  debtNames: ReadonlyMap<string, string>,
  underLoggedMonths: ReadonlySet<string>,
  readinessItems: readonly ReadinessItem[] = NO_ITEMS,
): SetupFacts {
  const today = inputs.asOf;
  const thisMonth = today.slice(0, 7);
  const prev = previousMonth(today);
  const pay = inputs.series.find((s) => s.role === 'pay' && s.confirmed && s.status === 'live');
  // 06.1-75 (DS-6): the one bill set the bills page reads too.
  const bills = decideBillSetOf(inputs);
  const last = inputs.months.find((m) => m.month === prev);
  const dates = (inputs.months.find((m) => m.month === thisMonth)?.lines ?? []).map((l) => l.date).sort();
  const sized = inputs.safetyNet?.size ?? null;
  return {
    hasPay: pay !== undefined && inputs.profile !== null,
    payTypesSet: inputs.profile !== null,
    payAmountMinor: pay ? Number(pay.amount) : null,
    payDay: pay ? Number(pay.anchorDate.slice(8, 10)) : null,
    billsRightAnswered: flags.billsRight,
    billsCount: bills.monthly.size,
    billsMonthlyMinor: decideBillsTotal(bills),
    debts: inputs.debts.map((d) => ({ name: debtNames.get(d.id) ?? '', dueDay: d.dueDay ?? null })),
    noDebtsAnswered: flags.noDebts,
    netSizeMinor: sized !== null && Number(sized) > 0 ? Number(sized) : null,
    // A-SU-3: the money in the net (the same figure the safety-net screen shows), else the emergency fund.
    netSavedMinor: inputs.safetyNet != null ? Number(inputs.safetyNet.saved) : inputs.emergency !== null ? Number(inputs.emergency.amount) : null,
    netNotSetAnswered: flags.netNotSet,
    // 06.1-79 (DS-8, OQ-79-1 A): Grow's saving and investing count as rules on, as both rules lists show them.
    rulesOn: rulesOnOf(inputs),
    noRulesAnswered: flags.noRules,
    lastMonthComplete: last !== undefined && last.full && !underLoggedMonths.has(prev),
    newestEntryThisMonth: dates.length > 0 ? (dates[dates.length - 1] as string) : null,
    accountsAllHaveUse: (inputs.accounts ?? []).filter(everydayCapable).every((a) => a.use !== null),
    recordsUpTo: inputs.recordsAsOf ?? null,
    readinessOpen: readinessItems.length,
    readinessFirst: readinessItems[0] ?? null,
  };
}

export interface SetupFactsState {
  loading: boolean;
  /** 06.1-54 (C-20): a read failed with nothing cached. */
  error: boolean;
  retry: () => void;
  facts: SetupFacts | null;
  currency: string;
  today: string;
}

/** 06.1-25: the facts the six rules read, for item screens that show one rule's parts (Records shows its three checks). */
export function useSetupFacts(): SetupFactsState {
  const rc = useRecordContext();
  const v3 = useDecideV3();
  const settingsQuery = useDecideSettings(rc.userId ?? undefined);
  // 06.1-54 (C-20): undefined = not read yet; null = read, and there is no settings row yet (every flag unanswered).
  const settingsRead = settingsQuery.data;
  const debts = useDebts(rc.householdId ?? undefined).data;
  const inputs = v3.inputs;
  const evaluation = v3.evaluation;
  const error = v3.status === 'error' || (settingsRead === undefined && settingsQuery.isError);
  const retry = v3.refetch;
  return useMemo(() => {
    if (inputs === null || settingsRead === undefined) return { loading: !error, error, retry, facts: null, currency: inputs?.currency ?? 'USD', today: inputs?.asOf ?? NO_DAY };
    const settings = settingsRead ?? NO_SETTINGS;
    const names = new Map((debts ?? []).map((d) => [d.id, d.name]));
    const under = new Set((evaluation?.month.notices ?? []).filter((n) => n.code === 'month_looks_under_logged').map((n) => String(n.values.month)));
    const facts = setupFactsFrom(
      inputs,
      {
        noDebts: settings.answered_no_debts_at !== null,
        netNotSet: settings.answered_net_not_set_at !== null,
        noRules: settings.answered_no_rules_at !== null,
        billsRight: settings.answered_bills_right_at !== null,
      },
      names,
      under,
      // 06.1-45 (C-4): the same named items the answer screen shows; Records is done only when none is open.
      evaluation?.result.readiness?.items ?? NO_ITEMS,
    );
    return { loading: false, error: false, retry, facts, currency: inputs.currency, today: inputs.asOf };
  }, [inputs, evaluation, settingsRead, debts, error, retry]);
}

/** Exported for tests (G-72-3): two facts records are the same when every field is (debts and the first readiness item by value). */
export function sameFacts(a: SetupFacts, b: SetupFacts): boolean {
  for (const k of Object.keys(a) as (keyof SetupFacts)[]) {
    if (k === 'debts' || k === 'readinessFirst') continue;
    if (a[k] !== b[k]) return false;
  }
  return JSON.stringify(a.debts) === JSON.stringify(b.debts) && JSON.stringify(a.readinessFirst) === JSON.stringify(b.readinessFirst);
}

export function useSetupProgress(): SetupProgressState {
  const { loading, error, retry, facts: fresh, currency, today } = useSetupFacts();
  // 06.1-75 (G-72-3): a refetch under an open setup item rebuilds the inputs, but the six facts rarely change. Holding the last equal
  // facts keeps the progress object the same, so the checklist behind the item skips its render.
  // React's "store information from previous renders" pattern: a changed value is stored during render.
  const [held, setHeld] = useState<SetupFacts | null>(fresh);
  let facts = held;
  if (held !== fresh && (held === null || fresh === null || !sameFacts(held, fresh))) {
    setHeld(fresh);
    facts = fresh;
  }
  return useMemo(() => {
    if (facts === null) return { ...EMPTY, loading, error, retry, currency, today };
    return { ...setupProgress(facts, today), loading, error, retry, currency, today };
  }, [loading, error, retry, facts, currency, today]);
}

export interface DecideBillsState {
  /** The bills Decide counts; null until the Decide inputs are read. */
  set: DecideBillSet | null;
  /** "These are right" was answered (D-23), so no bill is waiting to be confirmed. */
  billsRight: boolean;
}

/** 06.1-75 (DS-6, DS-15): the bills page reads the same set as the checklist, and whether the bills were confirmed. */
export function useDecideBills(): DecideBillsState {
  const rc = useRecordContext();
  const inputs = useDecideV3().inputs;
  const settings = useDecideSettings(rc.userId ?? undefined).data;
  const billsRight = (settings?.answered_bills_right_at ?? null) !== null;
  return useMemo(() => ({ set: inputs === null ? null : decideBillSetOf(inputs), billsRight }), [inputs, billsRight]);
}
