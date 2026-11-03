/**
 * Right-answer fixture to engine inputs (05.4-05). Test-only; the calculator never imports this.
 * Builds synthetic full months before asOf from the fixture's usual month, plus the current part-month.
 * The fixture states usual figures, never derived ones (spare, left, typical): the engine derives those.
 */
import { currencyCode, minorUnits, type MinorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import type { AccountUse, Cadence, CheckV2, PayV2, V3Account, V3Debt, V3Inputs, V3Month } from '../../types';
import { buildFunds } from '../../funds/build';
import { buildMonthModel } from '../../month/model';
import { checkOnce, inputsOf, monthOf, v3Line, v3Series } from '../helpers/fixtures';
import type { RightAnswerFixture } from './schema';

const mu = (n: number): MinorUnits => minorUnits(n);

/** 05.4 ARC-07: the category the fixture's essential everyday spending is logged under, marked essential in the inputs. */
const ESSENTIAL = 'essential';

function monthBefore(ym: string, back: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const t = y * 12 + (m - 1) - back;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Days in 'YYYY-MM'. */
function daysIn(ym: string): number {
  return new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
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

/**
 * A savings account with no use stated is money kept aside, not spending money (05.4-17, OD-07: an empty savings account is
 * not asked about). Any other account with no use stays unstated, so the engine asks first.
 */
function useOf(a: RightAnswerFixture['accounts'][number]): AccountUse | null {
  if (a.use === 'everyday') return { kind: 'everyday' };
  if (a.use === 'emergency') return { kind: 'dedicated', purpose: { kind: 'emergency' } };
  if (a.use === 'untouched' || a.kind === 'savings') return { kind: 'untouched' };
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
  // 05.4 D-52: irregular pay has no pay series; each history month's income is one unlinked line on the stated day.
  const irr = f.pay.irregular;
  const months: V3Month[] = [];
  for (let i = f.historyMonths; i >= 1; i--) {
    const m = monthBefore(ym, i);
    const income = irr
      ? v3Line({ id: `in-${m}`, date: `${m}-${pad(Math.min(irr.day, daysIn(m)))}`, amount: irr.amounts[f.historyMonths - i] ?? 0, role: 'income', seriesId: null })
      : v3Line({ id: `in-${m}`, date: `${m}-01`, amount: monthlyPay(f.pay), role: 'income', seriesId: 'pay' });
    months.push(
      monthOf(m, [
        income,
        v3Line({ id: `bill-${m}`, date: `${m}-02`, amount: f.usualMonth.bills, seriesId: 'bills' }),
        // 05.4 ARC-07: the essential part of everyday spending sits in a category marked essential (the starter safety net).
        ...(f.usualMonth.everyday - f.usualMonth.essentialEveryday > 0
          ? [v3Line({ id: `day-${m}`, date: `${m}-15`, amount: f.usualMonth.everyday - f.usualMonth.essentialEveryday })]
          : []),
        ...(f.usualMonth.essentialEveryday > 0
          ? [v3Line({ id: `ess-${m}`, date: `${m}-15`, amount: f.usualMonth.essentialEveryday, categoryId: ESSENTIAL })]
          : []),
      ])
    );
  }
  const t = f.thisMonth;
  months.push(
    monthOf(
      ym,
      [
        ...(t.received > 0 ? [v3Line({ id: `in-${ym}`, date: `${ym}-01`, amount: t.received, role: 'income' as const, seriesId: irr ? null : 'pay' })] : []),
        ...(t.billsPaid > 0 ? [v3Line({ id: `bill-${ym}`, date: `${ym}-01`, amount: t.billsPaid, seriesId: 'bills' })] : []),
        ...(t.everydaySoFar > 0 ? [v3Line({ id: `day-${ym}`, date: `${ym}-01`, amount: t.everydaySoFar })] : []),
      ],
      { full: false }
    )
  );
  // mapped when FIN-04 lands: debt dueDay and joint
  // mapped when BO-05 lands: plan first-payment choices beyond the engine's own
  // mapped when FIN-27 lands: region rules, check.taxIncluded
  // mapped when ENG-14 lands: check.runningCosts and check.closingPercent
  // mapped when FIN-07 lands: check.replaces (stops and sale)
  // mapped when FIN-08 lands: userLine, check.yourAnswer, check.saveForIt
  // mapped when FIN-09 lands: bills list, pay.lastThree and pay.setupAmount
  // mapped when FIN-08 / plan 05.4-23 lands: pay.lean (low months stated explicitly)
  // mapped when FIN-04 lands: debt paidThisMonth (part of a minimum already paid)
  // mapped when FIN-05 / D-39c lands: check.pay.housing (a mortgage skips the 10% interest test)
  // 05.4 FIN-03: kind, overdraft limit and rate as stated (the engine reads a limit only on checking and current accounts).
  const accounts: V3Account[] = f.accounts.map((a) => ({
    id: a.id,
    balance: mu(a.balance),
    use: useOf(a),
    kind: a.kind,
    overdraftLimit: a.overdraftLimit === null ? null : mu(a.overdraftLimit),
    overdraftRate: a.overdraftRate === null ? null : percent(a.overdraftRate),
  }));
  const debts: V3Debt[] = f.debts.map((d) => ({
    id: d.id, kind: d.kind, balance: mu(d.balance), minimum: mu(d.minimum), apr: d.apr === null ? null : percent(d.apr), secured: false, isHousing: d.housing === true,
  }));
  const spending = f.accounts.filter((a) => a.kind === 'checking' || a.kind === 'current').reduce((s, a) => s + a.balance, 0);
  const inputs0 = inputsOf({
    asOf: f.asOf,
    currency: currencyCode(f.currency),
    region: f.region ? (f.region.subdivision ? `${f.region.country}-${f.region.subdivision}` : f.region.country) : null,
    months,
    series: irr ? [bills] : [pay, bills],
    ...(irr ? { profile: { types: ['freelance'], variable: 'steady', steady: mu(f.pay.amount), billsHorizonMonths: null } } : {}),
    balance: mu(spending),
    accounts,
    debts,
    unspent: { amount: mu(spending), at: f.asOf }, // replaced below by the app's own suggested figure
    // 05.4-15 (ENG-11, ENG-14): quick estimates are the engine's typed estimates; their spending is bills plus everyday
    // (the same total the app stores as rough_spending). The records date is passed as given.
    typedEstimates:
      f.quickEstimates === null
        ? null
        : { income: mu(f.quickEstimates.income), expenses: mu(f.quickEstimates.bills + f.quickEstimates.everyday), saving: mu(0), debt: mu(0), invest: mu(0), asOf: f.asOf },
    recordsAsOf: f.recordsAsOf,
    // 05.4 FIN-01 (D-35): the safety net as stated; null = no record (protection on, the starter size, nothing saved).
    safetyNet: f.safetyNet === null ? null : { protect: f.safetyNet.protect, size: f.safetyNet.size === null ? null : mu(f.safetyNet.size), saved: mu(f.safetyNet.saved), locked: f.safetyNet.locked },
    essentialCategoryIds: f.usualMonth.essentialEveryday > 0 ? [ESSENTIAL] : [],
  });
  // 05.4-18: the confirmed unspent figure is the app's own suggested sum (spending money less the bills still due and the
  // everyday spending still to come), as a user who confirms it would see it. A raw balance would count this month's spending
  // still to come as money from earlier months (SN-04: "$300 now and $300 a month", not $700). Signed (05.4 ENG-02).
  const mm = buildMonthModel(inputs0);
  const toArrive = mm.moneyIn - t.received > 0 ? mm.moneyIn - t.received : 0;
  const inputs: V3Inputs = { ...inputs0, unspent: { amount: mu(buildFunds(inputs0, mm, null).suggested + toArrive), at: f.asOf } };
  const c = f.check;
  const check = checkOnce(c.price ?? 0, {
    price: c.price === null ? null : mu(c.price),
    taxPercent: c.taxPercent === null ? null : percent(c.taxPercent),
    oneOffFees: mu(c.oneOffFees),
    pay: payOf(c.pay),
    // 05.4 D-41: the need-or-want reading (words and the order of facts only).
    purpose: c.purpose == null ? null : { kind: 'preset', value: c.purpose },
  });
  return { inputs, check };
}
