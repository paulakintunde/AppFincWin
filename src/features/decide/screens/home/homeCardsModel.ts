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

export const MAX_OWN_RULES = 5;
export const MAX_RULE_PERCENT = 100;

export type OwnRuleKind = 'keep' | 'largest' | 'category_cap' | 'category_share';

export interface StoredRule {
  readonly id: string;
  readonly kind: OwnRuleKind;
  readonly on: boolean;
  /** Minor units for keep, largest and category_cap; whole percent of pay for category_share. */
  readonly value: number;
  /** category_cap and category_share only. */
  readonly categoryId: string | null;
}

export interface RulesDoc {
  readonly v: 1;
  readonly rules: readonly StoredRule[];
}

export const EMPTY_RULES: RulesDoc = { v: 1, rules: [] };

const KINDS: readonly OwnRuleKind[] = ['keep', 'largest', 'category_cap', 'category_share'];
const isRec = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function storedRuleOf(x: unknown): StoredRule | null {
  if (!isRec(x)) return null;
  const kind = KINDS.find((k) => k === x.kind);
  const value = x.value;
  if (typeof x.id !== 'string' || x.id === '' || kind === undefined) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
  if (kind === 'category_share' && value > MAX_RULE_PERCENT) return null;
  const categoryId = typeof x.categoryId === 'string' && x.categoryId !== '' ? x.categoryId : null;
  if ((kind === 'category_cap' || kind === 'category_share') && categoryId === null) return null;
  return { id: x.id, kind, on: x.on === true, value, categoryId };
}

/** The rules document inside a custom_options value. Invalid entries, duplicate ids, and entries past the cap are dropped. */
export function readRulesDoc(customOptions: unknown): RulesDoc {
  if (!isRec(customOptions) || !isRec(customOptions.rules) || !Array.isArray(customOptions.rules.rules)) return EMPTY_RULES;
  const seen = new Set<string>();
  const rules: StoredRule[] = [];
  for (const raw of customOptions.rules.rules) {
    const rule = storedRuleOf(raw);
    if (rule === null || seen.has(rule.id) || rules.length >= MAX_OWN_RULES) continue;
    seen.add(rule.id);
    rules.push(rule);
  }
  return { v: 1, rules };
}

/** The new custom_options value: everything already there, with the rules document replaced. */
export function withRulesDoc(customOptions: unknown, doc: RulesDoc): Record<string, unknown> {
  const rest = isRec(customOptions) ? customOptions : {};
  return { ...rest, rules: doc };
}

export function upsertRule(doc: RulesDoc, rule: StoredRule): RulesDoc {
  const has = doc.rules.some((r) => r.id === rule.id);
  if (!has && doc.rules.length >= MAX_OWN_RULES) return doc;
  return { v: 1, rules: has ? doc.rules.map((r) => (r.id === rule.id ? rule : r)) : [...doc.rules, rule] };
}

export function removeRule(doc: RulesDoc, id: string): RulesDoc {
  return { v: 1, rules: doc.rules.filter((r) => r.id !== id) };
}

export function canAddRule(doc: RulesDoc): boolean {
  return doc.rules.length < MAX_OWN_RULES;
}

/** The singleton rules (keep, largest) can be added once each; a category rule can repeat. */
export function kindTaken(doc: RulesDoc, kind: OwnRuleKind): boolean {
  return (kind === 'keep' || kind === 'largest') && doc.rules.some((r) => r.kind === kind);
}

export function newRuleId(kind: OwnRuleKind, doc: RulesDoc): string {
  if (kind === 'keep' || kind === 'largest') return `own_${kind}`;
  let n = doc.rules.length + 1;
  while (doc.rules.some((r) => r.id === `own_${kind}_${n}`)) n += 1;
  return `own_${kind}_${n}`;
}

/** FIN-07: the money-left-each-month line the engine reads. Absent or off = null. */
export function tightLineOf(doc: RulesDoc): number | null {
  const keep = doc.rules.find((r) => r.kind === 'keep' && r.on);
  return keep === undefined ? null : keep.value;
}

/**
 * The own lines in the raw shape the engine builder validates (buildV3Inputs.lineSpecOf). Keep is not a line (it is the tight line),
 * so it is left out here.
 */
export function ownLinesOf(doc: RulesDoc): unknown[] {
  const out: unknown[] = [];
  for (const r of doc.rules) {
    if (r.kind === 'largest') out.push({ id: r.id, on: r.on, spec: { kind: 'single_purchase_cap', cap: r.value } });
    else if (r.kind === 'category_cap') out.push({ id: r.id, on: r.on, spec: { kind: 'category_monthly_cap', categoryId: r.categoryId, cap: r.value } });
    else if (r.kind === 'category_share') out.push({ id: r.id, on: r.on, spec: { kind: 'category_income_share', categoryId: r.categoryId, pct: String(r.value) } });
  }
  return out;
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

/** A change still in force: not deleted, and not ended before this month. */
export function isActiveChange(row: { deleted_at: string | null; end_month: string | null }, thisMonth: string): boolean {
  return row.deleted_at === null && (row.end_month === null || row.end_month >= thisMonth);
}
