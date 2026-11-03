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
import { PERCENT_SCALE } from '../../../../payoff/types';
import { applyPurchaseFlows } from '../../cash/path';
import { addDays, daysInYearMonth, yearMonthOf } from '../../dates';
import { essentialCosts, essentialSpendingOf } from '../../essentialCosts';
import { purchaseCashFlows } from '../../judge/purchase';
import { liveSeriesOf, seriesOccurrences } from '../../month/series';
import { judgeCheck, prepare, type Evaluation } from '../../prepare';
import type { CheckV2, LocalDate, V3Inputs, V3Series } from '../../types';
import auditFile from './audit.json';
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
  if (check.taxPercent) rows.push(['Tax', rateText(check.taxPercent)]);
  if (check.oneOffFees) rows.push(['Fees', m(check.oneOffFees)]);
  if (check.pay.mode === 'plan') {
    const p = check.pay;
    const n = p.count ?? p.termMonths;
    rows.push(['Paying', `in a plan${n === null ? '' : `, ${n} payments ${every(p.cadence.unit, p.cadence.every)}`}${p.apr ? ` at ${rateText(p.apr)} a year` : ''}${p.deposit ? `, deposit ${m(p.deposit)}` : ''}`]);
    if (p.firstPayment) rows.push(['First payment', p.firstPayment.kind === 'today' ? 'today' : p.firstPayment.kind === 'one_period' ? 'one period from today' : p.firstPayment.firstDate]);
  } else rows.push(['Paying', 'in cash, all at once']);
  rows.push(['Check date', inputs.asOf]);
  return rows;
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

/**
 * D-52 check: steady-but-irregular income with history and no live pay series. Returns the usual payday (median day of the
 * income lines in full months) and the low-month amount (the smallest full-month income), or null when D-52 does not apply.
 */
export function d52Pay(inputs: V3Inputs): { readonly day: number; readonly low: number; readonly months: number } | null {
  const hasPay = liveSeriesOf(inputs.series, inputs.asOf, 'pay').length > 0;
  const irregular = inputs.profile !== null && (inputs.profile.types.includes('freelance') || inputs.profile.variable !== null);
  const full = inputs.months.filter((m) => m.full && m.month < yearMonthOf(inputs.asOf));
  if (hasPay || !irregular || full.length < 3) return null;
  const days: number[] = [];
  const totals: number[] = [];
  for (const m of full) {
    const inc = m.lines.filter((l) => l.role === 'income' && l.status === 'paid');
    totals.push(inc.reduce((a, l) => a + l.amount, 0));
    for (const l of inc) days.push(Number(l.date.slice(8, 10)));
  }
  if (days.length === 0) return null;
  days.sort((a, b) => a - b);
  return { day: days[Math.floor(days.length / 2)] as number, low: Math.min(...totals), months: full.length };
}

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
  for (const x of payLater) inRows.push([`Pay expected ${x.date}`, m(x.amount)]);
  if (liveSeriesOf(inputs.series, asOf, 'pay').length === 0) inRows.push(['Pay series', 'none: the engine expects no more pay']);
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
  const availableNow = spendBalance - envelopesIn + unusedOd - promised;
  const monthEndExpected = spendBalance - envelopesIn + payToCome - billsToCome - mo.erest - savingToCome;
  for (const a of accounts) {
    acctRows.push([`${a.id}: balance on ${asOf}`, `${m(a.balance)} (${accountUseWords(a.use)})`]);
    if (!isSpendingAccount(a.use) && a.use !== null && a.use.kind === 'dedicated' && a.use.purpose.kind === 'emergency') {
      acctRows.push([`${a.id}: saved in it`, `${m(a.balance)}; kept apart from "available now"`]);
    }
  }
  if (accounts.length === 0) acctRows.push([`Balance on ${asOf}`, m(inputs.balance)]);
  const which = spendingAccounts.length > 1 ? 'spending accounts together' : (spendingAccounts[0]?.id ?? 'the account');
  if (envelopesIn > 0) acctRows.push([`In pots inside ${which}`, `${m(envelopesIn)}; kept apart`]);
  acctRows.push([
    `Available now (${which})`,
    `${m(availableNow)} = balance ${m(spendBalance)}${envelopesIn > 0 ? ` - pots ${m(envelopesIn)}` : ''} + unused overdraft ${m(unusedOd)} - bills due before the next pay${nextPay === null ? ' (no pay date)' : ` on ${nextPay}`} ${m(promised)}`,
  ]);
  acctRows.push([
    `Expected at month end, ${monthEnd} (${which})`,
    `${m(monthEndExpected)} = ${m(spendBalance - envelopesIn)} + pay still to come ${m(payToCome)} - bills still to come ${m(billsToCome)} - everyday ${m(mo.erest)} - saving ${m(savingToCome)}`,
  ]);
  if (ev.funds.unspent !== null) acctRows.push(['Confirmed spare figure (unspent)', `${m(ev.funds.unspent.value)}${ev.funds.unspent.drifted ? ' (the engine flags it as drifted from the account)' : ''}`]);
  sections.push({ title: 'Accounts (D-55)', rows: acctRows });

  // Safety net
  const netRows: [string, string][] = [];
  const ec = essentialCosts(mo, inputs.debts, essentialSpendingOf(inputs, mo));
  netRows.push(['Starter (D-51)', `${m(ec.parts.bills)} bills + ${m(ec.parts.essentialSpending)} essential spending + ${m(ec.parts.debtMinimums)} debt minimums, rounded up = ${m(ec.total)}`]);
  if (net !== undefined) {
    netRows.push(['Saved in it', `${m(net.saved)}; kept apart from available now`]);
    netRows.push(['Size', `${m(net.size)}${inputs.safetyNet?.size == null ? ' (the starter; no size set)' : ''}`]);
    netRows.push(['State', `${net.off ? 'protection off' : 'protected'}; ${net.state === 'none' ? 'nothing saved' : net.state === 'small' ? 'below its size' : net.state === 'full' ? 'at its size' : 'above its size'}`]);
    netRows.push(['Protected part', m(net.floor)]);
    netRows.push(['Saved above the size (counts as spare)', m(net.aboveSize)]);
  }
  sections.push({ title: 'Safety net', rows: netRows });

  // Debts
  if (inputs.debts.length > 0) {
    sections.push({
      title: 'Debts',
      rows: inputs.debts.map((d): [string, string] => [`${d.id} (${d.kind})`, `owes ${m(d.balance)}, minimum ${m(d.minimum)} a month, rate ${d.apr === null ? 'not given' : `${rateText(d.apr)} a year`}`]),
    });
  }

  // Plan terms
  if (c.check.pay.mode === 'plan' && ev.planCard !== null) {
    const pc = ev.planCard;
    const pay = c.check.pay;
    const borrowed = pc.price + pc.tax + pc.oneOffFees - pay.deposit - pay.tradeIn;
    sections.push({
      title: 'Plan',
      rows: [
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
  const flows = ev.purchase ? purchaseCashFlows(ev.purchase, asOf, r.open.days) : [];
  const withP = applyPurchaseFlows(r.open, opening as never, flows);
  const without = applyPurchaseFlows(r.open, opening as never, []);
  const low = (pts: typeof withP.points): (typeof withP.points)[number] => pts.reduce((a, b) => (b.balance < a.balance ? b : a), pts[0] as (typeof withP.points)[number]);
  const lw = low(withP.points);
  const lo = low(without.points);
  const pathRows: [string, string][] = [
    ['Opening', `${m(opening)} = spending money ${m(ev.funds.spending)} + own envelope ${m(ev.funds.ownEnvelope)} + saved above the net size ${m(net?.aboveSize ?? 0)}`],
  ];
  const pays = liveSeriesOf(inputs.series, asOf, 'pay').flatMap((s) => seriesOccurrences(s, addDays(asOf, 1), r.open.end).map((d) => `${d} ${m(s.amount)}`));
  pathRows.push(['Pay counted', pays.length === 0 ? 'none' : pays.join('; ')]);
  const dated = r.open.net.map((n, i) => [i, n] as const).filter(([, n]) => n !== 0n).map(([i, n]) => `${(withP.points[i] as { date: string }).date} ${m(Number(n))}`);
  pathRows.push(['Dated money in and out (pay less bills and debt payments, by day)', dated.length === 0 ? 'none' : dated.join('; ')]);
  pathRows.push(['Everyday spending spread', `${m(mo.erest)} over the rest of ${ym}, then ${m(mo.e ?? 0)} a month`]);
  if (flows.length > 0) pathRows.push(['Purchase payments in the 90 days', flows.map((f) => `${f.date} ${m(f.amount)}`).join('; ')]);
  pathRows.push(['Lowest with the purchase', `${m(lw.balance)} on ${lw.date}`]);
  pathRows.push(['Lowest without the purchase', `${m(lo.balance)} on ${lo.date}`]);
  pathRows.push(['Lowest with the purchase, counting the safety net money it may lend', `${m(lw.balance + (net?.usable ?? 0))} (lends up to ${m(net?.usable ?? 0)})`]);
  pathRows.push(['Overdraft floor', m(r.floor)]);
  const d52 = d52Pay(inputs);
  if (d52 !== null) {
    pathRows.push(['D-52 (not built yet)', `No pay series, so no pay is counted. D-52 expects pay on about day ${d52.day} of each month at the low-month amount ${m(d52.low)} (lowest of ${d52.months} full months).`]);
  }
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
  else if (cash.kind === 'net') steps.push(`It goes ${m(-lw.balance)} below ${m(0)}. The safety net can lend ${m(net?.usable ?? 0)}, which covers it, so the purchase dips into the safety net. The purchase adds ${m(cash.added)} to that dip.`);
  else steps.push(`It goes ${m(cash.shortBy)} below ${m(0)}, past the overdraft floor, and the safety net cannot cover it.`);
  if (ev.result.parts.monthly !== null) steps.push(`One-off part: ${LABEL[ev.result.parts.oneOff] ?? ev.result.parts.oneOff}. Monthly part: ${LABEL[ev.result.parts.monthly] ?? ev.result.parts.monthly}. The stricter one leads.`);
  if (net !== undefined && (ev.result.code === 'fits_month' || ev.result.code === 'fits_unspent')) {
    steps.push(net.state === 'none' ? 'Nothing is saved in a safety net, so a fit carries "but no safety net" (D-35).' : net.state === 'small' ? `The safety net holds ${m(net.saved)} of its ${m(net.size)} size, so a fit carries "but your safety net is small" (D-35).` : 'The safety net is at or above its size, so no net caution.');
  }
  steps.push(`Engine answer: ${words({ code: ev.result.code, variant: ev.result.variant, afterBuyMonth: left === null ? null : (left['left'] as number) })}.`);
  return { sections, steps };
}

function sectionsHtml(sections: readonly Section[]): string {
  return sections.map((s) => `<h4>${esc(s.title)}</h4><table>${s.rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`).join('');
}

function auditHtml(a: AuditEntry | null): string {
  if (a === null) return '<div class="audit"><h4>Audit</h4><p>Not audited yet.</p></div>';
  const notes = a.notes.length === 0 ? '' : `<ul>${a.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  const d54 = a.d54 === undefined || a.d54.length === 0 ? '' : `<p><b>D-54 lines (drafted, not built yet):</b></p><ul>${a.d54.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
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
  return (
    `<!doctype html><meta charset="utf-8"><title>${esc(fixId)}: changed answers</title><style>${CSS}</style>` +
    `<h1>${esc(fixId)}: changed answers</h1><p>${changes.length} of ${cases.length} checks changed (${groups.stricter.length} stricter, ${groups.looser.length} looser, ${groups.detail.length} same answer with different detail). Invented people only.</p>` +
    `<p>Audit: ${esc(verdictLine)}. Each change shows its Audit box first, then the full breakdown.</p>` +
    section('Stricter', groups.stricter, false) + section('Looser', groups.looser, false) + section('Same answer, detail changed', groups.detail, false)
  );
}
