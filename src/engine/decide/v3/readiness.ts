/**
 * D-52 (as amended by D-57 and D-58), D-51, D-54 (05.1); D-24 (05.3-54). Are the records good enough for Decide to give
 * a verdict, and if not, which lines are missing?
 * Pure: no clock (asOf comes from the inputs), no I/O. Reuses the records-look-behind arithmetic of needsInput and the
 * D-51 settle module; it adds no threshold of its own.
 *
 * With history, ready means: the previous calendar month is fully recorded AND the current month is up to date AND
 * every envelope says which account holds it. A person with no history who gave quick estimates is always ready (D-57):
 * the answer is the estimate-based one. A missed pay is never a readiness item (D-58); needsInput asks about it instead.
 *
 * D-24: readiness names lines. Each gap is an item with its series or envelope, the pending line of the same series
 * (B1), a name, an amount and a date, so the asking card can say "Netflix, $11.99, due Sep 3". `missing` keeps the
 * D-52 codes. Readiness never changes the code, the split or any figure; the only figure exception is D-27
 * ("someone else paid it"), and it lives in month/ (05.3-63), not here.
 *
 * The user's answers (V3Inputs.waivers, D-28) settle the items they name; those move to `waived` with the answer, so
 * the verdict can say what it rests on. A skipped occurrence (V3Inputs.skipped) settles its due silently, as a record.
 */
import { MATCH_DAYS, NEEDS_INPUT_ENTRY_AGE_DAYS, PAY_MATCH_DAYS, UNDER_LOGGED_PACE_PERCENT } from './constants';
import { addDays, addYearMonths, daysBetween, yearMonthOf } from './dates';
import { recordsSynced } from './month/freshness';
import { classifyLine, seriesIndex, seriesOccurrences } from './month/series';
import { dueKey, matchWindowDays, settle, toPaidLine, type Due, type PaidLine } from './month/settle';
import type {
  LocalDate,
  MonthModel,
  Readiness,
  ReadinessCode,
  ReadinessItem,
  ReadinessItemKind,
  ReadinessWaiver,
  ReadinessWaiverKind,
  V3Inputs,
  V3Line,
  V3Series,
  WaivedItem,
  YearMonth,
} from './types';

/** A bill or pay gap before its pending line, name and amount are looked up. */
interface DueGap {
  readonly kind: 'bill' | 'pay';
  readonly code: ReadinessCode;
  readonly month: YearMonth;
  readonly due: Due;
}

interface Ctx {
  readonly inputs: V3Inputs;
  readonly index: ReadonlyMap<string, V3Series>;
  readonly paid: readonly PaidLine[];
  /** Skipped occurrences as linked lines: they settle their own due exactly like a paid line, silently (a record, not an answer). */
  readonly skips: readonly PaidLine[];
  readonly window: (seriesId: string) => number;
}

function contextOf(inputs: V3Inputs): Ctx {
  const index = seriesIndex(inputs.series);
  const paid = inputs.months.flatMap((m) => m.lines.filter((l) => l.status === 'paid')).map(toPaidLine);
  const skips: PaidLine[] = [];
  for (const k of inputs.skipped ?? []) {
    const s = index.get(k.seriesId);
    if (s !== undefined) skips.push({ id: `skip|${k.seriesId}|${k.date}`, seriesId: k.seriesId, date: k.date, amount: s.amount, source: 'manual' });
  }
  const windows = new Map<string, number>();
  for (const s of inputs.series) {
    windows.set(s.id, matchWindowDays(s.cadence, s.role === 'pay' || s.role === 'other_income' ? PAY_MATCH_DAYS : MATCH_DAYS));
  }
  return { inputs, index, paid, skips, window: (id) => windows.get(id) as number };
}

/** Occurrences with seriesId, date and amount in [from, to) of the series with one of `roles`. */
function duesOf(inputs: V3Inputs, roles: readonly V3Series['role'][], from: string, to: string): readonly Due[] {
  const dues: Due[] = [];
  for (const s of inputs.series) {
    if (!roles.includes(s.role)) continue;
    for (const date of seriesOccurrences(s, from, to, inputs.asOf)) dues.push({ seriesId: s.id, date, amount: s.amount });
  }
  return dues;
}

function unsettled(ctx: Ctx, dues: readonly Due[], lines: readonly PaidLine[]): readonly Due[] {
  const { settled } = settle(dues, lines, ctx.window);
  return dues.filter((d) => !settled.has(dueKey(d)));
}

function plainItem(kind: ReadinessItemKind, code: ReadinessCode, month: YearMonth, date: LocalDate | null): ReadinessItem {
  return { kind, code, month, seriesId: null, envelopeId: null, lineId: null, name: null, amount: null, date };
}

/** Previous calendar month (code past_month_missing). */
function pastMonthItems(ctx: Ctx, ym: YearMonth): { readonly items: readonly ReadinessItem[]; readonly gaps: readonly DueGap[] } {
  const { inputs, index } = ctx;
  const code: ReadinessCode = 'past_month_missing';
  const prev = addYearMonths(ym, -1);
  const prevMonth = inputs.months.find((m) => m.month === prev);
  if (prevMonth === undefined || !prevMonth.full) {
    let earliest: LocalDate | null = null;
    for (const l of prevMonth?.lines ?? []) if (earliest === null || l.date < earliest) earliest = l.date;
    return { items: [plainItem('late_start', code, prev, earliest)], gaps: [] };
  }
  const items: ReadinessItem[] = [];
  const gaps: DueGap[] = [];
  const paidHere = prevMonth.lines.filter((l) => l.status === 'paid');
  if (!paidHere.some((l) => classifyLine(l, index) === 'everyday')) items.push(plainItem('spending', code, prev, null));
  const from = `${prev}-01`;
  const to = `${ym}-01`;
  if (!paidHere.some((l) => l.role === 'income')) {
    for (const due of unsettled(ctx, duesOf(inputs, ['pay', 'other_income'], from, to), ctx.skips)) gaps.push({ kind: 'pay', code, month: prev, due });
  }
  for (const due of unsettled(ctx, duesOf(inputs, ['bill'], from, to), [...ctx.paid, ...ctx.skips])) gaps.push({ kind: 'bill', code, month: prev, due });
  return { items, gaps };
}

/** Current month (code activity_not_current). */
function currentMonthItems(ctx: Ctx, month: MonthModel, ym: YearMonth): { readonly items: readonly ReadinessItem[]; readonly gaps: readonly DueGap[] } {
  const { inputs, index } = ctx;
  const code: ReadinessCode = 'activity_not_current';
  // Nothing recorded at all: there is no activity to be current about; past_month_missing already says so.
  if (ctx.paid.length === 0) return { items: [], gaps: [] };
  let newest: LocalDate | null = null;
  for (const m of inputs.months) {
    for (const l of m.lines) {
      if (l.status === 'paid' && l.role === 'spending' && classifyLine(l, index) === 'everyday' && (newest === null || l.date > newest)) newest = l.date;
    }
  }
  const items: ReadinessItem[] = [];
  const old = newest === null || daysBetween(newest, inputs.asOf) > NEEDS_INPUT_ENTRY_AGE_DAYS;
  const behind =
    month.e === null ||
    BigInt(month.everydayLogged) * BigInt(month.daysInMonth) * 100n < BigInt(UNDER_LOGGED_PACE_PERCENT) * BigInt(month.e) * BigInt(month.day);
  // 05.4 ENG-14: the same freshness rule as needsInput; recently synced records stand in for a new month's spending (QE-07).
  if (old && behind && !recordsSynced(inputs)) items.push(plainItem('spending', code, ym, newest));
  const dues = duesOf(inputs, ['bill'], `${ym}-01`, addDays(inputs.asOf, 1));
  const gaps = unsettled(ctx, dues, [...ctx.paid, ...ctx.skips])
    .filter((d) => daysBetween(d.date, inputs.asOf) > NEEDS_INPUT_ENTRY_AGE_DAYS)
    .map((due): DueGap => ({ kind: 'bill', code, month: ym, due }));
  return { items, gaps };
}

/** D-54: every envelope must say which account holds it. Never waived; its only answer is Open envelopes. */
function envelopeItems(inputs: V3Inputs, ym: YearMonth): readonly ReadinessItem[] {
  return inputs.envelopes
    .filter((e) => e.accountId === null || e.accountId === undefined)
    .map((e) => ({ ...plainItem('envelopes', 'envelopes_unconfirmed', ym, null), envelopeId: e.id, name: e.name ?? null }));
}

/**
 * B1: a gap's lineId comes only from a pending line of the same series. Settling the pending lines of each series
 * against its own dues pairs them nearest first inside the series window; a pending line with no series is never a
 * candidate, so a one-off of the same amount is never marked paid or skipped.
 */
function namedGaps(ctx: Ctx, gaps: readonly DueGap[]): readonly ReadinessItem[] {
  const pending = new Map<string, V3Line>();
  for (const m of ctx.inputs.months) for (const l of m.lines) if (l.status === 'pending' && l.seriesId !== null) pending.set(l.id, l);
  const { lineFor } = settle(
    gaps.map((g) => g.due),
    [...pending.values()].map(toPaidLine),
    ctx.window,
  );
  return gaps.map((g) => {
    const s = ctx.index.get(g.due.seriesId) as V3Series;
    const lineId = lineFor.get(dueKey(g.due));
    const line = lineId === undefined ? undefined : (pending.get(lineId) as V3Line);
    return {
      kind: g.kind,
      code: g.code,
      month: g.month,
      seriesId: g.due.seriesId,
      envelopeId: null,
      lineId: line?.id ?? null,
      name: line?.name ?? s.name ?? null,
      amount: line?.amount ?? s.amount,
      date: g.due.date,
    };
  });
}

const KIND_RANK: Readonly<Record<ReadinessItemKind, number>> = { late_start: 0, pay: 1, bill: 2, spending: 3, envelopes: 4 };

/** Month, then kind, then date, then series or envelope id; plain string order, never localeCompare. */
function itemKey(i: ReadinessItem): string {
  const sep = String.fromCharCode(1);
  return [i.month, String(KIND_RANK[i.kind]), i.date ?? '', i.seriesId ?? i.envelopeId ?? ''].join(sep);
}

function sortItems<T>(list: readonly T[], itemOf: (t: T) => ReadinessItem): T[] {
  return list
    .map((t) => ({ t, k: itemKey(itemOf(t)) }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map((x) => x.t);
}

/** When several waivers settle one item, the first kind here names it (for several of one kind, the latest `at`). */
const PRECEDENCE: readonly ReadinessWaiverKind[] = ['start_from', 'month_complete', 'income_elsewhere', 'always_other', 'paid_by_other', 'didnt_happen', 'no_pay', 'nothing_to_add'];

/** Rank, then `at` newest first (digits inverted so plain string order is descending), then a fixed canonical order. */
function waiverKey(w: ReadinessWaiver): string {
  const sep = String.fromCharCode(1);
  const at = 'at' in w ? w.at.replace(/\d/g, (d) => String(9 - Number(d))) : '';
  return [String(PRECEDENCE.indexOf(w.kind)), at, JSON.stringify(w)].join(sep);
}

/**
 * Does `w` settle `item`? `fresh` is the D-52 staleness clock: an answer within NEEDS_INPUT_ENTRY_AGE_DAYS stands in
 * for a recent everyday line in the current month.
 */
function settles(w: ReadinessWaiver, item: ReadinessItem, ym: YearMonth, fresh: (at: LocalDate) => boolean): boolean {
  switch (w.kind) {
    case 'start_from':
      return item.month < w.month;
    case 'month_complete':
      if (item.month !== w.month) return false;
      if (item.month < ym) return true;
      // The current month's items are bills and the spending clock only.
      if (item.kind !== 'bill') return fresh(w.at);
      // Typed constant, not an inline cast: Stryker rewrites `(x as T) <= y` into `x as T < y`, which does not parse.
      {
        const billDate: LocalDate = item.date as LocalDate;
        return billDate <= w.at;
      }
    case 'income_elsewhere':
      return item.kind === 'pay';
    case 'always_other':
      return item.kind === 'bill' && item.seriesId === w.seriesId;
    case 'paid_by_other':
    case 'didnt_happen':
      return item.kind === 'bill' && item.seriesId === w.seriesId && item.date === w.date;
    case 'no_pay':
      return item.kind === 'pay' && item.seriesId === w.seriesId && item.date === w.date;
    case 'nothing_to_add':
      return item.kind === 'spending' && item.month === w.month && (item.month < ym || fresh(w.at));
  }
}

export function readinessOf(inputs: V3Inputs, month: MonthModel): Readiness {
  const ym = yearMonthOf(inputs.asOf);
  // D-57: no history and quick estimates given: the answer is the estimate-based one.
  if (inputs.typedEstimates !== null && !inputs.months.some((m) => m.month < ym)) return { ready: true, missing: [], items: [], waived: [] };
  const ctx = contextOf(inputs);
  const past = pastMonthItems(ctx, ym);
  const current = currentMonthItems(ctx, month, ym);
  const gapItems = [...past.items, ...current.items, ...namedGaps(ctx, [...past.gaps, ...current.gaps])];
  // A waiver answered after asOf does not exist yet.
  const live = (inputs.waivers ?? []).filter((w) => !('at' in w) || w.at <= inputs.asOf);
  const fresh = (at: LocalDate): boolean => daysBetween(at, inputs.asOf) <= NEEDS_INPUT_ENTRY_AGE_DAYS;
  const open: ReadinessItem[] = [...envelopeItems(inputs, ym)]; // D-54: envelopes are never waived
  const waived: WaivedItem[] = [];
  for (const item of gapItems) {
    const best = live
      .filter((w) => settles(w, item, ym, fresh))
      .map((w) => ({ w, k: waiverKey(w) }))
      .reduce<{ w: ReadinessWaiver; k: string } | null>((b, x) => (b === null || x.k < b.k ? x : b), null);
    if (best === null) open.push(item);
    else waived.push({ item, by: best.w.kind, waiver: best.w });
  }
  const items = sortItems(open, (i) => i);
  const missing = [...new Set(items.map((i) => i.code))].sort();
  return { ready: items.length === 0, missing, items, waived: sortItems(waived, (w) => w.item) };
}
