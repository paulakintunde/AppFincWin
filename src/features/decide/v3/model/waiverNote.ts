// PURE. 05.3-59 (D-24, D-27, D-31, W8, W9): the user's answers a result rests on, as one quiet note and confidence-sheet rows.
// Sources: readiness.waived (WaivedItem.waiver), MonthModel.paidByOther and MonthModel.alwaysOther. One row per waiver.
// Dates and months stay LocalDate / YearMonth; the card formats them.
import type { AlwaysOtherSeries, LocalDate, PaidByOtherDue, ReadinessWaiver, WaivedItem, YearMonth } from '@/engine/decide/v3';

const K = 'decide.v3.ui.confidence.waiver.';
/** The name a row shows when its series or line has none. */
export const WAIVER_UNNAMED_KEY = `${K}unnamed`;

export interface WaiverRowParams {
  readonly name?: string;
  readonly date?: LocalDate;
  readonly month?: YearMonth;
}

export interface WaiverRow {
  /** stable dedupe key: the waiver kind plus its fields */
  readonly key: string;
  /** the sheet row text */
  readonly textKey: string;
  /** the note text when this is the only answer (W8) */
  readonly shortKey: string;
  readonly params: WaiverRowParams;
  /** notCounted (paid_by_other this month), alwaysNotCounted (always_other), else null */
  readonly effectKey: string | null;
  readonly waiver: ReadinessWaiver;
  readonly name: string | null;
}

export interface WaiverText {
  readonly key: string;
  readonly params: WaiverRowParams;
}

export interface WaiverNote {
  readonly key: string;
  readonly params: Record<string, unknown>;
}

function keyOf(w: ReadinessWaiver): string {
  switch (w.kind) {
    case 'paid_by_other':
    case 'didnt_happen':
    case 'no_pay':
      return `${w.kind}|${w.seriesId}|${w.date}`;
    case 'always_other':
      return `${w.kind}|${w.seriesId}`;
    case 'income_elsewhere':
      return w.kind;
    case 'nothing_to_add':
    case 'month_complete':
    case 'start_from':
      return `${w.kind}|${w.month}`;
  }
}

function rowOf(w: ReadinessWaiver, name: string | null, thisMonth: YearMonth): WaiverRow {
  const named = name === null ? {} : { name };
  let params: WaiverRowParams;
  let effectKey: string | null = null;
  let shortKey = `${K}${w.kind}`;
  switch (w.kind) {
    case 'paid_by_other':
      params = { ...named, date: w.date };
      shortKey = `${K}paid_by_other_short`;
      if (w.date.slice(0, 7) === thisMonth) effectKey = `${K}notCounted`;
      break;
    case 'didnt_happen':
    case 'no_pay':
      params = { ...named, date: w.date };
      break;
    case 'always_other':
      params = named;
      shortKey = `${K}always_other_short`;
      effectKey = `${K}alwaysNotCounted`;
      break;
    case 'income_elsewhere':
      params = {};
      break;
    case 'nothing_to_add':
    case 'month_complete':
    case 'start_from':
      params = { month: w.month };
      break;
  }
  return { key: keyOf(w), textKey: `${K}${w.kind}`, shortKey, params, effectKey, waiver: w, name };
}

/** Month-wide and income waivers name no line, so their rows carry no name. */
function namesLine(w: ReadinessWaiver): boolean {
  return w.kind === 'paid_by_other' || w.kind === 'didnt_happen' || w.kind === 'no_pay' || w.kind === 'always_other';
}

/** One row per waiver, in source order: readiness answers, then this month's paid-by-other dues, then always-other series. */
export function waiverRows(
  waived: readonly WaivedItem[] | undefined,
  paidByOther: readonly PaidByOtherDue[] | undefined,
  alwaysOther: readonly AlwaysOtherSeries[] | undefined,
  thisMonth: YearMonth,
): readonly WaiverRow[] {
  const found: { w: ReadinessWaiver; name: string | null }[] = [
    ...(waived ?? []).map((x) => ({ w: x.waiver, name: namesLine(x.waiver) ? x.item.name : null })),
    ...(paidByOther ?? []).map((d) => ({
      w: d.by === 'always_other' ? ({ kind: 'always_other', seriesId: d.seriesId } as const) : ({ kind: 'paid_by_other', seriesId: d.seriesId, date: d.date } as const),
      name: d.name,
    })),
    ...(alwaysOther ?? []).map((s) => ({ w: { kind: 'always_other', seriesId: s.seriesId } as const, name: s.name })),
  ];
  const order: string[] = [];
  const byKey = new Map<string, { w: ReadinessWaiver; name: string | null }>();
  for (const f of found) {
    const k = keyOf(f.w);
    const seen = byKey.get(k);
    if (seen === undefined) {
      order.push(k);
      byKey.set(k, f);
    } else if (seen.name === null) byKey.set(k, { w: seen.w, name: f.name });
  }
  return order.map((k) => {
    const f = byKey.get(k)!;
    return rowOf(f.w, f.name, thisMonth);
  });
}

/** null with no rows; one row names it (note_one, params.text = the row's short text); more give a count. */
export function waiverNote(rows: readonly WaiverRow[]): WaiverNote | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) {
    const r = rows[0]!;
    const text: WaiverText = { key: r.shortKey, params: r.params };
    return { key: `${K}note_one`, params: { text } };
  }
  return { key: `${K}note_other`, params: { count: rows.length } };
}
