/**
 * 05.4 FIN-03 / ENG-02 (D-26..D-28, D-36..D-38): overdraft.ts unit by unit, and the approved overdraft cases to the cent
 * (05.4-12 revision notes: the day-by-day path and the daily-sum interest the cases were computed with).
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import { percent } from '../../../payoff/types';
import { applyPurchaseFlows, type CashPathV3 } from '../cash/path';
import { CASH_PATH_DAYS_V3 } from '../constants';
import { evaluate } from '../evaluate';
import { purchaseCashFlows } from '../judge/purchase';
import {
  monthlyOverdraftCost,
  noLimitAccountOf,
  noLimitFacts,
  otherOverdrawnFacts,
  overdraftAccountOf,
  overdraftCost,
  overdraftFloor,
  overdraftRepeat,
  overdraftUse,
  overdraftUseFacts,
  payerOf,
} from '../overdraft';
import { prepare } from '../prepare';
import type { AccountUse, V3Account, V3Inputs } from '../types';
import { checkOnce as checkOnceWith } from './helpers/fixtures';
import { toEngineInputs } from './rightAnswers/fixture';
import { loadCases } from './rightAnswers/loader';

const mu = (n: number): MinorUnits => minorUnits(n);
const everyday: AccountUse = { kind: 'everyday' };

function acct(id: string, balance: number, over: Partial<V3Account> = {}): V3Account {
  return { id, balance: mu(balance), use: everyday, kind: 'checking', overdraftLimit: null, overdraftRate: null, ...over };
}

/** A path from balances, one day each, from 2026-11-01. */
function pathOf(...balances: number[]): CashPathV3 {
  const day = (i: number): string => `2026-11-${String(i + 1).padStart(2, '0')}`;
  return { asOf: day(0), points: balances.map((b, i) => ({ date: day(i), balance: mu(b) })) };
}

function caseInputs(id: string): ReturnType<typeof toEngineInputs> {
  const c = loadCases().find((x) => x.id === id);
  if (c === undefined) throw new RangeError(`no case ${id}`);
  return toEngineInputs(c.fixture);
}

/** The case's 90-day path with and without its purchase, from the same prepared reading the engine judges. */
function pathsOf(id: string): { readonly withP: CashPathV3; readonly withoutP: CashPathV3; readonly inputs: V3Inputs } {
  const { inputs, check } = caseInputs(id);
  const p = prepare(inputs);
  const r = p.readings[0]!;
  const ev = evaluate(inputs, check);
  const flows = purchaseCashFlows(ev.purchase!, inputs.asOf, CASH_PATH_DAYS_V3);
  return { withP: applyPurchaseFlows(r.open, r.funds.spending, flows), withoutP: applyPurchaseFlows(r.open, r.funds.spending, []), inputs };
}

describe('overdraft floor and accounts (D-28, CONTEXT: only checking and current accounts)', () => {
  it('the floor is minus the limits on counted checking and current accounts; a null limit is 0', () => {
    expect(overdraftFloor(undefined)).toBe(0);
    expect(overdraftFloor([])).toBe(0);
    expect(overdraftFloor([acct('a', 100), acct('b', 0, { kind: 'current', overdraftLimit: mu(50_000) })])).toBe(-50_000);
    expect(overdraftFloor([acct('a', 0, { overdraftLimit: mu(20_000) }), acct('b', 0, { kind: 'current', overdraftLimit: mu(30_000) })])).toBe(-50_000);
  });

  it('savings, cards, unstated kinds, uncounted uses and invalid limits never give an overdraft (OD-07)', () => {
    const limit = { overdraftLimit: mu(100_000) };
    expect(overdraftFloor([acct('s', 0, { ...limit, kind: 'savings' })])).toBe(0);
    expect(overdraftFloor([acct('c', 0, { ...limit, kind: 'card' })])).toBe(0);
    expect(overdraftFloor([acct('n', 0, { ...limit, kind: null })])).toBe(0);
    expect(overdraftFloor([acct('k', 0, { overdraftLimit: mu(100_000), kind: undefined })])).toBe(0);
    expect(overdraftFloor([acct('u', 0, { ...limit, use: { kind: 'untouched' } })])).toBe(0);
    expect(overdraftFloor([acct('q', 0, { ...limit, use: null })])).toBe(0);
    expect(overdraftFloor([acct('m', 0, { ...limit, use: { kind: 'mixed', extraSetAside: null } })])).toBe(-100_000);
    expect(overdraftFloor([acct('x', 0, { overdraftLimit: -5 as MinorUnits })])).toBe(0);
    expect(overdraftFloor([acct('y', 0, { overdraftLimit: 1.5 as MinorUnits })])).toBe(0);
  });

  it('the payer holds the most; the overdraft account is the payer when it has a limit, else the largest limit', () => {
    const joint = acct('joint', -30_000, { overdraftLimit: mu(50_000) });
    const main = acct('main', 200_000);
    expect(payerOf([joint, main])?.id).toBe('main');
    expect(payerOf([acct('a', 5), acct('b', 5)])?.id).toBe('a');
    expect(payerOf([])).toBeNull();
    expect(overdraftAccountOf([joint, main])?.id).toBe('joint');
    expect(overdraftAccountOf([joint, acct('big', -1, { overdraftLimit: mu(90_000) }), main])?.id).toBe('big');
    expect(overdraftAccountOf([acct('p', 9, { overdraftLimit: mu(10) }), acct('q', 1, { overdraftLimit: mu(90) })])?.id).toBe('p');
    expect(overdraftAccountOf([main])).toBeNull();
    expect(overdraftAccountOf(undefined)).toBeNull();
  });

  it('the no-limit account is the payer when its limit is null, else the first with a null limit; an explicit 0 is an answer', () => {
    expect(noLimitAccountOf([acct('a', 10)])?.id).toBe('a');
    expect(noLimitAccountOf([acct('a', 10, { overdraftLimit: mu(0) }), acct('b', 5)])?.id).toBe('b');
    expect(noLimitAccountOf([acct('a', 10, { overdraftLimit: mu(0) })])).toBeNull();
    expect(noLimitAccountOf(undefined)).toBeNull();
  });
});

describe('overdraft cost (D-36: a daily sum, never the deepest day times the days)', () => {
  it('is the sum of each day below 0 times the rate over 365, rounded half up once', () => {
    // 3 days below 0: 10,000 + 30,000 + 20,000 = 60,000 unit-days at 36.5% = 60 exactly
    expect(overdraftCost(pathOf(5_000, -10_000, -30_000, -20_000, 0), percent('36.5'))).toBe(60);
    // the deepest-day reading (30,000 x 3 days) would be 90: not the rule
    expect(overdraftCost(pathOf(-30_000), percent('36.5'))).toBe(30);
    expect(overdraftCost(pathOf(-5_000), null)).toBe(0);
    expect(overdraftCost(pathOf(1, 2, 3), percent('22'))).toBe(0);
    // half up: 1,000 unit-days at 18.25% = 0.5 -> 1
    expect(overdraftCost(pathOf(-1_000), percent('18.25'))).toBe(1);
  });

  it('OD-01 (Priya): 9 days below 0 adding up to 334,000; about 2.01, without the purchase 1.69, so it adds 0.32', () => {
    const { withP, withoutP } = pathsOf('OD-01');
    const below = withP.points.filter((p) => p.balance < 0);
    expect(below).toHaveLength(9);
    expect(below.reduce((s, p) => s - p.balance, 0)).toBe(334_000);
    expect(overdraftCost(withP, percent('22'))).toBe(201);
    expect(overdraftCost(withoutP, percent('22'))).toBe(169);
    expect(overdraftUse(withP, withoutP, ['2026-12-01'], percent('22'))).toMatchObject({ below: 46_000, days: 9, costEstimate: 201, without: 169, adds: 32, notCleared: false });
  });

  it('OD-11 (Tess, limit set): the 90-day cost is 74.25, 55.85 without the purchase, 18.40 added', () => {
    const { withP, withoutP } = pathsOf('OD-11');
    expect(withP.points.reduce((s, p) => s + (p.balance < 0 ? -p.balance : 0), 0)).toBe(6_792_263);
    expect(overdraftCost(withP, percent('39.9'))).toBe(7_425);
    expect(overdraftCost(withoutP, percent('39.9'))).toBe(5_585);
  });

  it('OD-12 (Ivy): 2.68 with the purchase, 1.45 without, 1.23 added', () => {
    const { withP, withoutP } = pathsOf('OD-12');
    expect(overdraftCost(withP, percent('22'))).toBe(268);
    expect(overdraftCost(withoutP, percent('22'))).toBe(145);
  });

  it('OD-08: 300 below 0 at 20% is 5.00 a month', () => {
    expect(monthlyOverdraftCost(mu(30_000), percent('20'))).toBe(500);
  });
});

describe('overdraft use and repeat (D-26, D-36, D-37)', () => {
  it('is null when the path never goes below 0', () => {
    expect(overdraftUse(pathOf(0, 5), pathOf(0, 5), ['2026-11-02'], percent('20'))).toBeNull();
  });

  it('is not cleared when the pay leaves it below 0, when no pay lands inside the path, or the pay is past its end', () => {
    expect(overdraftUse(pathOf(-5, -1), pathOf(0, 0), ['2026-11-02'], null)?.notCleared).toBe(true);
    expect(overdraftUse(pathOf(-5, 0), pathOf(0, 0), ['2026-11-02'], null)?.notCleared).toBe(false);
    expect(overdraftUse(pathOf(-5, 0), pathOf(0, 0), [], null)).toMatchObject({ notCleared: true, payDate: null });
    expect(overdraftUse(pathOf(-5, 0), pathOf(0, 0), ['2027-01-01'], null)?.notCleared).toBe(true);
  });

  it('repeat use is below 0 on the day before at least 2 of the next 3 paydays (OD-01: 1 of 3, none)', () => {
    const p = pathOf(-1, -1, 0, -1, 0, 0, 0);
    expect(overdraftRepeat(p, ['2026-11-02', '2026-11-03', '2026-11-05'])).toEqual({ count: 3, of: 3 });
    expect(overdraftRepeat(p, ['2026-11-02', '2026-11-04', '2026-11-05'])).toEqual({ count: 2, of: 3 });
    expect(overdraftRepeat(p, ['2026-11-04', '2026-11-06', '2026-11-07'])).toBeNull();
    // only the next 3 paydays count; a payday past the path end has no day before it inside the path
    expect(overdraftRepeat(p, ['2026-11-04', '2026-11-06', '2026-11-07', '2026-11-02', '2026-11-03'])).toBeNull();
    expect(overdraftRepeat(p, ['2026-11-02', '2026-12-30'])).toBeNull();
    const { withoutP } = pathsOf('OD-01');
    expect(overdraftRepeat(withoutP, ['2026-12-01', '2027-01-01', '2027-02-01'])).toBeNull();
  });
});

describe('overdraft facts', () => {
  const limit = acct('a1', -20_000, { overdraftLimit: mu(50_000), overdraftRate: percent('22') });

  it('with no rate set, the cost facts are left out and the use and repeat facts carry no rate or cost', () => {
    const ctx = { floor: mu(-50_000), withPurchase: pathOf(-10, -10, 5), withoutPurchase: pathOf(-5, -5, 5), paydays: ['2026-11-02', '2026-11-03'] };
    const { variant, facts } = overdraftUseFacts([{ ...limit, overdraftRate: null }], ctx, { kind: 'month', month: '2027-01' });
    expect(variant).toBe('not_cleared');
    expect(facts.map((f) => f.code)).toEqual(['overdraft_not_cleared', 'overdraft_use', 'wait_clears', 'overdraft_repeat']);
    expect(facts[1]!.values).toEqual({ accountId: 'a1', below: 10, days: 2, zero: 0 });
    expect(facts[3]!.values).toEqual({ accountId: 'a1', count: 2, of: 3, zero: 0 });
  });

  it('with no pay inside the path the warning has no date and reads the end of the path; no month that clears it, no wait line', () => {
    const ctx = { floor: mu(-50_000), withPurchase: pathOf(0, -10, -7), withoutPurchase: pathOf(0, 0, 0), paydays: [] };
    const { facts } = overdraftUseFacts([limit], ctx, null);
    expect(facts.map((f) => f.code)).toEqual(['overdraft_not_cleared', 'overdraft_use', 'overdraft_cost_90d', 'overdraft_without_purchase', 'overdraft_purchase_adds']);
    expect(facts[0]!.values).toEqual({ accountId: 'a1', below: 7, zero: 0 });
    expect(facts[3]!.values).toEqual({ below: 0, days: 0, cost: 0, zero: 0 });
  });

  it('cleared by the next pay: no warning, variant null', () => {
    const ctx = { floor: mu(-50_000), withPurchase: pathOf(-10, 5), withoutPurchase: pathOf(0, 5), paydays: ['2026-11-02'] };
    const { variant, facts } = overdraftUseFacts([limit], ctx, null);
    expect(variant).toBeNull();
    expect(facts.map((f) => f.code)).toEqual(['overdraft_use', 'overdraft_without_purchase', 'overdraft_purchase_adds']);
  });

  it('the no-limit question names the account; clearing_first only when it is already below 0; no interest in a date with no rate', () => {
    expect(noLimitFacts(undefined, mu(5), null)).toEqual([]);
    expect(noLimitFacts([acct('m', 0)], mu(27_742), { kind: 'date', date: '2026-11-01' }).map((f) => f.code)).toEqual(['no_overdraft_limit', 'ready_without_interest']);
    expect(noLimitFacts([acct('m', -150_000)], mu(5), { kind: 'month', month: '2027-03' }).map((f) => f.code)).toEqual([
      'no_overdraft_limit',
      'clearing_first',
      'ready_without_interest',
    ]);
    expect(noLimitFacts([acct('m', -1, { overdraftRate: percent('20') })], mu(5), { kind: 'month', month: '2027-03' }).map((f) => f.code)).toEqual(['no_overdraft_limit', 'clearing_first']);
    expect(noLimitFacts([acct('m', 0)], mu(5), null).map((f) => f.code)).toEqual(['no_overdraft_limit']);
    expect(noLimitFacts([acct('m', 0)], mu(27_742), null)[0]!.values).toEqual({ accountId: 'm', below: 27_742, zero: 0 });
  });

  it('another account below 0 is a fact with its monthly cost; the payer and accounts at or above 0 are not listed', () => {
    const facts = otherOverdrawnFacts([acct('joint', -30_000, { overdraftLimit: mu(50_000), overdraftRate: percent('20') }), acct('main', 200_000), acct('spare', 0), acct('old', -100)]);
    expect(facts.map((f) => f.values)).toEqual([
      { accountId: 'joint', below: 30_000, rate: '20', monthlyCost: 500, zero: 0 },
      { accountId: 'old', below: 100, zero: 0 },
    ]);
    expect(otherOverdrawnFacts([acct('only', -5)])).toEqual([]);
    expect(otherOverdrawnFacts(undefined)).toEqual([]);
  });
});

describe('judge: the one-off part with the cash path inside the overdraft', () => {
  const ivy = (): ReturnType<typeof toEngineInputs> => caseInputs('OD-12');

  it('money spoken for never counts as overdraft: with unspent far below the balance it is Not yet, not Uses your overdraft', () => {
    const { inputs, check } = ivy();
    // the user said the 700 the records cannot explain is set aside for a bill, so it is not spare
    const spokenFor: V3Inputs = { ...inputs, unspent: { amount: mu(-100_000), at: inputs.asOf }, unexplainedAnswer: { amount: mu(70_000), use: 'set_aside_for_bill', at: inputs.asOf } };
    const ev = evaluate(spokenFor, check);
    expect(ev.cash.kind).toBe('overdraft');
    expect(ev.result.code).toBe('not_yet');
    expect(ev.result.variant).toBe('not_covered');
    expect(ev.result.facts.some((f) => f.code === 'overdraft_use')).toBe(false);
  });

  it("the purchase's own envelope keeps its share; the rest comes out of this month (D-22)", () => {
    const { inputs } = ivy();
    const withEnvelope: V3Inputs = {
      ...inputs,
      envelopes: [{ id: 'e1', kind: 'pot', target: null, monthlyAmount: null, readyBy: null, saved: mu(3_000), purposeId: null, accountId: 'a1' }],
    };
    const ev = evaluate(withEnvelope, checkOnceWith(10_000, { envelopeId: 'e1' }));
    expect(ev.result.code).toBe('fits_uses_overdraft');
    expect(ev.result.split).toEqual([
      { source: 'month', amount: 7_000 },
      { source: 'envelope', amount: 3_000 },
    ]);
  });

  it('05.4 D-35: inside the overdraft limit the overdraft carries the dip and the protected net is kept for last, whatever the purpose', () => {
    const { inputs } = ivy();
    const withFund: V3Inputs = {
      ...inputs,
      accounts: [...(inputs.accounts ?? []), { id: 'n1', balance: mu(10_000), use: { kind: 'dedicated', purpose: { kind: 'emergency' } } }],
      emergency: { amount: mu(10_000), accountId: 'n1' },
      unspent: { amount: mu(0), at: inputs.asOf },
    };
    const ev = evaluate(withFund, checkOnceWith(10_000, { emergency: true, purpose: { kind: 'preset', value: 'necessity' } }));
    expect(ev.cash.kind).toBe('overdraft');
    expect(ev.result.code).toBe('fits_uses_overdraft');
    expect(ev.result.split).toEqual([{ source: 'month', amount: 10_000 }]);
    expect(ev.result.facts.some((f) => f.code === 'net_used')).toBe(false);
  });
});
