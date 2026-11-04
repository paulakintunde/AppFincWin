/**
 * Right-answer fixture to engine inputs (05.4-05). Test-only; the calculator never imports this.
 * Builds synthetic full months before asOf from the fixture's usual month, plus the current part-month.
 * The fixture states usual figures, never derived ones (spare, left, typical): the engine derives those.
 */
import { currencyCode, minorUnits, type MinorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import type { AccountUse, Cadence, CheckV2, PayV2, ReadinessWaiver, V3Account, V3Debt, V3Inputs, V3Line, V3Month, V3Series } from '../../types';
import { addMonthsClamped } from '../../dates';
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

/** The first pay date after asOf; null when none in sight (irregular pay has no pay series, D-52). */
function firstPayAfter(f: RightAnswerFixture): string | null {
  if (f.pay.irregular !== undefined) return null;
  for (let i = 0; i < 60; i++) {
    const d = f.pay.cadence === 'monthly' ? addMonthsClamped(f.pay.nextDate, i) : addDays(f.pay.nextDate, i * (f.pay.cadence === 'fortnightly' ? 14 : 7));
    if (d > f.asOf) return d;
  }
  return null;
}

function addDays(date: string, n: number): string {
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + n)).toISOString().slice(0, 10);
}

/**
 * 05.4-19 (FIN-11): the due date of the bills still due this month that the bills list does not name: the day before the next
 * pay, or the last day of this month when that is sooner; with irregular pay (no pay series, D-52) the last day of this month;
 * with no pay in sight, today. The plain calculator lands them on the same day.
 */
export function undatedDueDate(f: RightAnswerFixture): string {
  const ym = f.asOf.slice(0, 7);
  const monthEnd = `${ym}-${pad(daysIn(ym))}`;
  if (f.pay.irregular !== undefined) return monthEnd;
  const next = firstPayAfter(f);
  if (next === null) return f.asOf;
  const before = addDays(next, -1);
  return before < monthEnd ? before : monthEnd;
}

/** A monthly series anchor on day `day` at or before month `ym`, in a month long enough to hold that day (so later months keep it). */
function monthlyAnchor(ym: string, day: number): string {
  for (let back = 0; ; back++) {
    const m = monthBefore(ym, back);
    if (daysIn(m) >= day) return `${m}-${pad(day)}`;
  }
}

/** Day `day` of month `ym`, clamped to the month (the engine's own month step). */
const dayOf = (ym: string, day: number): string => `${ym}-${pad(Math.min(day, daysIn(ym)))}`;

interface MappedBills {
  series: V3Series[];
  /** the paid bill lines of one history month */
  history: (m: string) => V3Line[];
  /** this month's paid bill lines */
  now: V3Line[];
  waivers: ReadinessWaiver[];
}

/**
 * 05.4-19 (FIN-11): the fixture's bills list as bill series with real due dates and paid lines.
 * - Monthly bills are part of the usual month's bills: each is its own series on its due day; the rest of the usual bills stays
 *   one series. This month, a named bill whose next due date is today or later this month is still due (no line); otherwise its
 *   payment is logged (on its last-paid date when that is this month). Whatever of thisMonth.billsPaid / billsDue the named
 *   bills do not explain is the rest: paid on the 1st, and due on undatedDueDate (its own series, so a part-paid month is read
 *   as part paid, not as the whole series paid).
 * - Yearly and every-3-month bills are not in the usual month's bills (RC-10: the usual month leaves £700 before the
 *   insurance): each is its own series, left out of the usual month (typicalChoice 'excluded'; D-47 holds back what the months
 *   before it cannot cover). Its due dates step back from nextDue; every due date inside the records up to asOf is paid on that
 *   date (the newest on lastPaid when given). D-70: one with inUsualMonth is counted in the usual month at its monthly share
 *   (that share is inside usualMonth.bills, so the rest of the bills is that much less). With no lastPaid, the bill starts at nextDue, so nothing has built up. One paid or
 *   due this month is part of thisMonth.billsPaid / billsDue.
 * - A bill paid by someone else is a series with the always-paid-by-someone-else answer (D-31) and no lines; it is not in the
 *   usual month's bills.
 */
function billsOf(f: RightAnswerFixture, start: string): MappedBills {
  const ym = f.asOf.slice(0, 7);
  const startYm = start.slice(0, 7);
  const series: V3Series[] = [];
  const hist = new Map<string, V3Line[]>();
  const now: V3Line[] = [];
  const waivers: ReadinessWaiver[] = [];
  const histMonths: string[] = [];
  for (let i = f.historyMonths; i >= 1; i--) histMonths.push(monthBefore(ym, i));
  const addHist = (m: string, l: V3Line): void => {
    hist.set(m, [...(hist.get(m) ?? []), l]);
  };
  let namedMonthly = 0;
  let inUsual = 0;
  let paidNow = 0;
  let dueNow = 0;
  for (const b of f.bills) {
    const id = `bill-${b.id}`;
    const day = Number(b.nextDue.slice(8, 10));
    if (b.paidBy === 'other') {
      series.push(v3Series({ id, role: 'bill', cadence: { unit: 'month', every: b.everyMonths }, anchorDate: b.nextDue, amount: b.amount, name: b.id, ...(b.everyMonths > 1 ? { typicalChoice: 'excluded' as const } : {}) }));
      waivers.push({ kind: 'always_other', seriesId: id });
      continue;
    }
    if (b.everyMonths === 1) {
      namedMonthly += b.amount;
      series.push(v3Series({ id, role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: monthlyAnchor(startYm, day), amount: b.amount, name: b.id }));
      for (const m of histMonths) addHist(m, v3Line({ id: `${id}-${m}`, date: dayOf(m, day), amount: b.amount, seriesId: id }));
      if (b.nextDue.slice(0, 7) === ym && b.nextDue >= f.asOf) {
        dueNow += b.amount;
        continue;
      }
      const paid = b.lastPaid !== null && b.lastPaid.slice(0, 7) === ym && b.lastPaid <= f.asOf ? b.lastPaid : dayOf(ym, day);
      if (paid <= f.asOf) {
        paidNow += b.amount;
        now.push(v3Line({ id: `${id}-${ym}`, date: paid, amount: b.amount, seriesId: id }));
      }
      continue;
    }
    // Yearly or every 3 months: due dates step back from nextDue to before the records start.
    let anchor = b.nextDue;
    let k = 0;
    if (b.lastPaid !== null) {
      while (anchor > start) anchor = addMonthsClamped(b.nextDue, -b.everyMonths * ++k);
    }
    if (addMonthsClamped(anchor, b.everyMonths * k) !== b.nextDue) throw new Error(`fixture bill ${b.id}: due day ${day} does not repeat every ${b.everyMonths} months`);
    // D-70: a bill the usual month already sets aside is counted there at its monthly share ('monthly'), not left out.
    if (b.inUsualMonth === true) inUsual += Math.round(b.amount / b.everyMonths);
    series.push(v3Series({ id, role: 'bill', cadence: { unit: 'month', every: b.everyMonths }, anchorDate: anchor, amount: b.amount, name: b.id, typicalChoice: b.inUsualMonth === true ? 'monthly' : 'excluded' }));
    if (b.nextDue.slice(0, 7) === ym && b.nextDue >= f.asOf) dueNow += b.amount;
    const dues: string[] = [];
    for (let n = 0; n < k; n++) {
      const d = addMonthsClamped(anchor, b.everyMonths * n);
      if (d >= start && d <= f.asOf) dues.push(d);
    }
    dues.forEach((d, n) => {
      const date = n === dues.length - 1 && b.lastPaid !== null && b.lastPaid >= start && b.lastPaid <= f.asOf ? b.lastPaid : d;
      const line = v3Line({ id: `${id}-${d}`, date, amount: b.amount, seriesId: id });
      if (date.slice(0, 7) === ym) {
        paidNow += b.amount;
        now.push(line);
      } else addHist(date.slice(0, 7), line);
    });
  }
  const t = f.thisMonth;
  const rest = f.usualMonth.bills - namedMonthly - inUsual;
  const restPaid = t.billsPaid - paidNow;
  const restDue = t.billsDue - dueNow;
  if (rest < 0 || restPaid < 0 || restDue < 0 || restDue > rest) throw new Error('fixture bills list does not fit usualMonth.bills / thisMonth');
  const paidPart = rest - restDue;
  if (paidPart > 0) {
    series.push(v3Series({ id: 'bills', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: start, amount: paidPart }));
    for (const m of histMonths) addHist(m, v3Line({ id: `bill-${m}`, date: `${m}-02`, amount: paidPart, seriesId: 'bills' }));
    if (restPaid > 0) now.push(v3Line({ id: `bill-${ym}`, date: `${ym}-01`, amount: restPaid, seriesId: 'bills' }));
  }
  if (restDue > 0) {
    const dueDay = Number(undatedDueDate(f).slice(8, 10));
    series.push(v3Series({ id: 'bills-due', role: 'bill', cadence: { unit: 'month', every: 1 }, anchorDate: monthlyAnchor(startYm, dueDay), amount: restDue }));
    for (const m of histMonths) addHist(m, v3Line({ id: `bill-due-${m}`, date: dayOf(m, dueDay), amount: restDue, seriesId: 'bills-due' }));
  }
  return { series, history: (m) => hist.get(m) ?? [], now, waivers };
}

export function toEngineInputs(f: RightAnswerFixture): { inputs: V3Inputs; check: CheckV2 } {
  const ym = f.asOf.slice(0, 7);
  const start = `${monthBefore(ym, f.historyMonths)}-01`;
  const pay = v3Series({ id: 'pay', role: 'pay', cadence: cadenceOf(f.pay.cadence), anchorDate: f.pay.cadence === 'monthly' ? start : f.pay.nextDate, amount: f.pay.amount });
  const bills = billsOf(f, start);
  // 05.4 D-58: a regular saving is a fixed monthly 'saving' series from the everyday account, logged on its day each full month;
  // the usual month reads it as set aside (as the persona Maya does).
  const sv = f.usualMonth.saving;
  const saving = sv === undefined ? null : v3Series({ id: 'saving', role: 'saving', cadence: { unit: 'month', every: 1 }, anchorDate: `${start.slice(0, 7)}-${pad(sv.day)}`, amount: sv.amount, savingMode: 'fixed' });
  const savingLine = (m: string) => (sv === undefined ? [] : [v3Line({ id: `save-${m}`, date: `${m}-${pad(sv.day)}`, amount: sv.amount, role: 'saved_invested', seriesId: 'saving' })]);
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
        ...bills.history(m),
        // 05.4 ARC-07: the essential part of everyday spending sits in a category marked essential (the starter safety net).
        ...(f.usualMonth.everyday - f.usualMonth.essentialEveryday > 0
          ? [v3Line({ id: `day-${m}`, date: `${m}-15`, amount: f.usualMonth.everyday - f.usualMonth.essentialEveryday })]
          : []),
        ...(f.usualMonth.essentialEveryday > 0
          ? [v3Line({ id: `ess-${m}`, date: `${m}-15`, amount: f.usualMonth.essentialEveryday, categoryId: ESSENTIAL })]
          : []),
        ...savingLine(m),
      ])
    );
  }
  const t = f.thisMonth;
  months.push(
    monthOf(
      ym,
      [
        ...(t.received > 0 ? [v3Line({ id: `in-${ym}`, date: `${ym}-01`, amount: t.received, role: 'income' as const, seriesId: irr ? null : 'pay' })] : []),
        ...bills.now,
        ...(t.everydaySoFar > 0 ? [v3Line({ id: `day-${ym}`, date: `${ym}-01`, amount: t.everydaySoFar })] : []),
        ...(sv !== undefined && sv.movedThisMonth ? savingLine(ym) : []),
      ],
      { full: false }
    )
  );
  // mapped when BO-05 lands: plan first-payment choices beyond the engine's own
  // mapped when FIN-27 lands: region rules, check.taxIncluded
  // mapped when ENG-14 lands: check.runningCosts and check.closingPercent
  // mapped when FIN-07 lands: check.replaces (stops and sale)
  // mapped when FIN-08 lands: check.yourAnswer, check.saveForIt (userLine is mapped below, 05.4-21)
  // mapped when FIN-09 lands: pay.lastThree and pay.setupAmount
  // mapped when FIN-08 / plan 05.4-23 lands: pay.lean (low months stated explicitly)
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
  // 05.4-20 (FIN-04, FIN-10, FIN-14): due day, joint and the part already paid as stated. A debt the situation pays as one of its
  // bills (DB-03, DB-04, DB-06, DB-07, DB-12: "pays her $300 card minimum as a monthly bill") is the bills list's monthly bill of
  // the same amount on the same due day, paid by this person; the debt is linked to that bill's series, so it is counted once.
  const debts: V3Debt[] = f.debts.map((d) => {
    const bill = f.bills.find((b) => b.everyMonths === 1 && b.paidBy === 'me' && b.amount === d.minimum && d.dueDay !== null && Number(b.nextDue.slice(8, 10)) === d.dueDay);
    return {
      id: d.id,
      kind: d.kind,
      balance: mu(d.balance),
      minimum: mu(d.minimum),
      apr: d.apr === null ? null : percent(d.apr),
      secured: false,
      isHousing: d.housing === true,
      dueDay: d.dueDay,
      joint: d.joint,
      ...(d.paidThisMonth === undefined ? {} : { paidThisMonth: mu(d.paidThisMonth) }),
      ...(bill === undefined ? {} : { seriesId: `bill-${bill.id}` }),
    };
  });
  const spending = f.accounts.filter((a) => a.kind === 'checking' || a.kind === 'current').reduce((s, a) => s + a.balance, 0);
  const inputs0 = inputsOf({
    asOf: f.asOf,
    currency: currencyCode(f.currency),
    region: f.region ? (f.region.subdivision ? `${f.region.country}-${f.region.subdivision}` : f.region.country) : null,
    months,
    series: [...(irr ? [] : [pay]), ...bills.series, ...(saving === null ? [] : [saving])],
    ...(bills.waivers.length === 0 ? {} : { waivers: bills.waivers }),
    ...(irr ? { profile: { types: ['freelance'], variable: 'steady', steady: mu(f.pay.amount), billsHorizonMonths: null } } : {}),
    balance: mu(spending),
    accounts,
    debts,
    unspent: { amount: mu(spending), at: f.asOf }, // replaced below by the app's own suggested figure
    // 05.4-15 (ENG-11, ENG-14): quick estimates are the engine's typed estimates; their spending is bills plus everyday
    // (the same total the app stores as rough_spending). The records date is passed as given.
    // 05.4-57 ENG11-QE-ESSENTIAL: the cases state the essential part of everyday spending ("everyday spending £300 (£200 of it
    // on essentials)", D-42, QE-13), so it is passed as the estimates' essential part.
    // 05.4-57 D-74: the app's "Money out each month" includes the recorded card and loan minimums and the regular saving too, so
    // the money out a person with these parts would enter is bills + everyday + each minimum not paid as one of the bills + the
    // regular saving (QE-01: £1,000 + £300 + the £25 card minimum = £1,325, leaving the £300 everyday the case states).
    typedEstimates:
      f.quickEstimates === null
        ? null
        : {
            income: mu(f.quickEstimates.income),
            expenses: mu(
              f.quickEstimates.bills +
                f.quickEstimates.everyday +
                debts.filter((d) => d.seriesId === undefined).reduce((s, d) => s + d.minimum, 0) +
                (sv === undefined ? 0 : sv.amount)
            ),
            saving: mu(0),
            debt: mu(0),
            invest: mu(0),
            asOf: f.asOf,
            essential: mu(f.usualMonth.essentialEveryday),
          },
    recordsAsOf: f.recordsAsOf,
    // 05.4 FIN-01 (D-35): the safety net as stated; null = no record (protection on, the starter size, nothing saved).
    safetyNet: f.safetyNet === null ? null : { protect: f.safetyNet.protect, size: f.safetyNet.size === null ? null : mu(f.safetyNet.size), saved: mu(f.safetyNet.saved), locked: f.safetyNet.locked },
    essentialCategoryIds: f.usualMonth.essentialEveryday > 0 ? [ESSENTIAL] : [],
    factLines: f.factLines, // D-08 (05.4-20)
    tightLine: f.userLine === null ? null : mu(f.userLine), // 05.4-21 (FIN-07, BR-09): the money-left-each-month line the user set
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
