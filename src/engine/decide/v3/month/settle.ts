/**
 * One matcher for "was this due date paid?" (M-02, H-02; D-51 as amended by D-56). Pure: no clock, no I/O.
 *
 * thisMonth, unspent, evaluate and incomeProfile used to carry four hand-copied matchers that drifted apart (a
 * one-sided pay window, a first-unused greedy walk that depended on input order). This module replaces them.
 *
 * A due item (bill, debt payment or pay occurrence) is settled only by a paid line that matches it: a line linked to
 * its series, or a paid line with no series link (typed by the user or imported from a statement, D-56) whose amount
 * has the same sign as the due amount and sits within AMOUNT_TOLERANCE_DIVISOR of it. Either way the line must be
 * dated within the series' window of the due date. The due date passing settles nothing.
 * Pairs are taken nearest first, so the result is the same for every ordering of the lines.
 * Callers pass only status 'paid' lines: a pending line never settles.
 */
import type { MinorUnits } from '../../../money/types';
import { AMOUNT_TOLERANCE_DIVISOR } from '../constants';
import { daysBetween } from '../dates';
import type { Cadence, V3Line } from '../types';

export interface Due {
  readonly seriesId: string;
  readonly date: string;
  readonly amount: MinorUnits;
}

export interface PaidLine {
  readonly id: string;
  readonly seriesId: string | null;
  readonly date: string;
  readonly amount: MinorUnits;
  readonly source: 'manual' | 'statement';
}

/** A logged line as the matcher sees it; an absent source is a typed line (D-51). */
export function toPaidLine(l: V3Line): PaidLine {
  return { id: l.id, seriesId: l.seriesId, date: l.date, amount: l.amount, source: l.source ?? 'manual' };
}

export interface Settled {
  /** dueKey of every due that a line settled. */
  readonly settled: ReadonlySet<string>;
  /** ids of the lines that settled something. */
  readonly usedLines: ReadonlySet<string>;
  /** dueKey -> id of the line that settled it. */
  readonly lineFor: ReadonlyMap<string, string>;
}

/** Half the shortest gap between two occurrences, minus one day, capped at maxDays: windows of neighbouring occurrences never overlap. */
export function matchWindowDays(c: Cadence, maxDays: number): number {
  const minPeriod = (c.unit === 'week' ? 7 : 28) * c.every;
  return Math.min(maxDays, Math.floor((minPeriod - 1) / 2));
}

export function dueKey(d: Due): string {
  return `${d.seriesId}|${d.date}`;
}

function inAmountBand(line: bigint, due: bigint): boolean {
  if (line === 0n || due === 0n || line < 0n !== due < 0n) return false;
  const diff = line > due ? line - due : due - line;
  const abs = due < 0n ? -due : due;
  return diff * BigInt(AMOUNT_TOLERANCE_DIVISOR) <= abs;
}

interface Pair {
  readonly dist: number;
  readonly due: Due;
  readonly line: PaidLine;
}

/** Sort key: distance, then due date, line date, line id, series id; plain string order, never localeCompare (L-06). */
function sortKey(p: Pair): string {
  const sep = String.fromCharCode(1); // sorts below every id character, so a prefix id sorts first
  return [String(p.dist).padStart(4, '0'), p.due.date, p.line.date, p.line.id, p.due.seriesId].join(sep);
}

function before(a: Pair, b: Pair): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export function settle(
  due: readonly Due[],
  lines: readonly PaidLine[],
  windowOf: (seriesId: string) => number,
): Settled {
  const pairs: Pair[] = [];
  for (const d of due) {
    const window = windowOf(d.seriesId);
    for (const line of lines) {
      const linked = line.seriesId === d.seriesId;
      if (!linked && !(line.seriesId === null && inAmountBand(BigInt(line.amount), BigInt(d.amount)))) continue;
      const dist = Math.abs(daysBetween(line.date, d.date));
      if (dist <= window) pairs.push({ dist, due: d, line });
    }
  }
  pairs.sort(before);
  const settled = new Set<string>();
  const usedLines = new Set<string>();
  const lineFor = new Map<string, string>();
  for (const p of pairs) {
    const key = dueKey(p.due);
    if (settled.has(key) || usedLines.has(p.line.id)) continue;
    settled.add(key);
    usedLines.add(p.line.id);
    lineFor.set(key, p.line.id);
  }
  return { settled, usedLines, lineFor };
}
