/**
 * 06.1-22 (D-19, D49, D50): the pure model behind "Your money rules" and the Open checks card. No React, no I/O.
 *
 * Where rules live. The debt share keeps its own column (decide_settings.dsr_line, null = off). Keep at least, largest purchase and
 * the user's own category rules have no column, so they are stored as one small document under `custom_options.rules` (a column
 * the user already owns; the engine reads only the keys it knows). Reading is forgiving: anything that is not the document shape
 * reads as no rules. Writing always spreads the existing custom_options, so own item types and purposes are never lost.
 *
 * Up to 5 of the user's own rules (keep, largest and category rules together), matching the engine's own-line limit (D-12).
 */

import { kindTaken, MAX_RULE_PERCENT, type OwnRuleKind, type RulesDoc } from '@/features/decide/snapshot/v3/rulesDoc';
export * from '@/features/decide/snapshot/v3/rulesDoc';

/** The kinds "Add a rule" can list, in the order it lists them. */
export const ADD_RULE_KINDS: readonly OwnRuleKind[] = ['category_cap', 'category_share', 'largest', 'keep'];

/**
 * 06.1-80 (DC-7, OQ-80-1 A): the kinds "Add your own rule" offers. A kind already on the list (Keep at least or Largest single
 * purchase, on or off) is left out: it is changed from its own row, so adding never quietly fills a rule that is already there.
 * Category rules can repeat, so they are always offered.
 */
export function kindsOffered(doc: RulesDoc): OwnRuleKind[] {
  return ADD_RULE_KINDS.filter((k) => !kindTaken(doc, k));
}

/** The debt share as stored text ("30") to whole percent; null when off or unreadable. */
export function debtPercentOf(dsrLine: string | null): number | null {
  if (dsrLine === null || !/^\d{1,3}(\.\d{1,4})?$/.test(dsrLine)) return null;
  const n = Number(dsrLine);
  return n > MAX_RULE_PERCENT ? null : n;
}

export const DEBT_STEP_MIN = 5;
export const DEBT_STEP_MAX = 60;
export const DEBT_DEFAULT = 36;

/** The whole-percent stepper value for the debt share: the stored share clamped to 5..60, else the default. */
export function debtStepperValue(dsrLine: string | null): number {
  const n = debtPercentOf(dsrLine);
  if (n === null) return DEBT_DEFAULT;
  return Math.min(DEBT_STEP_MAX, Math.max(DEBT_STEP_MIN, Math.round(n)));
}

// ── crossing checks ──────────────────────────────────────────────────────────────────────────────────────────────

export interface Crossing {
  readonly checkId: string;
  readonly name: string;
}

/**
 * D49: which open checks a new rule newly pushes over. `before` and `after` are, per check, the line ids crossed and the tone with
 * the old and the new rules. A check is named when a line it did not cross now crosses, or when the answer moved from a calm tone
 * (fits, extra) to a tight or short one because of the rule.
 */
export interface JudgedCheck {
  readonly checkId: string;
  readonly name: string;
  readonly lineIds: readonly string[];
  readonly tone: string;
}

const CALM = new Set(['fits', 'extra']);
const STRAINED = new Set(['tight', 'short']);

export function newlyCrossing(before: readonly JudgedCheck[], after: readonly JudgedCheck[]): Crossing[] {
  const prior = new Map(before.map((b) => [b.checkId, b]));
  const out: Crossing[] = [];
  for (const a of after) {
    const b = prior.get(a.checkId);
    if (b === undefined) continue;
    const newLine = a.lineIds.some((id) => !b.lineIds.includes(id));
    const worse = CALM.has(b.tone) && STRAINED.has(a.tone);
    if (newLine || worse) out.push({ checkId: a.checkId, name: a.name });
  }
  return out;
}

// ── open-check rows ─────────────────────────────────────────────────────────────────────────────────────────────

export interface OpenCheckRowModel {
  readonly id: string;
  readonly name: string;
  /** Minor units; null when the check has no price yet. */
  readonly price: number | null;
  /** 'YYYY-MM-DD' or null (today). */
  readonly date: string | null;
  /** Minor units left after buying, from the last answer; null when no answer was stored. */
  readonly left: number | null;
  readonly code: string | null;
  readonly variant: string | null;
  /** The check is paid in one go (no plan): picks the one-off tight row. */
  readonly once: boolean;
  /** No answer yet, or an answer that still needs input: shown as a draft (notYet). */
  readonly draft: boolean;
  /** The draft has no way to pay chosen. */
  readonly payNotChosen: boolean;
  /** The records changed since the answer was last looked at. */
  readonly changed: boolean;
  /** When the check was last looked at ('YYYY-MM-DD'), for the "checked" line. */
  readonly checkedOn: string | null;
  /** 06.1-56 (DS-12): the day the check was made ('YYYY-MM-DD'); the row's date when no purchase date was chosen. */
  readonly createdOn?: string | null;
}

// ── D53: Something changed? ─────────────────────────────────────────────────────────────────────────────────────

/** What the user reported. Nothing is inferred from their data; the sheet starts with none chosen. */
export type ChangeEntry =
  | { readonly kind: 'pay'; /** New pay a month, minor units. */ readonly amount: number; /** 'YYYY-MM-DD' */ readonly from: string }
  | { readonly kind: 'bill'; readonly seriesId: string; readonly name: string; /** The bill's monthly amount, positive minor units. */ readonly amount: number; readonly status: 'stopped' | 'paused'; readonly from: string }
  | { readonly kind: 'oneOff'; readonly amount: number; readonly date: string };

export interface ChangeRowDraft {
  readonly kind: 'income' | 'spending';
  readonly name: string;
  readonly monthly_amount: number;
  readonly start_month: string;
  readonly end_month: string | null;
}

const monthOf = (date: string): string => date.slice(0, 7);

/**
 * The decide_changes row for a report. Pay: income, the signed difference from a usual month's pay. A stopped or paused bill:
 * spending that goes down by the bill's amount. A one-off cost: spending in that one month only. `label` is the shown name.
 */
export function changeRowOf(entry: ChangeEntry, label: string, usualPay: number | null): ChangeRowDraft {
  if (entry.kind === 'pay') {
    return { kind: 'income', name: label, monthly_amount: entry.amount - (usualPay ?? 0), start_month: monthOf(entry.from), end_month: null };
  }
  if (entry.kind === 'bill') {
    return { kind: 'spending', name: label, monthly_amount: -Math.abs(entry.amount), start_month: monthOf(entry.from), end_month: null };
  }
  return { kind: 'spending', name: label, monthly_amount: Math.abs(entry.amount), start_month: monthOf(entry.date), end_month: monthOf(entry.date) };
}

/** What a usual month would leave with the report applied; null for a one-off (it is one month) or when the usual month is unknown. */
export function leftWithChange(entry: ChangeEntry, usualLeft: number | null, usualPay: number | null): number | null {
  if (usualLeft === null) return null;
  if (entry.kind === 'pay') return usualLeft + (entry.amount - (usualPay ?? 0));
  if (entry.kind === 'bill') return usualLeft + Math.abs(entry.amount);
  return null;
}

/** The stored parts of a decide_changes row this model reads. */
export interface ChangeRowShape {
  readonly kind: 'income' | 'spending';
  readonly name: string | null;
  readonly monthly_amount: number;
  readonly start_month: string;
  readonly end_month: string | null;
}

/** A one-off cost as the sheet writes it: spending, positive, in one month only. */
export function isOneOffRow(row: ChangeRowShape): boolean {
  return row.kind === 'spending' && row.monthly_amount > 0 && row.end_month === row.start_month;
}

/**
 * Whether a stored name is a label the app wrote from `template`, a translated label with `marker` where the amount goes ("One-off
 * #"). The amount part only has to look like money (a digit, no word of four letters or more), so a label written under an
 * older money format still counts.
 */
export function isWrittenLabel(name: string, template: string, marker: string): boolean {
  const at = template.indexOf(marker);
  if (at < 0) return name === template;
  const prefix = template.slice(0, at);
  const suffix = template.slice(at + marker.length);
  if (name.length <= prefix.length + suffix.length || !name.startsWith(prefix) || !name.endsWith(suffix)) return false;
  const amount = name.slice(prefix.length, name.length - suffix.length);
  return /\d/.test(amount) && !/\p{L}{4,}/u.test(amount);
}

/**
 * 06.1-80 (DS-19): the name the person gave a one-off cost, or null. A one-off saved with no name stores the shown label ("One-off
 * $9"), so a stored name that is such a label (`isOneOffLabel`) is no name.
 */
export function ownChangeName(row: ChangeRowShape, isOneOffLabel: (name: string) => boolean): string | null {
  if (!isOneOffRow(row) || row.name === null) return null;
  const name = row.name.trim();
  return name === '' || isOneOffLabel(name) ? null : name;
}

/** The Something changed form, as the sheet holds it. */
export interface ChangeFormValues {
  readonly kind: 'pay' | 'bill' | 'oneOff';
  readonly amount: number | null;
  readonly billId: string | null;
  readonly status: 'stopped' | 'paused';
  /** 'YYYY-MM-DD' */
  readonly date: string;
  /** The one-off's own name; '' for none. */
  readonly name: string;
}

export interface ChangeFormContext {
  /** 'YYYY-MM-DD' */
  readonly today: string;
  readonly usualPay: number | null;
  readonly bills: readonly { id: string; name: string }[];
  /** The stored label of a stopped or paused bill ("Gym stopped"). */
  readonly billLabel: (billName: string, status: 'stopped' | 'paused') => string;
  readonly isOneOffLabel: (name: string) => boolean;
}

/**
 * 06.1-80 (DC-10): the form a saved change opens with when "Change" is pressed, or null when the row is not one this sheet can
 * write again unchanged (an ended pay change, a bill that is no longer listed, an older row of another shape). Rows only keep a
 * month, so the date is today in the change's own month, else the 1st. Pay is stored as the difference from a usual month's pay,
 * so the amount shown is that pay plus the difference.
 */
export function changeFormOf(row: ChangeRowShape, ctx: ChangeFormContext): ChangeFormValues | null {
  const date = row.start_month === ctx.today.slice(0, 7) ? ctx.today : `${row.start_month}-01`;
  const base = { billId: null, status: 'stopped' as const, date, name: '' };
  if (isOneOffRow(row)) return { ...base, kind: 'oneOff', amount: row.monthly_amount, name: ownChangeName(row, ctx.isOneOffLabel) ?? '' };
  if (row.end_month !== null) return null;
  if (row.kind === 'income') {
    const pay = (ctx.usualPay ?? 0) + row.monthly_amount;
    return { ...base, kind: 'pay', amount: pay > 0 ? pay : null };
  }
  if (row.monthly_amount >= 0) return null;
  for (const bill of ctx.bills) {
    for (const status of ['stopped', 'paused'] as const) {
      if (ctx.billLabel(bill.name, status) === row.name) return { ...base, kind: 'bill', amount: null, billId: bill.id, status };
    }
  }
  return null;
}

/** The fields of a stored row that differ from the new draft; empty when nothing changed. */
export function changePatchOf(row: ChangeRowShape, draft: ChangeRowDraft): Partial<ChangeRowDraft> {
  const patch: { -readonly [K in keyof ChangeRowDraft]?: ChangeRowDraft[K] } = {};
  if (draft.kind !== row.kind) patch.kind = draft.kind;
  if (draft.name !== row.name) patch.name = draft.name;
  if (draft.monthly_amount !== row.monthly_amount) patch.monthly_amount = draft.monthly_amount;
  if (draft.start_month !== row.start_month) patch.start_month = draft.start_month;
  if (draft.end_month !== row.end_month) patch.end_month = draft.end_month;
  return patch;
}

/** A change still in force: not deleted, and not ended before this month. */
export function isActiveChange(row: { deleted_at: string | null; end_month: string | null }, thisMonth: string): boolean {
  return row.deleted_at === null && (row.end_month === null || row.end_month >= thisMonth);
}
