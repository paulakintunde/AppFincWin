// 05-22 (DCU-07, D-11, D-12): the Past decisions view model. Reads the decided checks, their links and the lines
// those links point at, and turns a decision plus its linked lines into the numbers the list and the detail sheet show.
// Integer minor units throughout; a figure that cannot be converted at stored rates is left out, never guessed.
import { useMemo } from 'react';
import { useReopenCheck } from '@/data/mutations/decideChecks';
import { convertLatest } from '@/data/queries/fxConvert';
import { homeAmountFor } from '@/data/queries/homeAmount';
import { useCustomCurrencies } from '@/data/queries/customCurrencies';
import { useDecideChecks, useDecideLinks, useGoalLines, useLinkedLines, useSavingsGoals } from '@/data/queries/decide';
import { useFxLatest } from '@/data/queries/fxLatest';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideLinkRow } from '@/db/decideLinks';
import type { CustomCurrencyRow, FxLatestRow, TransactionRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { currencyCode } from '@/engine/money';
import { localDateIn } from '@/engine/time';
import { useRecordContext } from '@/features/record/useRecordContext';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { moneyFn, type Money } from '../check/steps/stepUi';
import { compareEstimate, scheduleMatch, type Checkpoint, type EstimateInput, type LinkedLine } from '../journal/estimateActual';
import { checkHref } from '../home/checkHref';
import { cancelCheckReminders } from '../notifications/waitReminder';
import { parseCheckInputs } from '../snapshot/checkInputs';

const PAST_LINES_KEY = 'past-decisions';

/** IN-B01: the calendar date of a timestamptz instant in the app's time zone (rc.timeZone), as 'YYYY-MM-DD'. */
export function localDateOf(timestamp: string, timeZone: string): string {
  return localDateIn(new Date(timestamp), timeZone);
}

export interface PastContext {
  home: string;
  rates: readonly FxLatestRow[];
  customs: readonly CustomCurrencyRow[];
  today: string;
  timeZone: string;
}

/** Linked transaction rows as the pure journal helper's lines: home minor units, null where no stored rate exists. */
export function toLinkedLines(lines: readonly TransactionRow[], home: string, rates: readonly FxLatestRow[]): LinkedLine[] {
  return lines.map((l) => ({
    id: l.id,
    date: l.local_date,
    amount: homeAmountFor(l, home, rates),
    status: l.status,
    seriesId: l.recurring_series_id,
  }));
}

/** The decision's estimates in the home currency, with its linked lines; null when an estimate cannot be converted. */
export function estimateInputFor(
  decision: DecideCheckRow,
  lines: readonly TransactionRow[],
  ctx: PastContext
): EstimateInput | null {
  if (decision.decided_at === null) return null;
  const typed = decision.inputs['currency'];
  const from = typeof typed === 'string' && typed !== '' ? typed : ctx.home;
  const toHome = (amount: number): number | null =>
    from === ctx.home ? amount : (convertLatest(amount, from, ctx.home, ctx.rates, ctx.customs, ctx.today)?.amount ?? null);
  const dayOne = toHome(decision.estimate_day_one ?? 0);
  const monthly = toHome(decision.estimate_monthly ?? 0);
  if (dayOne === null || monthly === null) return null;
  return {
    decidedDate: localDateOf(decision.decided_at, ctx.timeZone),
    estimateDayOne: dayOne,
    estimateMonthly: monthly,
    lines: toLinkedLines(lines, ctx.home, ctx.rates),
  };
}

export type RowDelta =
  | { kind: 'monthly'; estimate: number; actual: number; diff: number; tone: NonNullable<Checkpoint['toneMonthly']> }
  | { kind: 'schedule'; paid: number; due: number };

/** The list row's delta strip: the monthly comparison at the latest reached checkpoint, or the schedule match for a plan. */
export function deltaFor(decision: DecideCheckRow, lines: readonly TransactionRow[], ctx: PastContext): RowDelta | null {
  if (decision.status !== 'bought') return null;
  const input = estimateInputFor(decision, lines, ctx);
  if (input === null) return null;
  const [c30, c90] = compareEstimate(input, ctx.today).checkpoints;
  const latest = c90.reached ? c90 : c30.reached ? c30 : null;
  if (latest === null) return null;
  const method = parseCheckInputs(decision.inputs, ctx.today).method;
  if (method === 'loan' || method === 'instalment') {
    const { paid, due } = scheduleMatch(input.lines.filter((l) => l.seriesId !== null), ctx.today);
    return due > 0 ? { kind: 'schedule', paid, due } : null;
  }
  // WR-B06: no linked running cost (or one without a rate) has no actual to compare, so no strip.
  if (latest.monthlyActual === null || latest.diffMonthly === null || latest.toneMonthly === null) return null;
  if (input.estimateMonthly <= 0 && latest.monthlyActual <= 0) return null;
  return {
    kind: 'monthly',
    estimate: input.estimateMonthly,
    actual: latest.monthlyActual,
    diff: latest.diffMonthly,
    tone: latest.toneMonthly,
  };
}

export interface PastDecisionsModel {
  decisions: DecideCheckRow[];
  linksByCheck: ReadonlyMap<string, DecideLinkRow[]>;
  linesByCheck: ReadonlyMap<string, TransactionRow[]>;
  goalByCheck: ReadonlyMap<string, SavingsGoalRow>;
  goalLines: TransactionRow[];
  ctx: PastContext;
  userId: string | null;
  householdId: string | null;
  today: string;
  whole: Money;
  wholeIn: (typed: string | null) => Money;
  formatDate: (localDate: string) => string;
}

/** The shared read context for the list and the detail sheet: identity, home currency, stored rates and formatters. */
export function usePastContext() {
  const rc = useRecordContext();
  const fmt = useMoneyFormatter(false);
  const rates = useFxLatest().data;
  const customs = useCustomCurrencies(rc.userId ?? undefined).data;
  const whole = useMemo(() => moneyFn(fmt, currencyCode(rc.homeCurrency)), [fmt, rc.homeCurrency]);
  // WR-B07: a check's own amounts are formatted in the currency they were typed in (null: the current home).
  const wholeIn = useMemo(
    () => (typed: string | null): Money => (typed === null || typed === rc.homeCurrency ? whole : moneyFn(fmt, currencyCode(typed))),
    [fmt, whole, rc.homeCurrency]
  );
  const formatDate = useMemo(() => (d: string) => fmt.formatDate(d), [fmt]);
  const ctx = useMemo<PastContext>(
    () => ({ home: rc.homeCurrency, rates: rates ?? [], customs: customs ?? [], today: rc.today, timeZone: rc.timeZone }),
    [rc.homeCurrency, rates, customs, rc.today, rc.timeZone]
  );
  return { userId: rc.userId, householdId: rc.householdId, today: rc.today, ctx, whole, wholeIn, formatDate };
}

export function usePastDecisions(): PastDecisionsModel {
  const { userId: uid, householdId: hid, today, ctx, whole, wholeIn, formatDate } = usePastContext();
  const userId = uid ?? undefined;
  const householdId = hid ?? undefined;
  const checks = useDecideChecks(userId, householdId).data;
  const goals = useSavingsGoals(userId, householdId).data;

  const decisions = useMemo(() => {
    const decided = (checks ?? []).filter((c) => c.status !== 'open' && c.deleted_at === null);
    const when = (c: DecideCheckRow) => c.decided_at ?? c.updated_at;
    return decided.sort((a, b) => (when(a) < when(b) ? 1 : when(a) > when(b) ? -1 : 0));
  }, [checks]);

  const checkIds = useMemo(() => decisions.map((d) => d.id), [decisions]);
  const links = useDecideLinks(userId, householdId, checkIds).data;

  const linksByCheck = useMemo(() => {
    const out = new Map<string, DecideLinkRow[]>();
    for (const link of links ?? []) {
      if (link.deleted_at !== null) continue;
      out.set(link.check_id, [...(out.get(link.check_id) ?? []), link]);
    }
    return out;
  }, [links]);

  const ids = useMemo(() => {
    const transactionIds: string[] = [];
    const seriesIds: string[] = [];
    for (const list of linksByCheck.values()) {
      for (const l of list) {
        if (l.entity === 'transactions') transactionIds.push(l.target_id);
        else if (l.entity === 'recurring_series') seriesIds.push(l.target_id);
      }
    }
    return { transactionIds: [...new Set(transactionIds)].sort(), seriesIds: [...new Set(seriesIds)].sort() };
  }, [linksByCheck]);
  const lineRows = useLinkedLines(hid, PAST_LINES_KEY, ids).data;

  const linesByCheck = useMemo(() => {
    const out = new Map<string, TransactionRow[]>();
    for (const [checkId, list] of linksByCheck) {
      const txIds = new Set(list.filter((l) => l.entity === 'transactions').map((l) => l.target_id));
      const seriesIds = new Set(list.filter((l) => l.entity === 'recurring_series').map((l) => l.target_id));
      out.set(
        checkId,
        (lineRows ?? []).filter(
          (r) => txIds.has(r.id) || (r.recurring_series_id !== null && seriesIds.has(r.recurring_series_id))
        )
      );
    }
    return out;
  }, [linksByCheck, lineRows]);

  const goalByCheck = useMemo(() => {
    const out = new Map<string, SavingsGoalRow>();
    for (const g of goals ?? []) if (g.check_id !== null && g.deleted_at === null) out.set(g.check_id, g);
    return out;
  }, [goals]);
  const waitingGoalIds = useMemo(
    () =>
      decisions.flatMap((d) => {
        const g = d.status === 'waiting' ? goalByCheck.get(d.id) : undefined;
        return g ? [g.id] : [];
      }),
    [decisions, goalByCheck]
  );
  const goalLines = useGoalLines(hid, waitingGoalIds).data;

  return {
    decisions,
    linksByCheck,
    linesByCheck,
    goalByCheck,
    goalLines: goalLines ?? [],
    ctx,
    userId: uid,
    householdId: hid,
    today,
    whole,
    wholeIn,
    formatDate,
  };
}

/** Reopening a waiting or passed decision: its reminders are cancelled and a new open check starts at step 1 (D-10, D-11). */
export function useReopenDecision(today: string): (row: DecideCheckRow) => void {
  const { reopen } = useReopenCheck();
  return (row) => {
    cancelCheckReminders(row.id).catch(() => {});
    const id = reopen(row, today);
    showToast({ kind: 'ordinary', text: { key: 'decide.toast.reopened' } });
    pushOnce(checkHref(id, { step: '1' }));
  };
}
