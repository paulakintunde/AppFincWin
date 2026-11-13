// 06.1-17 (D-10, D-11, D-23): gathers the setup facts from the Decide inputs, the settings flags and the debt names, then hands them
// to the pure setupProgress rules. Read only: nothing here writes.
import { useMemo } from 'react';
import { useDebts, useDecideSettings } from '@/data/queries/decide';
import { useDecideV3 } from '@/data/queries/decideV3';
import type { ReadinessItem, V3Account, V3Inputs, V3Series } from '@/engine/decide/v3';
import { useRecordContext } from '@/features/record/useRecordContext';
import { setupProgress, type SetupFacts, type SetupProgress } from '../logic/setupProgress';

export interface SetupProgressState extends SetupProgress {
  loading: boolean;
  /** The currency the minor-unit figures in the status lines are in. */
  currency: string;
  /** The date the progress was judged on. */
  today: string;
}

const EMPTY: SetupProgress = { items: [], doneCount: 0, next: null, allDone: false };
const NO_DAY = '';
const NO_ITEMS: readonly ReadinessItem[] = [];

function previousMonth(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** A monthly figure for a series: weekly amounts are spread over a 52-week year. */
function monthlyMinor(s: V3Series): number {
  const every = Math.max(1, s.cadence.every);
  return s.cadence.unit === 'month' ? Math.round(Number(s.amount) / every) : Math.round((Number(s.amount) * 52) / 12 / every);
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
  const bills = inputs.series.filter((s) => s.role === 'bill' && s.status === 'live');
  const last = inputs.months.find((m) => m.month === prev);
  const dates = (inputs.months.find((m) => m.month === thisMonth)?.lines ?? []).map((l) => l.date).sort();
  const sized = inputs.safetyNet?.size ?? null;
  return {
    hasPay: pay !== undefined && inputs.profile !== null,
    payAmountMinor: pay ? Number(pay.amount) : null,
    payDay: pay ? Number(pay.anchorDate.slice(8, 10)) : null,
    billsRightAnswered: flags.billsRight,
    billsCount: bills.length,
    billsMonthlyMinor: bills.reduce((sum, s) => sum + monthlyMinor(s), 0),
    debts: inputs.debts.map((d) => ({ name: debtNames.get(d.id) ?? '', dueDay: d.dueDay ?? null })),
    noDebtsAnswered: flags.noDebts,
    netSizeMinor: sized !== null && Number(sized) > 0 ? Number(sized) : null,
    netNotSetAnswered: flags.netNotSet,
    rulesOn: inputs.limits.lines.filter((l) => l.on).length,
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
  facts: SetupFacts | null;
  currency: string;
  today: string;
}

/** 06.1-25: the facts the six rules read, for item screens that show one rule's parts (Records shows its three checks). */
export function useSetupFacts(): SetupFactsState {
  const rc = useRecordContext();
  const v3 = useDecideV3();
  const settings = useDecideSettings(rc.userId ?? undefined).data ?? null;
  const debts = useDebts(rc.householdId ?? undefined).data;
  const inputs = v3.inputs;
  const evaluation = v3.evaluation;
  return useMemo(() => {
    if (inputs === null || settings === null) return { loading: true, facts: null, currency: inputs?.currency ?? 'USD', today: inputs?.asOf ?? NO_DAY };
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
    return { loading: false, facts, currency: inputs.currency, today: inputs.asOf };
  }, [inputs, evaluation, settings, debts]);
}

export function useSetupProgress(): SetupProgressState {
  const { loading, facts, currency, today } = useSetupFacts();
  return useMemo(() => {
    if (facts === null) return { ...EMPTY, loading, currency, today };
    return { ...setupProgress(facts, today), loading, currency, today };
  }, [loading, facts, currency, today]);
}
