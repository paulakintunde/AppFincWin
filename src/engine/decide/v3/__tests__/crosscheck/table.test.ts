/** QA-03: every approved right-answer case with no pending rule also runs through the plain calculator. */
import * as fc from 'fast-check';
import { loadCases } from '../rightAnswers/loader';
import { PENDING_RULES, pendingFixIds } from './pendingRules';
import { evaluate } from '../../evaluate';
import { TIER_CASES, rileyTier, rileyTierFixture } from '../helpers/tierFixtures';
import { carriesCostlyDebt, debtDates, debtMinimums, debtToPay, freeMoney, leftThisMonth, longDueInWindow, paidAsBill, pathLow, monthEndBalance, monthPay, plainHeld, plainHoldBack, wholeMonths, notCleared, overdraftRoom, payDates, plainAnswer, plainMoveBy, plainNet, plainOverdraftCost, plainPath, plainPathFlows, plainPlanMonthly, plainPlanTotal, plainShortPlan, plainTier, plainFloor, plainMonthlyShort, plainTightPlan, planDates, planPathLow, planPayments, recordsFresh, recordsLookBehind, everydayToCome, usualEveryday, quickMoneyOut, usualShortfall, plainLowMonths, lowerPay, payGapNamed } from './plain';
import { SHORT_PLAN_CASES, shortPlan, shortPlanFixture, type ShortPlanCase } from '../helpers/shortPlanFixtures';
import { toEngineInputs, undatedDueDate } from '../rightAnswers/fixture';
import { pick } from '../rightAnswers/pick';
import type { RightAnswerFixture } from '../rightAnswers/schema';

const PENDING_IDS = new Set(PENDING_RULES.flatMap((r) => r.fixId.split('/')));

describe('plain calculator vs the approved table', () => {
  const cases = loadCases().filter((c) => c.status === 'approved');
  // 05.4-21: RC-10 left FIN-07 (tight landed) but its code waited for FIN-09. 05.4-24: FIN-09 does not move it. Its case counts the
  // whole £1,500 free (the account) as this month's money (Fits, £50 left); both sides read this month after its plans as £687.10
  // (£2,500 - £1,000 - £400 spent - £412.90 still to come over 16 of 31 days) and the rest as spare money from earlier months, so
  // both give fits_unspent with a month figure of £0. Owner question at the 05.4-24 review; it stays in knownRed under FIN-09 until then.
  const WAITS: Readonly<Record<string, string>> = { 'RC-10': 'FIN-09' };
  const live = cases.filter((c) => {
    const pending = pendingFixIds(c.fixture);
    return pending.length === 0 && !c.fixIds.some((id) => PENDING_IDS.has(id)) && WAITS[c.id] === undefined;
  });
  it(`checks ${live.length} approved cases`, () => {
    for (const c of live) expect({ id: c.id, code: plainAnswer(c.fixture).code }).toEqual({ id: c.id, code: c.expected.code });
  });
  // 05.4-24 (FIN-09): and the month figure after buying, where the case states it
  it('the month figure after buying matches every approved case that states one', () => {
    const stated = live.filter((c) => c.expected.afterBuy.month !== null);
    expect(stated.length).toBeGreaterThan(20);
    for (const c of stated) expect({ id: c.id, month: plainAnswer(c.fixture).afterBuy }).toEqual({ id: c.id, month: c.expected.afterBuy.month });
  });
});

describe('plain calculator: records synced (QE-07, ENG-14)', () => {
  const lucy = loadCases().find((c) => c.id === 'QE-07')!;
  const f = lucy.fixture;
  it('QE-07 answers as a usual month from fresh records', () => {
    expect(recordsFresh(f)).toBe(true);
    expect(plainAnswer(f)).toEqual({ code: lucy.expected.code, variant: null, afterBuy: 50_000 });
  });
  it('older records, or a record already in the new month: the usual rules, and big purchases ask for records first', () => {
    const big = { ...f, check: { ...f.check, price: 150_000 } };
    expect(plainAnswer(big).code).not.toBe('needs_input');
    expect(plainAnswer({ ...big, recordsAsOf: '2026-11-27' }).code).toBe('needs_input');
    expect(plainAnswer({ ...big, recordsAsOf: null }).code).toBe('needs_input');
    expect(recordsFresh({ ...f, recordsAsOf: '2026-12-02' })).toBe(false);
    expect(recordsFresh({ ...f, asOf: '2026-12-08', recordsAsOf: '2026-12-07' })).toBe(false);
    expect(recordsFresh({ ...f, thisMonth: { ...f.thisMonth, everydaySoFar: 100 } })).toBe(false);
    expect(recordsLookBehind({ ...f, historyMonths: 0 })).toBe(false);
  });
});

describe('plain calculator: overdrafts (05.4-17, FIN-03; D-26..D-28, D-36..D-38)', () => {
  const od = loadCases().filter((c) => c.topic === 'overdraft' && c.status === 'approved');
  const costOf = (id: string, withPurchase: boolean): bigint => {
    const f = od.find((c) => c.id === id)!.fixture;
    const cost = withPurchase ? BigInt(f.check.price ?? 0) + BigInt(f.check.oneOffFees) : 0n;
    return plainOverdraftCost(plainPath(f, cost), f.accounts[0]!.overdraftRate!);
  };

  it('every approved overdraft case gets its expected code and variant from the plain rules', () => {
    for (const c of od) {
      const got = plainAnswer(c.fixture);
      expect({ id: c.id, code: got.code, variant: got.code === 'fits_uses_overdraft' ? got.variant : c.expected.variant }).toEqual({
        id: c.id,
        code: c.expected.code,
        variant: c.expected.variant,
      });
    }
  });

  it('the daily-sum cost matches the cases to the cent (OD-01, OD-03, OD-11, OD-12), with and without the purchase', () => {
    expect([costOf('OD-01', true), costOf('OD-01', false)]).toEqual([201n, 169n]);
    expect([costOf('OD-03', true), costOf('OD-03', false)]).toEqual([116n, 2n]);
    expect([costOf('OD-11', true), costOf('OD-11', false)]).toEqual([7_425n, 5_585n]);
    expect([costOf('OD-12', true), costOf('OD-12', false)]).toEqual([268n, 145n]);
  });

  it('only checking and current accounts used for everyday spending carry an overdraft; no limit set is 0 (OD-07, D-28)', () => {
    const hiro = od.find((c) => c.id === 'OD-07')!.fixture;
    expect(overdraftRoom(hiro)).toBe(0n);
    const priya = od.find((c) => c.id === 'OD-01')!.fixture;
    expect(overdraftRoom(priya)).toBe(50_000n);
    expect(overdraftRoom({ ...priya, accounts: priya.accounts.map((a) => ({ ...a, use: 'untouched' as const })) })).toBe(0n);
    // exactly at the limit is inside it; 1 cent past is Not yet (I-limit)
    expect(plainAnswer({ ...priya, accounts: priya.accounts.map((a) => ({ ...a, overdraftLimit: 46_000 })) }).code).toBe('fits_uses_overdraft');
    expect(plainAnswer({ ...priya, accounts: priya.accounts.map((a) => ({ ...a, overdraftLimit: 45_999 })) }).code).toBe('not_yet');
  });

  it('no pay inside the 90 days is never cleared; weekly pay lands every 7 days', () => {
    const tess = od.find((c) => c.id === 'OD-11')!.fixture;
    expect(notCleared({ ...tess, pay: { ...tess.pay, nextDate: '2027-06-01' } }, 20_000n)).toBe(true);
    expect(payDates({ ...tess, pay: { ...tess.pay, cadence: 'weekly' } }).slice(0, 3)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15']);
    expect(payDates({ ...tess, pay: { ...tess.pay, cadence: 'fortnightly' } }).slice(0, 2)).toEqual(['2026-11-01', '2026-11-15']);
  });
});

describe('plain calculator: safety net (05.4-18, FIN-01, FIN-02; D-05, D-06, D-35, D-41)', () => {
  const sn = loadCases().filter((c) => c.topic === 'safety-net' && c.status === 'approved');
  const NET_VARIANTS: readonly (string | null)[] = [null, 'no_net', 'small_net', 'protection_off'];

  it('every approved safety-net case gets its expected code, and its net variant, from the plain rules', () => {
    for (const c of sn) {
      // 05.4-21: tight (SN-10, SN-11) is compared too.
      const got = plainAnswer(c.fixture);
      const variant = NET_VARIANTS.includes(c.expected.variant) || c.expected.variant === 'tight' ? got.variant : c.expected.variant;
      expect({ id: c.id, code: got.code, variant }).toEqual({ id: c.id, code: c.expected.code, variant: c.expected.variant });
    }
  });

  it('the starter is 1 month of essential costs, rounded up; only money saved is protected; above the size is spare; $0 is off', () => {
    const leo = sn.find((c) => c.id === 'SN-01')!.fixture;
    expect(plainNet(leo)).toMatchObject({ starter: 190_000n, size: 190_000n, saved: 0n, protectedPart: 0n, lend: 0n });
    const kai = sn.find((c) => c.id === 'SN-13')!.fixture;
    expect(plainNet(kai)).toMatchObject({ protectedPart: 100_000n, above: 50_000n });
    expect(plainNet({ ...kai, safetyNet: { protect: true, size: 0, saved: 150_000 } })).toMatchObject({ off: true, lend: 150_000n, above: 0n });
    expect(plainNet({ ...kai, debts: [{ id: 'd', kind: 'card', balance: 1, minimum: 2_501, apr: null, dueDay: null, joint: false }] }).starter).toBe(242_600n);
    expect(freeMoney(sn.find((c) => c.id === 'SN-04')!.fixture)).toBe(30_000n);
  });

  it('D-41: need or want never changes the plain answer', () => {
    for (const purpose of ['necessity', 'treat', null] as const) {
      const f = sn.find((c) => c.id === 'SN-03')!.fixture;
      expect(plainAnswer({ ...f, check: { ...f.check, purpose } }).code).toBe('fits_uses_net');
    }
  });
});

describe('plain calculator: 05.4-48 drafts (D-52, D-61, D-62)', () => {
  const byId = (id: string) => {
    const c = loadCases().find((x) => x.id === id);
    if (c === undefined) throw new Error(`no case ${id}`);
    return c;
  };
  it('SN-16 Maya: pay expected on her usual day at her lowest month (D-52), a plain Fits with $740 left', () => {
    const c = byId('SN-16');
    expect(payDates(c.fixture)).toEqual(['2026-11-05', '2026-12-05']);
    expect(plainAnswer(c.fixture)).toMatchObject({ code: c.expected.code, afterBuy: c.expected.afterBuy.month });
  });
  it('SN-19 locked and SN-20 unlocked (D-61): the locked net lends nothing', () => {
    expect(plainNet(byId('SN-19').fixture).lend).toBe(0n);
    expect(plainAnswer(byId('SN-19').fixture).code).toBe('not_yet');
    expect(plainAnswer(byId('SN-20').fixture).code).toBe('fits_uses_net');
  });
  it('SN-13 and SN-17: Fits from extra savings (D-62)', () => {
    for (const id of ['SN-13', 'SN-17']) expect(plainAnswer(byId(id).fixture)).toMatchObject({ code: 'fits_unspent', variant: 'extra_savings' });
  });
});

describe('plain calculator: D-65 tiers agree with the engine (Riley-like, usual month 300 short)', () => {
  const expected = { small: 'month_short_small', moderate: 'month_short_moderate', moderateExtra: 'month_short_moderate_extra', large: 'month_already_short' } as const;
  it.each(Object.keys(TIER_CASES) as (keyof typeof TIER_CASES)[])('%s: the same variant, and the same N and M', (k) => {
    const f = rileyTierFixture(TIER_CASES[k]);
    const { inputs, check } = rileyTier(TIER_CASES[k]);
    const r = evaluate(inputs, check).result;
    const plain = plainAnswer(f);
    expect({ code: plain.code, variant: plain.variant }).toEqual({ code: r.code, variant: expected[k] });
    expect(r.variant).toBe(expected[k]);
    const lasts = r.facts.find((x) => x.code === 'money_lasts_shorter')?.values;
    const t = plainTier(f, plain.code);
    expect(t.months === null ? undefined : { months: t.months, monthsAfter: t.monthsAfter }).toEqual(lasts);
  });
});

describe('plain calculator: the interest total and the move-by saving (05.4-51, Plan-49 re-run, D-58, D-67)', () => {
  const byId = (id: string): RightAnswerFixture => {
    const c = loadCases().find((x) => x.id === id);
    if (c === undefined) throw new RangeError(id);
    return c.fixture;
  };
  const fact = (f: RightAnswerFixture, code: string, today = false) => {
    const { inputs, check } = toEngineInputs(f);
    const c = today && check.pay.mode === 'plan' ? { ...check, pay: { ...check.pay, firstPayment: { kind: 'today' as const } } } : check;
    return evaluate(inputs, c).result.facts.find((x) => x.code === code)?.values;
  };

  it("SN-18's plan: 47 x $219.30 and a last $218.96, $10,526.06 in all (deposit 0, first payment a month out)", () => {
    const f = byId('SN-18');
    const pays = planPayments(900_000n, 48, '7.9', false);
    expect(pays.slice(0, 47).every((p) => p === 21_930n)).toBe(true);
    expect(pays[47]).toBe(21_896n);
    expect(plainPlanTotal(f)).toBe(1_052_606n);
  });

  it('the same plan, first payment today and a $500 deposit: deposit + every payment once, as the engine', () => {
    const sn18 = byId('SN-18');
    const f: RightAnswerFixture = { ...sn18, check: { ...sn18.check, pay: { ...(sn18.check.pay as Extract<RightAnswerFixture['check']['pay'], { mode: 'plan' }>), deposit: 50_000, firstPaymentDate: sn18.asOf } } };
    const total = plainPlanTotal(f);
    // by hand: $500 + 48 payments on $8,500 with the first today (an annuity-due), never the first payment twice
    expect(total).toBe(50_000n + planPayments(850_000n, 48, '7.9', true).reduce((t, p) => t + p, 0n));
    expect(fact(f, 'interest_is_a_cost', true)).toEqual({ interest: Number(total) - 900_000, total: Number(total) });
    // 0% splits evenly, the last payment the rest
    expect(planPayments(100_000n, 3, '0', false)).toEqual([33_334n, 33_334n, 33_332n]);
  });

  it('SN-16 with its saving: the plain move-by equals the engine, and the saving adds its $200 when both go below $0', () => {
    const f = byId('SN-16');
    expect(f.usualMonth.saving).toEqual({ amount: 20_000, day: 6, movedThisMonth: false });
    expect(plainMoveBy(f, 6_000n)).toEqual({ amount: 6_667, date: '2026-11-02' });
    expect(fact(f, 'move_money_by')).toEqual(plainMoveBy(f, 6_000n));
    expect(fact(f, 'net_above_size')).toEqual({ above: 100_000 });
    const at500 = { ...f, check: { ...f.check, price: 50_000 } };
    const { saving: _s, ...usual } = f.usualMonth;
    const noSaving: RightAnswerFixture = { ...at500, usualMonth: usual };
    expect(plainMoveBy(at500, 50_000n)).toEqual({ amount: 50_667, date: '2026-11-01' });
    expect(plainMoveBy(noSaving, 50_000n)).toEqual({ amount: 30_667, date: '2026-11-01' });
    expect(fact(at500, 'move_money_by')).toEqual(plainMoveBy(at500, 50_000n));
    expect(fact(noSaving, 'move_money_by')).toEqual(plainMoveBy(noSaving, 50_000n));
    // with no saving at $60 the account alone never goes below 0: no move-by line on either side
    expect(plainMoveBy({ ...noSaving, check: f.check }, 6_000n)).toBeNull();
    expect(fact({ ...noSaving, check: f.check }, 'move_money_by')).toBeUndefined();
  });

  it('D-67: the saving still to move comes off the month-end figure; once moved, it does not come off again', () => {
    const f = byId('SN-16');
    const moved: RightAnswerFixture = { ...f, asOf: '2026-10-07', usualMonth: { ...f.usualMonth, saving: { amount: 20_000, day: 6, movedThisMonth: true } } };
    const before = { ...f, asOf: '2026-10-07' };
    // asOf after its day and moved: nothing still to move; not moved and its day past: also nothing (it is not taken late)
    expect(monthEndBalance(moved)).toBe(monthEndBalance(before));
    expect(monthEndBalance(f) - monthEndBalance({ ...f, usualMonth: { ...f.usualMonth, saving: { amount: 20_000, day: 2, movedThisMonth: true } } })).toBe(-20_000n);
    // no move-by line when nothing else can cover the gap
    expect(plainMoveBy({ ...f, safetyNet: { protect: true, size: 300_000, saved: 300_000 } }, 6_000n)).toBeNull();
    expect(plainMoveBy({ ...f, safetyNet: { protect: true, size: 300_000, saved: 300_000, locked: false } }, 6_000n, true)).toEqual({ amount: 6_667, date: '2026-11-02' });
    expect(plainPlanTotal(f)).toBe(0n);
  });
});

describe('05.4-51 drafts: the D-65 tiers SN-21..SN-24 and the deposit-and-today plan BR-16 (hand, plain calculator and engine agree)', () => {
  const byId = (id: string) => {
    const c = loadCases().find((x) => x.id === id);
    if (c === undefined) throw new RangeError(id);
    return c;
  };
  it.each(['SN-21', 'SN-22', 'SN-23', 'SN-24'])('%s: the engine and the plain calculator give the expected tier and facts', (id) => {
    const c = byId(id);
    expect(c.status).toBe('draft');
    const { inputs, check } = toEngineInputs(c.fixture);
    const r = evaluate(inputs, check).result;
    expect({ code: r.code, variant: r.variant, readyBy: r.readyBy }).toEqual({ code: c.expected.code, variant: c.expected.variant, readyBy: null });
    const codes = r.facts.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(c.expected.mustHaveFacts));
    for (const no of c.expected.mustNotHaveFacts) expect(codes).not.toContain(no);
    const plain = plainAnswer(c.fixture);
    expect({ code: plain.code, variant: plain.variant }).toEqual({ code: c.expected.code, variant: c.expected.variant });
  });
  it('SN-22 / SN-23: N and M by hand (14 -> 11, 14 -> 7)', () => {
    const lasts = (id: string) => {
      const { inputs, check } = toEngineInputs(byId(id).fixture);
      return evaluate(inputs, check).result.facts.find((x) => x.code === 'money_lasts_shorter')?.values;
    };
    expect(lasts('SN-22')).toEqual({ months: 14, monthsAfter: 11 });
    expect(lasts('SN-23')).toEqual({ months: 14, monthsAfter: 7 });
    expect(plainTier(byId('SN-23').fixture, 'fits_unspent')).toEqual({ variant: 'month_short_moderate_extra', months: 14, monthsAfter: 7 });
  });
  it('BR-16: deposit + every payment once ($10,376.29), the engine total when the first payment is today', () => {
    const c = byId('BR-16');
    expect(plainPlanTotal(c.fixture)).toBe(1_037_629n);
    const { inputs, check } = toEngineInputs(c.fixture);
    const today = check.pay.mode === 'plan' ? { ...check, pay: { ...check.pay, firstPayment: { kind: 'today' as const } } } : check;
    const r = evaluate(inputs, today).result;
    expect({ code: r.code, variant: r.variant }).toEqual({ code: c.expected.code, variant: c.expected.variant });
    expect(r.facts.find((x) => x.code === 'interest_is_a_cost')?.values).toEqual({ interest: 137_629, total: 1_037_629 });
    expect(r.facts.map((x) => x.code)).toEqual(expect.arrayContaining(c.expected.mustHaveFacts));
    for (const no of c.expected.mustNotHaveFacts) expect(r.facts.map((x) => x.code)).not.toContain(no);
    expect(plainAnswer(c.fixture)).toMatchObject({ code: 'monthly_short', variant: 'month_already_short' });
    // 05.4-22: the fixture now maps a first payment on asOf as today, so the fixture as written gives the same answer
    const asWritten = evaluate(inputs, check).result;
    expect({ code: asWritten.code, variant: asWritten.variant, missing: asWritten.missing }).toEqual({ code: c.expected.code, variant: c.expected.variant, missing: [] });
  });
});

describe('05.4-54 (D-68): the plain calculator restates short plans paid from money on hand, and agrees with the engine', () => {
  /** The plain side of a 05.4-53 person: the same fixture, with its running cost stated as a running cost (the engine side adds it as an extra). */
  const plainSide = (o: ShortPlanCase): RightAnswerFixture => {
    const f = shortPlanFixture(o);
    if (o.running === undefined) return f;
    return { ...f, check: { ...f.check, runningCosts: [{ id: 'ins', amount: o.running, everyMonths: 1, start: f.asOf, end: null }] } };
  };
  const QUALIFY = new Set(['qualifies', 'extraSavings', 'alreadyShort', 'fortnight']);

  it.each(Object.keys(SHORT_PLAN_CASES) as (keyof typeof SHORT_PLAN_CASES)[])('%s: the same code and variant, and D-68 on both sides or neither', (k) => {
    const o: ShortPlanCase = SHORT_PLAN_CASES[k];
    const { inputs, check } = shortPlan(o);
    const r = evaluate(inputs, check).result;
    const f = plainSide(o);
    // not_yet's variant (not_covered, with its ready-by month) is not restated by the plain calculator; the code is.
    expect(plainAnswer(f)).toMatchObject(r.code === 'not_yet' ? { code: r.code } : { code: r.code, variant: r.variant });
    expect(plainShortPlan(f)).toBe(QUALIFY.has(k));
    expect(r.facts.some((x) => x.code === 'short_plan_from_cash')).toBe(QUALIFY.has(k));
    const monthly = r.facts.find((x) => x.code === 'short_plan_from_cash')?.values;
    if (monthly !== undefined) expect(monthly).toEqual({ monthly: Number(plainPlanMonthly(f)) });
  });

  it('QUALIFIES by hand: $1,800 in all, the path lowest at $2,700 on 31 January, and the one-off ladder for $1,800', () => {
    const f = shortPlanFixture(SHORT_PLAN_CASES.qualifies);
    expect(planDates(f)).toEqual(['2026-11-15', '2026-12-15', '2027-01-15']);
    expect(plainPlanTotal(f)).toBe(180_000n);
    // $4,000 + two pays of $3,000 - two months of $1,500 bills - $1,800 of payments - $500 + $1,000 + $1,000 everyday = $2,700
    expect(planPathLow(f)).toBe(270_000n);
    const low = plainPathFlows(f, [
      { date: '2026-11-15', amount: 60_000n },
      { date: '2026-12-15', amount: 60_000n },
      { date: '2027-01-15', amount: 60_000n },
    ]).find((p) => p.balance === 270_000n);
    expect(low?.date).toBe('2027-01-31');
    // $500 of this month's room, then $1,300 of the $3,000 of earlier spare money: Fits from spare money; the month ends at $0 (BR-17)
    expect(plainAnswer(f)).toEqual({ code: 'fits_unspent', variant: null, afterBuy: 0 });
  });

  it('plainPath is plainPathFlows with the cost on day 0 (every existing caller gives the same numbers)', () => {
    const f = shortPlanFixture(SHORT_PLAN_CASES.qualifies);
    expect(plainPath(f, 12_345n)).toEqual(plainPathFlows(f, [{ date: f.asOf, amount: 12_345n }]));
  });

  it('ALREADY SHORT (D-65 with D-68): the tier of a $1,800 cash buy, N 32 and M 14, as the engine', () => {
    const f = shortPlanFixture(SHORT_PLAN_CASES.alreadyShort);
    const { inputs, check } = shortPlan(SHORT_PLAN_CASES.alreadyShort);
    const r = evaluate(inputs, check).result;
    const t = plainTier(f, plainAnswer(f).code);
    expect(t).toEqual({ variant: 'month_short_moderate', months: 32, monthsAfter: 14 });
    expect(r.variant).toBe(t.variant);
    expect(r.facts.find((x) => x.code === 'money_lasts_shorter')?.values).toEqual({ months: t.months, monthsAfter: t.monthsAfter });
  });

  it('QE-12 (48 months), BR-12 and BR-13 (the path goes below $0) are not short plans paid from money on hand', () => {
    const byId = (id: string) => loadCases().find((x) => x.id === id)!.fixture;
    for (const id of ['QE-11', 'QE-12', 'BR-05', 'BR-12', 'BR-13']) expect({ id, short: plainShortPlan(byId(id)) }).toEqual({ id, short: false });
    expect(planPathLow(byId('BR-12'))).toBeLessThan(0n);
    expect(planPathLow(byId('BR-13'))).toBeLessThan(0n);
  });

  it('a payment on day 90 is outside; on day 89 it is inside (days 0..89)', () => {
    const f = shortPlanFixture({ ...SHORT_PLAN_CASES.qualifies, firstOn: '2026-12-12' });
    expect(planDates(f).at(-1)).toBe('2027-02-12');
    expect(plainShortPlan(f)).toBe(true);
    expect(plainShortPlan(shortPlanFixture({ ...SHORT_PLAN_CASES.qualifies, firstOn: '2026-12-13' }))).toBe(false);
    const engine68 = (firstOn: string) => {
      const { inputs, check } = shortPlan({ ...SHORT_PLAN_CASES.qualifies, firstOn });
      return evaluate(inputs, check).result.facts.some((x) => x.code === 'short_plan_from_cash');
    };
    expect([engine68('2026-12-12'), engine68('2026-12-13')]).toEqual([true, false]);
  });

  it('the crosscheck skip: every plan stays out of the whole-code comparison under BO-05; the FIN-05 entry is gone (05.4-22) and the fixture no longer asks first', () => {
    const f = shortPlanFixture(SHORT_PLAN_CASES.qualifies);
    expect(pendingFixIds(f)).toContain('BO-05');
    expect(pendingFixIds(f)).not.toContain('FIN-05');
    const { inputs, check } = toEngineInputs(f);
    expect(evaluate(inputs, check).result.missing).toEqual([]);
    expect(pendingFixIds(shortPlanFixture(SHORT_PLAN_CASES.longShort))).toContain('BO-05');
    expect(PENDING_RULES.map((r) => r.fixId)).not.toContain('FIN-06/FIN-07');
  });
});

describe('05.4-54 (D-68) at scale: random short plans on the 05.4-53 person, the engine through the BR-16 first-payment mapping', () => {
  const RUNS = Number(process.env.D68_RUNS ?? 1000);
  const caseArb: fc.Arbitrary<ShortPlanCase> = fc
    .record({
      everyday: fc.integer({ min: 0, max: 800_000 }),
      saved: fc.integer({ min: 0, max: 800_000 }),
      price: fc.integer({ min: 1_000, max: 600_000 }),
      months: fc.integer({ min: 1, max: 8 }),
      fortnight: fc.boolean(),
      onePeriod: fc.boolean(),
      unlocked: fc.boolean(),
      bills: fc.integer({ min: 100_000, max: 200_000 }),
      spend: fc.integer({ min: 50_000, max: 200_000 }),
      apr: fc.constantFrom('0', '0', '9.9', '29.99'),
    })
    .map((r) => ({
      everyday: r.everyday,
      saved: r.saved,
      price: r.price,
      months: r.months,
      bills: r.bills,
      spend: r.spend,
      ...(r.fortnight ? { every: 'fortnight' as const } : { apr: r.apr }),
      ...(r.onePeriod ? { first: 'one_period' as const } : {}),
      ...(r.unlocked ? { locked: false as const } : {}),
    }));

  it(`agrees on ${RUNS} draws: D-68 on both sides or neither, and on a D-68 answer the same code and variant`, () => {
    let short = 0;
    fc.assert(
      fc.property(caseArb, (o) => {
        const { inputs, check } = shortPlan(o);
        const r = evaluate(inputs, check).result;
        const f = shortPlanFixture(o);
        const p = plainAnswer(f);
        const d68 = plainShortPlan(f);
        if (d68) short++;
        const e68 = r.facts.some((x) => x.code === 'short_plan_from_cash');
        // A plan D-68 leaves alone is pinned in 05.4-21's block below (the day-one part against the monthly part is not restated on
        // the plain side); here only that it is left alone is compared.
        if (!d68 && !e68) return;
        expect({ code: p.code, variant: p.variant, d68 }).toEqual({ code: r.code, variant: r.variant, d68: e68 });
      }),
      { numRuns: RUNS, seed: 0x5454 }
    );
    expect(short).toBeGreaterThan(RUNS / 20);
  });
});

describe('05.4-54 drafts BR-17..BR-23 (D-68): hand, plain calculator and engine (first payment read as today, as BR-16)', () => {
  const byId = (id: string) => {
    const c = loadCases().find((x) => x.id === id);
    if (c === undefined) throw new RangeError(id);
    return c;
  };
  const engine = (f: RightAnswerFixture) => {
    const { inputs, check } = toEngineInputs(f);
    const today = check.pay.mode === 'plan' ? { ...check, pay: { ...check.pay, firstPayment: { kind: 'today' as const } } } : check;
    return pick(evaluate(inputs, today));
  };
  /**
   * BR-19 and BR-20: the ready-by month follows BR-12 ("judged like paying £900 at once ... £500 more at £80 a month = 7 months"):
   * the whole cost. Owner, 2026-11-03: the hand dates stand (2027-03, 2027-04). 05.4-22 (FIN-05): the engine reads the whole cost of
   * a Not yet plan inside the 90 days, so it gives them too (it read the day-one payment before: 2027-01, 2026-12-01).
   */
  const ENGINE_READY: Record<string, string> = {};

  it.each(['BR-17', 'BR-18', 'BR-19', 'BR-20', 'BR-21', 'BR-22', 'BR-23'])('%s', (id) => {
    const c = byId(id);
    // 05.4-56: the owner approved all seven at the FIN-01b review (2026-11-03). 05.4-22: they pass through the fixture as written.
    expect({ status: c.status, fixIds: c.fixIds }).toEqual({ status: 'approved', fixIds: ['FIN-05', 'FIN-06', 'FIN-01b'] });
    const got = engine(c.fixture);
    const e = c.expected;
    expect({ code: got.code, variant: got.variant, readyBy: got.readyBy }).toEqual({ code: e.code, variant: e.variant, readyBy: ENGINE_READY[id] ?? e.readyBy });
    if (e.afterBuy.month !== null) expect(got.afterBuy.month).toBe(e.afterBuy.month);
    expect(got.facts).toEqual(expect.arrayContaining(e.mustHaveFacts));
    for (const no of e.mustNotHaveFacts) expect(got.facts).not.toContain(no);
    const plain = plainAnswer(c.fixture);
    expect(plain.code === 'not_yet' ? { code: plain.code } : { code: plain.code, variant: plain.variant }).toEqual(e.code === 'not_yet' ? { code: e.code } : { code: e.code, variant: e.variant });
    expect(plainShortPlan(c.fixture)).toBe(e.mustHaveFacts.includes('short_plan_from_cash'));
  });

  it('the hand figures: totals, path low points, the monthly figure, the move-by amount and the D-65 months', () => {
    const f = (id: string) => byId(id).fixture;
    expect(['BR-17', 'BR-19', 'BR-21', 'BR-22', 'BR-23'].map((id) => plainPlanTotal(f(id)))).toEqual([180_000n, 180_000n, 180_000n, 180_000n, 180_000n]);
    expect(['BR-17', 'BR-19', 'BR-20', 'BR-21', 'BR-22', 'BR-23'].map((id) => planPathLow(f(id)))).toEqual([270_000n, -80_000n, -120_000n, -80_000n, 125_000n, 220_000n]);
    expect(planDates(f('BR-18')).at(-1)).toBe('2027-04-15');
    expect(planDates(f('BR-23'))).toEqual(['2026-11-15', '2026-11-29', '2026-12-13', '2026-12-27']);
    expect(plainPlanMonthly(f('BR-23'))).toBe(97_500n);
    const { inputs, check } = toEngineInputs(f('BR-21'));
    const today = check.pay.mode === 'plan' ? { ...check, pay: { ...check.pay, firstPayment: { kind: 'today' as const } } } : check;
    const facts = evaluate(inputs, today).result.facts;
    expect(facts.find((x) => x.code === 'move_money_by')?.values).toEqual({ amount: 80_000, date: '2026-11-15' });
    expect(facts.find((x) => x.code === 'extra_savings_used')?.values).toEqual({ used: 130_000, above: 400_000 });
    expect(plainTier(f('BR-22'), 'fits_unspent')).toEqual({ variant: 'month_short_moderate', months: 32, monthsAfter: 14 });
    // the ready-by months by hand (BR-12's rule): whole cost less the spare money, at $500 a month, rounded up, from November
    const months = (whole: number, free: number) => Math.ceil((whole - free) / 50_000);
    expect([months(180_000, 0), months(270_000, 50_000)]).toEqual([4, 5]);
    expect([byId('BR-19').expected.readyBy, byId('BR-20').expected.readyBy]).toEqual(['2027-03', '2027-04']);
  });
});

describe('plain calculator: yearly and every-3-month bills (05.4-19, FIN-11 as changed by D-47)', () => {
  const hana = loadCases().find((c) => c.id === 'RC-10')!.fixture;
  const bill = hana.bills[0]!;
  it('RC-10 Hana: built up £700 over 7 months, 4 whole months x £700 cover the £1,200, so nothing is held back', () => {
    expect(wholeMonths('2026-03-01', '2026-10-15')).toBe(7);
    expect(wholeMonths('2026-10-15', '2027-03-01')).toBe(4);
    expect(plainHeld(hana)).toEqual([{ id: 'b-ins', builtUp: 70_000n, uncovered: 0n, holdBack: 0n, months: 4, perMonth: 70_000n }]);
    expect(plainHoldBack(hana)).toBe(0n);
  });
  it('a thin usual leftover holds back the whole built-up share; an ample one nothing', () => {
    // £50 a month left: £1,200 - £50 x 4 = £1,000 uncovered, capped at the £700 built up.
    const thin = { ...hana, usualMonth: { ...hana.usualMonth, everyday: 145_000 } };
    expect(plainHeld(thin)[0]).toMatchObject({ builtUp: 70_000n, uncovered: 100_000n, holdBack: 70_000n });
    // £200 a month left: £1,200 - £800 = £400 uncovered, under the £700 built up.
    const part = { ...hana, usualMonth: { ...hana.usualMonth, everyday: 130_000 } };
    expect(plainHeld(part)[0]).toMatchObject({ uncovered: 40_000n, holdBack: 40_000n });
    // a usual month already short covers nothing
    expect(plainHeld({ ...hana, usualMonth: { ...hana.usualMonth, everyday: 200_000 } })[0]).toMatchObject({ uncovered: 120_000n, holdBack: 70_000n });
  });
  it('the share resets after a payment, a bill never paid has built up nothing, someone else\'s bill and monthly bills are never held back', () => {
    const justPaid = { ...hana, bills: [{ ...bill, lastPaid: '2026-10-14', nextDue: '2027-10-14' }] };
    expect(plainHeld(justPaid)[0]).toMatchObject({ builtUp: 0n, holdBack: 0n });
    expect(plainHeld({ ...hana, bills: [{ ...bill, lastPaid: null }] })[0]).toMatchObject({ builtUp: 0n, holdBack: 0n });
    expect(plainHeld({ ...hana, bills: [{ ...bill, paidBy: 'other' as const }] })).toEqual([]);
    expect(plainHeld({ ...hana, bills: [{ ...bill, everyMonths: 1 as const }] })).toEqual([]);
  });
  it('every 3 months: a $300 bill paid 1 month ago has built up $100; one due this month is in this month\'s bills already', () => {
    const q = { ...hana, usualMonth: { ...hana.usualMonth, everyday: 150_000 }, bills: [{ ...bill, amount: 30_000, everyMonths: 3 as const, lastPaid: '2026-09-15', nextDue: '2026-12-15' }] };
    expect(plainHeld(q)[0]).toMatchObject({ builtUp: 10_000n, holdBack: 10_000n });
    const due = { ...q, bills: [{ ...q.bills[0]!, lastPaid: '2026-07-20', nextDue: '2026-10-20' }] };
    expect(plainHeld(due)[0]).toMatchObject({ holdBack: 0n });
  });
  it('D-70 counted once: a bill the usual month already sets aside adds its share to each month of cover', () => {
    // Hana's insurance counted in the usual month at $100 a month: bills $1,100, so the usual month leaves $600; a month covers
    // $600 + $100 = $700; 4 x $700 = $2,800 covers the $1,200: nothing held back (the same as RC-10 with the bill left out).
    const inside = { ...hana, usualMonth: { ...hana.usualMonth, bills: 110_000 }, bills: [{ ...bill, inUsualMonth: true }] };
    expect(plainHeld(inside)[0]).toMatchObject({ perMonth: 70_000n, uncovered: 0n, holdBack: 0n });
    // a $10,000 version: share $833.33, so bills $1,833.33 and the usual month -$133.33; a month covers -$133.33 + $833.33 = $700;
    // 4 x $700 = $2,800; $7,200 not covered, capped at the $5,833.33 built up
    const big = { ...hana, usualMonth: { ...hana.usualMonth, bills: 183_333 }, bills: [{ ...bill, amount: 1_000_000, inUsualMonth: true }] };
    expect(plainHeld(big)[0]).toMatchObject({ perMonth: 70_000n, uncovered: 720_000n, builtUp: 583_333n, holdBack: 583_333n });
    // where it bites: $50 left after a $100 share covers $150 a month: $1,200 - $600 = $600 held back, not the $700 built up
    const thin = { ...inside, usualMonth: { ...inside.usualMonth, everyday: 135_000 } };
    expect(plainHeld(thin)[0]).toMatchObject({ perMonth: 15_000n, uncovered: 60_000n, holdBack: 60_000n });
    expect(plainHeld({ ...thin, bills: [{ ...bill }] })[0]).toMatchObject({ perMonth: 5_000n, holdBack: 70_000n });
    // the engine gives the same hold-back through the fixture
    const { inputs } = toEngineInputs(thin);
    expect(evaluate(inputs, toEngineInputs(thin).check).funds.billsHeld?.parts[0]).toMatchObject({ builtUp: 70_000, holdBack: 60_000 });
  });

  it('the hold-back comes off spare money, and a bill inside the 90 days lands on the path on its date', () => {
    const thin = { ...hana, usualMonth: { ...hana.usualMonth, everyday: 145_000 } };
    const none = { ...thin, bills: [] };
    expect(freeMoney(none) - freeMoney(thin)).toBe(70_000n);
    const soon = { ...hana, bills: [{ ...bill, nextDue: '2026-12-01' }] };
    const p = plainPath(soon, 0n);
    const at = (d: string) => p.find((x) => x.date === d)!.balance;
    const q = plainPath({ ...hana, bills: [] }, 0n);
    const at0 = (d: string) => q.find((x) => x.date === d)!.balance;
    expect(at0('2026-11-30') - at('2026-11-30')).toBe(0n);
    expect(at0('2026-12-01') - at('2026-12-01')).toBe(120_000n);
    expect(longDueInWindow(soon)).toBe(true);
    expect(longDueInWindow(hana)).toBe(false);
  });
  it('the toEngineInputs undated due day: the day before the next pay, cut to the month end', () => {
    expect(undatedDueDate(hana)).toBe('2026-10-31');
    const theo = loadCases().find((c) => c.id === 'QE-09')!.fixture;
    expect(undatedDueDate(theo)).toBe('2026-11-26');
    expect(undatedDueDate({ ...theo, pay: { ...theo.pay, nextDate: '2026-12-04' } })).toBe('2026-11-30');
  });
  it('a usual month reads fortnightly pay as 26 pays over 12 months (SN-09: $1,400 is about $3,033 a month)', () => {
    const noor = loadCases().find((c) => c.id === 'SN-09')!.fixture;
    expect(monthPay(noor)).toBe(303_333n);
    expect(monthPay({ ...noor, pay: { ...noor.pay, cadence: 'weekly' } })).toBe(606_667n);
    expect(monthPay(hana)).toBe(250_000n);
  });
});

describe('05.4-19 regression: the D-47 hold-back survives the D-56 month-end cap (crosscheck seed 23)', () => {
  // Pay $1,000, bills $206.50 still due, a $130 saving on the 16th; a $1,130 yearly bill last paid 15 February, due 15 February.
  // Built up 8 months: $753.33; 4 whole months x $280 left cover $1,120, so $10 is uncovered and held back. Spare money is the
  // $525 the account holds at month end less the $10: $515. $500 + $25 fees = $525: $280 from this month, then $245, more than the $515 - $280 = $235 left.
  const f: RightAnswerFixture = {
    asOf: '2026-10-15', currency: 'USD', region: null,
    pay: { amount: 100_000, cadence: 'monthly', nextDate: '2026-11-01', setupAmount: null, lastThree: null },
    usualMonth: { bills: 20_650, everyday: 38_350, essentialEveryday: 19_175, saving: { amount: 13_000, day: 16, movedThisMonth: false } },
    thisMonth: { received: 100_000, billsPaid: 0, billsDue: 20_650, everydaySoFar: 7_670 },
    historyMonths: 3, quickEstimates: null, recordsAsOf: null,
    accounts: [{ id: 'a1', kind: 'checking', name: 'Main', balance: 116_830, overdraftLimit: null, overdraftRate: null, use: 'everyday' }],
    safetyNet: null,
    bills: [{ id: 'long', amount: 113_000, everyMonths: 12, nextDue: '2027-02-15', lastPaid: '2026-02-15', paidBy: 'me' }],
    debts: [], userLine: null, factLines: false,
    check: { price: 50_000, taxPercent: null, taxIncluded: null, oneOffFees: 2_500, pay: { mode: 'once' } },
  };
  it('plain and engine: Not yet', () => {
    expect(plainHeld(f)[0]).toMatchObject({ builtUp: 75_333n, uncovered: 1_000n, holdBack: 1_000n, months: 4 });
    expect(freeMoney(f)).toBe(51_500n);
    expect(plainAnswer(f).code).toBe('not_yet');
    const { inputs, check } = toEngineInputs(f);
    expect(pick(evaluate(inputs, check)).code).toBe('not_yet');
  });
});

describe('plain calculator: card and loan minimums (05.4-20, FIN-04, FIN-10, D-39b)', () => {
  const db = (id: string): RightAnswerFixture => loadCases().find((c) => c.id === id)!.fixture;
  const engine = (f: RightAnswerFixture) => {
    const { inputs, check } = toEngineInputs(f);
    return pick(evaluate(inputs, check));
  };

  it('every approved debts case (DB-09 since 05.4-22: borrowing, FIN-05) gets its expected code from the plain rules, and the engine agrees', () => {
    for (const c of loadCases().filter((x) => x.topic === 'debts' && x.status === 'approved')) {
      expect({ id: c.id, plain: plainAnswer(c.fixture).code, engine: engine(c.fixture).code }).toEqual({ id: c.id, plain: c.expected.code, engine: c.expected.code });
    }
  });

  it('DB-01 by hand: $1,400 - $400 everyday - $300 minimum on 25 November - $800 = -$100 before pay on 1 December', () => {
    const f = db('DB-01');
    expect(debtDates(f)).toEqual([
      { date: '2026-11-25', amount: 30_000n },
      { date: '2026-12-25', amount: 30_000n },
      { date: '2027-01-25', amount: 30_000n },
    ]);
    expect(pathLow(f, 80_000n)).toBe(-10_000n);
    expect(leftThisMonth(f)).toBe(70_000n); // $3,000 - $1,200 - $400 - $400 - $300
    expect(freeMoney(f)).toBe(70_000n); // $1,400 - $400 everyday still to come - $300 still due on the card
  });

  it('DB-02 by hand: no due day, so the $300 lands tomorrow (16 November), then on the 16th each month', () => {
    expect(debtDates(db('DB-02')).map((x) => x.date)).toEqual(['2026-11-16', '2026-12-16', '2027-01-16']);
    expect(pathLow(db('DB-02'), 60_000n)).toBe(10_000n);
  });

  it('DB-03 / DB-07 by hand: a minimum paid as one of the bills is counted once', () => {
    expect([...paidAsBill(db('DB-03'))]).toEqual(['d-card']);
    expect(debtMinimums(db('DB-03'))).toBe(0n);
    expect(leftThisMonth(db('DB-03'))).toBe(70_000n); // $3,000 - $1,500 bills (the card inside) - $800 everyday
    expect(leftThisMonth(db('DB-07'))).toBe(80_000n); // $4,000 - $2,200 bills (the mortgage inside) - $1,000 everyday
    expect(engine(db('DB-07')).afterBuy.month).toBe(30_000);
  });

  it('DB-10 by hand: only the $200 still owed lands on 25 November; the month sets the whole $300 aside', () => {
    const f = db('DB-10');
    expect(debtDates(f)[0]).toEqual({ date: '2026-11-25', amount: 20_000n });
    expect(debtToPay(f)).toBe(20_000n);
    expect(leftThisMonth(f)).toBe(70_000n);
    expect(plainAnswer(f)).toEqual({ code: 'fits_month', variant: null, afterBuy: 25_000 });
  });

  it('DB-04 / DB-11 (D-39b): money saved earlier on a fit with a 24.9% card is costly_debt; this month spare money alone is not', () => {
    expect(carriesCostlyDebt(db('DB-04'), 105_000n)).toBe(true); // £1,050 from earlier months: £21.79 a month
    expect(plainAnswer(db('DB-04'))).toMatchObject({ code: 'fits_unspent', variant: 'costly_debt' });
    expect(engine(db('DB-04'))).toMatchObject({ code: 'fits_unspent', variant: 'costly_debt' });
    expect(plainAnswer(db('DB-11'))).toMatchObject({ code: 'fits_month', variant: null });
    // 19.99% is under the line; 20% is on it
    const at = (apr: string): RightAnswerFixture => ({ ...db('DB-04'), debts: db('DB-04').debts.map((d) => ({ ...d, apr })) });
    expect(plainAnswer(at('19.99')).variant).toBe(null);
    expect(engine(at('19.99')).variant).toBe(null);
    expect(plainAnswer(at('20')).variant).toBe('costly_debt');
    expect(engine(at('20')).variant).toBe('costly_debt');
  });

  it('DB-08 by hand: both minimums count, $1,400 - $400 - $300 (16 Nov) - $200 (20 Nov) - $600 = -$100', () => {
    expect(debtToPay(db('DB-08'))).toBe(50_000n);
    expect(pathLow(db('DB-08'), 60_000n)).toBe(-10_000n);
  });

  it('D-72 / D-73 (owner) in the plain rules: $2.67 at 21.9% is no caution, $54.80 is; a $587.32 card with a $707.08 minimum pays once', () => {
    const f = db('DB-04');
    const loan = (balance: number): RightAnswerFixture => ({ ...f, debts: [{ ...f.debts[0]!, balance, apr: '21.9' }] });
    expect(carriesCostlyDebt(loan(1_523_785), 267n)).toBe(false); // gen:145: about $0.05 a month
    expect(carriesCostlyDebt(loan(1_523_785), 5_480n)).toBe(true); // $1.00 a month
    expect(carriesCostlyDebt(loan(1_523_785), 5_452n)).toBe(false); // $0.99
    expect(carriesCostlyDebt(loan(9), 100_000n)).toBe(false); // the balance caps it
    const card = { ...db('DB-02'), debts: [{ ...db('DB-02').debts[0]!, balance: 58_732, minimum: 70_708 }] };
    expect(debtDates(card)).toEqual([{ date: '2026-11-16', amount: 58_732n }]);
    const engine = (x: RightAnswerFixture) => {
      const { inputs, check } = toEngineInputs(x);
      return pick(evaluate(inputs, check)).code;
    };
    expect(engine(card)).toBe(plainAnswer(card).code);
  });
});

describe('plain calculator: quick estimates count the bills once (05.4-57, ENG-11)', () => {
  const qe = (id: string): RightAnswerFixture => loadCases().find((c) => c.id === id)!.fixture;
  const run = (f: RightAnswerFixture) => {
    const { inputs, check } = toEngineInputs(f);
    const ev = evaluate(inputs, check);
    return { picked: pick(ev), month: ev.month, net: ev.net };
  };

  it('QE-13 by hand: £1,300 - £1,000 bills = £300 everyday; £80 still to come; £1,200 left; £600 leaves £600; starter £1,200', () => {
    const f = qe('QE-13');
    expect(usualEveryday(f)).toBe(30_000n);
    expect(everydayToCome(f)).toBe(8_000n); // max(£300 x 8 / 30 = £80, £300 - £220 = £80)
    expect(leftThisMonth(f)).toBe(120_000n); // £2,500 - £1,000 - £220 - £80
    expect(plainNet(f).starter).toBe(120_000n); // £1,000 bills + £200 essential
    expect(plainAnswer(f)).toEqual({ code: 'fits_month', variant: null, afterBuy: 60_000 });
    const e = run(f);
    expect([e.month.erest, e.month.monthLeft, e.net?.size, e.net?.state]).toEqual([8_000, 120_000, 120_000, 'full']);
    expect([e.picked.code, e.picked.variant, e.picked.afterBuy.month]).toEqual(['fits_month', null, 60_000]);
  });

  it('QE-01 by hand: £80 still to come, records do not look behind, £1,175 - £1,150 = £25 left', () => {
    const f = qe('QE-01');
    expect(everydayToCome(f)).toBe(8_000n);
    expect(recordsLookBehind(f)).toBe(false); // £220 x 30 x 100 = 660,000 >= 50 x £300 x 22 = 330,000 (in pounds)
    expect(plainAnswer(f).code).toBe('fits_month');
    expect(plainAnswer(f).afterBuy).toBe(2_500);
    expect(plainNet(f).starter).toBe(122_500n); // D-51: £1,000 + £25 minimum + £200
    const e = run(f);
    expect([e.month.erest, e.picked.code, e.picked.afterBuy.month]).toEqual([8_000, 'fits_month', 2_500]);
    expect(e.picked.reasons).not.toContain('under_logged');
  });

  it('no bill series recorded (estimates only): the whole £1,300 is everyday spending, counted once; still £1,200 left', () => {
    const base = qe('QE-13');
    const f: RightAnswerFixture = { ...base, usualMonth: { ...base.usualMonth, bills: 0 }, thisMonth: { ...base.thisMonth, billsPaid: 0 } };
    expect(usualEveryday(f)).toBe(130_000n);
    expect(everydayToCome(f)).toBe(108_000n); // max(£1,300 x 8 / 30 = £346.67, £1,300 - £220 = £1,080)
    expect(leftThisMonth(f)).toBe(120_000n); // £2,500 - £220 - £1,080: the same money left, split differently
    const e = run(f);
    expect([e.month.e, e.month.recurringBills, e.month.erest, e.month.monthLeft]).toEqual([130_000, 0, 108_000, 120_000]);
    expect([e.picked.code, e.picked.afterBuy.month]).toEqual([plainAnswer(f).code, plainAnswer(f).afterBuy]);
  });

  it('£1,400 of bill series against £1,300 of money out: everyday 0, never below 0', () => {
    const base = qe('QE-13');
    const f: RightAnswerFixture = { ...base, usualMonth: { ...base.usualMonth, bills: 140_000 }, thisMonth: { ...base.thisMonth, billsPaid: 140_000 } };
    expect(usualEveryday(f)).toBe(0n);
    expect(everydayToCome(f)).toBe(0n);
    expect(leftThisMonth(f)).toBe(88_000n); // £2,500 - £1,400 - £220
    const e = run(f);
    expect([e.month.e, e.month.erest, e.month.monthLeft]).toEqual([0, 0, 88_000]);
    expect(e.month.typicalLeft).toBe(110_000); // D-74: the larger figure, £1,400 recorded, goes out of the usual month
    expect(e.picked.code).toBe(plainAnswer(f).code);
  });

  // D-74 (owner, 2026-11-03): money out already includes the recorded bills, card and loan minimums and regular saving.
  it('D-74 QE-01 by hand: money out £1,000 + £300 + £25 = £1,325; everyday £1,325 - £1,000 - £25 = £300; usual month £1,175', () => {
    const f = qe('QE-01');
    expect(quickMoneyOut(f)).toBe(132_500n);
    expect(usualEveryday(f)).toBe(30_000n);
    expect(usualShortfall(f)).toBe(0n); // not short: £2,500 - £1,000 - £300 - £25 = £1,175 left
    const e = run(f);
    expect([e.month.e, e.month.typicalLeft, e.month.setAside]).toEqual([30_000, 117_500, 2_500]);
  });

  it('D-74 a quick-estimates person with two loans (crosscheck seed 0): the minimums are inside the money out, so the usual month is $0.01 short on both sides', () => {
    const f: RightAnswerFixture = {
      asOf: '2026-10-15', currency: 'USD', region: null,
      pay: { amount: 100_000, cadence: 'monthly', nextDate: '2026-11-01', setupAmount: null, lastThree: null },
      usualMonth: { bills: 31_850, everyday: 59_150, essentialEveryday: 29_575 },
      thisMonth: { received: 100_000, billsPaid: 0, billsDue: 31_850, everydaySoFar: 11_830 },
      historyMonths: 0, quickEstimates: { income: 100_000, bills: 31_850, everyday: 59_150 }, recordsAsOf: null,
      accounts: [
        { id: 'a1', kind: 'checking', name: 'Main', balance: 88_170, overdraftLimit: null, overdraftRate: null, use: 'everyday' },
        { id: 'n1', kind: 'savings', name: 'Safety net', balance: 77_470, overdraftLimit: null, overdraftRate: null, use: 'emergency' },
      ],
      safetyNet: { protect: true, size: null, saved: 77_470, locked: false },
      bills: [],
      debts: [
        { id: 'debt-0', kind: 'loan', balance: 0, minimum: 3_000, apr: null, dueDay: null, joint: false },
        { id: 'debt-1', kind: 'loan', balance: 5_970, minimum: 6_001, apr: '20', dueDay: null, joint: false },
      ],
      userLine: null, factLines: false,
      check: { price: 10_000, taxPercent: null, taxIncluded: null, oneOffFees: 0, pay: { mode: 'once' } },
    };
    expect(quickMoneyOut(f)).toBe(100_001n); // $318.50 + $591.50 + $30.00 + $60.01
    expect(usualShortfall(f)).toBe(1n); // $1,000 - $1,000.01
    const e = run(f);
    expect(e.month.typicalLeft).toBe(-1);
    expect({ code: e.picked.code, variant: e.picked.variant }).toEqual({ code: plainAnswer(f).code, variant: plainAnswer(f).variant });
    expect(e.picked.variant).toBe('month_short_moderate_extra');
  });
});

describe('05.4-21: short month and tight (FIN-06 / ENG-06, FIN-07, D-40): hand, plain calculator and engine', () => {
  const byId = (id: string) => {
    const c = loadCases().find((x) => x.id === id);
    if (c === undefined) throw new RangeError(id);
    return c;
  };
  /** The engine with the plan's pause question answered (no interest during the pause: every plan here is 0%). */
  const engine = (f: RightAnswerFixture) => {
    const { inputs, check } = toEngineInputs(f);
    const fp = check.pay.mode === 'plan' ? check.pay.firstPayment : null;
    const c = check.pay.mode === 'plan' && fp !== null && fp.kind === 'deferred' ? { ...check, pay: { ...check.pay, firstPayment: { ...fp, interestDuringPause: false } } } : check;
    return evaluate(inputs, c);
  };

  it.each(['BR-05', 'BR-07', 'BR-08', 'BR-09', 'BR-11'])('%s: the approved code and variant from the engine and the plain calculator', (id) => {
    const c = byId(id);
    expect(c.status).toBe('approved');
    const r = engine(c.fixture).result;
    expect({ code: r.code, variant: r.variant }).toEqual({ code: c.expected.code, variant: c.expected.variant });
    expect(plainAnswer(c.fixture)).toMatchObject({ code: c.expected.code, variant: c.expected.variant });
    if (c.expected.variant === 'tight') expect(r.facts.map((x) => x.code)).toContain('tight_floor');
  });

  it('the plan figures by hand: payment and floor', () => {
    const f = (id: string) => byId(id).fixture;
    // BR-07: $1,870 of $2,200 = 85% (more than 80%); $330 left, floor $280 (a tenth of $1,800 + $1,000)
    expect([plainPlanMonthly(f('BR-07')), plainFloor(f('BR-07'))]).toEqual([187_000n, 28_000n]);
    // BR-08: $650 of $1,000 = 65%; $350 left, under the $400 floor (a tenth of $2,500 + $1,500)
    expect([plainPlanMonthly(f('BR-08')), plainFloor(f('BR-08'))]).toEqual([65_000n, 40_000n]);
    expect(engine(f('BR-08')).result.facts.find((x) => x.code === 'tight_floor')?.values).toEqual({ floor: 40_000, basis: 'tenth' });
    // BR-09: $750 of $1,000 = 75%; $250 left, above the $200 tenth, under her $300 line
    expect([plainPlanMonthly(f('BR-09')), plainFloor(f('BR-09'))]).toEqual([75_000n, 30_000n]);
    expect(engine(f('BR-09')).result.facts.find((x) => x.code === 'tight_floor')?.values).toEqual({ floor: 30_000, basis: 'user_line' });
    // BR-11: £200 of £200 = 100%; £0 left, under the £180 floor
    expect([plainPlanMonthly(f('BR-11')), plainFloor(f('BR-11'))]).toEqual([20_000n, 18_000n]);
    expect(plainTightPlan(f('BR-07'))).toBe(true);
    // BR-05: the usual month is -$100 before the plan, so no plan fits it
    expect(plainMonthlyShort(f('BR-05'))).toBe(true);
  });

  it('BR-06 (D-76): this month heads to -$200 (FIN-06 makes the monthly part Short each month), but the account goes below $0 before payday with no overdraft, so Not yet leads', () => {
    const c = byId('BR-06');
    const f = c.fixture;
    expect(plainMonthlyShort(f)).toBe(true);
    expect(freeMoney(f)).toBe(-20_000n);
    // $400 - $600 everyday still to come - the $100 first payment on 28 November = -$300 before pay on 1 December
    const r = engine(f);
    expect(r.cash).toMatchObject({ kind: 'not_covered', shortBy: 30_000, payDate: '2026-12-01' });
    expect(r.result.parts.monthly).toBe('monthly_short');
    const got = pick(r);
    expect({ code: got.code, variant: got.variant, readyBy: got.readyBy }).toEqual({ code: c.expected.code, variant: c.expected.variant, readyBy: c.expected.readyBy });
    expect(got.facts).toContain('no_overdraft_limit');
    expect(plainAnswer(f).code).toBe('not_yet');
  });

  it.each([
    ['SN-10', 2_000n, 20_000n],
    ['SN-11', 5_000n, 17_000n],
    ['DB-02', 10_000n, 20_000n],
    ['DB-03', 10_000n, 23_000n],
    ['DB-07', 30_000n, 32_000n],
    ['QE-01', 2_500n, 13_000n],
    ['QE-08', 2_500n, 20_000n],
    ['SO-06', 10_000n, 20_000n],
    ['RC-10', 3_710n, 18_000n],
  ] as const)('%s one-off: left %s under the floor %s, tight on both sides', (id, left, floor) => {
    const f = byId(id).fixture;
    expect(freeMoney(f) + plainNet(f).above - BigInt(f.check.price ?? 0)).toBe(left);
    expect(plainFloor(f)).toBe(floor);
    expect(plainAnswer(f).variant).toBe('tight');
    const r = engine(f).result;
    expect(r.variant).toBe('tight');
    expect(r.facts.find((x) => x.code === 'tight_floor')?.values).toEqual({ floor: Number(floor), basis: 'tenth' });
  });

  it.each([
    ['DB-10', 25_000n, 20_000n],
    ['DB-12', 120_000n, 32_000n],
    ['QE-13', 60_000n, 13_000n],
  ] as const)('%s one-off: left %s is not under the floor %s, no tight on either side', (id, left, floor) => {
    const f = byId(id).fixture;
    expect(freeMoney(f) + plainNet(f).above - BigInt(f.check.price ?? 0)).toBe(left);
    expect(plainFloor(f)).toBe(floor);
    expect(plainAnswer(f).variant).not.toBe('tight');
    const r = engine(f).result;
    expect(r.variant).not.toBe('tight');
    expect(r.facts.map((x) => x.code)).not.toContain('tight_floor');
  });
});

describe('plain calculator: your word, low months and the pay cut (05.4-23, FIN-08, FIN-15)', () => {
  const fx = (id: string): RightAnswerFixture => loadCases().find((c) => c.id === id)!.fixture;
  it('QE-03, QE-04, QE-05 and QE-14 get their approved code and variant from the plain low-month rule', () => {
    for (const id of ['QE-03', 'QE-04', 'QE-05', 'QE-14']) {
      const c = loadCases().find((x) => x.id === id)!;
      const got = plainAnswer(c.fixture);
      expect({ id, code: got.code, variant: got.variant }).toEqual({ id, code: c.expected.code, variant: c.expected.variant });
    }
  });
  it('QE-03 with no answer asks; savings that carry the low months never ask', () => {
    const f = fx('QE-03');
    expect(plainLowMonths({ ...f, check: { ...f.check, yourAnswer: null } })?.code).toBe('needs_input');
    expect(plainLowMonths({ ...f, accounts: f.accounts.map((a) => (a.kind === 'savings' ? { ...a, balance: 400_000 } : a)) })).toEqual({ code: 'fits_month', variant: 'low_month' });
    // a one-off, a fortnightly plan or no low month: the low-month rule does not apply
    expect(plainLowMonths({ ...f, check: { ...f.check, pay: { mode: 'once' } } })).toBeNull();
    expect(plainLowMonths({ ...f, pay: { ...f.pay, lastThree: [300_000, 300_000, 300_000] } })).toBeNull();
  });
  it('QE-14 with protection off reads protection_off', () => {
    const f = fx('QE-14');
    expect(plainLowMonths({ ...f, safetyNet: { ...f.safetyNet!, protect: false } })).toEqual({ code: 'fits_uses_net', variant: 'protection_off' });
  });
  it('QE-06 by hand: the lower of $3,000 and the middle $2,720 is $2,720, 9.3% below (named); $720 - $850 is Short each month', () => {
    const f = fx('QE-06');
    expect(lowerPay(f)).toBe(272_000n);
    expect(payGapNamed(f)).toBe(true);
    expect(plainAnswer(f).code).toBe('monthly_short');
    expect(payGapNamed({ ...f, pay: { ...f.pay, lastThree: [290_000, 286_000, 285_000] } })).toBe(false);
    expect(lowerPay({ ...f, pay: { ...f.pay, lastThree: [310_000, 320_000, 330_000] } })).toBe(300_000n);
    expect(lowerPay({ ...f, pay: { ...f.pay, lastThree: null } })).toBe(300_000n);
  });
});
