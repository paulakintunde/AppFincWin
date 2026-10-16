// 05-39 (D-36, A17): past decisions for the engine's estimate bias, and the attached-line role default.
// PURE. Integer minor units; the monthly average is rounded half-up with divideHalfUp. A figure with no linked
// line of its role is null, never zero (04 D-56); a line with no stored rate makes its figure null (D-39).
import type { PastDecision } from '@/engine/decide';
import { currencyCode, divideHalfUp, minorUnits } from '@/engine/money';
import { convertLatest } from '@/data/queries/fxConvert';
import { homeAmountFor } from '@/data/queries/homeAmount';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideLinkRoleValue, DecideLinkRow } from '@/db/decideLinks';
import type { CustomCurrencyRow, FxLatestRow, TransactionRow } from '@/db/rows';
import { compareEstimate } from './estimateActual';

const ATTACH_DAY_ONE_WINDOW_DAYS = 7;

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** The device-local calendar date of a timestamptz instant, as 'YYYY-MM-DD'. */
function localDateOf(timestamp: string): string {
  const d = new Date(timestamp);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map((p) => parseInt(p, 10)) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** A17: a line within 7 days of the decision (on the day or after) is a day-one cost, otherwise a running cost. */
export function attachRoleFor(decidedAt: string, lineDate: string): 'day_one' | 'running_cost' {
  const gap = dayNumber(lineDate) - dayNumber(localDateOf(decidedAt));
  return gap >= 0 && gap <= ATTACH_DAY_ONE_WINDOW_DAYS ? 'day_one' : 'running_cost';
}

function wholeMonthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map((p) => parseInt(p, 10)) as [number, number, number];
  const [ty, tm, td] = to.split('-').map((p) => parseInt(p, 10)) as [number, number, number];
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(1, months);
}

export interface ToPastDecisionsArgs {
  decisions: readonly DecideCheckRow[];
  links: readonly DecideLinkRow[];
  lines: readonly TransactionRow[];
  today: string; // 'YYYY-MM-DD'
  home: string;
  rates: readonly FxLatestRow[];
  customs: readonly CustomCurrencyRow[];
}

export function toPastDecisions(args: ToPastDecisionsArgs): PastDecision[] {
  const { decisions, links, lines, today, home, rates, customs } = args;
  const lineById = new Map(lines.filter((l) => l.deleted_at === null).map((l) => [l.id, l]));
  const out: PastDecision[] = [];

  for (const check of decisions) {
    if (check.status !== 'bought' || check.deleted_at !== null || check.decided_at === null) continue;
    if (check.estimate_monthly_payment === null) continue;

    const decidedDate = localDateOf(check.decided_at);
    const [c30, c90] = compareEstimate(
      { decidedDate, estimateDayOne: 0, estimateMonthly: 0, lines: [] },
      today
    ).checkpoints;
    const checkpoint = c90.reached ? c90 : c30.reached ? c30 : null;
    if (checkpoint === null) continue;

    // Estimates in the home currency (04 D-62); an unconvertible estimate leaves the decision out.
    const typed = check.inputs['currency'];
    const from = typeof typed === 'string' && typed !== '' ? typed : home;
    const toHome = (amount: number): number | null =>
      from === home ? amount : (convertLatest(amount, from, home, rates, customs, today)?.amount ?? null);
    const dayOne = toHome(check.estimate_day_one ?? 0);
    const monthlyPayment = toHome(check.estimate_monthly_payment);
    const runningCosts = toHome(check.estimate_running ?? 0);
    if (dayOne === null || monthlyPayment === null || runningCosts === null) continue;

    const linked = (role: DecideLinkRoleValue): TransactionRow[] => {
      const found: TransactionRow[] = [];
      for (const link of links) {
        if (link.check_id !== check.id || link.deleted_at !== null || link.role !== role) continue;
        if (link.entity === 'transactions') {
          const line = lineById.get(link.target_id);
          if (line) found.push(line);
        } else if (link.entity === 'recurring_series') {
          for (const line of lineById.values()) if (line.recurring_series_id === link.target_id) found.push(line);
        }
      }
      return found.filter((l) => l.status === 'paid' && l.local_date <= checkpoint.date);
    };

    // null when there is no linked line of the role, or any of them lacks a stored rate (never a partial sum)
    const total = (role: DecideLinkRoleValue, windowed: boolean): number | null => {
      const roleLines = linked(role).filter((l) => !windowed || l.local_date >= decidedDate);
      if (roleLines.length === 0) return null;
      let sum = 0;
      for (const l of roleLines) {
        const amount = homeAmountFor(l, home, rates);
        if (amount === null) return null;
        sum += Math.abs(amount);
      }
      return sum;
    };
    const monthly = (role: DecideLinkRoleValue): number | null => {
      const sum = total(role, true);
      if (sum === null) return null;
      const months = wholeMonthsBetween(decidedDate, checkpoint.date);
      return Number(divideHalfUp(BigInt(sum), BigInt(months)));
    };

    const dayOneActual = total('day_one', false);
    out.push({
      id: check.id,
      currency: currencyCode(home),
      estimate: {
        dayOne: minorUnits(dayOne),
        monthlyPayment: minorUnits(monthlyPayment),
        runningCosts: minorUnits(runningCosts),
      },
      actual: {
        dayOne: dayOneActual === null ? null : minorUnits(dayOneActual),
        monthlyPayment: nullable(monthly('payment')),
        runningCosts: nullable(monthly('running_cost')),
      },
    });
  }
  return out;
}

function nullable(n: number | null) {
  return n === null ? null : minorUnits(n);
}
