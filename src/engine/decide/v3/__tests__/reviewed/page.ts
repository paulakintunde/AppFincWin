/**
 * 05.4-08 (D-14): the changed-answers page. Pure string building from the corpus and the changes list, so the write test and the
 * read-only page mode share it. Each changed check shows the person's situation, read straight from the engine inputs (no prose
 * written by hand). Test-only; everyone here is synthetic. No scripts in the page.
 */
import type { CheckV2, LocalDate, V3Inputs } from '../../types';
import type { CorpusCase, ReviewedAnswer, ReviewedChange } from './corpus';

const LABEL: Record<string, string> = {
  fits_month: 'Fits',
  fits_unspent: 'Fits from spare money',
  emergency_use: 'Dips into your safety net',
  fits_uses_net: 'Dips into your safety net',
  fits_uses_overdraft: 'Uses your overdraft',
  monthly_short: 'Short each month',
  not_yet: 'Not yet',
  needs_input: 'Needs a figure first',
};
// The CODE_PRECEDENCE order (05.4-18 adds fits_uses_net next to the stored-only emergency_use).
const RANK: Record<string, number> = { fits_month: 0, fits_unspent: 1, fits_uses_net: 2, emergency_use: 3, fits_uses_overdraft: 4, monthly_short: 5, not_yet: 6, needs_input: 7 };
const VARIANT: Record<string, string> = {
  payday: 'payday',
  not_covered: 'not covered',
  low_month: 'low month',
  not_cleared: 'past payday',
  no_net: 'but no safety net',
  small_net: 'but your safety net is small',
  protection_off: 'protection off',
};

export const words = (a: ReviewedAnswer): string => {
  const base = LABEL[a.code] ?? a.code;
  const v = a.variant === null ? '' : ` (${VARIANT[a.variant] ?? a.variant})`;
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
  else if (fullMonths.length > 0) rows.push(['Usual everyday spending a month', `about ${m(Math.round(fullMonths.reduce((a, x) => a + spend(x.lines), 0) / fullMonths.length))}`]);
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
      const od = a.overdraftLimit === null || a.overdraftLimit === undefined ? '' : `, overdraft limit ${m(a.overdraftLimit)}${a.overdraftRate ? ` at ${a.overdraftRate}%` : ''}`;
      rows.push([`Account ${a.id}`, `${m(a.balance)}${od}; ${accountUseWords(a.use)}`]);
    }
  } else rows.push(['Money in the bank', m(inputs.balance)]);
  const net = inputs.safetyNet;
  if (net) rows.push(['Safety net', `${net.protect ? 'protected' : 'protection off'}, saved ${m(net.saved)}${net.size === null ? ', starter size' : `, size ${m(net.size)}`}`]);
  else if (inputs.emergency) rows.push(['Safety net', `saved ${m(inputs.emergency.amount)}, protected`]);
  for (const d of inputs.debts) rows.push([`Debt (${d.kind})`, `owes ${m(d.balance)}, minimum ${m(d.minimum)} a month${d.apr ? `, ${d.apr}% a year` : ''}`]);
  if (inputs.months.length > 0) rows.push(['Months of history', String(fullMonths.length)]);
  rows.push(['Buying', check.price === null ? 'no price yet' : m(check.price)]);
  if (check.taxPercent) rows.push(['Tax', `${check.taxPercent}%`]);
  if (check.oneOffFees) rows.push(['Fees', m(check.oneOffFees)]);
  if (check.pay.mode === 'plan') {
    const p = check.pay;
    const n = p.count ?? p.termMonths;
    rows.push(['Paying', `in a plan${n === null ? '' : `, ${n} payments`}${p.apr ? ` at ${p.apr}% a year` : ''}${p.deposit ? `, deposit ${m(p.deposit)}` : ''}`]);
    if (p.firstPayment) rows.push(['First payment', p.firstPayment.kind === 'today' ? 'today' : p.firstPayment.kind === 'one_period' ? 'one period from today' : p.firstPayment.firstDate]);
  } else rows.push(['Paying', 'in cash, all at once']);
  rows.push(['Check date', inputs.asOf]);
  return rows;
}

export function situationHtml(c: CorpusCase): string {
  const rows = situationRows(c.inputs, c.check).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  return `<table>${rows}</table>`;
}

const who = (c: CorpusCase, key: string): string => {
  const g = /^gen:(\d+)$/.exec(key);
  return g ? `Generated person ${g[1]} (made up from a fixed seed, the same every run)` : c.label;
};

const CSS = 'body{font-family:system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px;line-height:1.45}li{margin:10px 0}table{border-collapse:collapse;width:100%}th,td{text-align:left;border-bottom:1px solid #ccc;padding:3px 6px;font-size:.9rem}th{width:40%;font-weight:normal}summary{cursor:pointer}';

export function buildPage(fixId: string, changes: readonly ReviewedChange[], cases: readonly CorpusCase[]): string {
  const byKey = new Map(cases.map((c) => [c.key, c]));
  const groups = { stricter: [] as ReviewedChange[], looser: [] as ReviewedChange[], detail: [] as ReviewedChange[] };
  for (const c of changes) groups[group(c.before, c.after)].push(c);
  const item = (ch: ReviewedChange, open: boolean): string => {
    const c = byKey.get(ch.key);
    const name = c === undefined ? ch.key : who(c, ch.key);
    const sit = c === undefined ? '<p>Situation not found in the corpus.</p>' : situationHtml(c);
    return `<li><b>${esc(name)}</b> <code>${esc(ch.key)}</code><br>${esc(words(ch.before))} &rarr; ${esc(words(ch.after))}<details${open ? ' open' : ''}><summary>Situation</summary>${sit}</details></li>`;
  };
  const section = (title: string, list: ReviewedChange[], open: boolean): string =>
    `<h2>${title} (${list.length})</h2>` + (list.length === 0 ? '<p>None.</p>' : `<ul>${list.map((c) => item(c, open)).join('')}</ul>`);
  return (
    `<!doctype html><meta charset="utf-8"><title>${esc(fixId)}: changed answers</title><style>${CSS}</style>` +
    `<h1>${esc(fixId)}: changed answers</h1><p>${changes.length} of ${cases.length} checks changed (${groups.stricter.length} stricter, ${groups.looser.length} looser, ${groups.detail.length} same answer with different detail). Invented people only.</p>` +
    section('Stricter', groups.stricter, true) + section('Looser', groups.looser, true) + section('Same answer, detail changed', groups.detail, false)
  );
}
