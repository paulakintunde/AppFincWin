/**
 * Right-answer fixture to engine inputs (05.4-05). Test-only; the calculator never imports this.
 * Builds synthetic full months before asOf from the fixture's usual month, plus the current part-month.
 * The fixture states usual figures, never derived ones (spare, left, typical): the engine derives those.
 */
import { currencyCode, minorUnits, type MinorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import type { AccountUse, Cadence, CheckV2, PayV2, V3Account, V3Debt, V3Inputs, V3Month } from '../../types';
import { checkOnce, inputsOf, monthOf, v3Line, v3Series } from '../helpers/fixtures';
import type { RightAnswerFixture } from './schema';

const mu = (n: number): MinorUnits => minorUnits(n);

function monthBefore(ym: string, back: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const t = y * 12 + (m - 1) - back;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

function cadenceOf(c: RightAnswerFixture['pay']['cadence']): Cadence {
  if (c === 'monthly') return { unit: 'month', every: 1 };
  return { unit: 'week', every: c === 'fortnightly' ? 2 : 1 };
}

/** One month of pay at the fixture cadence (26 fortnights or 52 weeks a year). */
function monthlyPay(p: RightAnswerFixture['pay']): number {
  if (p.cadence === 'monthly') return p.amount;
  return Math.round((p.amount * (p.cadence === 'fortnightly' ? 26 : 52)) / 12);
}

function useOf(a: RightAnswerFixture['accounts'][number]): AccountUse | null {
  if (a.use === 'everyday') return { kind: 'everyday' };
  if (a.use === 'emergency') return { kind: 'dedicated', purpose: { kind: 'emergency' } };
  if (a.use === 'untouched') return { kind: 'untouched' };
  return null;
}

function payOf(p: RightAnswerFixture['check']['pay']): PayV2 {
  if (p.mode === 'once') return { mode: 'once' };
  return {
    mode: 'plan',
    cadence: p.every === 'fortnight' ? { unit: 'week', every: 2 } : { unit: 'month', every: 1 },
    count: p.months,
    termMonths: p.every === 'fortnight' ? null : p.months,
    apr: p.apr === null ? null : percent(p.apr),
    fees: { setup: mu(p.fees), perPeriod: mu(0), end: mu(0) },
    deposit: mu(p.deposit),
    tradeIn: mu(0),
    quotedPayment: null,
    firstPayment: { kind: 'deferred', firstDate: p.firstPaymentDate, interestDuringPause: null },
    deferredInterestTerm: p.deferredInterest === true,
  };
}

export function toEngineInputs(f: RightAnswerFixture): { inputs: V3Inputs; check: CheckV2 } {
  const ym = f.asOf.slice(0, 7);
  const start = `${monthBefore(ym, f.historyMonths)}-01`;
  const pay = v3Series({ id: 'pay', role: 'pay', cadence: cadenceOf(f.pay.cadence), anchorDate: f.pay.cadence === 'monthly' ? start : f.pay.nextDate, amount: f.pay.amount });
  const bills = v3Series({ id: 'bills', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: start, amount: f.usualMonth.bills });
  const months: V3Month[] = [];
  for (let i = f.historyMonths; i >= 1; i--) {
    const m = monthBefore(ym, i);
    months.push(
      monthOf(m, [
        v3Line({ id: `in-${m}`, date: `${m}-01`, amount: monthlyPay(f.pay), role: 'income', seriesId: 'pay' }),
        v3Line({ id: `bill-${m}`, date: `${m}-02`, amount: f.usualMonth.bills, seriesId: 'bills' }),
        v3Line({ id: `day-${m}`, date: `${m}-15`, amount: f.usualMonth.everyday }),
      ])
    );
  }
  const t = f.thisMonth;
  months.push(
    monthOf(
      ym,
      [
        ...(t.received > 0 ? [v3Line({ id: `in-${ym}`, date: `${ym}-01`, amount: t.received, role: 'income' as const, seriesId: 'pay' })] : []),
        ...(t.billsPaid > 0 ? [v3Line({ id: `bill-${ym}`, date: `${ym}-01`, amount: t.billsPaid, seriesId: 'bills' })] : []),
        ...(t.everydaySoFar > 0 ? [v3Line({ id: `day-${ym}`, date: `${ym}-01`, amount: t.everydaySoFar })] : []),
      ],
      { full: false }
    )
  );
  // mapped when FIN-03 lands: overdraftLimit, overdraftRate
  // mapped when FIN-01 lands: safetyNet (protect, size, saved)
  // mapped when FIN-04 lands: debt dueDay and joint
  // mapped when BO-05 lands: plan first-payment choices beyond the engine's own
  // mapped when FIN-27 lands: region rules, check.taxIncluded
  // mapped when ENG-14 lands: check.runningCosts and check.closingPercent
  // mapped when FIN-07 lands: check.replaces (stops and sale)
  // mapped when FIN-08 lands: userLine, check.yourAnswer, check.saveForIt
  // mapped when FIN-09 lands: bills list, recordsAsOf, quickEstimates, pay.lastThree and pay.setupAmount
  // mapped when FIN-08 / plan 05.4-23 lands: pay.lean (low months stated explicitly)
  // mapped when FIN-04 lands: debt paidThisMonth (part of a minimum already paid)
  // mapped when D-41 lands (05.4-18): check.purpose (need or want; words and order only)
  const accounts: V3Account[] = f.accounts.map((a) => ({ id: a.id, balance: mu(a.balance), use: useOf(a) }));
  const debts: V3Debt[] = f.debts.map((d) => ({
    id: d.id, kind: d.kind, balance: mu(d.balance), minimum: mu(d.minimum), apr: d.apr === null ? null : percent(d.apr), secured: false, isHousing: d.housing === true,
  }));
  const spending = f.accounts.filter((a) => a.kind === 'checking' || a.kind === 'current').reduce((s, a) => s + a.balance, 0);
  const inputs = inputsOf({
    asOf: f.asOf,
    currency: currencyCode(f.currency),
    region: f.region ? (f.region.subdivision ? `${f.region.country}-${f.region.subdivision}` : f.region.country) : null,
    months,
    series: [pay, bills],
    balance: mu(spending),
    accounts,
    debts,
    unspent: { amount: mu(Math.max(0, spending)), at: f.asOf },
  });
  const c = f.check;
  const check = checkOnce(c.price ?? 0, {
    price: c.price === null ? null : mu(c.price),
    taxPercent: c.taxPercent === null ? null : percent(c.taxPercent),
    oneOffFees: mu(c.oneOffFees),
    pay: payOf(c.pay),
  });
  return { inputs, check };
}
