/**
 * 05.4-08 (D-14): the changed-answers page. Pure string building from the corpus and the changes list, so the write test and the
 * read-only page mode share it. Each changed check shows the person's situation, read straight from the engine inputs (no prose
 * written by hand). Test-only; everyone here is synthetic. No scripts in the page.
 *
 * 05.4-18 audit (D-53, D-54, D-55): every change also shows the full breakdown (money in, spent, still to come, each with its
 * date; left before and after; account figures with what each one means; the safety net and its starter; debts; plan terms with
 * the rate as a real percent; the 90-day low point and its date) and the step-by-step sum that reaches the engine's answer, then
 * an Audit box (right answer, verdict, cause, notes, D-54 lines) read from audit.json.
 */
import en from '../../../../../i18n/locales/en';
import { PERCENT_SCALE } from '../../../../payoff/types';
import { applyPurchaseFlows } from '../../cash/path';
import { addDays, daysInYearMonth, yearMonthOf } from '../../dates';
import { debtOutflows, debtsInMonth } from '../../debts';
import { essentialCosts, essentialSpendingOf } from '../../essentialCosts';
import { firstPaymentsToday, purchaseCashFlows } from '../../judge/purchase';
import { planTotal } from '../../depletion';
import { liveSeriesOf, seriesOccurrences } from '../../month/series';
import { FACT_KEYS, NOTICE_KEYS } from '../../copy/verdictTable';
import { evaluate } from '../../evaluate';
import { judgeCheck, prepare, type Evaluation } from '../../prepare';
import type { CheckV2, Fact, FundingSource, LocalDate, Notice, V3Debt, V3Inputs, V3Series } from '../../types';
import { loadCases } from '../rightAnswers/loader';
import { toEngineInputs } from '../rightAnswers/fixture';
import auditFile from './audit.json';
import type { CorpusCase, ReviewedAnswer, ReviewedChange } from './corpus';

const LABEL: Record<string, string> = {
  fits_month: 'Fits',
  fits_unspent: 'Fits from spare money',
  emergency_use: 'Dips into your safety net',
  fits_uses_net: 'Dips into your safety net',
  fits_uses_overdraft: 'Uses your overdraft',
  fits_by_borrowing: 'Only by borrowing', // 05.4-22 (FIN-05)
  monthly_short: 'Short each month',
  not_yet: 'Not yet',
  needs_input: 'Needs a figure first',
};
// The CODE_PRECEDENCE order (05.4-18 adds fits_uses_net next to the stored-only emergency_use).
// 05.4-22 (FIN-05): fits_by_borrowing sits between fits_uses_overdraft and monthly_short.
const RANK: Record<string, number> = { fits_month: 0, fits_unspent: 1, fits_uses_net: 2, emergency_use: 3, fits_uses_overdraft: 4, fits_by_borrowing: 4.5, monthly_short: 5, not_yet: 6, needs_input: 7 };
const VARIANT: Record<string, string> = {
  payday: 'payday',
  not_covered: 'not covered',
  low_month: 'low month',
  not_cleared: 'past payday',
  no_net: 'but no safety net',
  small_net: 'but your safety net is small',
  protection_off: 'protection off',
  costly_debt: 'but you carry costly debt',
};

/** D-63 / D-65: the headline words when the usual month is already short (the owner's wording, en.ts decide.v3.verdict chips). */
const TIER_WORDS: Record<string, string> = {
  month_already_short: 'No: your month is already short',
  month_short_small: 'Fits, but your month is already short',
  month_short_moderate: 'Fits from spare money, but your month is already short',
  month_short_moderate_extra: 'Fits from extra savings, but your month is already short',
};

export const words = (a: ReviewedAnswer): string => {
  const code = LABEL[a.code] ?? a.code;
  // D-62, D-63 and D-65 headlines have their own words; the code the engine gives is kept in brackets for D-63 and D-65.
  const tier = a.variant === null ? undefined : TIER_WORDS[a.variant];
  // 05.4-20 (D-39b): "Fits, but you carry costly debt" on fits_unspent.
  // 05.4-21 (FIN-07, D-40): "Fits, but tight" ("each month" on a plan; the page's tight step says which).
  // 05.4-22 (FIN-05, D-39a): "Fits, but borrowing costs more" on fits_by_borrowing.
  const own =
    a.variant === 'extra_savings'
      ? 'Fits from extra savings'
      : a.variant === 'costly_debt'
        ? 'Fits, but you carry costly debt'
        : a.variant === 'tight'
          ? 'Fits, but tight'
          : a.variant === 'borrowing_costs_more'
            ? 'Fits, but borrowing costs more'
            : null;
  const base = tier !== undefined ? `${tier} (code: ${code})` : own !== null ? `${own} (code: ${code})` : code;
  const v = a.variant === null || tier !== undefined || own !== null ? '' : ` (${VARIANT[a.variant] ?? a.variant})`;
  const left = a.afterBuyMonth === null ? '' : `, ${(a.afterBuyMonth / 100).toFixed(2)} left that month`;
  return `${base}${v}${left}`;
};
export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const group = (b: ReviewedAnswer, a: ReviewedAnswer): 'stricter' | 'looser' | 'detail' => {
  const rb = RANK[b.code] ?? 99;
  const ra = RANK[a.code] ?? 99;
  return ra > rb ? 'stricter' : ra < rb ? 'looser' : 'detail';
};

function money(minor: number, currency: string): string {
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = ({ USD: '$', CAD: '$', GBP: '£', EUR: '€' } as Record<string, string>)[currency] ?? `${currency} `;
  return `${minor < 0 ? '-' : ''}${symbol}${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * D-53: a stored rate (Percent, a bigint scaled by PERCENT_SCALE = 10^10, so 7.9% is 79000000000n) as a real percent, e.g. "7.9%".
 * A value outside 0-100% is refused, so a scale slip can never reach the page again.
 */
export function rateText(r: bigint | null | undefined): string {
  if (r === null || r === undefined) return '';
  const v = Number(r) / Number(PERCENT_SCALE);
  if (!(v >= 0 && v <= 100)) throw new RangeError(`rateText: ${String(r)} is ${v}%, outside 0-100%`);
  return `${String(Math.round(v * 100) / 100)}%`;
}

const MS_DAY = 86400000;
const parse = (d: LocalDate): number => Date.parse(`${d}T00:00:00Z`);
const fmt = (t: number): string => new Date(t).toISOString().slice(0, 10);
function addMonths(t: number, n: number): number {
  const d = new Date(t);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const day = d.getUTCDate();
  const last = new Date(Date.UTC(Math.floor(total / 12), (total % 12) + 1, 0)).getUTCDate();
  return Date.UTC(Math.floor(total / 12), total % 12, Math.min(day, last));
}
function nextOnOrAfter(anchor: LocalDate, unit: 'week' | 'month', step: number, asOf: LocalDate): string {
  let t = parse(anchor);
  const end = parse(asOf);
  if (unit === 'week') {
    const len = 7 * step * MS_DAY;
    if (t < end) t += Math.ceil((end - t) / len) * len;
    return fmt(t);
  }
  let k = 0;
  while (t < end && k < 2400) {
    k += step;
    t = addMonths(parse(anchor), k);
  }
  return fmt(t);
}
const every = (u: 'week' | 'month', n: number): string => (n === 1 ? `every ${u}` : `every ${n} ${u}s`);
const monthlyOf = (amount: number, u: 'week' | 'month', n: number): number => (u === 'week' ? Math.round((amount * 52) / 12 / n) : Math.round(amount / n));

type Use = NonNullable<NonNullable<V3Inputs['accounts']>[number]['use']>;
function accountUseWords(use: Use | null): string {
  if (use === null) return 'use not said yet';
  if (use.kind === 'everyday') return 'everyday spending money';
  if (use.kind === 'untouched') return 'left alone';
  if (use.kind === 'mixed') return 'mixed use';
  return use.purpose.kind === 'emergency' ? 'safety net money' : 'set aside for a goal';
}

/** Situation rows as [label, text] pairs, from the inputs and the check. Empty fields are skipped. */
export function situationRows(inputs: V3Inputs, check: CheckV2): [string, string][] {
  const cur = inputs.currency;
  const m = (n: number): string => money(n, cur);
  const rows: [string, string][] = [['Currency', cur]];
  const pay = inputs.series.find((s) => s.role === 'pay' && s.status === 'live');
  if (pay) rows.push(['Pay', `${m(pay.amount)} ${every(pay.cadence.unit, pay.cadence.every)}, next on ${nextOnOrAfter(pay.anchorDate, pay.cadence.unit, pay.cadence.every, inputs.asOf)}`]);
  const bills = inputs.series.filter((s) => s.role === 'bill' && s.status === 'live');
  if (bills.length > 0) rows.push(['Usual bills a month', m(bills.reduce((a, s) => a + monthlyOf(s.amount, s.cadence.unit, s.cadence.every), 0))]);
  const fullMonths = inputs.months.filter((x) => x.full);
  const spend = (lines: V3Inputs['months'][number]['lines']): number => lines.filter((l) => l.role === 'spending' && l.status === 'paid' && l.seriesId === null).reduce((a, l) => a + l.amount, 0);
  if (inputs.everydayOverride !== null) rows.push(['Usual everyday spending a month', m(inputs.everydayOverride)]);
  else if (fullMonths.length > 0) rows.push(['Average everyday spending a month (the engine uses its own typical figure)', `about ${m(Math.round(fullMonths.reduce((a, x) => a + spend(x.lines), 0) / fullMonths.length))}`]);
  const thisMonth = inputs.months.find((x) => x.month === inputs.asOf.slice(0, 7));
  if (thisMonth) {
    const paid = thisMonth.lines.filter((l) => l.status === 'paid' && l.date <= inputs.asOf);
    const received = paid.filter((l) => l.role === 'income').reduce((a, l) => a + l.amount, 0);
    const billsPaid = paid.filter((l) => l.role === 'spending' && l.seriesId !== null).reduce((a, l) => a + l.amount, 0);
    const everyday = paid.filter((l) => l.role === 'spending' && l.seriesId === null).reduce((a, l) => a + l.amount, 0);
    const parts = [received > 0 ? `received ${m(received)}` : '', billsPaid > 0 ? `bills paid ${m(billsPaid)}` : '', everyday > 0 ? `everyday so far ${m(everyday)}` : ''].filter((p) => p !== '');
    if (parts.length > 0) rows.push(['This month so far', parts.join(', ')]);
  }
  if (inputs.accounts && inputs.accounts.length > 0) {
    for (const a of inputs.accounts) {
      const od = a.overdraftLimit === null || a.overdraftLimit === undefined ? '' : `, overdraft limit ${m(a.overdraftLimit)}${a.overdraftRate ? ` at ${rateText(a.overdraftRate)}` : ''}`;
      rows.push([`Account ${a.id}`, `${m(a.balance)} on ${inputs.asOf}${od}; ${accountUseWords(a.use)}`]);
    }
  } else rows.push(['Money in the bank', `${m(inputs.balance)} on ${inputs.asOf}`]);
  const net = inputs.safetyNet;
  if (net) rows.push(['Safety net', `${net.protect ? 'protected' : 'protection off'}, saved ${m(net.saved)}${net.size === null ? ', starter size' : `, size ${m(net.size)}`}`]);
  else if (inputs.emergency) rows.push(['Safety net', `saved ${m(inputs.emergency.amount)}, protected`]);
  for (const d of inputs.debts) rows.push([`Debt (${d.kind})`, `owes ${m(d.balance)}, minimum ${m(d.minimum)} a month${d.apr ? `, ${rateText(d.apr)} a year` : ''}`]);
  if (inputs.months.length > 0) rows.push(['Months of history', String(fullMonths.length)]);
  rows.push(['Buying', check.price === null ? 'no price yet' : m(check.price)]);
  const share = priceShareOfPay(inputs, check);
  if (share !== null) rows.push(['Price against pay (D-69)', share]);
  if (check.taxPercent) rows.push(['Tax', rateText(check.taxPercent)]);
  if (check.oneOffFees) rows.push(['Fees', m(check.oneOffFees)]);
  if (check.pay.mode === 'plan') {
    const p = check.pay;
    const n = p.count ?? p.termMonths;
    rows.push(['Paying', `in a plan${n === null ? '' : `, ${n} payment${n === 1 ? '' : 's'} ${every(p.cadence.unit, p.cadence.every)}`}${p.apr ? ` at ${rateText(p.apr)} a year` : ''}${p.deposit ? `, deposit ${m(p.deposit)}` : ''}`]);
    if (p.firstPayment) rows.push(['First payment', p.firstPayment.kind === 'today' ? 'today' : p.firstPayment.kind === 'one_period' ? 'one period from today' : p.firstPayment.firstDate]);
  } else rows.push(['Paying', 'in cash, all at once']);
  rows.push(['Check date', inputs.asOf]);
  return rows;
}

/**
 * 05.4-56 (D-69): the monthly pay the shadow generator ties the price to (the same base its costs use): the live pay series as a
 * month, or a freelancer's stated steady amount. Null when neither is known.
 */
export function monthlyPayOf(inputs: V3Inputs): { amount: number; which: string } | null {
  const pay = inputs.series.find((s) => s.role === 'pay' && s.status === 'live');
  if (pay) return { amount: monthlyOf(pay.amount, pay.cadence.unit, pay.cadence.every), which: 'pay' };
  const steady = inputs.profile?.steady ?? null;
  if (steady !== null && steady > 0) return { amount: steady, which: "a freelancer's steady amount" };
  return null;
}

/** "Price $X is Y% of monthly pay $Z (pay)": Y a real percent to 2 decimals (D-69). Null without a price or a pay base. */
export function priceShareOfPay(inputs: V3Inputs, check: CheckV2): string | null {
  const base = monthlyPayOf(inputs);
  if (base === null || base.amount <= 0 || check.price === null) return null;
  const pct = (check.price * 100) / base.amount;
  return `Price ${money(check.price, inputs.currency)} is ${pct.toFixed(2)}% of monthly pay ${money(base.amount, inputs.currency)} (${base.which})`;
}

/** A plan's length in whole months from its payment count and how often it is paid. */
export function termMonthsOf(count: number, unit: 'week' | 'month', every: number): number {
  return unit === 'month' ? count * every : Math.round((count * every * 12) / 52);
}

export function situationHtml(c: CorpusCase): string {
  const rows = situationRows(c.inputs, c.check).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  return `<table>${rows}</table>`;
}

// ---------------------------------------------------------------- D-53 / D-55 breakdown

export interface AuditEntry {
  readonly right: string;
  readonly rightCode: string;
  readonly rightVariant?: string;
  readonly verdict: string;
  readonly cause: string;
  readonly notes: readonly string[];
  readonly d54?: readonly string[];
}
const AUDIT = auditFile as unknown as Record<string, AuditEntry>;
export const auditOf = (key: string): AuditEntry | null => AUDIT[key] ?? null;

type Section = { readonly title: string; readonly rows: [string, string][] };
const seriesName = (s: V3Series): string => s.name ?? s.id;

function isSpendingAccount(use: Use | null): boolean {
  return use === null || use.kind === 'everyday' || use.kind === 'mixed';
}

/** The facts of an evaluation by code (first one wins). */
const factOf = (ev: Evaluation, code: string): Record<string, unknown> | null => {
  const f = ev.result.facts.find((x) => x.code === code);
  return f === undefined ? null : (f.values as Record<string, unknown>);
};

// ---------------------------------------------------------------- the answer's facts and notices (en.ts wording)

type Values = Record<string, unknown>;
const PLAIN_NUMBER_KEYS = new Set(['months', 'monthsAfter', 'day', 'count', 'everyMonths', 'days', 'of', 'periods', 'value', 'limit']);
const DATE_KEYS = new Set(['date', 'dueDate']);
/** COPY_RESOLVERS: the id a value carries and the placeholder the copy reads. */
const RESOLVED: Record<string, string> = { categoryId: 'category', seriesId: 'bill', envelopeId: 'envelope', accountId: 'account' };

/** The en.ts string at a dotted path, or null. */
function copyAt(path: string): string | null {
  let cur: unknown = en;
  for (const k of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  return typeof cur === 'string' ? cur : null;
}

/** The `_variant` copy a code's values pick (the UI's own choice, restated for the page). */
function copyKeyFor(group: 'fact' | 'notice', code: string, v: Values): string {
  const base = group === 'fact' ? (FACT_KEYS as Record<string, string>)[code] : (NOTICE_KEYS as Record<string, string>)[code];
  if (base === undefined) return `decide.v3.${group}.${code}`;
  const pick = (suffix: string): string => (copyAt(`${base}_${suffix}`) === null ? base : `${base}_${suffix}`);
  if (group === 'fact') {
    if (code === 'line_crossed' && typeof v['unit'] === 'string') return pick(v['unit']);
    if (code === 'wait_keeps_net' && v['date'] === undefined) return pick('month');
    if (code === 'overdraft_without_purchase' && v['days'] === 0) return pick('above');
    if (code === 'overdraft_not_cleared' && v['date'] === undefined) return pick('no_pay');
    if (['overdraft_use', 'overdraft_repeat', 'other_account_overdrawn'].includes(code) && v['rate'] === undefined) return pick('no_rate');
  } else {
    if (code === 'month_heading_short' && v['categoryId'] !== undefined) return pick('category');
    if (code === 'income_from_expected' && typeof v['source'] === 'string') return pick(v['source']);
  }
  return base;
}

/** One fact or notice in the app's own words, every {{key}} filled. A missing copy key prints `code { json }`. */
export function sayLine(group: 'fact' | 'notice', item: Fact | Notice, inputs: V3Inputs): string {
  const v = item.values as Values;
  const key = copyKeyFor(group, item.code, v);
  const text = copyAt(key);
  if (text === null) return `${item.code} ${JSON.stringify(v)}`;
  const names = new Map(inputs.series.map((s) => [s.id, s.name ?? s.id]));
  const filled: Values = {};
  for (const [k, val] of Object.entries(v)) {
    const placeholder = RESOLVED[k];
    if (placeholder !== undefined) filled[placeholder] = k === 'seriesId' ? (names.get(String(val)) ?? String(val)) : String(val);
    else filled[k] = val;
  }
  let missing = false;
  const out = text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => {
    const val = filled[k];
    if (k === 'zero') return money(0, inputs.currency);
    if (val === undefined || val === null) {
      missing = true;
      return `{${k}?}`;
    }
    const asMoney = !PLAIN_NUMBER_KEYS.has(k) || (item.code === 'line_crossed' && v['unit'] === 'money');
    if (typeof val === 'number') return asMoney ? money(val, inputs.currency) : String(val);
    if (DATE_KEYS.has(k)) return String(val);
    return String(val);
  });
  return missing ? `${out} (${item.code} ${JSON.stringify(v)})` : out;
}

const SAYS = 'What the answer says';
const SPLIT_LABEL: Record<FundingSource, string> = {
  month: 'This month',
  envelope: 'Its own envelope',
  unspent_earlier: 'Spare money (everyday account, earlier months)',
  extra_savings: "Extra savings (above the safety net's size)",
  emergency: 'Safety net (protected part, unlocked)',
};

/** Every breakdown section for one check, from the inputs and the engine's own reading. */
export function breakdown(c: CorpusCase): { sections: Section[]; steps: string[] } {
  const inputs = c.inputs;
  const cur = inputs.currency;
  const m = (n: number): string => money(n, cur);
  const asOf = inputs.asOf;
  const ym = yearMonthOf(asOf);
  const monthEnd = `${ym}-${String(daysInYearMonth(ym)).padStart(2, '0')}`;
  const nextFirst = addDays(monthEnd, 1);
  const p = prepare(inputs);
  const ev = judgeCheck(p, c.check);
  const r = p.readings[0] as (typeof p.readings)[number];
  const mo = ev.month;
  const net = ev.net;
  const thisMonth = inputs.months.find((x) => x.month === ym);
  const lines = thisMonth?.lines ?? [];
  const paidSeries = new Set(lines.filter((l) => l.status === 'paid' && l.seriesId !== null).map((l) => l.seriesId as string));
  const sections: Section[] = [];

  sections.push({ title: 'Check date', rows: [['Check date', `${asOf}. Every balance below is the balance on this date (the engine reads accounts[].balance and balance as of the check date).`]] });

  // Money in this month
  const inRows: [string, string][] = [];
  for (const l of lines.filter((x) => x.role === 'income' && x.status === 'paid')) inRows.push([`Received ${l.date}`, m(l.amount)]);
  const payLater: { date: string; amount: number }[] = [];
  for (const s of liveSeriesOf(inputs.series, asOf, 'pay')) {
    for (const d of seriesOccurrences(s, addDays(asOf, 1), nextFirst)) if (!paidSeries.has(s.id)) payLater.push({ date: d, amount: s.amount });
  }
  const hp = r.hp;
  const histThisMonth = hp === null || hp.amount <= 0 ? [] : hp.dates.filter((d) => d > asOf && d < nextFirst);
  for (const x of payLater) inRows.push([`Pay expected ${x.date}`, m(x.amount)]);
  for (const d of histThisMonth) {
    payLater.push({ date: d, amount: hp?.amount ?? 0 });
    inRows.push([`Pay expected ${d} (from history, D-52)`, m(hp?.amount ?? 0)]);
  }
  if (liveSeriesOf(inputs.series, asOf, 'pay').length === 0) {
    inRows.push([
      'Pay series',
      hp === null
        ? 'none: the engine expects no more pay'
        : `none scheduled; from ${hp.months} months of history the engine expects ${m(hp.amount)} (the lowest month) around day ${hp.day} of each month (D-52)`,
    ]);
  }
  inRows.push(['Engine: money in this month', m(mo.moneyIn)]);
  sections.push({ title: 'Money in this month', rows: inRows });

  // Already spent
  const spentRows: [string, string][] = [];
  const byId = new Map(inputs.series.map((s) => [s.id, s]));
  const everydayLines = lines.filter((l) => l.status === 'paid' && l.role === 'spending' && l.seriesId === null);
  for (const l of lines.filter((x) => x.status === 'paid' && x.seriesId !== null && x.role !== 'income')) {
    const s = byId.get(l.seriesId as string);
    const kind = l.role === 'saved_invested' ? 'Saved' : 'Bill paid';
    spentRows.push([`${kind} ${l.date}`, `${s ? seriesName(s) : (l.seriesId as string)}: ${m(l.amount)}`]);
  }
  if (everydayLines.length > 0) {
    const dates = everydayLines.map((l) => l.date).sort();
    spentRows.push([`Everyday ${dates[0]} to ${dates[dates.length - 1]}`, m(everydayLines.reduce((a, l) => a + l.amount, 0))]);
  }
  if (spentRows.length === 0) spentRows.push(['Nothing yet', m(0)]);
  sections.push({ title: 'Already spent this month', rows: spentRows });

  // Still to come this month
  const dueRows: { date: string; row: [string, string] }[] = [];
  let billsToCome = 0;
  let savingToCome = 0;
  const promisedBeforePay: number[] = [];
  const nextPay = r.payDate;
  for (const role of ['bill', 'debt_payment', 'saving'] as const) {
    for (const s of liveSeriesOf(inputs.series, asOf, role)) {
      for (const d of seriesOccurrences(s, `${ym}-01`, nextFirst)) {
        if (paidSeries.has(s.id)) continue;
        const label = role === 'saving' ? 'Saving' : role === 'bill' ? 'Bill' : 'Debt payment';
        dueRows.push({ date: d, row: [`${label} ${d}${d <= asOf ? ' (due, not yet recorded)' : ''}`, `${seriesName(s)}: ${m(s.amount)}`] });
        if (role === 'saving') savingToCome += s.amount;
        else {
          billsToCome += s.amount;
          if (nextPay === null || d < nextPay) promisedBeforePay.push(s.amount);
        }
      }
    }
  }
  // 05.4-20 (FIN-04): card and loan minimums still to come this month, on their dates (a minimum paid through a series is above).
  let debtsToCome = 0;
  const debtNow = debtOutflows(inputs, lines, 90).flows.filter((f) => f.date < nextFirst);
  for (const f of debtNow) {
    dueRows.push({ date: f.date, row: [`Debt minimum ${f.date}${inputs.debts.find((d) => d.id === f.debtId)?.dueDay == null ? ' (no due day set: tomorrow, DB-02)' : ''}`, `${f.debtId}: ${m(f.amount)}`] });
    debtsToCome += f.amount;
    if (nextPay === null || f.date < nextPay) promisedBeforePay.push(f.amount);
  }
  const toCome: [string, string][] = dueRows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((x) => x.row);
  toCome.push([`Everyday spending ${asOf} to ${monthEnd}`, `${m(mo.erest)} (engine estimate from the usual ${m(mo.e ?? 0)} a month)`]);
  sections.push({ title: 'Still to come this month', rows: toCome });

  // This month, before and after
  const left = factOf(ev, 'month_left_after');
  const monthRows: [string, string][] = [
    ['Engine: money out this month (bills, everyday, set aside)', m(mo.moneyOut)],
    ['Left this month before the purchase', m(mo.monthLeft)],
  ];
  if (left !== null) monthRows.push(['Left this month after the purchase (engine)', m(left['left'] as number)]);
  else if (c.check.pay.mode === 'plan' && ev.planCard !== null) monthRows.push(['Left this month after the purchase', `${m(mo.monthLeft)}: nothing is paid this month; the first payment is on ${ev.planCard.firstDate}`]);
  monthRows.push(['Usual month leaves', mo.typicalLeft === null ? 'not known' : m(mo.typicalLeft)]);
  sections.push({ title: 'This month', rows: monthRows });

  // Accounts (D-55)
  const acctRows: [string, string][] = [];
  const accounts = inputs.accounts ?? [];
  const spendingAccounts = accounts.filter((a) => isSpendingAccount(a.use));
  const envelopesIn = inputs.envelopes.reduce((a, e) => a + e.saved, 0);
  const promised = promisedBeforePay.reduce((a, n) => a + n, 0);
  const payToCome = payLater.reduce((a, x) => a + x.amount, 0);
  const spendBalance = accounts.length === 0 ? inputs.balance : spendingAccounts.reduce((a, x) => a + x.balance, 0);
  const unusedOd = spendingAccounts.reduce((a, x) => a + Math.max(0, (x.overdraftLimit ?? 0) - Math.max(0, -x.balance)), 0);
  const afterBills = spendBalance - envelopesIn - promised;
  const monthEndExpected = spendBalance - envelopesIn + payToCome - billsToCome - debtsToCome - mo.erest - savingToCome;
  for (const a of accounts) {
    acctRows.push([`${a.id}: balance on ${asOf}`, `${m(a.balance)} (${accountUseWords(a.use)})`]);
    if (!isSpendingAccount(a.use) && a.use !== null && a.use.kind === 'dedicated' && a.use.purpose.kind === 'emergency') {
      acctRows.push([`${a.id}: saved in it`, `${m(a.balance)}; kept apart from "after bills due before payday"`]);
    }
  }
  if (accounts.length === 0) acctRows.push([`Balance on ${asOf}`, m(inputs.balance)]);
  const which = spendingAccounts.length > 1 ? 'spending accounts together' : (spendingAccounts[0]?.id ?? 'the account');
  if (envelopesIn > 0) acctRows.push([`In pots inside ${which}`, `${m(envelopesIn)}; kept apart`]);
  acctRows.push([`Balance on ${asOf} (${which})`, `${m(spendBalance)}: what is in the account that day`]);
  acctRows.push([
    `After bills due before payday (${which}, D-57)`,
    `${m(afterBills)} = balance ${m(spendBalance)}${envelopesIn > 0 ? ` - pots ${m(envelopesIn)}` : ''} - bills${debtsToCome > 0 ? ' and debt minimums' : ''} due before the next pay${nextPay === null ? ' (no pay date)' : ` on ${nextPay}`} ${m(promised)}`,
  ]);
  acctRows.push(['Unused overdraft (its own line, not counted above, D-57)', m(unusedOd)]);
  acctRows.push([
    `Expected at month end, ${monthEnd} (${which})`,
    `${m(monthEndExpected)} = ${m(spendBalance - envelopesIn)} + pay still to come ${m(payToCome)} - bills still to come ${m(billsToCome)}${debtsToCome > 0 ? ` - debt minimums still to come ${m(debtsToCome)}` : ''} - everyday ${m(mo.erest)} - saving ${m(savingToCome)}`,
  ]);
  if (ev.funds.unspent !== null) acctRows.push(['Confirmed spare figure (unspent)', `${m(ev.funds.unspent.value)}${ev.funds.unspent.drifted ? ' (the engine flags it as drifted from the account)' : ''}`]);
  sections.push({ title: 'Accounts (D-55)', rows: acctRows });

  // Safety net
  const netRows: [string, string][] = [];
  const ec = essentialCosts(mo, debtsInMonth(inputs.debts, inputs.series, asOf), essentialSpendingOf(inputs, mo));
  netRows.push(['Starter (D-51)', `${m(ec.parts.bills)} bills + ${m(ec.parts.essentialSpending)} essential spending + ${m(ec.parts.debtMinimums)} debt minimums, rounded up = ${m(ec.total)}`]);
  if (net !== undefined) {
    netRows.push(['Saved in it', `${m(net.saved)}; kept apart from "after bills due before payday"`]);
    netRows.push(['Size', `${m(net.size)}${inputs.safetyNet?.size == null ? ' (the starter; no size set)' : ''}`]);
    netRows.push(['State', `${net.off ? 'protection off' : 'protected'}; ${net.state === 'none' ? 'nothing saved' : net.state === 'small' ? 'below its size' : net.state === 'full' ? 'at its size' : 'above its size'}`]);
    netRows.push(['Protected part', m(net.floor)]);
    netRows.push(['Saved above the size (extra savings, D-56)', m(net.aboveSize)]);
    netRows.push(['Locked', net.locked ? 'locked: left out of the answer (D-61)' : 'unlocked: may lend (D-61)']);
    netRows.push(['May lend this purchase', `${m(net.usable)}${net.locked ? ' (0 while locked)' : ''}`]);
  }
  sections.push({ title: 'Safety net', rows: netRows });

  // The answer as the app gives it: split and every fact and notice (en.ts wording)
  const res = evaluate(inputs, c.check).result;
  sections.push({
    title: 'Split',
    rows: res.split.length === 0 ? [['No split', 'the answer pays nothing from any source']] : res.split.map((x): [string, string] => [SPLIT_LABEL[x.source] ?? x.source, m(x.amount)]),
  });
  const says: [string, string][] = [['Headline', words({ code: res.code, variant: res.variant, afterBuyMonth: null })]];
  for (const f of res.facts) says.push([`Fact ${f.code}`, sayLine('fact', f, inputs)]);
  for (const n of res.notices) says.push([`Notice ${n.code}`, sayLine('notice', n, inputs)]);
  sections.push({ title: SAYS, rows: says });

  // Debts (05.4-20: FIN-04, FIN-10, FIN-14)
  if (inputs.debts.length > 0) sections.push({ title: 'Debts', rows: debtRows(inputs, m) });

  // Plan terms
  if (c.check.pay.mode === 'plan' && ev.planCard !== null) {
    const pc = ev.planCard;
    const pay = c.check.pay;
    const borrowed = pc.price + pc.tax + pc.oneOffFees - pay.deposit - pay.tradeIn;
    sections.push({
      title: 'Plan',
      rows: [
        ['In brief', planLine(pc, pay.apr)],
        ['Price', m(pc.price)],
        ['Deposit today', m(pay.deposit)],
        ['Rate', pay.apr === null ? 'not given' : `${rateText(pay.apr)} a year`],
        ['Payments', `${pc.lines.map((x) => `${x.count} x ${m(x.amount)}`).join(' + ')}, ${every(pc.cadence.unit, pc.cadence.every)}`],
        ['About a month', m(pc.monthlyEquivalent)],
        ['First and last payment', `${pc.firstDate} to ${pc.endDate}`],
        ['Total interest', `${m(pc.interest)}${borrowed > 0 ? ` (${Math.round((pc.interest * 100) / borrowed)}% of the ${m(borrowed)} borrowed)` : ''}`],
        ['Total paid', m(pc.total)],
      ],
    });
  }

  // 90-day cash path
  const opening = ev.funds.spending + ev.funds.ownEnvelope + (net?.aboveSize ?? 0);
  const usable = net?.usable ?? 0;
  const flows = ev.purchase ? purchaseCashFlows(ev.purchase, asOf, r.open.days) : [];
  const withP = applyPurchaseFlows(r.open, opening as never, flows);
  const without = applyPurchaseFlows(r.open, opening as never, []);
  const low = (pts: typeof withP.points): (typeof withP.points)[number] => pts.reduce((a, b) => (b.balance < a.balance ? b : a), pts[0] as (typeof withP.points)[number]);
  const lw = low(withP.points);
  const lo = low(without.points);
  const pathRows: [string, string][] = [
    [
      'Opening',
      `${m(opening)} = spending money ${m(ev.funds.spending)} + own envelope ${m(ev.funds.ownEnvelope)} + extra savings ${m(net?.aboveSize ?? 0)}; the safety net may lend ${m(usable)} more${net?.locked === true ? ' (0: locked, D-61)' : ''}`,
    ],
  ];
  const pays = [
    ...liveSeriesOf(inputs.series, asOf, 'pay').flatMap((s) => seriesOccurrences(s, addDays(asOf, 1), r.open.end).map((d) => `${d} ${m(s.amount)}`)),
    ...(hp === null || hp.amount <= 0 ? [] : hp.dates.map((d) => `${d} ${m(hp.amount)} (from history, D-52)`)),
  ];
  pathRows.push(['Pay counted', pays.length === 0 ? 'none' : pays.join('; ')]);
  const dated = r.open.net.map((n, i) => [i, n] as const).filter(([, n]) => n !== 0n).map(([i, n]) => `${(withP.points[i] as { date: string }).date} ${m(Number(n))}`);
  pathRows.push(['Dated money in and out (pay less bills and debt payments, by day)', dated.length === 0 ? 'none' : dated.join('; ')]);
  pathRows.push(['Everyday spending spread', `${m(mo.erest)} over the rest of ${ym}, then ${m(mo.e ?? 0)} a month`]);
  if (flows.length > 0) pathRows.push(['Purchase payments in the 90 days', flows.map((f) => `${f.date} ${m(f.amount)}`).join('; ')]);
  pathRows.push(['Lowest with the purchase', `${m(lw.balance)} on ${lw.date}`]);
  pathRows.push(['Lowest without the purchase', `${m(lo.balance)} on ${lo.date}`]);
  pathRows.push(['Lowest with the purchase, counting the safety net money it may lend', `${m(lw.balance + usable)} (lends up to ${m(usable)}${net?.locked === true ? '; locked, so nothing' : ''})`]);
  pathRows.push(['Overdraft floor', m(r.floor)]);
  sections.push({ title: '90-day cash path', rows: pathRows });

  // Step by step
  const steps: string[] = [];
  steps.push(`Expected at month end in ${which}: ${m(monthEndExpected)}. Saved above the safety net's size: ${m(net?.aboveSize ?? 0)}. Spare money in all: ${m(monthEndExpected + (net?.aboveSize ?? 0))}.`);
  if (ev.purchase !== null) {
    if (ev.purchase.dayOne > 0) steps.push(`Paid today: ${m(ev.purchase.dayOne)}. Spare money after it: ${m(monthEndExpected + (net?.aboveSize ?? 0) - ev.purchase.dayOne)}.`);
    if (ev.purchase.schedule !== null) steps.push(`Monthly cost: about ${m(ev.purchase.monthly)}. The usual month leaves ${mo.typicalLeft === null ? 'an unknown amount' : m(mo.typicalLeft)}, so ${mo.typicalLeft === null ? 'it cannot be compared' : `${m(mo.typicalLeft - ev.purchase.monthly)} a month is left once payments start`}.`);
  }
  steps.push(`The 90-day path with the purchase is lowest at ${m(lw.balance)} on ${lw.date} (without it: ${m(lo.balance)} on ${lo.date}).`);
  const cash = ev.cash;
  if (cash.kind === 'ok') steps.push(`It never goes below ${m(0)}, so the one-off part fits without the safety net.`);
  else if (cash.kind === 'overdraft') steps.push(`It goes below ${m(0)} but stays inside the overdraft floor ${m(r.floor)}.`);
  else if (cash.kind === 'net') steps.push(`It goes ${m(-lw.balance)} below ${m(0)}. The safety net can lend ${m(usable)}, which covers it, so the purchase dips into the safety net. The purchase adds ${m(cash.added)} to that dip.`);
  else steps.push(`It goes ${m(cash.shortBy)} below ${m(0)}, past the overdraft floor, and the safety net cannot cover it${net?.locked === true && net.floor > 0 ? ` (it is locked, so its ${m(net.floor)} is left out, D-61)` : ''}.`);
  if (ev.result.parts.monthly !== null) steps.push(`One-off part: ${LABEL[ev.result.parts.oneOff] ?? ev.result.parts.oneOff}. Monthly part: ${LABEL[ev.result.parts.monthly] ?? ev.result.parts.monthly}. The stricter one leads.`);
  if (net !== undefined && (ev.result.code === 'fits_month' || ev.result.code === 'fits_unspent')) {
    steps.push(net.state === 'none' ? 'Nothing is saved in a safety net, so a fit carries "but no safety net" (D-35).' : net.state === 'small' ? `The safety net holds ${m(net.saved)} of its ${m(net.size)} size, so a fit carries "but your safety net is small" (D-35).` : 'The safety net is at or above its size, so no net caution.');
  }
  if (res.variant === 'month_already_short') steps.push(`The usual month leaves ${mo.typicalLeft === null ? 'an unknown amount' : m(mo.typicalLeft)} before the purchase, so it is already short: the headline is "No: your month is already short" on the code ${res.code} (D-63).`);
  const tierStep = d65Step(ev, res, m);
  if (tierStep !== null) steps.push(tierStep);
  const shortStep = d68Step(c, ev, res, lw, m);
  if (shortStep !== null) steps.push(shortStep);
  steps.push(...d47Steps(c, ev, m));
  steps.push(...debtSteps(c, ev, res, m));
  steps.push(...(quickEstimatesStep(c, ev, m)?.lines ?? [])); // 05.4-57 (ENG-11)
  steps.push(...tightSteps(c, ev, m)); // 05.4-21 (FIN-06, FIN-07, D-40)
  steps.push(...borrowSteps(c, ev, m)); // 05.4-22 (FIN-05, D-07, D-39a, D-39c, D-48)
  if (res.variant === 'extra_savings') steps.push('Part of it is paid from money saved above the safety net\'s size, so the headline is "Fits from extra savings" (D-62).');
  steps.push(`Engine answer: ${words({ code: res.code, variant: res.variant, afterBuyMonth: left === null ? null : (left['left'] as number) })}.`);
  return { sections, steps };
}

/** "N payments every <unit> over T months, at A% a year (APR), first payment <date>, last payment <date>" (05.4-56, D-53). */
export function planLine(pc: NonNullable<Evaluation['planCard']>, apr: bigint | null): string {
  const n = pc.lines.reduce((a, x) => a + x.count, 0);
  const t = termMonthsOf(n, pc.cadence.unit, pc.cadence.every);
  const rate = apr === null ? 'with no rate given' : `at ${rateText(apr)} a year (APR)`;
  return `${n} payment${n === 1 ? '' : 's'} ${every(pc.cadence.unit, pc.cadence.every)} over ${t} month${t === 1 ? '' : 's'}, ${rate}, first payment ${pc.firstDate}, last payment ${pc.endDate}`;
}

/**
 * 05.4-56 (D-68): the page's own "judged by cash" step for a plan whose every payment is dated before the 90 days end. Applied
 * (the engine's short_plan_from_cash line is there): the last payment date against the 90-day end, the dated path's lowest point
 * and date, the whole cost (deposit + every payment once, the page's own sum, with the engine's), the monthly cost against the
 * usual month's left. Not applied: the first condition that fails, in one step. A disagreement between the page's own checks and
 * the engine is said in capitals so the audit cannot miss it. Null for cash buys, plans past the 90 days and no purchase.
 */
function d68Step(c: CorpusCase, ev: Evaluation, res: Evaluation['result'], lw: { balance: number; date: string }, m: (n: number) => string): string | null {
  const p = ev.purchase;
  const pc = ev.planCard;
  const pay = c.check.pay;
  if (p === null || p.schedule === null || pc === null || pay.mode !== 'plan') return null;
  const asOf = c.inputs.asOf;
  const end = addDays(asOf, 90);
  const inside = pc.endDate < end;
  const applied = res.facts.some((f) => f.code === 'short_plan_from_cash');
  if (!inside) return applied ? `PAGE AND ENGINE DISAGREE (D-68): the last payment is on ${pc.endDate}, not before the 90 days end on ${end}, yet the answer says it is paid from money on hand.` : null;
  const own = pay.deposit + pc.lines.reduce((a, x) => a + x.count * x.amount, 0);
  const engineTotal = planTotal(p.dayOne, p.schedule, p.share, firstPaymentsToday(p.schedule, p.share, asOf));
  const whole = `${m(own)} (deposit ${m(pay.deposit)} + every payment once; engine ${m(engineTotal)})`;
  const tl = ev.month.typicalLeft;
  const usual = tl === null ? 'the usual month (not known)' : tl < 0 ? `the usual month, already ${m(-tl)} short` : `the usual month's ${m(tl)} left`;
  const net = ev.net;
  const roomNow = ev.month.monthLeft > 0 ? ev.month.monthLeft : 0;
  const spare = ev.spare ?? null;
  const above = net !== undefined && net.aboveSize > 0 ? net.aboveSize : 0;
  // The one-off ladder: this month's room, its own envelope, then spare money (which holds this month's room) and extra savings.
  // With no confirmed spare-money figure the ladder stops after this month's room and the envelope (it asks for the figure).
  const mine = spare === null ? roomNow : Math.max(roomNow, spare);
  const onHand = ev.funds.ownEnvelope + mine + (spare === null ? 0 : above);
  const env = ev.funds.ownEnvelope > 0 ? ` + own envelope ${m(ev.funds.ownEnvelope)}` : '';
  const handText =
    spare === null
      ? `money on hand ${m(onHand)} (this month's room ${m(mine)}${env}; there is no confirmed spare-money figure, so earlier money and extra savings are not counted)`
      : `money on hand ${m(onHand)} (this month and spare money ${m(mine)}${env} + extra savings ${m(above)})`;
  if (applied) {
    const ok = lw.balance >= 0 && ev.cash.kind === 'ok' && onHand >= engineTotal && p.runningMonthly === 0;
    return (
      `${ok ? '' : 'PAGE AND ENGINE DISAGREE: '}Judged by cash (D-68): the last payment is on ${pc.endDate}, before the 90 days end on ${end}; ` +
      `with every payment on its date the lowest point is ${m(lw.balance)} on ${lw.date}, ${lw.balance >= 0 ? `never below ${m(0)}` : `BELOW ${m(0)}`}, with no overdraft and no safety-net money; ` +
      `the plan's whole cost ${whole}, covered by ${handText}; about ${m(p.monthly)} a month against ${usual}, so it is paid from money on hand.`
    );
  }
  const mon = res.parts.monthly;
  const why =
    p.runningMonthly > 0
      ? `it has a running cost of ${m(p.runningMonthly)} a month`
      : mon !== 'monthly_short' && mon !== 'not_yet'
        ? `the monthly part already fits (about ${m(p.monthly)} a month against ${usual})`
        : tl === null
          ? 'the usual month is not known'
          : ev.cash.kind === 'not_covered'
            ? `the path goes below ${m(0)} (lowest ${m(lw.balance)} on ${lw.date})`
            : ev.cash.kind === 'net'
              ? `it needs the safety net (the path is lowest at ${m(lw.balance)} on ${lw.date})`
              : ev.cash.kind === 'overdraft'
                ? `it needs the overdraft (the path is lowest at ${m(lw.balance)} on ${lw.date})`
                : onHand < engineTotal
                  ? `${handText} does not cover ${m(engineTotal)}`
                  : `PAGE AND ENGINE DISAGREE: every check the page makes passes (${handText}, path lowest ${m(lw.balance)} on ${lw.date}), yet the engine does not judge it by cash`;
  return `Not judged by cash (D-68): every payment is before the 90 days end on ${end} (last ${pc.endDate}, whole cost ${whole}), but ${why}.`;
}

/** Whole months from a to b (the largest n with a + n months, the day cut to the month's end, on or before b); 0 when b is not after a. */
function wholeMonthsPage(a: LocalDate, b: LocalDate): number {
  let n = 0;
  while (fmt(addMonths(parse(a), n + 1)) <= b) n++;
  return n;
}

/** A share as a real percent to 2 decimals (7 of 12 months is 58.33%). */
const pct = (num: number, den: number): string => `${((num * 100) / den).toFixed(2)}%`;

/** The yearly and every-3-month bills D-47 reads: live, monthly cadence every 3 or 12 months, with an amount. */
export function longBillsOf(inputs: V3Inputs): V3Series[] {
  return liveSeriesOf(inputs.series, inputs.asOf, 'bill').filter((s) => s.cadence.unit === 'month' && (s.cadence.every === 3 || s.cadence.every === 12) && s.amount > 0);
}

/**
 * 05.4-19 (FIN-11 as changed by D-47): the page's own hold-back sum for each yearly or every-3-month bill, not read from the engine's
 * hold-back: "hold-back = max(0, bill - usual leftover x whole months until due), capped at the built-up share"; built-up share =
 * bill x whole months since last paid / months between payments (half up, never more than the bill; 0 again after each payment);
 * last paid = the newest paid line or the newest due date on or before the check date; a bill due this month is in this month's
 * bills, so nothing more is held back. The engine's figures sit beside it; a difference prints PAGE AND ENGINE DISAGREE.
 */
export function d47Steps(c: CorpusCase, ev: Evaluation, m: (n: number) => string): string[] {
  const inputs = c.inputs;
  const asOf = inputs.asOf;
  const always = new Set((inputs.waivers ?? []).flatMap((w) => (w.kind === 'always_other' ? [w.seriesId] : [])));
  const tl = ev.month.typicalLeft;
  const out: string[] = [];
  for (const s of longBillsOf(inputs)) {
    const name = s.name ?? s.id;
    const every = s.cadence.every;
    const engine = ev.funds.billsHeld?.parts.find((x) => x.seriesId === s.id);
    if (always.has(s.id)) {
      out.push(`${name}: ${m(s.amount)} every ${every} months, always paid by someone else (D-31), so nothing is held back${engine === undefined ? '' : '. PAGE AND ENGINE DISAGREE: the engine reads it'}.`);
      continue;
    }
    const paidLine = inputs.months.flatMap((x) => x.lines).filter((l) => l.seriesId === s.id && l.status === 'paid' && l.date <= asOf).map((l) => l.date).sort().pop() ?? null;
    let lastDue: string | null = null;
    for (let n = 0; ; n++) {
      const d = fmt(addMonths(parse(s.anchorDate), every * n));
      if (d > asOf) break;
      lastDue = d;
    }
    const paid = paidLine !== null && (lastDue === null || paidLine > lastDue) ? paidLine : lastDue;
    let due = s.anchorDate;
    if (paid !== null) {
      const past = fmt(addMonths(parse(paid), Math.floor(every / 2)));
      for (let n = 0; ; n++) {
        due = fmt(addMonths(parse(s.anchorDate), every * n));
        if (due > past) break;
      }
    }
    // D-70: a bill the usual month already sets aside (no yearly-bill choice, or 'monthly') counts its own monthly share once more
    // in the cover: bill / months between payments, half up.
    const own = s.typicalChoice === 'excluded' ? 0 : Math.floor((2 * s.amount + every) / (2 * every));
    const leftover = tl === null ? 0 : Math.max(0, tl + own);
    const since = paid === null ? 0 : wholeMonthsPage(paid, asOf);
    const share = Math.min(s.amount, Math.floor((2 * s.amount * since + every) / (2 * every)));
    const until = wholeMonthsPage(asOf, due);
    const covered = leftover * until;
    const uncovered = Math.max(0, s.amount - covered);
    const thisMonth = due.slice(0, 7) === asOf.slice(0, 7);
    const hold = thisMonth ? 0 : Math.min(share, uncovered);
    const agree = engine !== undefined && engine.builtUp === share && engine.holdBack === hold && engine.dueDate === due;
    out.push(
      `${agree ? '' : 'PAGE AND ENGINE DISAGREE: '}Yearly bills (D-47): ${name} is ${m(s.amount)} every ${every} months, ` +
        `${paid === null ? 'not paid yet (it starts on its first due date)' : `last paid ${paid}`}, next due ${due}. ` +
        `Built up: ${since} of ${every} months (${pct(Math.min(since, every), every)}) = ${m(share)}. ` +
        (tl === null
          ? 'The usual month is not known, so it covers nothing; '
          : `The usual month leaves ${m(tl)}${own > 0 ? `, and it already sets aside ${m(own)} a month for this bill, counted once (D-70): ${m(tl)} + ${m(own)}` : ''} = ${m(leftover)} a month${tl + own < 0 ? ' (below 0, so it covers nothing)' : ''}; `) +
        `${until} whole months before ${due} cover ${m(leftover)} x ${until} = ${m(covered)}. ` +
        `Not covered: the larger of ${m(0)} and ${m(s.amount)} - ${m(covered)} = ${m(uncovered)}. ` +
        (thisMonth ? `It is due this month, so it is already in this month's bills: nothing more is held back.` : `Held back: the smaller of ${m(share)} and ${m(uncovered)} = ${m(hold)}${hold === share && hold > 0 ? ' (the whole built-up share)' : ''}.`) +
        (engine === undefined ? ' (engine: no hold-back figure)' : ` Engine: built up ${m(engine.builtUp)}, held back ${m(engine.holdBack)}, due ${engine.dueDate}.`)
    );
  }
  const total = ev.funds.billsHeld?.total ?? 0;
  if (out.length > 0) out.push(`Held back from spare money for these bills: ${m(total)}${total > 0 ? ' (taken off after the month-end cap, so the cap never cancels it)' : ''}.`);
  return out;
}

/** The page's own day for a minimum: its due day cut to the month's last day, or (not set) tomorrow's day (DB-02). */
function pageDueDates(d: V3Debt, asOf: LocalDate, days: number): { date: string; first: boolean }[] {
  const end = fmt(parse(asOf) + days * MS_DAY);
  const tomorrow = fmt(parse(asOf) + MS_DAY);
  const day = d.dueDay != null && Number.isInteger(d.dueDay) && d.dueDay >= 1 && d.dueDay <= 31 ? d.dueDay : Number(tomorrow.slice(8, 10));
  const start = d.dueDay != null && day === d.dueDay ? `${asOf.slice(0, 8)}01` : `${tomorrow.slice(0, 8)}01`;
  const out: { date: string; first: boolean }[] = [];
  let left = Math.max(0, d.balance); // D-73: the payments stop once the balance is paid off
  for (let n = 0; n < 6; n++) {
    const first = addMonths(parse(start), n);
    const last = new Date(Date.UTC(new Date(first).getUTCFullYear(), new Date(first).getUTCMonth() + 1, 0)).getUTCDate();
    const date = fmt(Date.UTC(new Date(first).getUTCFullYear(), new Date(first).getUTCMonth(), Math.min(day, last)));
    if (date >= end) break;
    const paidUp = n === 0 && date.slice(0, 7) === asOf.slice(0, 7) && (d.paidThisMonth ?? 0) >= d.minimum;
    if (date >= asOf && !paidUp && left > 0) {
      out.push({ date, first: n === 0 });
      left -= Math.min(left, n === 0 && date.slice(0, 7) === asOf.slice(0, 7) ? Math.max(0, d.minimum - (d.paidThisMonth ?? 0)) : d.minimum);
    }
  }
  return out;
}

/** The page's own monthly interest: balance x APR / 12, rounded half up (0 with no rate). */
const pageInterest = (d: V3Debt): number => (d.apr === null || d.apr <= 0n || d.balance <= 0 ? 0 : Number((2n * BigInt(d.balance) * d.apr + 1200n * PERCENT_SCALE) / (2400n * PERCENT_SCALE)));

/** D-53: each debt with its rate as a real percent, its minimum, its due day and what pays it. */
function debtRows(inputs: V3Inputs, m: (n: number) => string): [string, string][] {
  const counted = new Set(debtsInMonth(inputs.debts, inputs.series, inputs.asOf).map((d) => d.id));
  const flows = debtOutflows(inputs, inputs.months.find((x) => x.month === yearMonthOf(inputs.asOf))?.lines ?? [], 90);
  return inputs.debts.map((d): [string, string] => {
    const own = flows.flows.filter((f) => f.debtId === d.id);
    const due = own.length === 0 ? (d.dueDay == null ? 'due day not set' : `due on day ${d.dueDay}`) : d.dueDay == null ? `due day not set, so counted from tomorrow (${fmt(parse(inputs.asOf) + MS_DAY)})` : `due on day ${d.dueDay}`;
    const pays = own.length === 0 ? (counted.has(d.id) ? 'paid through its own debt-payment series (that series is on the path; the minimum is set aside once)' : 'paid through one of the bills, so it is counted once, in the bills') : `lands on ${own.map((f) => `${f.date} ${m(f.amount)}`).join('; ')}`;
    return [
      `${d.id} (${d.kind}${d.isHousing ? ', housing' : ''}${d.joint === true ? ', in two names' : ''})`,
      `owes ${m(d.balance)}, rate ${d.apr === null ? 'not given' : `${rateText(d.apr)} a year`}, minimum ${m(d.minimum)} a month, ${due}${d.paidThisMonth ? `, ${m(d.paidThisMonth)} already paid this month` : ''}; ${pays}`,
    ];
  });
}

/**
 * 05.4-20 (FIN-04, FIN-10, D-39b): the page's own debt sums beside the engine's. Counted once (DB-07): a minimum paid through a bill
 * is in the bills, so the usual month does not take it again (the figure before this fix is shown). Each other minimum on the path
 * on its own day (the page's dates against the engine's). Monthly interest = balance x APR / 12. Costly debt: money saved in
 * earlier months (spare money + extra savings) on a Fits from spare money while a debt at 20% or more remains.
 */
export function debtSteps(c: CorpusCase, ev: Evaluation, res: Evaluation['result'], m: (n: number) => string): string[] {
  const inputs = c.inputs;
  if (inputs.debts.length === 0) return [];
  const out: string[] = [];
  const counted = new Set(debtsInMonth(inputs.debts, inputs.series, inputs.asOf).map((d) => d.id));
  const asBill = inputs.debts.filter((d) => !counted.has(d.id));
  const setAside = inputs.debts.filter((d) => counted.has(d.id)).reduce((a, d) => a + d.minimum, 0);
  const tl = ev.month.typicalLeft;
  out.push(
    `Debts in the usual month (counted once, DB-07): the minimums set aside besides the bills come to ${m(setAside)}` +
      (asBill.length === 0
        ? '; no minimum is also one of the bills, so nothing was counted twice before this fix either.'
        : `; ${asBill.map((d) => `${d.id} (${m(d.minimum)})`).join(', ')} is paid through one of the bills and counted there once. The usual month leaves ${tl === null ? 'an unknown amount' : m(tl)}; before this fix it took it again and left ${tl === null ? 'an unknown amount' : m(tl - asBill.reduce((a, d) => a + d.minimum, 0))}.`)
  );
  const flows = debtOutflows(inputs, inputs.months.find((x) => x.month === yearMonthOf(inputs.asOf))?.lines ?? [], 90).flows;
  for (const d of inputs.debts.filter((x) => counted.has(x.id))) {
    const engine = flows.filter((f) => f.debtId === d.id).map((f) => f.date);
    if (engine.length === 0) {
      out.push(`${d.id}: paid through its own debt-payment series, which is on the path on its dates; the minimum is not added a second time.`);
      continue;
    }
    const page = pageDueDates(d, inputs.asOf, 90).map((x) => x.date);
    const agree = JSON.stringify(page) === JSON.stringify(engine);
    out.push(
      `${agree ? '' : 'PAGE AND ENGINE DISAGREE: '}${d.id} on the 90-day path (FIN-04): minimum ${m(d.minimum)} ${d.dueDay == null ? 'with no due day set, so from tomorrow and then the same day each month (DB-02)' : `on day ${d.dueDay} (cut to the month's last day)`}: ${page.join(', ')}` +
        `${d.paidThisMonth ? `; this month only ${m(Math.max(0, d.minimum - d.paidThisMonth))} (${m(d.paidThisMonth)} already paid, DB-10)` : ''}. Engine: ${engine.join(', ')}.`
    );
  }
  for (const d of inputs.debts.filter((x) => x.apr !== null && x.apr > 0n && x.balance > 0)) {
    const mine = pageInterest(d);
    out.push(`${d.id}: ${m(d.balance)} at ${rateText(d.apr)} a year costs ${m(d.balance)} x ${rateText(d.apr)} / 12 = about ${m(mine)} a month in interest.`);
  }
  const fromEarlier = res.split.filter((x) => x.source === 'unspent_earlier' || x.source === 'extra_savings').reduce((a, x) => a + x.amount, 0);
  const costly = inputs.debts.filter((d) => d.balance > 0 && d.apr !== null && d.apr * 100n >= 2000n * PERCENT_SCALE);
  // D-72: only when that money put toward the debt would cut its interest by at least 1.00 a month.
  const saving = (d: V3Debt): number => pageInterest({ ...d, balance: Math.min(fromEarlier, d.balance) as V3Debt['balance'] });
  const worth = costly.filter((d) => saving(d) >= 100);
  const pageSays = res.code === 'fits_unspent' && fromEarlier > 0 && worth.length > 0;
  // A higher variant (a D-63 / D-65 headline, tight (05.4-21) or low_month) may lead; costly_debt never shows where the page says it does not apply.
  const higher = res.variant !== null && ['month_already_short', 'month_short_moderate_extra', 'month_short_moderate', 'month_short_small', 'tight', 'low_month'].includes(res.variant);
  const agree = pageSays ? res.variant === 'costly_debt' || higher : res.variant !== 'costly_debt';
  out.push(
    `${agree ? '' : 'PAGE AND ENGINE DISAGREE: '}Costly debt (D-39b): ${costly.length === 0 ? 'no debt is at 20% a year or more' : `${costly.map((d) => `${d.id} at ${rateText(d.apr)}`).join(', ')} at 20% a year or more`}; ` +
      `money saved in earlier months used: ${m(fromEarlier)} (spare money and extra savings in the split)` +
      (costly.length > 0 && fromEarlier > 0 ? `; put toward ${costly.map((d) => `${d.id} it would cut the interest by ${m(saving(d))} a month`).join(', ')} (D-72: at least ${m(100)})` : '') +
      (res.code !== 'fits_unspent' ? `; the answer is ${LABEL[res.code] ?? res.code}, so the caution does not apply.` : pageSays ? `, so "Fits, but you carry costly debt" applies${res.variant === 'costly_debt' ? '' : ` (a higher caution leads: ${res.variant ?? 'none'})`}.` : ', so the caution does not apply.')
  );
  return out;
}

/**
 * 05.4-57 (ENG-11, D-53): the quick-estimates step, with the page's own sums (not the engine's). Money out from the estimates,
 * less the usual bills the person pays (live monthly bill series at their monthly figure; a yearly or every-3-month bill only
 * when the person counts it monthly; bills someone else always pays left out), = everyday per month, never below 0. Then the
 * everyday spending so far, the still to come over the days left (the larger of the pace and the rest of the month's everyday),
 * and, when the estimates state an essential part, the starter safety net = bills + debt minimums + that part, rounded up to a
 * whole unit. null when the inputs carry no quick estimates. `everyday` and `out` are returned for the page test.
 */
export function quickEstimatesStep(c: CorpusCase, ev: Evaluation, m: (n: number) => string): { lines: string[]; everyday: number; out: number } | null {
  const inputs = c.inputs;
  const q = inputs.typedEstimates;
  if (q === null) return null;
  const mo = ev.month;
  const asOf = inputs.asOf;
  const ym = yearMonthOf(asOf);
  const n = daysInYearMonth(ym);
  const day = Number(asOf.slice(8, 10));
  const always = new Set((inputs.waivers ?? []).filter((w) => w.kind === 'always_other').map((w) => (w as { seriesId: string }).seriesId));
  const bills = liveSeriesOf(inputs.series, asOf, 'bill')
    .filter((s) => !always.has(s.id))
    .filter((s) => !(s.cadence.unit === 'month' && s.cadence.every > 1 && s.typicalChoice === 'excluded'))
    .map((s) => ({ s, monthly: s.cadence.unit === 'week' ? Math.round((s.amount * 52) / 12 / s.cadence.every) : Math.round(s.amount / s.cadence.every) }));
  const billTotal = bills.reduce((a, b) => a + b.monthly, 0);
  const out = q.expenses;
  // D-74: the recorded card and loan minimums and regular saving are inside the money out too, each taken out once.
  const mins = debtsInMonth(inputs.debts, inputs.series, asOf).reduce((a, d) => a + Math.max(0, d.minimum), 0);
  const saved = (['saving', 'investing'] as const)
    .flatMap((role) => liveSeriesOf(inputs.series, asOf, role))
    .filter((s) => s.savingMode !== 'flexible')
    .reduce((a, s) => a + (s.cadence.unit === 'week' ? Math.round((s.amount * 52) / 12 / s.cadence.every) : Math.round(s.amount / s.cadence.every)), 0);
  const recorded = billTotal + mins + saved;
  const everyday = Math.max(0, out - recorded);
  const lines: string[] = [];
  const used = mo.monthsUsed.length > 0 || inputs.everydayOverride !== null;
  lines.push(
    `Quick estimates (ENG-11, D-74): money in ${m(q.income)} a month; money out ${m(out)} a month (bills, minimums and regular saving included, as the app's "Money out each month"). ` +
      `Usual bills she pays: ${bills.length === 0 ? 'none recorded' : bills.map((b) => `${seriesName(b.s)} ${m(b.monthly)}`).join(' + ')} = ${m(billTotal)}; card and loan minimums ${m(mins)}; regular saving ${m(saved)}. ` +
      `Everyday per month = ${m(out)} - ${m(billTotal)} - ${m(mins)} - ${m(saved)} = ${m(everyday)}${out - recorded < 0 ? ` (never below 0; the recorded ${m(recorded)} is more than the money out, so the usual month takes ${m(recorded)} out)` : ''}.` +
      ` Usual month = ${m(q.income)} - ${m(Math.max(out, recorded))}${q.debt + q.saving + q.invest > 0 ? ` - typed debt, saving and invest ${m(q.debt + q.saving + q.invest)}` : ''} = ${m(q.income - Math.max(out, recorded) - q.debt - q.saving - q.invest)}.` +
      (used || mo.typicalLeft === q.income - Math.max(out, recorded) - q.debt - q.saving - q.invest ? '' : ` PAGE AND ENGINE DISAGREE: the engine's usual month is ${m(mo.typicalLeft ?? 0)}.`) +
      (used
        ? ` The estimates are not read here: ${inputs.everydayOverride !== null ? 'an everyday figure set by hand' : `${mo.monthsUsed.length} full month(s) of records (${mo.monthsUsed.join(', ')})`} set the everyday spending at ${m(mo.e ?? 0)}.`
        : `${everyday === mo.e ? '' : ` PAGE AND ENGINE DISAGREE: the engine reads ${m(mo.e ?? 0)}.`}`)
  );
  if (!used) {
    const logged = mo.everydayLogged;
    const left = n - day;
    const pace = left === 0 ? 0 : Math.floor((2 * everyday * left + n) / (2 * n));
    const rest = Math.max(0, everyday - logged);
    const toCome = left === 0 ? 0 : Math.max(pace, rest);
    lines.push(
      `Everyday so far (${ym}-01 to ${asOf}): ${m(logged)}. Still to come (${left === 0 ? 'none: the last day of the month' : `${addDays(asOf, 1)} to ${ym}-${String(n).padStart(2, '0')}, ${left} of ${n} days`}): ` +
        `the larger of the pace ${m(everyday)} x ${left} / ${n} = ${m(pace)} and the rest of the month's everyday ${m(everyday)} - ${m(logged)} = ${m(rest)}, so ${m(toCome)}.` +
        `${toCome === mo.erest ? '' : ` PAGE AND ENGINE DISAGREE: the engine reads ${m(mo.erest)}.`}`
    );
    if (q.essential != null) {
      const ess = Math.min(Math.max(0, q.essential), everyday);
      const starter = Math.ceil((billTotal + mins + ess) / 100) * 100;
      const engine = ev.net?.starter ?? null;
      lines.push(
        `Starter safety net (D-51, ENG11-QE-ESSENTIAL): bills ${m(billTotal)} + card and loan minimums ${m(mins)} + the essential part of everyday spending the estimates state ${m(ess)} = ${m(billTotal + mins + ess)}, rounded up to ${m(starter)}.` +
          `${engine === null || engine === starter ? '' : ` PAGE AND ENGINE DISAGREE: the engine's starter is ${m(engine)}.`}`
      );
    }
  }
  return { lines, everyday, out };
}

/** 05.4-20 (DB-07): the right-answer cases whose debt is one of the bills, with the usual month before (counted twice) and after. */
function countedOnceHtml(): string {
  const rows: string[] = [];
  for (const rc of loadCases().filter((x) => x.topic === 'debts' && x.status === 'approved')) {
    const { inputs, check } = toEngineInputs(rc.fixture);
    const linked = inputs.debts.filter((d) => d.seriesId != null);
    if (linked.length === 0) continue;
    const m = (n: number): string => money(n, inputs.currency);
    const after = evaluate(inputs, check);
    const before = evaluate({ ...inputs, debts: inputs.debts.map((d) => ({ ...d, seriesId: null })) }, check);
    const twice = linked.reduce((a, d) => a + d.minimum, 0);
    rows.push(
      `<li><b>${esc(rc.id)} ${esc(rc.persona)}</b>: ${esc(linked.map((d) => `${d.id} minimum ${m(d.minimum)}${d.apr === null ? '' : ` at ${rateText(d.apr)} a year`}, due day ${String(d.dueDay)}`).join('; '))}, one of the ${esc(m(rc.fixture.usualMonth.bills))} of bills.<br>` +
        `Before (counted twice): usual month ${esc(m(before.month.typicalLeft ?? 0))}, this month ${esc(m(before.month.monthLeft))}; answer ${esc(words({ code: before.result.code, variant: before.result.variant, afterBuyMonth: null }))}.<br>` +
        `After (counted once): usual month ${esc(m(after.month.typicalLeft ?? 0))}, this month ${esc(m(after.month.monthLeft))} (${esc(m(twice))} more); answer ${esc(words({ code: after.result.code, variant: after.result.variant, afterBuyMonth: null }))}.<br>` +
        `Approved right answer: ${esc(words({ code: rc.expected.code, variant: rc.expected.variant, afterBuyMonth: rc.expected.afterBuy.month }))}.</li>`
    );
  }
  return `<h2>Counted once (DB-07): right-answer cases whose debt is one of the bills (${rows.length})</h2><p>Before this fix the usual month took each of these minimums twice, once in the bills and once as a debt. "Before" is the same person with the debt not linked to its bill. The variant "tight" comes in 05.4-21.</p><ul>${rows.join('')}</ul>`;
}

/** Fix IDs whose page also lists the checks the rule reads but whose answer it leaves the same. */
const READS: Readonly<Record<string, (c: CorpusCase) => boolean>> = {
  'FIN-10': (c) => c.inputs.debts.length > 0, // 05.4-20
  'FIN-10b': (c) => c.inputs.debts.length > 0, // 05.4-20 D-72, D-73
  'FIN-11': (c) => longBillsOf(c.inputs).length > 0,
  'FIN-11b': (c) => longBillsOf(c.inputs).length > 0, // D-70
  'ENG-11': (c) => c.inputs.typedEstimates !== null, // 05.4-57: every check with quick estimates, changed or not
  'ENG-11b': (c) => c.inputs.typedEstimates !== null, // 05.4-57 D-74
  'FIN-06': tightCloseCall, // 05.4-21: fits within twice the floor, or a plan over 60% of the room
  'FIN-05': (c) => c.check.pay.mode === 'plan', // 05.4-22: every plan check, changed or not
};

/**
 * D-65: the page's own "how long your money lasts" sum, from the breakdown figures (not from the engine's tier line), so the owner
 * sees both side by side. R = spare money judged against (else this month's left) + money saved above the net's size, never the
 * locked net (D-61), and never below what the purchase uses; S = the usual shortfall; U = the purchase's day-one amount less its
 * own envelope. U < S is Small, else Moderate. Large names its reason. Null when the usual month is not short.
 */
function d65Step(ev: Evaluation, res: Evaluation['result'], m: (n: number) => string): string | null {
  const tl = ev.month.typicalLeft;
  if (tl === null || tl >= 0) return null;
  const S = -tl;
  const p = ev.purchase;
  const net = ev.net;
  const isFit = res.code === 'fits_month' || res.code === 'fits_unspent';
  if (!isFit || p === null || p.monthly > 0) {
    const why =
      p !== null && p.monthly > 0
        ? `a plan payment of about ${m(p.monthly)} a month makes the ${m(S)} shortfall bigger`
        : ev.cash.kind === 'not_covered' && net !== undefined && net.locked && net.floor > 0 && ev.cash.shortBy <= net.floor
          ? `only the locked safety net (${m(net.floor)}) could pay it, and it is left out (D-61)`
          : ev.cash.kind === 'not_covered' && net !== undefined && net.locked && net.floor > 0
            ? `the 90-day path goes ${m(ev.cash.shortBy)} below ${m(0)} with it, more than even the locked safety net (${m(net.floor)}) holds`
            : ev.cash.kind !== 'ok'
              ? `the 90-day path goes below ${m(0)} with it`
              : `the code ${res.code} is not a fit`;
    return `How long your money lasts: the usual month is ${m(S)} short, and ${why}, so the tier is Large: "No: your month is already short" (D-65).`;
  }
  const fromEnvelope = res.split.filter((x) => x.source === 'envelope').reduce((a, x) => a + x.amount, 0);
  const U = p.dayOne - fromEnvelope;
  const spare = ev.spare ?? null;
  const own = spare ?? ev.month.monthLeft;
  const A = own > 0 ? own : 0;
  const B = net !== undefined && net.aboveSize > 0 ? net.aboveSize : 0;
  const R = Math.max(A + B, U);
  const N = Math.floor(R / S);
  const M = Math.floor((R - U) / S);
  const fromExtra = res.split.some((x) => x.source === 'extra_savings' && x.amount > 0);
  const tier = U < S ? 'Small' : fromExtra ? 'Moderate, from extra savings' : 'Moderate, from spare money';
  return (
    `How long your money lasts: ${spare === null ? "this month's left" : 'spare money'} ${m(A)} + extra savings ${m(B)} (never the locked safety net) = ${m(R)}; ` +
    `usual shortfall ${m(S)} a month; ${m(R)} / ${m(S)} = ${N} months; after this purchase (${m(U)}): ${M} months; ` +
    `the purchase takes ${m(U)} / ${m(S)} = ${(U / S).toFixed(2)} of a month, so the tier is ${tier} (D-65).`
  );
}

function sectionsHtml(sections: readonly Section[]): string {
  return sections.map((s) => `<h4>${esc(s.title)}</h4><table>${s.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`).join('');
}

function auditHtml(a: AuditEntry | null): string {
  if (a === null) return '<div class="audit"><h4>Audit</h4><p>Not audited yet.</p></div>';
  const notes = a.notes.length === 0 ? '' : `<ul>${a.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  const d54 = a.d54 === undefined || a.d54.length === 0 ? '' : `<p><b>Audit's drafted lines (compare with ${SAYS}):</b></p><ul>${a.d54.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  return `<div class="audit"><h4>Audit</h4><p><b>Right answer:</b> ${esc(a.right)}<br><b>Verdict:</b> ${esc(a.verdict)}<br><b>Cause:</b> ${esc(a.cause)}</p>${notes}${d54}</div>`;
}

const who = (c: CorpusCase, key: string): string => {
  const g = /^gen:(\d+)$/.exec(key);
  return g ? `Generated person ${g[1]} (made up from a fixed seed, the same every run)` : c.label;
};

const CSS =
  'body{font-family:system-ui,sans-serif;max-width:860px;margin:0 auto;padding:16px;line-height:1.45}li{margin:10px 0}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #ccc;padding:3px 6px;font-size:.9rem;vertical-align:top}th{width:40%;font-weight:normal}summary{cursor:pointer}h4{margin:12px 0 2px;font-size:.85rem;text-transform:uppercase;letter-spacing:.04em}.audit{border:2px solid #000;padding:4px 10px;margin:8px 0}.audit li{margin:4px 0}ol li{margin:3px 0}';

export function buildPage(fixId: string, changes: readonly ReviewedChange[], cases: readonly CorpusCase[]): string {
  const byKey = new Map(cases.map((c) => [c.key, c]));
  const groups = { stricter: [] as ReviewedChange[], looser: [] as ReviewedChange[], detail: [] as ReviewedChange[] };
  for (const c of changes) groups[group(c.before, c.after)].push(c);
  const verdicts = new Map<string, number>();
  for (const ch of changes) {
    const v = auditOf(ch.key)?.verdict ?? 'not audited';
    verdicts.set(v, (verdicts.get(v) ?? 0) + 1);
  }
  const item = (ch: ReviewedChange, open: boolean): string => {
    const c = byKey.get(ch.key);
    const name = c === undefined ? ch.key : who(c, ch.key);
    if (c === undefined) return `<li><b>${esc(name)}</b><p>Situation not found in the corpus.</p></li>`;
    const b = breakdown(c);
    const steps = `<h4>Step by step</h4><ol>${b.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
    return (
      `<li><b>${esc(name)}</b> <code>${esc(ch.key)}</code><br>Before: ${esc(words(ch.before))}<br>After: ${esc(words(ch.after))}` +
      auditHtml(auditOf(ch.key)) +
      `<details${open ? ' open' : ''}><summary>Situation and full breakdown</summary>${situationHtml(c)}${sectionsHtml(b.sections)}${steps}</details></li>`
    );
  };
  const section = (title: string, list: ReviewedChange[], open: boolean): string =>
    `<h2>${title} (${list.length})</h2>` + (list.length === 0 ? '<p>None.</p>' : `<ul>${list.map((c) => item(c, open)).join('')}</ul>`);
  const verdictLine = [...verdicts].map(([v, n]) => `${n} ${v}`).join(', ');
  const reads = READS[fixId];
  const changed = new Set(changes.map((x) => x.key));
  const same = reads === undefined ? [] : cases.filter((c) => reads(c) && !changed.has(c.key));
  const sameItem = (c: CorpusCase): string => {
    const b = breakdown(c);
    const ans = evaluate(c.inputs, c.check).result;
    return (
      `<li><b>${esc(who(c, c.key))}</b> <code>${esc(c.key)}</code><br>Answer (unchanged): ${esc(words({ code: ans.code, variant: ans.variant, afterBuyMonth: null }))}` +
      auditHtml(auditOf(c.key)) +
      `<details><summary>Situation and full breakdown</summary>${situationHtml(c)}${sectionsHtml(b.sections)}<h4>Step by step</h4><ol>${b.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details></li>`
    );
  };
  const readsHtml = reads === undefined ? '' : `<h2>Checks this rule reads, answer unchanged (${same.length})</h2>` + (same.length === 0 ? '<p>None.</p>' : `<ul>${same.map(sameItem).join('')}</ul>`);
  return (
    `<!doctype html><meta charset="utf-8"><title>${esc(fixId)}: changed answers</title><style>${CSS}</style>` +
    `<h1>${esc(fixId)}: changed answers</h1><p>${changes.length} of ${cases.length} checks changed (${groups.stricter.length} stricter, ${groups.looser.length} looser, ${groups.detail.length} same answer with different detail). Invented people only.</p>` +
    `<p>Audit: ${esc(verdictLine)}. Each change shows its Audit box first, then the full breakdown.</p>` +
    section('Stricter', groups.stricter, false) + section('Looser', groups.looser, false) + section('Same answer, detail changed', groups.detail, false) +
    (fixId === 'FIN-10' ? countedOnceHtml() : '') +
    (fixId === 'ENG-11' || fixId === 'ENG-11b' ? quickEstimateCasesHtml() : '') +
    (fixId === 'FIN-06' ? tightCasesHtml() : '') +
    (fixId === 'FIN-05' ? borrowingCasesHtml() : '') +
    readsHtml
  );
}

/**
 * 05.4-57 (ENG-11): the approved right-answer cases with quick estimates (QE-01, QE-13). They are not in the corpus, so they show
 * here with the engine's answer now, the approved answer and the full breakdown (with the quick-estimates step). The answers
 * before this fix are in 05.4-57-ENG-11-AUDIT.md (scratch run of the engine before the fix).
 */
function quickEstimateCasesHtml(): string {
  const rows: string[] = [];
  for (const rc of loadCases().filter((x) => x.status === 'approved' && x.fixture.quickEstimates !== null)) {
    const { inputs, check } = toEngineInputs(rc.fixture);
    const c: CorpusCase = { key: `case:${rc.id}`, label: `${rc.id} ${rc.persona}`, inputs, check };
    const p = evaluate(inputs, check);
    const left = p.result.facts.find((f) => f.code === 'month_left_after')?.values['left'];
    const b = breakdown(c);
    rows.push(
      `<li><b>${esc(rc.id)} ${esc(rc.persona)}</b><br>Engine now: ${esc(words({ code: p.result.code, variant: p.result.variant, afterBuyMonth: typeof left === 'number' ? left : null }))}<br>` +
        `Approved right answer: ${esc(words({ code: rc.expected.code, variant: rc.expected.variant, afterBuyMonth: rc.expected.afterBuy.month }))}` +
        auditHtml(auditOf(c.key)) +
        `<details><summary>Situation and full breakdown</summary>${situationHtml(c)}${sectionsHtml(b.sections)}<h4>Step by step</h4><ol>${b.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details></li>`
    );
  }
  return `<h2>Right-answer cases with quick estimates (${rows.length})</h2><p>These approved cases are not in the corpus. The answers before this fix are in the audit file. "Tight" comes in 05.4-21.</p><ul>${rows.join('')}</ul>`;
}

/**
 * 05.4-21 (FIN-06 / ENG-06, FIN-07, D-40, D-53): the page's own short-month and tight sums, from the breakdown figures (not the
 * engine's tight_floor fact), so the owner sees both side by side. The floor: the user's line, else a tenth of the usual month's
 * bills plus everyday spending, rounded up. A plan: its monthly cost as a real percentage of the usual room (more than 80% is tight)
 * and the room left after it against the floor. A one-off (or a D-68 plan judged by cash): spare money (this month's own figure when
 * spare money is unknown) plus extra savings above the safety net's size, less what the purchase takes from them, against the floor.
 * A disagreement with the engine is said in capitals. Under a D-63 / D-65 month-short headline tight never shows, so nothing is
 * compared there.
 */
export interface TightSums {
  readonly floor: number;
  readonly floorText: string;
  readonly plan: { readonly room: number; readonly monthly: number; readonly sharePct: string; readonly over80: boolean; readonly leftEach: number } | null;
  readonly once: { readonly base: number; readonly baseIsSpare: boolean; readonly above: number; readonly used: number; readonly left: number } | null;
  readonly tight: boolean;
}

export function tightSums(c: CorpusCase, ev: Evaluation, m: (n: number) => string): TightSums | null {
  const res = ev.result;
  const p = ev.purchase;
  const mo = ev.month;
  // 05.4-22: an expensive plan's fit is fits_by_borrowing; its tight sums are the fit's own
  if (p === null || (res.code !== 'fits_month' && res.code !== 'fits_unspent' && res.code !== 'fits_by_borrowing')) return null;
  const spend = Math.max(0, mo.recurringBills + (mo.e ?? 0));
  const line = c.inputs.tightLine ?? null;
  const floor = line !== null ? Math.max(0, line) : Math.ceil(spend / 10);
  const floorText =
    line !== null
      ? `the ${m(floor)} line the user set`
      : `a tenth of ${m(mo.recurringBills)} bills + ${m(mo.e ?? 0)} everyday spending = ${m(spend)}, rounded up: ${m(floor)}`;
  const byCash = res.facts.some((f) => f.code === 'short_plan_from_cash');
  let plan: TightSums['plan'] = null;
  if (p.monthly > 0 && !byCash && res.parts.monthly === 'fits_month' && mo.typicalLeft !== null) {
    const room = mo.typicalLeft;
    const pct = room > 0 ? ((p.monthly * 100) / room).toFixed(1) : 'more than 100';
    plan = { room, monthly: p.monthly, sharePct: pct, over80: p.monthly * 10000 > room * 8000, leftEach: room - p.monthly };
  }
  let once: TightSums['once'] = null;
  if (p.schedule === null || byCash) {
    const spare = ev.spare ?? null;
    const above = ev.net !== undefined && ev.net.aboveSize > 0 ? ev.net.aboveSize : 0;
    const used = res.split.filter((s) => s.source === 'month' || s.source === 'unspent_earlier' || s.source === 'extra_savings').reduce((a, s) => a + s.amount, 0);
    const base = spare ?? mo.monthLeft;
    once = { base, baseIsSpare: spare !== null, above, used, left: base + above - used };
  }
  const tight = (plan !== null && (plan.over80 || plan.leftEach < floor)) || (once !== null && once.left < floor);
  return { floor, floorText, plan, once, tight };
}

function tightSteps(c: CorpusCase, ev: Evaluation, m: (n: number) => string): string[] {
  const res = ev.result;
  const out: string[] = [];
  const p = ev.purchase;
  const mo = ev.month;
  // FIN-06 / ENG-06: why a plan is Short each month when its payment is not bigger than the usual room.
  if (p !== null && p.monthly > 0 && res.parts.monthly === 'monthly_short') {
    const tl = mo.typicalLeft;
    const first = p.schedule?.firstDate ?? null;
    if (tl !== null && tl <= 0) out.push(`Short each month (FIN-06): the usual month leaves ${m(tl)}, at or below ${m(0)}, so no new monthly payment fits it.`);
    else if (tl !== null && p.monthly <= tl && first !== null) {
      const heading = ev.spare ?? mo.monthLeft;
      out.push(`Short each month (FIN-06): the first payment is on ${first}, in ${mo.month}, and ${ev.spare == null ? "this month's own figure" : 'spare money after this month\'s plans'} is ${m(heading)}, below ${m(0)}: a new payment cannot start in a month heading below ${m(0)}.`);
    }
  }
  const t = tightSums(c, ev, m);
  if (t === null) return out;
  const short = mo.typicalLeft !== null && mo.typicalLeft < 0;
  // 05.4-22: under "Only by borrowing" the tight floor still shows as a fact (the borrowing caution comes first, BR-01)
  const engineTight = res.variant === 'tight' || (res.code === 'fits_by_borrowing' && res.facts.some((f) => f.code === 'tight_floor'));
  const flag = !short && t.tight !== engineTight ? 'PAGE AND ENGINE DISAGREE: ' : '';
  if (t.plan !== null) {
    const pl = t.plan;
    out.push(
      `${flag}Tight each month (FIN-07): about ${m(pl.monthly)} a month is ${pl.sharePct}% of the usual ${m(pl.room)} room (${pl.over80 ? 'more than' : 'not more than'} 80%) and leaves ${m(pl.leftEach)} a month, ` +
        `${pl.leftEach < t.floor ? 'under' : 'not under'} the floor (${t.floorText}), so ${pl.over80 || pl.leftEach < t.floor ? 'it is "Fits, but tight each month"' : 'the plan part is not tight'}.`
    );
  }
  if (t.once !== null) {
    const o = t.once;
    out.push(
      `${flag}Tight (D-40): ${o.baseIsSpare ? 'spare money' : "this month's own figure (spare money is not known)"} ${m(o.base)} + extra savings above the safety net's size ${m(o.above)} - ${m(o.used)} paid from them = ${m(o.left)} left, ` +
        `${o.left < t.floor ? 'under' : 'not under'} the floor (${t.floorText}), so ${o.left < t.floor ? 'it is "Fits, but tight"' : 'the one-off part is not tight'}.`
    );
  }
  if (short && t.tight) out.push('The usual month is already short, so the month-short headline leads and tight is not shown (D-63 / D-65).');
  if (engineTight) out.push('Tight leads every safety-net caution, costly debt, extra savings and a low month (D-59); their facts still show below it.');
  return out;
}

/** 05.4-21: a check whose page-own tight sums fall within twice the floor, or a plan over 60% of the room (close calls). */
function tightCloseCall(c: CorpusCase): boolean {
  const ev = evaluate(c.inputs, c.check);
  const t = tightSums(c, ev, (n) => String(n));
  if (t === null || (ev.month.typicalLeft !== null && ev.month.typicalLeft < 0)) return false;
  const plan = t.plan !== null && (t.plan.leftEach < 2 * t.floor || t.plan.monthly * 100 > t.plan.room * 60);
  const once = t.once !== null && t.once.left < 2 * t.floor;
  return plan || once;
}

/**
 * 05.4-21: the approved right-answer cases for short months and tight (expected tight, or a case that pins "not tight"). They are
 * not in the corpus, so they show here with the engine's answer now and the approved answer. A plan runs with its pause question
 * answered (no interest during the pause: these plans are 0%), as the crosscheck's table pins do; through the fixture as written
 * the engine asks that question first (BO-05 / FIN-05).
 */
function tightCasesHtml(): string {
  const rows: string[] = [];
  const picked = loadCases().filter(
    (x) => x.status === 'approved' && (x.expected.variant === 'tight' || x.expected.mustNotHaveFacts.includes('tight_floor') || x.fixIds.includes('FIN-06'))
  );
  for (const rc of picked) {
    const { inputs, check } = toEngineInputs(rc.fixture);
    const fp = check.pay.mode === 'plan' ? check.pay.firstPayment : null;
    const answered = check.pay.mode === 'plan' && fp !== null && fp.kind === 'deferred' ? { ...check, pay: { ...check.pay, firstPayment: { ...fp, interestDuringPause: false } } } : check;
    const c: CorpusCase = { key: `case:${rc.id}`, label: `${rc.id} ${rc.persona}`, inputs, check: answered };
    const p = evaluate(inputs, answered);
    const left = p.result.facts.find((f) => f.code === 'month_left_after')?.values['left'];
    const b = breakdown(c);
    const same = p.result.code === rc.expected.code && p.result.variant === rc.expected.variant;
    rows.push(
      `<li><b>${esc(rc.id)} ${esc(rc.persona)}</b>${check.pay.mode === 'plan' ? ' (plan, pause question answered)' : ''}<br>Engine now: ${esc(words({ code: p.result.code, variant: p.result.variant, afterBuyMonth: typeof left === 'number' ? left : null }))}<br>` +
        `Approved right answer: ${esc(words({ code: rc.expected.code, variant: rc.expected.variant, afterBuyMonth: rc.expected.afterBuy.month }))}${same ? ' (same code and variant)' : ' (DIFFERENT: see the audit box)'}` +
        auditHtml(auditOf(c.key)) +
        `<details><summary>Situation and full breakdown</summary>${situationHtml(c)}${sectionsHtml(b.sections)}<h4>Step by step</h4><ol>${b.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details></li>`
    );
  }
  return `<h2>Right-answer cases for short months and tight (${rows.length})</h2><p>These approved cases are not in the corpus. Their answers before this fix are in 05.4-21-FIN-06-AUDIT.md.</p><ul>${rows.join('')}</ul>`;
}

/** 05.4-22: the page's own borrowing figures for a plan (FIN-05, D-07, D-39a, D-39c), from the plan card's payment lines. */
export interface BorrowSums {
  readonly borrowed: number;
  readonly paid: number;
  readonly interest: number;
  readonly fees: number;
  readonly sharePct: string;
  readonly rate: string;
  readonly rateLine: boolean;
  readonly shareLine: boolean;
  readonly housing: boolean;
  readonly expensive: boolean;
  readonly cash: Evaluation['result'];
  readonly cashFits: boolean;
  readonly costsMore: number;
}

export function borrowSums(c: CorpusCase, ev: Evaluation): BorrowSums | null {
  const pay = c.check.pay;
  const pc = ev.planCard;
  const s = ev.purchase?.schedule ?? null;
  if (pay.mode !== 'plan' || pc === null || s === null) return null;
  const borrowed = s.financed;
  const paid = pc.lines.reduce((t, x) => t + x.count * x.amount, 0);
  const interest = paid - borrowed;
  const fees = pc.fees;
  const housing = pay.housing === true;
  const rateLine = pay.apr !== null && pay.apr * 100n >= 2000n * PERCENT_SCALE;
  const shareLine = borrowed > 0 && interest * 10 >= borrowed;
  const cash = evaluate(c.inputs, { ...c.check, pay: { mode: 'once' } }).result;
  return {
    borrowed,
    paid,
    interest,
    fees,
    sharePct: borrowed > 0 ? ((interest * 100) / borrowed).toFixed(2) : '0',
    rate: pay.apr === null ? 'not given' : rateText(pay.apr),
    rateLine,
    shareLine,
    housing,
    expensive: borrowed > 0 && (rateLine || (!housing && shareLine)),
    cash,
    cashFits: cash.code === 'fits_month' || cash.code === 'fits_unspent',
    costsMore: interest + fees,
  };
}

/**
 * 05.4-22 (FIN-05, D-07, D-39a, D-39c, D-48): the page's own borrowing steps: the amount borrowed, the payments added up, the
 * interest and its share of the amount borrowed, the two lines (20% APR, 10% of the amount borrowed; a home loan skips the second),
 * the cash route (the same price paid once: its answer, its ready date or what it leaves) and what borrowing costs on top, then the
 * headline the rule gives. A disagreement with the engine is said in capitals.
 */
export function borrowSteps(c: CorpusCase, ev: Evaluation, m: (n: number) => string): string[] {
  const b = borrowSums(c, ev);
  const res = ev.result;
  if (b === null || res.code === 'needs_input') return [];
  const out: string[] = [];
  const pc = ev.planCard as NonNullable<Evaluation['planCard']>;
  const flagFig = b.interest !== pc.interest ? 'PAGE AND ENGINE DISAGREE: ' : '';
  out.push(
    `${flagFig}Borrowing (FIN-05): ${m(b.borrowed)} borrowed; the payments add up to ${pc.lines.map((x) => `${x.count} x ${m(x.amount)}`).join(' + ')} = ${m(b.paid)}, ` +
      `so the interest is ${m(b.interest)} (${b.sharePct}% of the amount borrowed; engine ${m(pc.interest)}) and the plan's fees ${m(b.fees)}. All in, the plan costs ${m(pc.total)}.`
  );
  out.push(
    `The rate is ${b.rate} a year: ${b.rateLine ? '20% or more' : 'under 20%'}. The interest is ${b.sharePct}% of the amount borrowed: ${b.shareLine ? '10% or more' : 'under 10%'}` +
      `${b.housing ? ', but a home loan skips the 10% line (D-39c)' : ''}. So the plan is ${b.expensive ? 'expensive' : 'not expensive'} (D-07: FincWin's lines, not law).`
  );
  const left = b.cash.facts.find((f) => f.code === 'unspent_before_after')?.values['after'] ?? b.cash.facts.find((f) => f.code === 'month_left_after')?.values['left'];
  const ready = b.cash.readyBy === null ? '' : `, ready ${b.cash.readyBy.kind === 'date' ? b.cash.readyBy.date : b.cash.readyBy.month}`;
  out.push(
    `Paying the ${m(c.check.price ?? 0)} at once instead: ${words({ code: b.cash.code, variant: b.cash.variant, afterBuyMonth: null })}${ready}` +
      `${b.cashFits && typeof left === 'number' ? `, leaving ${m(left)}` : ''}. Borrowing costs ${m(b.costsMore)} more than paying cash (the interest and the plan's fees).`
  );
  const byCash = res.facts.some((f) => f.code === 'short_plan_from_cash');
  const mon = res.parts.monthly;
  const ownCode = mon === null || byCash ? res.parts.oneOff : (RANK[res.parts.oneOff] ?? 0) >= (RANK[mon] ?? 0) ? res.parts.oneOff : mon;
  const fitsOwn = ['fits_month', 'fits_unspent', 'fits_uses_net', 'fits_uses_overdraft'].includes(ownCode);
  const short = ev.month.typicalLeft !== null && ev.month.typicalLeft < 0;
  const pageBorrowed = b.expensive && fitsOwn;
  const flag = pageBorrowed !== (res.code === 'fits_by_borrowing') ? 'PAGE AND ENGINE DISAGREE: ' : '';
  if (!b.expensive) out.push(`${flag}Not expensive, so the plan keeps its own answer (${LABEL[ownCode] ?? ownCode}).`);
  else if (!fitsOwn) out.push(`${flag}Expensive, but the plan itself does not fit (${LABEL[ownCode] ?? ownCode}), so that stricter answer leads; the save-or-borrow line still shows.`);
  else if (b.cash.code === 'needs_input') out.push(`${flag}Expensive and the plan fits, but paying at once asks for a figure first: "Only by borrowing", with no comparison.`);
  else out.push(`${flag}Expensive and the plan fits (${LABEL[ownCode] ?? ownCode}): ${b.cashFits ? 'cash fits too, so "Fits, but borrowing costs more" (D-39a)' : 'cash does not fit yet, so "Only by borrowing"'}${short ? '; the usual month is already short, so its D-63 / D-65 headline leads' : ''}.`);
  const d48 = ['interest_is_a_cost', 'net_covers_surprises', 'income_or_costs_first'].filter((k) => res.facts.some((f) => f.code === k));
  out.push(`The borrowing lines on every plan answer (D-48): ${d48.join(', ')}${b.interest > 0 ? '' : ' (0%: no interest line)'}.`);
  return out;
}

/**
 * 05.4-22: the approved right-answer cases on a plan (borrowing, the debts and quick-estimates plans). They are not in the corpus,
 * so they show here with the engine's answer now, the approved answer and the full breakdown (with the borrowing steps).
 */
function borrowingCasesHtml(): string {
  const rows: string[] = [];
  for (const rc of loadCases().filter((x) => x.status === 'approved' && x.fixture.check.pay.mode === 'plan')) {
    const { inputs, check } = toEngineInputs(rc.fixture);
    const c: CorpusCase = { key: `case:${rc.id}`, label: `${rc.id} ${rc.persona}`, inputs, check };
    const r = evaluate(inputs, check).result;
    const left = r.facts.find((f) => f.code === 'month_left_after')?.values['left'];
    const b = breakdown(c);
    const ready = (x: string | null): string => (x === null ? '' : `, ready ${x}`);
    const got = r.readyBy === null ? null : r.readyBy.kind === 'date' ? r.readyBy.date : r.readyBy.month;
    const same = r.code === rc.expected.code && r.variant === rc.expected.variant && got === rc.expected.readyBy;
    rows.push(
      `<li><b>${esc(rc.id)} ${esc(rc.persona)}</b><br>Engine now: ${esc(words({ code: r.code, variant: r.variant, afterBuyMonth: typeof left === 'number' ? left : null }))}${esc(ready(got))}<br>` +
        `Approved right answer: ${esc(words({ code: rc.expected.code, variant: rc.expected.variant, afterBuyMonth: rc.expected.afterBuy.month }))}${esc(ready(rc.expected.readyBy))}${same ? ' (same code, variant and ready date)' : ' (DIFFERENT: see the audit box)'}` +
        auditHtml(auditOf(c.key)) +
        `<details><summary>Situation and full breakdown</summary>${situationHtml(c)}${sectionsHtml(b.sections)}<h4>Step by step</h4><ol>${b.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details></li>`
    );
  }
  return `<h2>Right-answer cases on a plan (${rows.length})</h2><p>These approved cases are not in the corpus. Before this fix every one asked the pause question first (the fixture mapped no first payment); their answers now are above.</p><ul>${rows.join('')}</ul>`;
}
