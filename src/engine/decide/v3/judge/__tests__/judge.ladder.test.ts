import { CLEAN_CONFIDENCE } from '../../__tests__/helpers/restsOn';
import { minorUnits, type MinorUnits } from '../../../../money/types';
import { SOLE_SHARE } from '../../../share';
import { inputsOf } from '../../__tests__/helpers/fixtures';
import type { CashCheck } from '../../cash/path';
import type { MonthModel, Purchase } from '../../types';
import { NO_NET, type ResolvedNet } from '../../safetyNet';
import { oneOffPart, type JudgeInput } from '../judge';

// 05.4-59: the one-off ladder and its ready dates, pinned at exact boundaries through the exported oneOffPart.
const mu = (n: number): MinorUnits => minorUnits(n);

const month = (over: Partial<MonthModel> = {}): MonthModel => ({
  month: '2026-10',
  day: 3,
  daysInMonth: 31,
  moneyIn: mu(0),
  moneyOut: mu(0),
  billsPaid: mu(0),
  billsDue: mu(0),
  everydayLogged: mu(0),
  erest: mu(0),
  setAside: mu(0),
  monthLeft: mu(0),
  e: mu(100_000),
  typicalIncome: mu(500_000),
  recurringBills: mu(0),
  typicalLeft: mu(100),
  low: null,
  monthsUsed: [],
  categoryMonthly: [],
  housingMonthly: mu(0),
  largestLine: null,
  confidence: CLEAN_CONFIDENCE,
  notices: [],
  reasons: [],
  ...over,
});

const purchase = (dayOne: number): Purchase => ({
  whole: mu(dayOne),
  dayOne: mu(dayOne),
  monthly: mu(0),
  runningMonthly: mu(0),
  schedule: null,
  share: SOLE_SHARE,
  itemType: 'general',
  purpose: null,
  emergency: false,
  canUseEmergency: false,
  band: 4,
  layers: ['L0'],
  financed: false,
  secured: false,
  categoryId: null,
  envelopeId: null,
});

const netOf = (aboveSize: number, usable: number): ResolvedNet => ({ ...NO_NET, protect: true, off: false, aboveSize: mu(aboveSize), usable: mu(usable) });

function run(over: {
  dayOne: number;
  monthLeft?: number;
  typicalLeft?: number;
  unspent?: number;
  envelope?: number;
  net?: ResolvedNet;
  cash?: CashCheck;
  savedFor?: number;
  sale?: { amount: number; date: string };
}) {
  const j: JudgeInput = {
    inputs: inputsOf({}),
    month: month({ monthLeft: mu(over.monthLeft ?? 0), typicalLeft: mu(over.typicalLeft ?? 100) }),
    funds: {} as JudgeInput['funds'],
    purchase: purchase(over.dayOne),
    purchaseMissing: [],
    purchaseFacts: [],
    purchaseReasons: [],
    cash: over.cash ?? { kind: 'ok', lowest: { date: '2026-10-03', balance: mu(1_000_000) } },
    net: over.net,
    savedFor: over.savedFor,
    replaces: over.sale === undefined ? undefined : { freed: mu(0), showsUsual: false, saleLater: { amount: mu(over.sale.amount), date: over.sale.date } },
  };
  return oneOffPart(j, { unspent: mu(over.unspent ?? 0), envelope: mu(over.envelope ?? 0) });
}

describe('ladder: funding segments', () => {
  it('rest 0 through the own envelope reads fits_unspent, not fits_month', () => {
    const r = run({ dayOne: 100, envelope: 100 });
    expect(r.code).toBe('fits_unspent');
    expect(r.split).toEqual([{ source: 'envelope', amount: 100 }]);
  });

  it('the net lends exactly its usable part: the boundary fits, one more does not', () => {
    const fits = run({ dayOne: 500, net: netOf(0, 500) });
    expect(fits.code).toBe('fits_uses_net');
    expect(fits.split).toEqual([{ source: 'emergency', amount: 500 }]);
    expect(fits.netTaken).toBe(500);
    expect(fits.netUsed).toBe(500);
    expect(run({ dayOne: 501, net: netOf(0, 500) }).code).toBe('not_yet');
  });

  it('earlier money, extra savings and the protected net are summed, not subtracted', () => {
    const r = run({ dayOne: 600, unspent: 300, net: netOf(200, 100) });
    expect(r.code).toBe('fits_uses_net');
    expect(r.split).toEqual([
      { source: 'unspent_earlier', amount: 300 },
      { source: 'extra_savings', amount: 200 },
      { source: 'emergency', amount: 100 },
    ]);
    expect(r.netTaken).toBe(300);
    expect(r.netUsed).toBe(100);
  });

  it('a purchase wholly inside the extra savings adds no emergency segment', () => {
    const r = run({ dayOne: 250, unspent: -100, net: netOf(300, 100) });
    expect(r.code).toBe('fits_uses_net');
    expect(r.split).toEqual([{ source: 'extra_savings', amount: 250 }]);
    expect(r.netTaken).toBe(250);
    expect(r.netUsed).toBe(0);
  });

  it('an overdraft account splits the net into extra savings and the protected part', () => {
    const r = run({
      dayOne: 300,
      net: netOf(100, 400),
      cash: { kind: 'overdraft', lowest: { date: '2026-10-03', balance: mu(-50) } },
    });
    expect(r.code).toBe('fits_uses_overdraft');
    expect(r.split).toEqual([
      { source: 'extra_savings', amount: 100 },
      { source: 'emergency', amount: 200 },
    ]);
  });
});

describe('ladder: ready dates', () => {
  const notCovered = (payDate: string | null): CashCheck => ({ kind: 'not_covered', shortBy: mu(1), payDate });

  it('the ready month is 600 months out at most: 600 is a month, 601 is never', () => {
    expect(run({ dayOne: 600, typicalLeft: 1, cash: notCovered(null) }).readyBy).toEqual({ kind: 'month', month: '2076-10' });
    expect(run({ dayOne: 601, typicalLeft: 1, cash: notCovered(null) }).readyBy).toBeNull();
  });

  it('money set aside for it counts toward the ready month (added, not subtracted)', () => {
    expect(run({ dayOne: 1000, savedFor: 300, cash: notCovered(null) }).readyBy).toEqual({ kind: 'month', month: '2027-05' });
    expect(run({ dayOne: 1000, savedFor: 300 }).readyBy).toEqual({ kind: 'month', month: '2027-05' });
  });

  it('a sale arriving on the very day of payday still dates the wait to payday', () => {
    const sale = { amount: 900, date: '2026-11-05' };
    const r = run({ dayOne: 1000, sale, cash: notCovered('2026-11-05') });
    expect(r.readyBy).toEqual({ kind: 'date', date: '2026-11-05' });
    // The sale lands one minor unit after payday: the wait is the sale month, not payday.
    expect(run({ dayOne: 1000, sale, cash: notCovered('2026-11-04') }).readyBy).toEqual({ kind: 'month', month: '2026-11' });
  });

  it('a payday dip passes the ladder wait to payday when the sale lands on payday', () => {
    const r = run({ dayOne: 1000, sale: { amount: 900, date: '2026-11-05' }, cash: { kind: 'payday', until: '2026-11-05', shortBy: mu(1) } });
    expect(r.code).toBe('not_yet');
    expect(r.variant).toBe('payday');
    expect(r.readyBy).toEqual({ kind: 'date', date: '2026-11-05' });
  });

  it('a sale that exactly reaches the price counts in its own month', () => {
    const r = run({ dayOne: 1000, sale: { amount: 900, date: '2026-11-05' }, cash: notCovered(null) });
    expect(r.readyBy).toEqual({ kind: 'month', month: '2026-11' });
  });
});
