import { CLEAN_CONFIDENCE } from '../../__tests__/helpers/restsOn';
import { minorUnits, type MinorUnits } from '../../../../money/types';
import { SOLE_SHARE } from '../../../share';
import { inputsOf } from '../../__tests__/helpers/fixtures';
import type { Funds, MonthModel, Purchase, UnspentState } from '../../types';
import { NO_NET, type ResolvedNet } from '../../safetyNet';
import { judge, type JudgeInput } from '../judge';

// 05.4-59: the net state facts, one state at a time. Fixtures follow judge.test.ts.
const mu = (n: number): MinorUnits => minorUnits(n);
const FULL_NET: ResolvedNet = { ...NO_NET, protect: true, off: false, size: mu(300_000), starter: mu(300_000), saved: mu(300_000), floor: mu(300_000), usable: mu(300_000), state: 'full' };

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
  monthLeft: mu(42_500),
  e: mu(100_000),
  typicalIncome: mu(500_000),
  recurringBills: mu(0),
  typicalLeft: mu(42_500),
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

const unspentState = (value: number): UnspentState => ({
  value: mu(value),
  anchor: { amount: mu(value), at: '2026-10-01' },
  rolled: false,
  stale: false,
  drifted: false,
  breakdown: { in: mu(0), everyday: mu(0), bills: mu(0), loans: mu(0), investedSaved: mu(0), other: mu(0) },
});

const funds = (unspent: number): Funds => ({
  balance: mu(0),
  suggested: mu(unspent),
  unspent: unspentState(unspent),
  emergency: mu(300_000),
  envelopesSaved: mu(0),
  envelopesMonthly: mu(0),
  ownEnvelope: mu(0),
  spending: mu(0),
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

const input = (over: Partial<JudgeInput> = {}): JudgeInput => ({
  inputs: inputsOf({ profile: { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null }, emergency: { amount: mu(300_000) } }),
  month: month(),
  funds: funds(240_000),
  purchase: purchase(120_000),
  purchaseMissing: [],
  purchaseFacts: [],
  purchaseReasons: [],
  cash: { kind: 'ok', lowest: { date: '2026-10-03', balance: mu(1_000_000) } },
  ...over,
});

const codes = (r: { facts: readonly { code: string }[] }) => r.facts.map((f) => f.code);
const dip = { month: month({ monthLeft: mu(-2_000), typicalLeft: mu(12_000) }), funds: funds(10_000), purchase: purchase(70_000) };

describe('net state facts on a dip', () => {
  it('a full net that is dipped into adds no state line', () => {
    const r = judge(input({ ...dip, net: FULL_NET }));
    expect(r.code).toBe('fits_uses_net');
    for (const c of ['net_progress', 'net_zero_is_off', 'net_protection_off', 'net_none_start']) expect(codes(r)).not.toContain(c);
  });
  it('a small net that is dipped into shows its progress once', () => {
    const r = judge(input({ ...dip, net: { ...FULL_NET, state: 'small', saved: mu(300_000) } }));
    expect(r.facts.filter((f) => f.code === 'net_progress')).toEqual([{ code: 'net_progress', values: { saved: 300_000, size: 300_000 } }]);
  });
  it('protection off says so and does not also show progress', () => {
    const r = judge(input({ ...dip, net: { ...FULL_NET, protect: false, off: true, floor: mu(0), state: 'small' } }));
    expect(r.facts.filter((f) => f.code === 'net_protection_off')).toEqual([{ code: 'net_protection_off', values: {} }]);
    expect(codes(r)).not.toContain('net_progress');
  });
  it('a zero net says it counts as off with the zero', () => {
    const r = judge(input({ ...dip, net: { ...FULL_NET, off: true, zeroIsOff: true, size: mu(0), floor: mu(0), aboveSize: mu(0), state: 'above' } }));
    expect(r.facts.filter((f) => f.code === 'net_zero_is_off')).toEqual([{ code: 'net_zero_is_off', values: { zero: 0 } }]);
  });
});

describe('net state facts on a plain fit', () => {
  it('a net that is off shows no starter and no progress line', () => {
    for (const state of ['none', 'small'] as const) {
      const r = judge(input({ net: { ...FULL_NET, protect: false, off: true, state, saved: mu(1_000), floor: mu(0), usable: mu(1_000) } }));
      expect(codes(r)).not.toContain('net_none_start');
      expect(codes(r)).not.toContain('net_progress');
    }
  });
  it('a full net shows neither the starter nor the progress line', () => {
    const r = judge(input({ net: FULL_NET }));
    expect(r.code).toBe('fits_unspent');
    expect(codes(r)).not.toContain('net_none_start');
    expect(codes(r)).not.toContain('net_progress');
  });
  it('an empty net shows the starter once and no progress line', () => {
    const r = judge(input({ net: { ...FULL_NET, saved: mu(0), floor: mu(0), usable: mu(0), state: 'none' } }));
    expect(r.facts.filter((f) => f.code === 'net_none_start')).toEqual([{ code: 'net_none_start', values: { starter: 300_000 } }]);
    expect(codes(r)).not.toContain('net_progress');
  });
});
