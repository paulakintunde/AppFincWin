/**
 * 05.4 D-56 / D-58 / D-62 unit tests: spare money capped at the everyday account, the split that names the real source, and the
 * move-by fact. Every branch of moneySource.ts is pinned both ways.
 */
import { minorUnits } from '../../../money/types';
import { openCashPath, type CashPathV3 } from '../cash/path';
import { evaluate } from '../evaluate';
import { cappedSpare, moveMoneyBy, sourceSplit, spareInAccount } from '../moneySource';
import { prepare } from '../prepare';
import type { Result } from '../types';
import { toEngineInputs } from './rightAnswers/fixture';
import { loadCases } from './rightAnswers/loader';

const mu = minorUnits;
const fixtureOf = (id: string) => {
  const c = loadCases().find((x) => x.id === id);
  if (c === undefined) throw new RangeError(id);
  return toEngineInputs(c.fixture);
};
const fact = (r: Result, code: string) => r.facts.find((f) => f.code === code)?.values;
const path = (...pts: [string, number][]): CashPathV3 => ({ asOf: pts[0]![0], points: pts.map(([date, b]) => ({ date, balance: mu(b) })) });

describe('spareInAccount (D-56)', () => {
  it('the balance on the last day of asOf’s month, with no purchase, signed', () => {
    const open = openCashPath({ asOf: '2026-11-15', days: 90, series: [], paidThisMonth: new Set(), erest: mu(16_000), e: mu(30_000) });
    expect(spareInAccount(open, mu(70_000))).toBe(54_000);
    expect(spareInAccount(open, mu(10_000))).toBe(-6_000);
  });
});

describe('cappedSpare (D-56)', () => {
  it('the confirmed figure, no more than the account holds; an account below 0 caps at 0; null stays null', () => {
    expect(cappedSpare(mu(50_000), mu(30_000))).toBe(30_000);
    expect(cappedSpare(mu(20_000), mu(30_000))).toBe(20_000);
    expect(cappedSpare(mu(20_000), mu(-5_000))).toBe(0);
    expect(cappedSpare(mu(-7_000), mu(30_000))).toBe(-7_000);
    expect(cappedSpare(null, mu(30_000))).toBeNull();
  });
});

describe('sourceSplit (D-56)', () => {
  const base = { dayOne: mu(100_000), envelope: mu(0), month: mu(30_000), earlier: mu(40_000), protectedUsed: mu(20_000), aboveSize: mu(15_000) };

  it('the protected part is fixed, extra savings take up to the money above the size, then the month, then spare money', () => {
    expect(sourceSplit(base)).toEqual([
      { source: 'month', amount: 30_000 },
      { source: 'unspent_earlier', amount: 35_000 },
      { source: 'extra_savings', amount: 15_000 },
      { source: 'emergency', amount: 20_000 },
    ]);
    // an envelope, and nothing above the size: zero segments are dropped
    expect(sourceSplit({ ...base, envelope: mu(10_000), aboveSize: mu(0), earlier: mu(40_000) })).toEqual([
      { source: 'month', amount: 30_000 },
      { source: 'envelope', amount: 10_000 },
      { source: 'unspent_earlier', amount: 40_000 },
      { source: 'emergency', amount: 20_000 },
    ]);
    // more above the size than the rest: it all comes from extra savings and the net; a month below 0 gives nothing
    expect(sourceSplit({ ...base, aboveSize: mu(500_000), month: mu(-5) })).toEqual([
      { source: 'extra_savings', amount: 80_000 },
      { source: 'emergency', amount: 20_000 },
    ]);
  });

  it('throws when the parts cannot sum to the price', () => {
    expect(() => sourceSplit({ ...base, earlier: mu(10_000) })).toThrow(RangeError);
    expect(() => sourceSplit({ ...base, earlier: mu(-1), month: mu(0), aboveSize: mu(0) })).toThrow(RangeError);
    expect(() => sourceSplit({ ...base, protectedUsed: mu(200_000) })).toThrow(RangeError);
  });
});

describe('moveMoneyBy (D-58)', () => {
  it('how far the account goes below 0, capped at the other money, and the first day it does', () => {
    const p = path(['2026-11-15', 100], ['2026-11-16', -300], ['2026-11-17', -500], ['2026-11-18', 200]);
    expect(moveMoneyBy(p, mu(10_000))).toEqual({ amount: 500, date: '2026-11-16' });
    expect(moveMoneyBy(p, mu(400))).toEqual({ amount: 400, date: '2026-11-16' });
    expect(moveMoneyBy(p, mu(0))).toBeNull();
    expect(moveMoneyBy(path(['2026-11-15', 0], ['2026-11-16', 5]), mu(10_000))).toBeNull();
  });
});

describe('the real source through evaluate (D-56, D-58, D-62)', () => {
  it('SN-13: month 30,000 + extra savings 20,000; the facts name the extra savings and the move-by date', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const r = evaluate(inputs, check).result;
    expect(r.split).toEqual([
      { source: 'month', amount: 30_000 },
      { source: 'extra_savings', amount: 20_000 },
    ]);
    expect(r.code).toBe('fits_unspent');
    expect(r.variant).toBe('extra_savings'); // D-62; the approved SN-13 block changes in 05.4-48 (owner-approved)
    expect(fact(r, 'extra_savings_used')).toEqual({ used: 20_000, above: 50_000 });
    expect(fact(r, 'move_money_by')).toEqual({ amount: 20_000, date: '2026-11-23' });
    expect(fact(r, 'net_two_months')).toEqual({ twoMonths: 480_000 });
    expect(r.facts.map((f) => f.code)).toEqual(expect.arrayContaining(['net_above_size', 'emergency_untouched']));
    expect(fact(r, 'net_used')).toBeUndefined();
  });

  it('a net at 2 months of essential costs or more has no net_two_months line', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const r = evaluate({ ...inputs, safetyNet: { protect: true, size: mu(480_000), saved: mu(530_000) } }, check).result;
    expect(fact(r, 'extra_savings_used')).toBeDefined();
    expect(fact(r, 'net_two_months')).toBeUndefined();
  });

  it('spare money is capped at what the everyday account holds at month end', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const p = prepare(inputs);
    const held = p.readings[0]!.spareInAccount;
    // a confirmed unspent figure far above the account: judged against the account
    const rich = { ...inputs, unspent: { amount: mu(500_000), at: inputs.asOf } };
    const r = evaluate(rich, check).result;
    expect(fact(r, 'unspent_before_after')).toEqual({ before: Math.min(500_000, held), after: Math.min(500_000, held) - 30_000 });
    // with nothing above the size and the net locked, what the account cannot give is Not yet
    const locked = evaluate({ ...rich, safetyNet: { protect: true, size: mu(150_000), saved: mu(150_000) } }, { ...check, price: mu(90_000) } as typeof check).result;
    expect(locked.code).toBe('not_yet');
    // unlocked, the net carries it
    const open = evaluate({ ...rich, safetyNet: { protect: true, size: mu(150_000), saved: mu(150_000), locked: false } }, { ...check, price: mu(90_000) } as typeof check).result;
    expect(open.code).toBe('fits_uses_net');
    const em = open.split.find((s) => s.source === 'emergency')?.amount;
    expect(fact(open, 'net_used')).toEqual({ used: em });
    expect(open.split.reduce((t, s) => t + s.amount, 0)).toBe(90_000);
  });

  it('no move fact when the everyday account never goes below 0', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const r = evaluate({ ...inputs, accounts: (inputs.accounts ?? []).map((a) => (a.id === 'a1' ? { ...a, balance: mu(500_000) } : a)) }, check).result;
    expect(fact(r, 'move_money_by')).toBeUndefined();
  });
});
