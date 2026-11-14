/**
 * 06.1 UX-38 (prototype D55 "Every date, next 90 days"): the dated list of money in and out with this purchase, each line labelled,
 * with the balance after it. Pure, integer minor units.
 *
 * It reads the very flows the cash check sums (prepare.ts timelineOf: the open path's labelled flows and the purchase side's, for the
 * reading judgeCheck keeps), so its lowest point is the cash check's lowest point (pinned by a property test). Everyday spending is
 * spread across the days and never listed as a line; each balance after a line already has the spread up to that day taken off.
 * A flow dated before today sits on today, as the path puts it; a line of 0 is not listed.
 */
import type { MinorUnits } from '../../../money/types';
import { minorFromBigInt } from '../../../payoff/types';
import { CASH_PATH_DAYS_V3 } from '../constants';
import { addDays, daysBetween } from '../dates';
import { timelineOf, type Prepared } from '../prepare';
import type { CheckV2 } from '../types';
import { FLOW_KINDS, type CashPoint, type FlowKind } from './path';

const FN = 'cash/timeline';

export interface TimelineRow {
  readonly date: string;
  /** Signed: money in positive, money out negative. */
  readonly amount: MinorUnits;
  readonly kind: FlowKind;
  readonly seriesId: string | null;
  readonly debtId: string | null;
  /** The balance once this line and the everyday spending up to its day are counted. */
  readonly balanceAfter: MinorUnits;
}

export interface CashTimeline {
  /** The opening balance the path starts from (the spending money, the purchase's own envelope and money above the net's size). */
  readonly start: MinorUnits;
  /** Sorted by date, then by kind in FLOW_KINDS order, then as the path takes them. */
  readonly rows: readonly TimelineRow[];
  /** The lowest end-of-day balance (the first day it is reached). */
  readonly lowest: CashPoint;
}

export function cashTimeline(prepared: Prepared, check: CheckV2, days: number = CASH_PATH_DAYS_V3): CashTimeline {
  if (!Number.isInteger(days) || days < 1 || days > CASH_PATH_DAYS_V3) throw new RangeError(`${FN}: days must be 1..${CASH_PATH_DAYS_V3}`);
  const { open, opening, flows } = timelineOf(prepared, check);
  const { asOf } = open;
  const end = addDays(asOf, days);
  const kept = flows
    .map((f, i) => ({ f, i, day: f.date <= asOf ? 0 : daysBetween(asOf, f.date) }))
    .filter((x) => x.f.date < end && x.f.amount !== 0)
    .sort((a, b) => a.day - b.day || FLOW_KINDS.indexOf(a.f.kind) - FLOW_KINDS.indexOf(b.f.kind) || a.i - b.i);
  const rows: TimelineRow[] = [];
  let running = BigInt(opening);
  let lowest: CashPoint | null = null;
  let k = 0;
  for (let day = 0; day < days; day++) {
    const date = addDays(asOf, day);
    const spread = open.spread[day] as bigint;
    for (; k < kept.length && (kept[k] as (typeof kept)[number]).day === day; k++) {
      const { f } = kept[k] as (typeof kept)[number];
      running += BigInt(f.amount);
      rows.push({ date, amount: f.amount, kind: f.kind, seriesId: f.seriesId, debtId: f.debtId, balanceAfter: minorFromBigInt(running - spread, FN) });
    }
    const balance = minorFromBigInt(running - spread, FN);
    if (lowest === null || balance < lowest.balance) lowest = { date, balance };
  }
  return { start: opening, rows, lowest: lowest as CashPoint };
}
