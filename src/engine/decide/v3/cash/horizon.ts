/**
 * 08.1 D-05 / D-06: the no-purchase cash path stretched past 90 days, so a fresh check can be read on any later start day.
 *
 * The open path (path.ts) is capped at CASH_PATH_DAYS_V3. The ready-by search needs a fresh 90-day window opened on each candidate
 * day up to 12 months out, so this builds the same flows over a longer span: the series flows month by month (each calendar month is
 * its own window, so a pay cap for a month is never given twice), the savings transfers and debt minimums the caller dated for the
 * whole span, and the same cumulative daily spread. A fresh window opened on `start` begins with what the no-purchase path holds at
 * the end of the day before, and takes the spread of its own days only.
 *
 * Pure: integer minor units; nothing here knows a purchase until lowestFrom is given its flows.
 */
import type { MinorUnits } from '../../../money/types';
import { daysBetween, firstOfMonth, addYearMonths, yearMonthOf } from '../dates';
import { CASH_PATH_DAYS_V3 } from '../constants';
import { openCashFlows, spreadThrough, type DatedFlow, type OpenCashPathInput } from './path';

export interface HorizonInput extends Omit<OpenCashPathInput, 'days' | 'savings' | 'debts' | 'extraPays'> {
  /** The balance on asOf before any of the path's flows (the check's opening money). */
  readonly opening: MinorUnits;
  /** The regular saving transfers and debt minimums, dated over the whole span (money out, positive). */
  readonly outflows: readonly DatedFlow[];
  /** How many days the stretched path covers (the last start day plus the 90-day window). */
  readonly totalDays: number;
}

export interface Horizon {
  /**
   * The lowest balance of a fresh CASH_PATH_DAYS_V3 window opened on `start` (a day from asOf to the span's last start day), with the
   * purchase's dated money-out flows applied from that day. The window opens with what the no-purchase path holds the day before,
   * so each day is the no-purchase balance less what the purchase has taken by then.
   */
  lowestFrom(start: string, flows: readonly DatedFlow[]): bigint;
}

export function buildHorizon(input: HorizonInput): Horizon {
  const { asOf, totalDays } = input;
  const net = new Array<bigint>(totalDays).fill(0n);
  const put = (date: string, amount: bigint): void => {
    if (date < asOf) return;
    const i = daysBetween(asOf, date);
    if (i < totalDays) net[i] = (net[i] as bigint) + amount;
  };
  // the series flows, one calendar month at a time: the first window runs from asOf to the 1st of the next month
  let from = asOf;
  let ym = yearMonthOf(asOf);
  while (daysBetween(asOf, from) < totalDays) {
    ym = addYearMonths(ym, 1);
    const next = firstOfMonth(ym);
    // only the series: the saving transfers and debt minimums are given dated over the whole span (outflows), never once per window
    const { flows } = openCashFlows({ asOf: from, days: daysBetween(from, next), series: input.series, paidThisMonth: input.paidThisMonth, erest: input.erest, e: input.e, payCaps: input.payCaps, drops: input.drops });
    for (const f of flows) put(f.date, BigInt(f.amount));
    from = next;
  }
  for (const f of input.outflows) put(f.date, -BigInt(f.amount));
  // balance[i]: the end of day i on the no-purchase path
  const balance: bigint[] = [];
  let running = BigInt(input.opening);
  for (let i = 0; i < totalDays; i++) {
    running += net[i] as bigint;
    balance.push(running - spreadThrough(i, { erest: input.erest, e: input.e, asOf }));
  }
  return {
    lowestFrom(start, flows) {
      const s = daysBetween(asOf, start);
      const out = new Array<bigint>(CASH_PATH_DAYS_V3).fill(0n);
      for (const f of flows) {
        if (f.date < start) continue;
        const j = daysBetween(start, f.date);
        if (j < CASH_PATH_DAYS_V3) out[j] = (out[j] as bigint) + BigInt(f.amount);
      }
      let bought = 0n;
      let lowest = 0n;
      for (let j = 0; j < CASH_PATH_DAYS_V3; j++) {
        bought += out[j] as bigint;
        const at = (balance[s + j] as bigint) - bought;
        if (j === 0 || at < lowest) lowest = at;
      }
      return lowest;
    },
  };
}

/** How many days the stretched path must cover for start days up to `limit`: the days to it plus a whole window. */
export function horizonDays(asOf: string, limit: string): number {
  return daysBetween(asOf, limit) + CASH_PATH_DAYS_V3 + 1;
}
