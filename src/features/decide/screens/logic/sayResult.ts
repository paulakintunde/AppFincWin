/**
 * 06.1-06 (D-18, UX-19, UX-21): the one path from a v3 Result's codes to the sentences every answer screen shows. Every fact,
 * notice, caveat, basis, next step, missing figure, readiness gap and after-buy line becomes one sentence from the engine's own copy
 * key, its {{placeholders}} filled from the code's values. No prototype words, never two keys joined into one line.
 *
 * Pure: no React and no i18next here. `t` and `exists` are injected (the hook wrapper that binds them is 06.1-14).
 * A code with no key, or a placeholder with no value, is a MissingCopyError: thrown, or handed to `onMissing` and the line dropped.
 * The code itself is never printed.
 */
import {
  AFTER_BUY_KEYS,
  BASIS_KEYS,
  BASIS_REASON_KEYS,
  CAVEAT_FIGURE_KEYS,
  CAVEAT_KEYS,
  CAVEAT_WRONG_FIGURE_KEY,
  COPY_RESOLVERS,
  FACT_KEYS,
  MISSING_KEYS,
  MISSING_VALUE_SOURCE,
  NEXT_STEP_KEYS,
  NOTICE_KEYS,
  READINESS_KEYS,
  type Caveat,
  type Fact,
  type LocalDate,
  type MissingCode,
  type Notice,
  type Result,
} from '@/engine/decide/v3';

/** One sentence: the copy key it was read from, the text, and the engine code behind it. */
export interface Line {
  readonly key: string;
  readonly text: string;
  readonly code: string;
}

export interface SayNames {
  category(id: string): string;
  series(id: string): string;
  account(id: string): string;
  debt(id: string): string;
  envelope(id: string): string;
  /** D-79: a missing figure's code (save_vs_borrow 'ask'), named for "add {{figure}}". */
  figure(code: MissingCode): string;
}

export interface SayDeps {
  /** The copy at `key`. Called with no values it returns the template as written; with values it fills each {{name}} once. */
  t(key: string, values?: Readonly<Record<string, string>>): string;
  exists(key: string): boolean;
  money(minor: number, currency: string): string;
  /** A 'YYYY-MM-DD' date or a 'YYYY-MM' month, as the screen writes it. */
  date(localDate: string): string;
  readonly currency: string;
  /** The check date: a purchase dated today reads "Bought today." (D-42). */
  readonly today: LocalDate;
  readonly names: SayNames;
  /** Set: a line with a gap is dropped and reported here. Unset: the gap throws. */
  onMissing?(error: MissingCopyError): void;
}

export interface SaidResult {
  readonly notices: readonly Line[];
  readonly facts: readonly Line[];
  readonly basis: Line | null;
  readonly caveat: Line | null;
  readonly caveatFigures: readonly Line[];
  readonly nextStep: Line | null;
  readonly missing: readonly Line[];
  readonly readiness: readonly Line[];
  readonly afterBuy: { readonly lead: Line | null; readonly boughtOn: Line | null };
}

export class MissingCopyError extends Error {
  constructor(
    readonly code: string,
    readonly key: string | null,
    detail: string
  ) {
    super(`No copy for ${code}${key === null ? '' : ` (${key})`}: ${detail}`);
    this.name = 'MissingCopyError';
  }
}

type Values = Readonly<Record<string, unknown>>;

// ported from __tests__/reviewed/page.ts (06.1-06), widened with the counts the engine emits as plain numbers.
const PLAIN_NUMBER_KEYS = new Set(['months', 'monthsAfter', 'day', 'count', 'everyMonths', 'days', 'of', 'periods', 'value', 'limit', 'covered', 'times', 'payments', 'share', 'lookedFor']);
/** Every number in a basis sentence is a count of months. */
const ALL_PLAIN = new Set(['months', 'used', 'lookedFor']);
const ISO_DATE = /^\d{4}-\d{2}(-\d{2})?$/;

/** COPY_RESOLVERS read the other way: the placeholder, the id key that fills it, and the name lookup. */
const RESOLVE_BY_PLACEHOLDER: Readonly<Record<string, { readonly id: string; readonly name: keyof SayNames }>> = {
  [COPY_RESOLVERS.categoryId]: { id: 'categoryId', name: 'category' },
  [COPY_RESOLVERS.seriesId]: { id: 'seriesId', name: 'series' },
  [COPY_RESOLVERS.envelopeId]: { id: 'envelopeId', name: 'envelope' },
  [COPY_RESOLVERS.accountId]: { id: 'accountId', name: 'account' },
  [COPY_RESOLVERS.debtId]: { id: 'debtId', name: 'debt' },
  [COPY_RESOLVERS.missing]: { id: 'missing', name: 'figure' },
};
/** Codes whose `account` value is itself an account id (ENG-17 account_no_rate; UX-21 shared_money). */
const ACCOUNT_ID_CODES = new Set(['account_no_rate', 'shared_money']);

/** The value whose text names a fact's or notice's `_variant` copy (the DISCRIMINATOR_KEYS that pick one). */
const VARIANT_BY: Readonly<Record<'fact' | 'notice', Readonly<Record<string, string>>>> = {
  fact: { line_crossed: 'unit', save_vs_borrow: 'kind', ask_debts_not_recorded: 'kind', tight_floor: 'basis', earlier_money_from: 'where', lean_bridge: 'source' },
  notice: { income_from_expected: 'source' },
};

/**
 * The copy key a fact's or notice's values pick, or null when the code has none. A `_variant` that has no copy reads the base
 * (save_vs_borrow 'ready', ask_debts 'all', tight_floor 'tenth', earlier_money_from 'account', lean_bridge 'savings').
 */
export function copyKeyFor(group: 'fact' | 'notice', code: string, v: Values, exists: (key: string) => boolean): string | null {
  const base = group === 'fact' ? (FACT_KEYS as Record<string, string>)[code] : (NOTICE_KEYS as Record<string, string>)[code];
  if (base === undefined) return null;
  const pick = (suffix: string): string => (exists(`${base}_${suffix}`) ? `${base}_${suffix}` : base);
  const by = VARIANT_BY[group][code];
  if (by !== undefined && typeof v[by] === 'string' && !(code === 'save_vs_borrow' && v[by] === 'ready')) return pick(v[by]);
  if (group === 'fact') {
    if (code === 'wait_keeps_net' && v['date'] === undefined) return pick('month');
    if (code === 'overdraft_without_purchase' && v['days'] === 0) return pick('above');
    if (code === 'overdraft_not_cleared' && v['date'] === undefined) return pick('no_pay');
    if ((code === 'overdraft_use' || code === 'overdraft_repeat' || code === 'other_account_overdrawn') && v['rate'] === undefined) return pick('no_rate');
  } else if (code === 'month_heading_short' && v['categoryId'] !== undefined) {
    return pick('category');
  }
  return base;
}

/** One placeholder's text, or undefined when the values cannot fill it. */
function valueFor(p: string, code: string, v: Values, deps: SayDeps, plain: ReadonlySet<string>): string | undefined {
  if (p === 'zero') return deps.money(0, deps.currency);
  const resolver = RESOLVE_BY_PLACEHOLDER[p];
  if (resolver !== undefined && typeof v[resolver.id] === 'string') return deps.names[resolver.name](v[resolver.id] as never);
  const val = v[p];
  if (typeof val === 'number') {
    const asMoney = !plain.has(p) || (code === 'line_crossed' && v['unit'] === 'money');
    return asMoney ? deps.money(val, deps.currency) : String(val);
  }
  if (typeof val !== 'string') return undefined;
  if (p === 'account' && ACCOUNT_ID_CODES.has(code)) return deps.names.account(val);
  return ISO_DATE.test(val) ? deps.date(val) : val;
}

/** The sentence at `key`, each placeholder filled once (T-06.1-06-03: a name holding {{...}} is never filled again). */
function fill(code: string, key: string | null, v: Values, deps: SayDeps, plain: ReadonlySet<string> = PLAIN_NUMBER_KEYS): Line {
  if (key === null || !deps.exists(key)) throw new MissingCopyError(code, key, 'no copy key');
  const filled: Record<string, string> = {};
  for (const [, p] of deps.t(key).matchAll(/\{\{(\w+)\}\}/g)) {
    const text = valueFor(p as string, code, v, deps, plain);
    if (text === undefined) throw new MissingCopyError(code, key, `{{${p as string}}} has no value`);
    filled[p as string] = text;
  }
  return { key, code, text: deps.t(key, filled) };
}

/** One fact or notice as its sentence. */
export function sayCode(group: 'fact' | 'notice', item: Fact | Notice, deps: SayDeps): Line {
  return fill(item.code, copyKeyFor(group, item.code, item.values, deps.exists), item.values, deps);
}

/** Runs one line; with onMissing set, a MissingCopyError drops the line instead of throwing. */
function guard(deps: SayDeps, make: () => Line): Line | null {
  try {
    return make();
  } catch (e) {
    if (!(e instanceof MissingCopyError) || deps.onMissing === undefined) throw e;
    deps.onMissing(e);
    return null;
  }
}

const present = <T>(xs: readonly (T | null)[]): T[] => xs.filter((x): x is T => x !== null);

function basisLine(r: Result, deps: SayDeps): Line {
  const b = r.confidence.basis;
  switch (b.kind) {
    case 'quick_estimates':
      return fill(b.kind, BASIS_KEYS.quick_estimates, {}, deps, ALL_PLAIN);
    case 'partial':
      return fill(b.kind, BASIS_KEYS.partial, { used: b.used, lookedFor: b.lookedFor }, deps, ALL_PLAIN);
    case 'records':
      return fill(b.kind, BASIS_KEYS.records, { months: b.months, date: b.upTo }, deps, ALL_PLAIN);
    case 'records_with_reason':
      return fill(b.kind, (BASIS_REASON_KEYS as Readonly<Record<string, string>>)[b.reason] ?? null, { months: b.months, date: b.upTo }, deps, ALL_PLAIN);
  }
}

/** A question's copy reads its values from the notice MISSING_VALUE_SOURCE names (D-48, D-49, D-54, D-58). */
function missingLine(code: MissingCode, r: Result, deps: SayDeps): Line {
  const base = (MISSING_KEYS as Readonly<Record<string, string>>)[code] ?? null;
  const source = (MISSING_VALUE_SOURCE as Readonly<Record<string, string>>)[code];
  const values = r.notices.find((n) => n.code === source)?.values ?? {};
  const has = (c: string): boolean => r.notices.some((n) => n.code === c);
  // D-62: only the safety net's account is unstated, so the question asks which account holds it.
  const fund = code === 'account_use_question' && has('fund_account_unknown') && !has('account_use_unknown');
  return fill(code, fund ? `${base as string}_fund` : base, values, deps);
}

function caveatLines(caveat: Caveat | undefined, deps: SayDeps): { caveat: Line | null; figures: Line[] } {
  if (caveat === undefined) return { caveat: null, figures: [] };
  const line = guard(deps, () => fill(caveat.code, CAVEAT_KEYS[caveat.code], caveat.values, deps));
  if (caveat.code !== 'large_for_month' || line === null) return { caveat: line, figures: [] };
  // CO-D-118: one line per figure it carries (costs is absent when the usual month is not known), then the one line under them.
  const figures = (Object.keys(CAVEAT_FIGURE_KEYS) as (keyof typeof CAVEAT_FIGURE_KEYS)[])
    .filter((k) => caveat.values[k] !== undefined)
    .map((k) => guard(deps, () => fill(caveat.code, CAVEAT_FIGURE_KEYS[k], caveat.values, deps)));
  return { caveat: line, figures: present([...figures, guard(deps, () => fill(caveat.code, CAVEAT_WRONG_FIGURE_KEY, {}, deps))]) };
}

function afterBuyLead(r: Result, deps: SayDeps): Line | null {
  // A not-ready result or an ask is never a verdict (D-52), so it has no after-buy figure to lead with.
  if (r.code === 'needs_input' || r.readiness?.ready === false) return null;
  const a = r.afterBuy;
  const usual = a.lead === 'usualMonth' && a.usualMonth !== null;
  const amount = usual ? (a.usualMonth as number) : a.month;
  const name = usual ? (amount < 0 ? 'usualMonthOver' : 'usualMonth') : amount < 0 ? 'monthOver' : 'month';
  // D-116: below 0 reads "about $X short", so the figure is said without its sign.
  return fill(`afterBuy.${name}`, AFTER_BUY_KEYS[name], { amount: Math.abs(amount), monthName: a.monthName }, deps);
}

/** The whole Result as sentences, in reading order. */
export function sayResult(r: Result, deps: SayDeps): SaidResult {
  const g = (make: () => Line): Line | null => guard(deps, make);
  // CO-D-113: unsaved_changes is always the first notice; the rest keep the engine's order.
  const notices = [...r.notices.filter((n) => n.code === 'unsaved_changes'), ...r.notices.filter((n) => n.code !== 'unsaved_changes')];
  const noticeLines = present(notices.map((n) => g(() => sayCode('notice', n, deps))));
  // FIN-01..FIN-15: facts in the engine's order, never re-sorted (net lines and free help sit where the engine put them).
  const factLines = present(r.facts.map((f) => g(() => sayCode('fact', f, deps))));
  const basis = g(() => basisLine(r, deps));
  // CO-D-119: only the first caveat shows under the answer; the About sheet lists them all.
  const { caveat, figures } = caveatLines(r.caveats?.[0], deps);
  const step = r.confidence.nextStep;
  const nextStep = step === null ? null : g(() => fill(step.step, NEXT_STEP_KEYS[step.step], {}, deps));
  const missing = present(r.missing.map((m) => g(() => missingLine(m, r, deps))));
  const readiness = present((r.readiness?.missing ?? []).map((c) => g(() => fill(c, (READINESS_KEYS as Readonly<Record<string, string>>)[c] ?? null, {}, deps))));
  const lead = g(() => afterBuyLead(r, deps) as Line);
  // D-42: when it is to be bought, on every answer.
  const today = r.purchaseDate === deps.today;
  const boughtOn = g(() => fill(today ? 'afterBuy.boughtToday' : 'afterBuy.boughtOn', today ? AFTER_BUY_KEYS.boughtToday : AFTER_BUY_KEYS.boughtOn, { date: r.purchaseDate }, deps));
  return { notices: noticeLines, facts: factLines, basis, caveat, caveatFigures: figures, nextStep, missing, readiness, afterBuy: { lead, boughtOn } };
}
