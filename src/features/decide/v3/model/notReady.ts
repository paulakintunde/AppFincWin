/** 05.3-15 (D-06): the not-ready checklist rows in a fixed order; the engine returns them alphabetically. */
import { READINESS_KEYS } from '@/engine/decide/v3';
import type { LocalDate, Readiness, ReadinessCode, ReadinessItem, ReadinessWaiver, YearMonth } from '@/engine/decide/v3';
import type { MinorUnits } from '@/engine/money/types';

export const NOT_READY_ORDER = ['past_month_missing', 'activity_not_current', 'envelopes_unconfirmed'] as const;

export interface NotReadyRow {
  readonly code: ReadinessCode;
  readonly titleKey: string;
  readonly month: YearMonth | null;
  readonly reasonKey: string;
  readonly buttonKey: string;
  readonly target: 'activity' | 'envelopes';
}

function previousMonth(m: YearMonth): YearMonth {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7));
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
}

export function notReadyRows(readiness: Readiness | undefined, thisMonth: YearMonth): readonly NotReadyRow[] {
  if (readiness === undefined || readiness.ready || readiness.missing.length === 0) return [];
  const rows: NotReadyRow[] = [];
  for (const code of NOT_READY_ORDER) {
    if (!readiness.missing.includes(code)) continue;
    const envelopes = code === 'envelopes_unconfirmed';
    rows.push({
      code,
      titleKey: `decide.v3.ui.notReady.${code}`,
      month: envelopes ? null : code === 'past_month_missing' ? previousMonth(thisMonth) : thisMonth,
      reasonKey: READINESS_KEYS[code],
      buttonKey: envelopes ? 'decide.v3.ui.notReady.openEnvelopes' : 'decide.v3.ui.notReady.openActivity',
      target: envelopes ? 'envelopes' : 'activity',
    });
  }
  return rows;
}

// 05.3-57 (D-24, D-29): the asking not-ready card. Each named gap becomes a plain question with answer chips.
// Money stays MinorUnits and dates stay LocalDate / YearMonth; the card formats them.

const K = 'decide.v3.ui.notReady.';
/** Envelope names shown before the rest become a count (W10). */
export const NOT_READY_ENVELOPE_NAMES = 3;

/** The same union shape as 05.3-56's ReadinessAction, so it passes straight through. */
export type NotReadyAction =
  | { readonly kind: 'markPaid'; readonly lineId: string }
  | { readonly kind: 'skip'; readonly lineId: string }
  | { readonly kind: 'waive'; readonly waiver: ReadinessWaiver }
  | { readonly kind: 'open'; readonly target: 'activity' | 'envelopes' };

export interface NotReadyChip {
  readonly key: string;
  readonly labelKey: string;
  readonly labelParams?: Readonly<Record<string, string>>;
  readonly action: NotReadyAction;
}

export interface NotReadyTitleParams {
  readonly name?: string;
  readonly names?: readonly string[];
  readonly more?: number;
  readonly amount?: MinorUnits;
  readonly date?: LocalDate;
  readonly month?: YearMonth;
}

export interface NotReadyItemView {
  /** stable: kind|seriesId|date|month; 'envelopes' for the merged row; the code for code-only rows */
  readonly key: string;
  /** null for code-only fallback rows and the merged envelopes row */
  readonly item: ReadinessItem | null;
  readonly titleKey: string;
  readonly titleParams: NotReadyTitleParams;
  readonly statusKey: string;
  readonly questionKey: string | null;
  readonly chips: readonly NotReadyChip[];
  readonly link: NotReadyChip | null;
}

export interface NotReadyGroup {
  readonly key: string;
  readonly month: YearMonth | null;
  readonly headingKey: string;
  readonly items: readonly NotReadyItemView[];
  readonly monthLink: NotReadyChip | null;
}

const chip = (key: string, action: NotReadyAction): NotReadyChip => ({ key, labelKey: K + key, action });
const open = (key: 'openActivity' | 'openEnvelopes' | 'recordIt', target: 'activity' | 'envelopes'): NotReadyChip => chip(key, { kind: 'open', target });
const waive = (key: string, waiver: ReadinessWaiver): NotReadyChip => chip(key, { kind: 'waive', waiver });

function itemKey(it: ReadinessItem): string {
  return `${it.kind}|${it.seriesId ?? ''}|${it.date ?? ''}|${it.month}`;
}

function moneyTitleParams(it: ReadinessItem): NotReadyTitleParams {
  const params: { name?: string; amount?: MinorUnits; date?: LocalDate } = {};
  if (it.name !== null) params.name = it.name;
  if (it.amount !== null) params.amount = it.amount;
  if (it.date !== null) params.date = it.date;
  return params;
}

/** Bills and pay (D-29): a pending line of the same series gets the one-tap first chip; otherwise "I'll record it". */
function moneyView(it: ReadinessItem, kind: 'bill' | 'pay'): NotReadyItemView {
  const { lineId, seriesId, date } = it;
  const first = lineId === null ? open('recordIt', 'activity') : chip(kind === 'bill' ? 'itWasPaid' : 'itArrived', { kind: 'markPaid', lineId });
  const head = {
    key: itemKey(it),
    item: it,
    titleKey: `${K}${kind}.${it.name === null ? 'titleUnnamed' : 'title'}`,
    titleParams: moneyTitleParams(it),
    statusKey: `${K}${kind}.${lineId === null ? 'none' : 'pending'}`,
    questionKey: `${K}${kind}.question`,
  };
  // Waivers need the series and the date; the engine always sets both for bills and pay, so this is a guard only.
  if (seriesId === null || date === null) return { ...head, chips: [first], link: null };
  // T-05.3-57-02: skip only the same-series pending line; with none, the answer is a waiver.
  const gone = (key: string, waiverKind: 'didnt_happen' | 'no_pay'): NotReadyChip =>
    lineId === null ? waive(key, { kind: waiverKind, seriesId, date }) : chip(key, { kind: 'skip', lineId });
  if (kind === 'bill') {
    return {
      ...head,
      chips: [first, waive('someoneElsePaid', { kind: 'paid_by_other', seriesId, date }), gone('didntHappen', 'didnt_happen')],
      link: waive('alwaysOther', { kind: 'always_other', seriesId }),
    };
  }
  return { ...head, chips: [first, gone('noPay', 'no_pay'), waive('elsewhere', { kind: 'income_elsewhere' })], link: null };
}

function spendingView(it: ReadinessItem, today: LocalDate): NotReadyItemView {
  return {
    key: itemKey(it),
    item: it,
    titleKey: `${K}spending.title`,
    titleParams: it.date === null ? { month: it.month } : { date: it.date, month: it.month },
    statusKey: `${K}spending.${it.date === null ? 'none' : 'last'}`,
    questionKey: `${K}spending.question`,
    chips: [open('openActivity', 'activity'), waive('nothingToAdd', { kind: 'nothing_to_add', month: it.month, at: today })],
    link: null,
  };
}

function lateStartView(it: ReadinessItem, thisMonth: YearMonth): NotReadyItemView {
  return {
    key: itemKey(it),
    item: it,
    titleKey: `${K}lateStart.${it.date === null ? 'titleNone' : 'title'}`,
    titleParams: it.date === null ? { month: it.month } : { month: it.month, date: it.date },
    statusKey: `${K}lateStart.status`,
    questionKey: `${K}lateStart.question`,
    chips: [{ ...waive('startFrom', { kind: 'start_from', month: thisMonth }), labelParams: { month: thisMonth } }, open('openActivity', 'activity')],
    link: null,
  };
}

/** D-54 exception (W10): every unlinked envelope in one item, named up to three, the rest as a count. No waiver, no month link. */
function envelopesView(items: readonly ReadinessItem[]): NotReadyItemView {
  const names = items.flatMap((it) => (it.name === null ? [] : [it.name])).slice(0, NOT_READY_ENVELOPE_NAMES);
  const more = items.length - names.length;
  const title: Pick<NotReadyItemView, 'titleKey' | 'titleParams'> =
    names.length === 0
      ? { titleKey: `${K}envelopes_unconfirmed`, titleParams: {} }
      : more === 0
        ? { titleKey: `${K}envelopes.title`, titleParams: { names } }
        : { titleKey: `${K}envelopes.titleMore`, titleParams: { names, more } };
  return { key: 'envelopes', item: null, ...title, statusKey: `${K}envelopes.status`, questionKey: null, chips: [open('openEnvelopes', 'envelopes')], link: null };
}

function viewOf(it: ReadinessItem, thisMonth: YearMonth, today: LocalDate): NotReadyItemView {
  if (it.kind === 'spending') return spendingView(it, today);
  if (it.kind === 'late_start') return lateStartView(it, thisMonth);
  return moneyView(it, it.kind === 'pay' ? 'pay' : 'bill');
}

function monthGroup(month: YearMonth, items: readonly NotReadyItemView[], thisMonth: YearMonth, monthLink: NotReadyChip | null): NotReadyGroup {
  return { key: month, month, headingKey: `${K}${month === thisMonth ? 'groupCurrent' : 'groupPast'}`, items, monthLink };
}

function monthLinkOf(month: YearMonth, thisMonth: YearMonth, today: LocalDate): NotReadyChip {
  const key = month === thisMonth ? 'monthCompleteCurrent' : 'monthCompletePast';
  return { ...waive(key, { kind: 'month_complete', month, at: today }), labelParams: { month } };
}

const envelopesGroup = (view: NotReadyItemView): NotReadyGroup => ({ key: 'envelopes', month: null, headingKey: `${K}groupEnvelopes`, items: [view], monthLink: null });

/** A Readiness without named items (older fixtures): one code-only item per notReadyRows row, no month link. */
function codeOnlyGroups(readiness: Readiness, thisMonth: YearMonth): readonly NotReadyGroup[] {
  return notReadyRows(readiness, thisMonth).map((row) => {
    const view: NotReadyItemView = {
      key: row.code,
      item: null,
      titleKey: row.titleKey,
      titleParams: row.month === null ? {} : { month: row.month },
      statusKey: row.reasonKey,
      questionKey: null,
      chips: [open(row.target === 'envelopes' ? 'openEnvelopes' : 'openActivity', row.target)],
      link: null,
    };
    return row.month === null ? envelopesGroup(view) : monthGroup(row.month, [view], thisMonth, null);
  });
}

/** 05.3-57 (D-24): readiness.items grouped by month (oldest first), then one envelopes group. */
export function notReadyGroups(readiness: Readiness | undefined, thisMonth: YearMonth, today: LocalDate): readonly NotReadyGroup[] {
  if (readiness === undefined || readiness.ready || readiness.missing.length === 0) return [];
  const items = readiness.items ?? [];
  if (items.length === 0) return codeOnlyGroups(readiness, thisMonth);
  const byMonth = new Map<YearMonth, NotReadyItemView[]>();
  const envelopes: ReadinessItem[] = [];
  for (const it of items) {
    if (it.kind === 'envelopes') {
      envelopes.push(it);
      continue;
    }
    const list = byMonth.get(it.month) ?? [];
    list.push(viewOf(it, thisMonth, today));
    byMonth.set(it.month, list);
  }
  const groups = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, views]) => monthGroup(month, views, thisMonth, monthLinkOf(month, thisMonth, today)));
  return envelopes.length === 0 ? groups : [...groups, envelopesGroup(envelopesView(envelopes))];
}
