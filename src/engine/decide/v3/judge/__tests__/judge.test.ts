import { CLEAN_CONFIDENCE, codesOf } from '../../__tests__/helpers/restsOn';
import fc from 'fast-check';
import { minorUnits, type MinorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { SOLE_SHARE } from '../../../share';
import { CODE_PRECEDENCE, LEGACY_STATE_OF_CODE } from '../../constants';
import { seenOf } from '../../adapters/seen';
import type { CashCheck } from '../../cash/path';
import { inputsOf } from '../../__tests__/helpers/fixtures';
import type {
  Code,
  ExpectedMonthIncome,
  Funds,
  IncomeMonth,
  IncomePicture,
  LimitLine,
  LineSpec,
  MissingCode,
  MonthModel,
  Purchase,
  Purpose,
  ReadyBy,
  Schedule,
  UnspentState,
  V3Inputs,
} from '../../types';
import { addYearMonths } from '../../dates';
import { judge, monthlyPart, oneOffPart, type JudgeInput } from '../judge';
import { NO_NET, type ResolvedNet } from '../../safetyNet';

/** 05.4 FIN-01 (D-35): a full 300,000 net with protection on, the hand-built tests' fund. */
const FULL_NET: ResolvedNet = { ...NO_NET, protect: true, off: false, size: minorUnits(300_000), starter: minorUnits(300_000), saved: minorUnits(300_000), floor: minorUnits(300_000), usable: minorUnits(300_000), state: 'full' };

const mu = (n: number): MinorUnits => minorUnits(n);

function month(over: Partial<MonthModel> = {}): MonthModel {
  return {
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
  };
}

function unspentState(value: number, over: Partial<UnspentState> = {}): UnspentState {
  return {
    value: mu(value),
    anchor: { amount: mu(value), at: '2026-10-01' },
    rolled: false,
    stale: false,
    drifted: false,
    breakdown: { in: mu(0), everyday: mu(0), bills: mu(0), loans: mu(0), investedSaved: mu(0), other: mu(0) },
    ...over,
  };
}

function funds(unspent: number | null, over: Partial<Funds> = {}): Funds {
  return {
    balance: mu(0),
    suggested: mu(unspent ?? 0),
    unspent: unspent === null ? null : unspentState(unspent),
    emergency: mu(300_000),
    envelopesSaved: mu(0),
    envelopesMonthly: mu(0),
    ownEnvelope: mu(0),
    spending: mu(0),
    ...over,
  };
}

function purchase(over: Partial<Purchase> = {}): Purchase {
  return {
    whole: mu(120_000),
    dayOne: mu(120_000),
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
    ...over,
  };
}

const PROFILE = { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null } as const;

function input(over: Partial<JudgeInput> & { inputsOver?: Partial<V3Inputs> } = {}): JudgeInput {
  const { inputsOver, ...rest } = over;
  return {
    inputs: inputsOf({ profile: { ...PROFILE, types: [...PROFILE.types] }, emergency: { amount: mu(300_000) }, ...inputsOver }),
    month: month(),
    funds: funds(240_000),
    purchase: purchase(),
    purchaseMissing: [],
    purchaseFacts: [],
    purchaseReasons: [],
    cash: { kind: 'ok', lowest: { date: '2026-10-03', balance: mu(1_000_000) } },
    ...rest,
  };
}

const nice: Purpose = { kind: 'preset', value: 'nice_to_have' };
const work: Purpose = { kind: 'preset', value: 'for_work' };

describe('judge: one-off ladder (v3 §12)', () => {
  it('v3 §12 #2 laptop: fits_unspent with month first, then earlier unspent', () => {
    const r = judge(input({ net: FULL_NET }));
    expect(r.code).toBe('fits_unspent');
    expect(r.split).toEqual([
      { source: 'month', amount: 42_500 },
      { source: 'unspent_earlier', amount: 77_500 },
    ]);
    expect(r.facts).toContainEqual({ code: 'unspent_before_after', values: { before: 240_000, after: 120_000 } });
    expect(r.facts).toContainEqual({ code: 'emergency_untouched', values: { amount: 300_000 } });
    expect(r.legacyState).toBe('fits');
  });

  it('v3 §12 #10 sofa: not_yet not_covered, ready in four months', () => {
    const r = judge(input({ purchase: purchase({ dayOne: mu(400_000), whole: mu(400_000) }) }));
    expect(r.code).toBe('not_yet');
    expect(r.variant).toBe('not_covered');
    expect(r.readyBy).toEqual({ kind: 'month', month: '2027-02' });
    expect(r.split).toEqual([]);
  });

  it('v3 §12 #5 Riley: typical left below zero and nothing unspent', () => {
    const r = judge(
      input({
        month: month({
          monthLeft: mu(-1_000),
          typicalLeft: mu(-5_000),
          notices: [{ code: 'typical_short', values: { amount: -5_000 } }],
        }),
        funds: funds(0),
      })
    );
    expect(r.code).toBe('not_yet');
    expect(r.variant).toBe('month_already_short'); // 05.4 D-63: the usual month is already short
    expect(r.readyBy).toBeNull();
    expect(r.notices.map((n) => n.code)).toContain('typical_short');
    expect(r.facts.map((f) => f.code)).not.toContain('emergency_untouched'); // no net in these hand-built inputs (D-25)
  });

  it('v3 §12 #11 Leo, 05.4 D-41: a work purchase dips into the safety net, refill months shown', () => {
    const r = judge(
      input({
        month: month({ monthLeft: mu(-2_000), typicalLeft: mu(12_000) }),
        funds: funds(10_000),
        purchase: purchase({ dayOne: mu(70_000), whole: mu(70_000), emergency: true, purpose: work, canUseEmergency: true }),
        net: FULL_NET,
      })
    );
    expect(r.code).toBe('fits_uses_net');
    expect(r.variant).toBeNull();
    expect(r.split).toEqual([
      { source: 'unspent_earlier', amount: 10_000 },
      { source: 'emergency', amount: 60_000 },
    ]);
    expect(r.facts.slice(0, 4)).toEqual([
      { code: 'need_net_line', values: {} },
      { code: 'net_used', values: { used: 60_000 } },
      { code: 'net_left', values: { left: 240_000 } },
      { code: 'net_refill', values: { months: 5 } },
    ]);
    expect(r.facts.some((f) => f.code === 'emergency_untouched')).toBe(false);
    // the month figure counts the net money the split takes (D-22): -2,000 - 60,000
    expect(r.facts).toContainEqual({ code: 'month_left_after', values: { month: '2026-10', left: -62_000 } });
    expect(r.legacyState).toBe('adjust');
  });

  it('M-03 net_refill is left out when the refill time is unknown', () => {
    const r = judge(
      input({
        month: month({ monthLeft: mu(-2_000), typicalLeft: null }),
        funds: funds(10_000),
        purchase: purchase({ dayOne: mu(70_000), whole: mu(70_000), emergency: true, purpose: work, canUseEmergency: true }),
        net: FULL_NET,
      })
    );
    expect(r.facts.find((x) => x.code === 'net_used')?.values).toEqual({ used: 60_000 });
    expect(r.facts.some((x) => x.code === 'net_refill')).toBe(false);
  });

  it('with no money in a safety net the price is not met from it', () => {
    const r = judge(
      input({
        month: month({ monthLeft: mu(-2_000), typicalLeft: mu(12_000) }),
        funds: funds(10_000, { emergency: null as unknown as MinorUnits }),
        purchase: purchase({ dayOne: mu(70_000), whole: mu(70_000), emergency: true, purpose: work, canUseEmergency: true }),
        net: NO_NET,
      })
    );
    expect(r.code).toBe('not_yet');
    expect(r.split).toEqual([]);
  });

  it('D-41 / D-49: every purpose, emergency mark or not, dips into the net the same way; a want leads with the wait date', () => {
    const answers = [nice, work, { kind: 'custom', id: 'x' } as Purpose, null].flatMap((purpose) =>
      [true, false].map((emergency) =>
        judge(
          input({
            month: month({ monthLeft: mu(-2_000), typicalLeft: mu(12_000) }),
            funds: funds(10_000),
            purchase: purchase({ dayOne: mu(70_000), whole: mu(70_000), emergency, purpose, canUseEmergency: purpose === work }),
            net: FULL_NET,
          })
        )
      )
    );
    for (const r of answers) {
      expect(r.code).toBe('fits_uses_net');
      expect(r.split).toEqual(answers[0]!.split);
      expect(r.facts.find((f) => f.code === 'net_used')).toEqual({ code: 'net_used', values: { used: 60_000 } });
    }
    // 70,000 - 10,000 = 60,000 over 12,000 a month: ready without the net in 5 months
    expect(answers[0]!.facts[0]).toEqual({ code: 'wait_keeps_net', values: { month: '2027-03' } });
  });

  it('D-06 protection off counts the net money and says so; a $0 net says it counts as off', () => {
    const dip = { month: month({ monthLeft: mu(-2_000), typicalLeft: mu(12_000) }), funds: funds(10_000), purchase: purchase({ dayOne: mu(70_000), whole: mu(70_000) }) };
    const off = judge(input({ ...dip, net: { ...FULL_NET, protect: false, off: true, floor: minorUnits(0) } }));
    expect(off.code).toBe('fits_uses_net');
    expect(off.variant).toBe('protection_off');
    expect(off.facts.some((f) => f.code === 'net_protection_off')).toBe(true);
    const zero = judge(input({ ...dip, net: { ...FULL_NET, off: true, zeroIsOff: true, size: minorUnits(0), floor: minorUnits(0), aboveSize: minorUnits(0), state: 'above' } }));
    expect(zero.variant).toBe('protection_off');
    expect(zero.facts).toContainEqual({ code: 'net_zero_is_off', values: { zero: 0 } });
    const zeroFits = judge(input({ net: { ...FULL_NET, off: true, zeroIsOff: true, size: minorUnits(0), floor: minorUnits(0), state: 'above' } }));
    expect(zeroFits.code).toBe('fits_unspent');
    expect(zeroFits.variant).toBeNull();
    expect(zeroFits.facts).toContainEqual({ code: 'net_zero_is_off', values: { zero: 0 } });
    expect(zeroFits.facts).toContainEqual({ code: 'emergency_untouched', values: { amount: 300_000 } });
  });

  it('D-35 a 90-day dip the net carries: a fit dips into it; a price past the ladder, or unknown unspent money, is not a fit', () => {
    const cash: CashCheck = { kind: 'net', lowest: { date: '2026-10-20', balance: mu(-5_000) }, used: mu(5_000), added: mu(5_000), until: '2026-11-01' };
    const fits = judge(input({ cash, net: FULL_NET }));
    expect(fits.code).toBe('fits_uses_net');
    expect(fits.facts[0]).toEqual({ code: 'wait_keeps_net', values: { date: '2026-11-01' } });
    expect(fits.facts).toContainEqual({ code: 'net_used', values: { used: 5_000 } });
    expect(fits.facts).toContainEqual({ code: 'net_left', values: { left: 295_000 } });
    const big = oneOffPart(input({ cash, net: { ...FULL_NET, usable: minorUnits(0) }, purchase: purchase({ dayOne: mu(400_000), whole: mu(400_000) }) }), { unspent: mu(240_000), envelope: mu(0) });
    expect(big.code).toBe('not_yet');
    const ask = oneOffPart(input({ cash, net: FULL_NET }), { unspent: null, envelope: mu(0) });
    expect(ask.code).toBe('needs_input');
    const noPay = judge(input({ cash: { ...cash, until: null }, net: FULL_NET }));
    expect(noPay.facts.some((f) => f.code === 'wait_keeps_net')).toBe(false);
  });

  it('D-35 a fit with an empty or small net is amber, with the starter or the progress line; low_month wins the variant', () => {
    const none = judge(input({ net: { ...FULL_NET, saved: minorUnits(0), floor: minorUnits(0), usable: minorUnits(0), state: 'none' } }));
    expect(none.variant).toBe('no_net');
    expect(none.facts).toContainEqual({ code: 'net_none_start', values: { starter: 300_000 } });
    expect(none.facts.some((f) => f.code === 'emergency_untouched')).toBe(false);
    const small = judge(input({ net: { ...FULL_NET, saved: minorUnits(1_000), floor: minorUnits(1_000), usable: minorUnits(1_000), state: 'small' } }));
    expect(small.variant).toBe('small_net');
    expect(small.facts).toContainEqual({ code: 'net_progress', values: { saved: 1_000, size: 300_000 } });
    const above = judge(input({ net: { ...FULL_NET, saved: minorUnits(400_000), aboveSize: minorUnits(100_000), state: 'above' } }));
    expect(above.variant).toBeNull();
    expect(above.facts).toContainEqual({ code: 'net_above_size', values: { above: 100_000 } });
  });

  it('D-35 money above the net size is spare: it pays what earlier money cannot, and counts toward the ready date', () => {
    const above: ResolvedNet = { ...FULL_NET, saved: minorUnits(360_000), aboveSize: minorUnits(60_000), state: 'above' };
    const tight = { month: month({ monthLeft: mu(-2_000), typicalLeft: mu(12_000) }), funds: funds(10_000), net: above };
    const r = judge(input({ ...tight, purchase: purchase({ dayOne: mu(70_000), whole: mu(70_000) }) }));
    expect(r.code).toBe('fits_unspent');
    expect(r.split).toEqual([
      { source: 'unspent_earlier', amount: 10_000 },
      { source: 'extra_savings', amount: 60_000 },
    ]);
    const past = judge(input({ ...tight, net: { ...above, usable: minorUnits(0) }, purchase: purchase({ dayOne: mu(100_000), whole: mu(100_000) }) }));
    expect(past.code).toBe('not_yet');
    // 100,000 - (10,000 + 60,000) = 30,000 over 12,000 a month: 3 months
    expect(past.readyBy).toEqual({ kind: 'month', month: '2027-01' });
  });

  it('v3 §12 #12 Tia: payday wins even when unspent covers it', () => {
    const cash: CashCheck = { kind: 'payday', until: '2026-10-28', shortBy: mu(5_000) };
    const r = judge(input({ cash }));
    expect(r.code).toBe('not_yet');
    expect(r.variant).toBe('payday');
    expect(r.readyBy).toEqual({ kind: 'date', date: '2026-10-28' });
  });

  describe('payday when the ladder also holds the price back (I13 regression)', () => {
    const cash: CashCheck = { kind: 'payday', until: '2026-10-28', shortBy: mu(5_000) };

    it('is not covered with the ladder month, not ready on payday', () => {
      // gap 120000 - 10000 = 110000 over typicalLeft 42500 = 3 months.
      const r = judge(input({ cash, funds: funds(10_000) }));
      expect(r.code).toBe('not_yet');
      expect(r.variant).toBe('not_covered');
      expect(r.readyBy).toEqual({ kind: 'month', month: '2027-01' });
      expect(r.split).toEqual([]);
    });

    it('a dearer price that dips before payday is never ready before a cheaper one the ladder alone holds back', () => {
      const lo = judge(input({ funds: funds(10_000), purchase: purchase({ dayOne: mu(90_000), whole: mu(90_000) }) }));
      const hi = judge(input({ cash, funds: funds(10_000) }));
      expect(lo.variant).toBe('not_covered');
      expect(lo.readyBy).toEqual({ kind: 'month', month: '2026-12' });
      expect(hi.readyBy).toEqual({ kind: 'month', month: '2027-01' });
    });

    it('keeps payday when payday falls after the start of the ladder month', () => {
      const late: CashCheck = { kind: 'payday', until: '2026-11-20', shortBy: mu(5_000) };
      const r = judge(input({ cash: late, funds: funds(10_000), month: month({ typicalLeft: mu(1_000_000) }) }));
      expect(r.variant).toBe('payday');
      expect(r.readyBy).toEqual({ kind: 'date', date: '2026-11-20' });
    });

    it('payday on the first of the ladder month is ready on payday (05.4-18: TX-06, TX-07, OD-07 "fits from payday on 1 December")', () => {
      const first: CashCheck = { kind: 'payday', until: '2026-11-01', shortBy: mu(5_000) };
      const r = judge(input({ cash: first, funds: funds(10_000), month: month({ typicalLeft: mu(1_000_000) }) }));
      expect(r.variant).toBe('payday');
      expect(r.readyBy).toEqual({ kind: 'date', date: '2026-11-01' });
      const before: CashCheck = { kind: 'payday', until: '2026-10-31', shortBy: mu(5_000) };
      expect(judge(input({ cash: before, funds: funds(10_000), month: month({ typicalLeft: mu(1_000_000) }) })).readyBy).toEqual({ kind: 'month', month: '2026-11' });
    });

    it('is not covered with no ready date when the typical month leaves nothing', () => {
      const r = judge(input({ cash, funds: funds(10_000), month: month({ typicalLeft: mu(0) }) }));
      expect(r.variant).toBe('not_covered');
      expect(r.readyBy).toBeNull();
    });

    it('payday stands when unspent is unknown and the price is above this month', () => {
      const r = oneOffPart(input({ cash, funds: funds(null) }), { unspent: null, envelope: mu(0) });
      expect(r.variant).toBe('payday');
      expect(r.readyBy).toEqual({ kind: 'date', date: '2026-10-28' });
    });
  });

  describe('I13 residual: not_covered against a payday late in the ladder month', () => {
    const readyKey = (r: { readyBy: ReadyBy | null }): string =>
      r.readyBy === null ? '9999-99-99' : r.readyBy.kind === 'date' ? r.readyBy.date : `${r.readyBy.month}-01`;
    const roomy = month({ typicalLeft: mu(100_000) });

    it('I13 a not_covered answer is the later of the ladder month and the pay date', () => {
      // gap 120000 - 10000 = 110000 over 100000 = 2 months: 2026-12. Use unspent 20000 -> gap 100000 = 1 month: 2026-11.
      const hi = judge(input({ month: roomy, funds: funds(20_000), cash: { kind: 'not_covered', shortBy: mu(1), payDate: '2026-11-28' } }));
      const lo = judge(
        input({
          month: roomy,
          funds: funds(20_000),
          purchase: purchase({ dayOne: mu(90_000), whole: mu(90_000) }),
          cash: { kind: 'payday', until: '2026-11-28', shortBy: mu(1) },
        })
      );
      expect(hi.readyBy).toEqual({ kind: 'date', date: '2026-11-28' });
      expect(readyKey(hi) >= readyKey(lo)).toBe(true);
    });

    it('a pay date before the first of the ladder month leaves the ladder month; on the first, the pay date', () => {
      const r = judge(input({ month: roomy, funds: funds(20_000), cash: { kind: 'not_covered', shortBy: mu(1), payDate: '2026-10-31' } }));
      expect(r.readyBy).toEqual({ kind: 'month', month: '2026-11' });
      const first = judge(input({ month: roomy, funds: funds(20_000), cash: { kind: 'not_covered', shortBy: mu(1), payDate: '2026-11-01' } }));
      expect(first.readyBy).toEqual({ kind: 'date', date: '2026-11-01' });
    });

    it('no pay date leaves the ladder month', () => {
      const none = judge(input({ month: roomy, funds: funds(20_000), cash: { kind: 'not_covered', shortBy: mu(1), payDate: null } }));
      const absent = judge(input({ month: roomy, funds: funds(20_000), cash: { kind: 'not_covered', shortBy: mu(1) } }));
      expect(none.readyBy).toEqual({ kind: 'month', month: '2026-11' });
      expect(absent.readyBy).toEqual({ kind: 'month', month: '2026-11' });
    });

    it('no ladder month (nothing left in a typical month) stays null', () => {
      const r = judge(input({ month: month({ typicalLeft: mu(0) }), funds: funds(20_000), cash: { kind: 'not_covered', shortBy: mu(1), payDate: '2026-11-28' } }));
      expect(r.readyBy).toBeNull();
    });
  });

  it('M-04 a ready month beyond the simulation horizon is null, not a malformed year', () => {
    const big = purchase({ dayOne: mu(1_000_000_000), whole: mu(1_000_000_000) });
    const r = judge(input({ month: month({ typicalLeft: mu(1) }), purchase: big, funds: funds(0), cash: { kind: 'not_covered', shortBy: mu(1) } }));
    expect(r.variant).toBe('not_covered');
    expect(r.readyBy).toBeNull();
    const ladderOnly = judge(input({ month: month({ typicalLeft: mu(1) }), purchase: big, funds: funds(0) }));
    expect(ladderOnly.readyBy).toBeNull();
  });

  it('cash not covered is not_yet not_covered with a month', () => {
    const r = judge(input({ cash: { kind: 'not_covered', shortBy: mu(1) } }));
    expect(r.code).toBe('not_yet');
    expect(r.variant).toBe('not_covered');
  });

  it('unspent unknown and P above this month: needs_input unspent_not_confirmed', () => {
    const r = judge(input({ funds: funds(null) }));
    expect(r.code).toBe('needs_input');
    expect(r.missing).toEqual(['unspent_not_confirmed']);
    expect(r.legacyState).toBe('missing');
    expect(r.split).toEqual([]);
  });

  it('own envelope: month, then envelope, then earlier unspent', () => {
    const r = judge(
      input({
        month: month({ monthLeft: mu(0) }),
        funds: funds(20_000, { ownEnvelope: mu(50_000) }),
        purchase: purchase({ dayOne: mu(60_000), whole: mu(60_000), envelopeId: 'e1' }),
      })
    );
    expect(r.code).toBe('fits_unspent');
    expect(r.split).toEqual([
      { source: 'envelope', amount: 50_000 },
      { source: 'unspent_earlier', amount: 10_000 },
    ]);
    expect(r.facts).toContainEqual({ code: 'envelope_used', values: { used: 50_000, envelopeId: 'e1' } });
    expect(r.facts).toContainEqual({ code: 'unspent_before_after', values: { before: 20_000, after: 10_000 } });
    // M-03: the month the copy names
    expect(r.facts.find((f) => f.code === 'month_left_after')?.values.month).toBe('2026-10');
  });
});

describe('judge: monthly part and precedence', () => {
  it('v3 §12 #7 phone: low month clause', () => {
    const r = judge(
      input({
        month: month({ low: { left: mu(5_000), month: '2026-08', reason: 'second_lowest' } }),
        purchase: purchase({ dayOne: mu(0), whole: mu(8_500), monthly: mu(8_500) }),
      })
    );
    expect(r.code).toBe('fits_month');
    expect(r.variant).toBe('low_month');
    expect(r.parts).toEqual({ oneOff: 'fits_month', monthly: 'fits_month' });
  });

  it('v3 §12 #6 lease: monthly_short leads over a fitting one-off', () => {
    const r = judge(input({ purchase: purchase({ dayOne: mu(0), whole: mu(45_000), monthly: mu(45_000) }) }));
    expect(r.code).toBe('monthly_short');
    expect(r.parts).toEqual({ oneOff: 'fits_month', monthly: 'monthly_short' });
    expect(r.legacyState).toBe('adjust');
  });

  it('v3 §12 #22 dog: fits_unspent with the low month variant', () => {
    const r = judge(
      input({
        month: month({ low: { left: mu(5_000), month: '2026-08', reason: 'second_lowest' } }),
        purchase: purchase({ dayOne: mu(80_000), whole: mu(80_000), monthly: mu(12_000) }),
      })
    );
    expect(r.code).toBe('fits_unspent');
    expect(r.variant).toBe('low_month');
  });

  it('monthlyPart is null when M is zero', () => {
    expect(monthlyPart(month(), mu(0))).toBeNull();
  });

  it('oneOffPart without a purchase asks for input', () => {
    expect(oneOffPart(input({ purchase: null }), { unspent: mu(1), envelope: mu(0) }).code).toBe('needs_input');
  });

  it('no purchase gives needs_input no_price', () => {
    const r = judge(input({ purchase: null }));
    expect(r.code).toBe('needs_input');
    expect(r.missing).toContain('no_price');
  });
});

describe('judge: notices and confidence', () => {
  it('D-30 drifted unspent: the user figure is judged, notice and the unspent_drifted reason with its numbers', () => {
    const f = funds(300_000, { suggested: mu(200_000) });
    const r = judge(
      input({
        funds: { ...f, unspent: unspentState(300_000, { drifted: true, rolled: true }) },
        purchase: purchase({ dayOne: mu(250_000), whole: mu(250_000) }),
      })
    );
    expect(r.code).toBe('fits_unspent');
    expect(r.notices).toContainEqual({ code: 'unspent_drifted', values: { suggested: 200_000 } });
    expect(r.confidence.reasons).toEqual([{ code: 'unspent_drifted', numbers: { value: 300_000, suggested: 200_000 }, weight: 40, audience: 'detail' }]);
    expect(r.confidence.nextStep).toEqual({ reason: 'unspent_drifted', step: 'confirm_unspent' });
    expect(r.confidence.basis).toEqual(CLEAN_CONFIDENCE.basis);
  });

  it('D-32 rough figures only: judged against the typical month with from_your_figures', () => {
    const r = judge(
      input({
        month: month({ typicalLeft: mu(115_000), reasons: ['quick_estimates_used'] }),
        purchase: purchase({ dayOne: mu(0), whole: mu(10_000), monthly: mu(10_000) }),
      })
    );
    expect(r.parts.monthly).toBe('fits_month');
    expect(r.notices.map((n) => n.code)).toContain('from_your_figures');
    expect(codesOf(r.confidence)).toEqual(['quick_estimates']);
    expect(r.confidence.basis).toEqual({ kind: 'records_with_reason', months: 3, upTo: '2026-10-03', reason: 'quick_estimates' });
    expect(r.reasons).toContain('quick_estimates_used');
  });

  it('stale unspent adds the unspent_stale reason with its days, and a days notice', () => {
    const f = funds(240_000);
    const r = judge(
      input({
        funds: { ...f, unspent: unspentState(240_000, { stale: true, anchor: { amount: mu(240_000), at: '2026-09-01' } }) },
      })
    );
    expect(r.confidence.reasons).toEqual([{ code: 'unspent_stale', numbers: { days: 32 }, weight: 90, audience: 'detail' }]);
    expect(r.confidence.basis.kind).toBe('records');
    expect(r.notices).toContainEqual({ code: 'unspent_stale', values: { days: 32 } });
  });

  it('emergency not set is a notice, not an advice', () => {
    const r = judge(input({ inputsOver: { emergency: null }, funds: funds(240_000, { emergency: null }) }));
    expect(r.notices.map((n) => n.code)).toContain('emergency_not_set');
    expect(r.facts.map((x) => x.code)).not.toContain('emergency_untouched');
  });
});

describe('judge: facts feed the seen-state adapter', () => {
  it('seenOf picks up unspent_before_after and line_crossed from a judge Result', () => {
    const line: LimitLine = { id: 'cap1', on: true, source: 'own', spec: { kind: 'single_purchase_cap', cap: mu(50_000) } };
    const r = judge(input({ inputsOver: { limits: { lines: [line] } } }));
    const seen = seenOf(r);
    expect(seen.unspentAfter).toBe(120_000);
    expect(seen.lineFacts).toEqual(['cap1']);
  });
});

describe('judge: legacyState', () => {
  it('legacyState follows the D-23 table for every code reached', () => {
    const cases: JudgeInput[] = [
      input(),
      input({ purchase: purchase({ dayOne: mu(0), whole: mu(100), monthly: mu(0) }) }),
      input({ funds: funds(null) }),
      input({ purchase: purchase({ dayOne: mu(400_000) }) }),
      input({ purchase: purchase({ dayOne: mu(0), monthly: mu(45_000) }) }),
    ];
    const seen = new Set<Code>();
    for (const c of cases) {
      const r = judge(c);
      seen.add(r.code);
      expect(r.legacyState).toBe(LEGACY_STATE_OF_CODE[r.code]);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Task 2: judge-level properties

const money = (lo: number, hi: number) => fc.integer({ min: lo, max: hi }).map(mu);

const purposeArb: fc.Arbitrary<Purpose | null> = fc.oneof(
  fc.constant(null),
  fc.constantFrom<Purpose>(
    { kind: 'preset', value: 'necessity' },
    { kind: 'preset', value: 'for_work' },
    { kind: 'preset', value: 'nice_to_have' },
    { kind: 'preset', value: 'treat' },
    { kind: 'custom', id: 'c1' }
  )
);

const judgeInputArb: fc.Arbitrary<JudgeInput> = fc
  .record({
    monthLeft: money(-1e9, 1e9),
    typicalLeft: fc.option(money(-1e9, 1e9), { nil: null }),
    lowLeft: fc.option(money(-1e9, 1e9), { nil: null }),
    unspent: fc.option(money(-1e9, 1e9), { nil: null }),
    emergencyFund: money(0, 1e9),
    envelope: money(0, 1e9),
    dayOne: money(0, 1e9),
    monthly: money(0, 1e9),
    emergency: fc.boolean(),
    purpose: purposeArb,
    cash: fc.constantFrom<'ok' | 'payday' | 'not_covered'>('ok', 'ok', 'ok', 'payday', 'not_covered'),
  })
  .map((r) => {
    const cash: CashCheck =
      r.cash === 'ok'
        ? { kind: 'ok', lowest: { date: '2026-10-03', balance: mu(0) } }
        : r.cash === 'payday'
          ? { kind: 'payday', until: '2026-10-28', shortBy: mu(1) }
          : { kind: 'not_covered', shortBy: mu(1) };
    return input({
      month: month({
        monthLeft: r.monthLeft,
        typicalLeft: r.typicalLeft,
        low: r.lowLeft === null ? null : { left: r.lowLeft, month: '2026-08', reason: 'second_lowest' },
      }),
      funds: funds(r.unspent === null ? null : r.unspent, { emergency: r.emergencyFund, ownEnvelope: r.envelope }),
      purchase: purchase({
        dayOne: r.dayOne,
        whole: r.dayOne,
        monthly: r.monthly,
        emergency: r.emergency,
        purpose: r.purpose,
        canUseEmergency: r.emergency,
      }),
      cash,
    });
  });

const lineArb: fc.Arbitrary<LimitLine> = fc
  .record({
    id: fc.string({ minLength: 1, maxLength: 4 }),
    on: fc.boolean(),
    spec: fc.oneof<fc.Arbitrary<LineSpec>[]>(
      fc.record({ kind: fc.constant('single_purchase_cap' as const), cap: money(0, 1e9) }),
      fc.record({ kind: fc.constant('unspent_floor' as const), floor: money(-1e9, 1e9) }),
      fc.record({ kind: fc.constant('debt_share' as const), pct: fc.constant(percent('36')) }),
      fc.record({ kind: fc.constant('housing_share' as const), pct: fc.constant(percent('30')) })
    ),
  })
  .map((l) => ({ ...l, source: 'own' as const }));

function rankOf(c: Code): number {
  return CODE_PRECEDENCE.indexOf(c);
}

describe('judge: properties', () => {
  it('D-10 lines never change the code', () => {
    fc.assert(
      fc.property(judgeInputArb, fc.array(lineArb, { maxLength: 5 }), (j, lines) => {
        const ids = new Set<string>();
        const unique = lines.filter((l) => (ids.has(l.id) ? false : (ids.add(l.id), true)));
        const withLines = judge({ ...j, inputs: { ...j.inputs, limits: { lines: unique } } });
        const without = judge({ ...j, inputs: { ...j.inputs, limits: { lines: [] } } });
        expect(withLines.code).toBe(without.code);
        expect(withLines.variant).toBe(without.variant);
        expect(withLines.split).toEqual(without.split);
      }),
      { numRuns: 200 }
    );
  });

  it('notices never change the code', () => {
    fc.assert(
      fc.property(judgeInputArb, (j) => {
        const a = judge(j);
        const b = judge({
          ...j,
          month: { ...j.month, notices: [] },
          inputs: { ...j.inputs, unsavedWrites: 3 },
        });
        expect(b.code).toBe(a.code);
        expect(b.split).toEqual(a.split);
      }),
      { numRuns: 100 }
    );
  });

  it('split sums to P', () => {
    fc.assert(
      fc.property(judgeInputArb, (j) => {
        const r = judge(j);
        if (r.code === 'fits_month' || r.code === 'fits_unspent' || r.code === 'emergency_use') {
          const sum = r.split.reduce((s, x) => s + x.amount, 0);
          expect(sum).toBe(j.purchase?.dayOne);
        }
        if (r.split.some((s) => s.source === 'emergency')) expect(r.parts.oneOff).toBe('emergency_use');
      }),
      { numRuns: 200 }
    );
  });

  it('I31 emergency locked (judge level)', () => {
    fc.assert(
      fc.property(judgeInputArb, (j0) => {
        const j = { ...j0, purchase: j0.purchase === null ? null : { ...j0.purchase, emergency: false } };
        const lo = judge({ ...j, funds: { ...j.funds, emergency: mu(0) } });
        const hi = judge({ ...j, funds: { ...j.funds, emergency: mu(100_000_000) } });
        const strip = (r: typeof lo) => ({ ...r, facts: r.facts.filter((f) => f.code !== 'emergency_untouched') });
        expect(strip(hi)).toEqual(strip(lo));
        expect(hi.code).not.toBe('emergency_use');
      }),
      { numRuns: 200 }
    );
  });

  it('I18 ladder monotone in P', () => {
    fc.assert(
      fc.property(judgeInputArb, money(0, 1e9), (j, extra) => {
        if (j.purchase === null) return;
        const p = j.purchase;
        const base = judge(j);
        const bigger = judge({ ...j, purchase: { ...p, dayOne: mu(p.dayOne + extra), whole: mu(p.whole + extra) } });
        // needs_input is a different question, not a worse answer: skip it on either side.
        if (base.code === 'needs_input' || bigger.code === 'needs_input') return;
        expect(rankOf(bigger.code)).toBeLessThanOrEqual(rankOf(base.code));
      }),
      { numRuns: 200 }
    );
  });

  it('I23 low-month clause', () => {
    fc.assert(
      fc.property(judgeInputArb, (j) => {
        const r = judge(j);
        if (j.purchase === null || (r.code !== 'fits_month' && r.code !== 'fits_unspent')) return;
        const low = j.month.low;
        const M = j.purchase.monthly;
        // 05.4 D-63, D-65 (05.4-50): an already-short usual month heads every answer instead, with one of the three tiers
        if (j.month.typicalLeft !== null && j.month.typicalLeft < 0) {
          expect(['month_already_short', 'month_short_small', 'month_short_moderate', 'month_short_moderate_extra']).toContain(r.variant);
        }
        // 05.4-21 (FIN-07, D-59): tight leads low_month; the low-month fact still shows under it
        else if (r.variant === 'tight') {
          expect(r.facts.map((f) => f.code)).toContain('tight_floor');
          if (M > 0 && low !== null && low.left - M < 0) expect(r.facts.map((f) => f.code)).toContain('low_month');
        }
        else if (M > 0 && low !== null && low.left - M < 0) expect(r.variant).toBe('low_month');
        else expect(r.variant).toBeNull();
      }),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 05.1-46: the monthly part for variable and seasonal earners (D-36, D-37, D-46), available unspent (D-38), the notices
// (D-49, D-50, D-54, D-58, D-62) and the missing order (D-59).
// ---------------------------------------------------------------------------------------------------------------------

const LEAN_MM = ['10', '11', '12', '01', '02', '03', '04'];

function windowMonths(over: (ym: string, i: number) => Partial<IncomeMonth> = () => ({})): IncomeMonth[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ym = addYearMonths('2025-10', i);
    const lean = LEAN_MM.includes(ym.slice(5));
    const income = lean ? 40_000 : 200_000;
    return { month: ym, income: mu(income), everyday: mu(30_000), left: mu(income - 30_000), lean, ...over(ym, i) };
  });
}

function picture(over: Partial<IncomePicture> = {}): IncomePicture {
  return {
    stated: 'seasonal',
    treated: 'seasonal',
    swings: false,
    volatile: false,
    confirmNeeded: false,
    windowMonths: 12,
    fullMonths: 14,
    months: windowMonths(),
    leanLeft: mu(10_000),
    expectedThisMonth: mu(40_000),
    ...over,
  };
}

function leanMonth(over: Partial<MonthModel> = {}, pic: Partial<IncomePicture> = {}): MonthModel {
  return month({ e: mu(30_000), recurringBills: mu(0), setAside: mu(0), incomePicture: picture(pic), ...over });
}

/** A monthly cost of m with no one-off part. */
const monthlyOnly = (m: number, over: Partial<Purchase> = {}): Purchase =>
  purchase({ dayOne: mu(0), whole: mu(m), monthly: mu(m), runningMonthly: mu(m), ...over });

function sched(firstDate: string): Schedule {
  return {
    cadence: { unit: 'month', every: 1 },
    count: 6,
    payment: mu(25_000),
    finalPayment: mu(25_000),
    lastPaying: 6,
    firstDate,
    financed: mu(150_000),
    pauseInterest: mu(0),
    totalPaid: mu(150_000),
    totalInterest: mu(0),
    fees: { setup: mu(0), perPeriod: mu(0), end: mu(0) },
    monthlyEquivalent: mu(25_000),
    source: 'computed',
  };
}

function expectedAll(amountOf: (i: number) => number): ExpectedMonthIncome[] {
  return Array.from({ length: 12 }, (_, i) => ({ month: addYearMonths('2026-10', i), amount: mu(amountOf(i)), at: '2026-10-01' }));
}

const factOf = (r: { facts: readonly { code: string; values: unknown }[] }, code: string) => r.facts.find((f) => f.code === code)?.values;
const readyKeyOf = (r: ReadyBy | null): string => (r === null ? '9999-99-99' : r.kind === 'date' ? r.date : `${r.month}-01`);

describe('D-36 / D-37 seasonal earner, monthly part', () => {
  it('D-36 every lean month covers the payment: fits_month, reason lean_months_used, lean months judged', () => {
    const r = judge(input({ month: leanMonth({}, { months: windowMonths((_, i) => ({ income: mu(60_000), left: mu(30_000), lean: i < 7 })) }), purchase: monthlyOnly(25_000), funds: funds(120_000) }));
    // 60,000 income - 30,000 everyday = 30,000 left in each lean month; the payment is 25,000.
    expect(r.code).toBe('fits_month');
    expect(r.reasons).toContain('lean_months_used');
    expect(r.parts).toEqual({ oneOff: 'fits_month', monthly: 'fits_month' });
    expect(factOf(r, 'lean_months_judged')).toEqual({ from: '2026-10', to: '2027-04', leanLeft: 30_000 });
    expect(r.facts.map((f) => f.code)).not.toContain('lean_bridge');
  });

  it('D-37 and D-46 shortfall x lean months to carry is the bridge, paid from unspent money', () => {
    const r = judge(input({ month: leanMonth(), purchase: monthlyOnly(25_000), funds: funds(120_000) }));
    // Lean months Oct to Apr: 40,000 - 30,000 = 10,000 left. Shortfall 15,000 x 7 months = 105,000; unspent 120,000 leaves 15,000.
    expect(r.code).toBe('fits_unspent');
    expect(r.parts).toEqual({ oneOff: 'fits_month', monthly: 'fits_unspent' });
    expect(factOf(r, 'lean_bridge')).toEqual({ monthly: 25_000, leanLeft: 10_000, shortfall: 15_000, months: 7, until: '2027-04', bridge: 105_000, after: 15_000 });
    expect(factOf(r, 'lean_months_judged')).toEqual({ from: '2026-10', to: '2027-04', leanLeft: 10_000 });
  });

  it('D-37 unspent short of the bridge: not_yet, not_covered, ready in a month', () => {
    const r = judge(input({ month: leanMonth(), purchase: monthlyOnly(25_000), funds: funds(100_000) }));
    expect(r.code).toBe('not_yet');
    expect(r.variant).toBe('not_covered');
    expect(r.readyBy).toEqual({ kind: 'month', month: '2026-11' }); // 105,000 - 100,000 = 5,000 against a typical 42,500
    expect(r.parts).toEqual({ oneOff: 'fits_month', monthly: 'not_yet' });
  });

  it('D-37 unspent not confirmed: needs_input with unspent_not_confirmed', () => {
    const r = judge(input({ month: leanMonth(), purchase: monthlyOnly(25_000), funds: funds(null) }));
    expect(r.code).toBe('needs_input');
    expect(r.missing).toEqual(['unspent_not_confirmed']);
    expect(r.parts).toEqual({ oneOff: 'fits_month', monthly: 'needs_input' });
  });

  it('D-37 the one-off part is taken off the unspent money before the bridge', () => {
    // One-off 120,000: this month 42,500 and 77,500 from earlier unspent; 240,000 - 120,000 = 120,000 after, bridge 105,000.
    const r = judge(input({ month: leanMonth(), purchase: purchase({ dayOne: mu(120_000), whole: mu(120_000), monthly: mu(25_000), runningMonthly: mu(25_000) }), funds: funds(240_000) }));
    expect(r.code).toBe('fits_unspent');
    expect(factOf(r, 'lean_bridge')).toMatchObject({ bridge: 105_000, after: 15_000 });
  });

  it('D-37 months with no lean flag at all: every month with less than the payment is carried', () => {
    const r = judge(input({ month: leanMonth({}, { months: windowMonths(() => ({ lean: false, income: mu(40_000), left: mu(10_000) })) }), purchase: monthlyOnly(25_000), funds: funds(200_000) }));
    expect(r.code).toBe('fits_unspent');
    expect(factOf(r, 'lean_bridge')).toMatchObject({ months: 12, until: '2027-09', bridge: 180_000, after: 20_000 });
    expect(factOf(r, 'lean_months_judged')).toEqual({ from: '2026-10', to: '2027-09', leanLeft: 10_000 });
  });

  it('D-37 a schedule starts the walk at the first payment: Feb to Apr are the lean run', () => {
    const r = judge(input({ month: leanMonth(), purchase: purchase({ dayOne: mu(0), whole: mu(150_000), monthly: mu(25_000), schedule: sched('2027-02-05') }), funds: funds(120_000) }));
    expect(r.code).toBe('fits_unspent');
    expect(factOf(r, 'lean_bridge')).toMatchObject({ months: 3, until: '2027-04', bridge: 45_000 });
    expect(factOf(r, 'lean_months_judged')).toEqual({ from: '2027-02', to: '2027-04', leanLeft: 10_000 });
  });

  it('D-37 a schedule that starts beyond the year ahead judges the current month', () => {
    const r = judge(input({ month: leanMonth(), purchase: purchase({ dayOne: mu(0), whole: mu(150_000), monthly: mu(25_000), schedule: sched('2029-01-01') }), funds: funds(120_000) }));
    expect(factOf(r, 'lean_bridge')).toMatchObject({ months: 1, until: '2026-10', bridge: 15_000 });
  });

  it('D-37 confirmed expected income (under 12 months of records): months with less left than the payment are carried', () => {
    const expected = expectedAll((i) => (i < 6 ? 40_000 : 200_000)); // Oct to Mar lean
    const r = judge(
      input({ month: leanMonth({}, { fullMonths: 6, months: [] }), purchase: monthlyOnly(25_000), funds: funds(100_000), inputsOver: { expectedIncome: expected } })
    );
    // Everyday is the typical 30,000: 40,000 - 30,000 = 10,000 left; shortfall 15,000 x 6 = 90,000; 100,000 leaves 10,000.
    expect(r.code).toBe('fits_unspent');
    expect(factOf(r, 'lean_bridge')).toEqual({ monthly: 25_000, leanLeft: 10_000, shortfall: 15_000, months: 6, until: '2027-03', bridge: 90_000, after: 10_000 });
    expect(factOf(r, 'lean_months_judged')).toEqual({ from: '2026-10', to: '2027-03', leanLeft: 10_000 });
  });

  it('D-37 confirmed income that covers every month: fits_month', () => {
    const r = judge(input({ month: leanMonth({}, { fullMonths: 6, months: [] }), purchase: monthlyOnly(25_000), funds: funds(100_000), inputsOver: { expectedIncome: expectedAll(() => 100_000) } }));
    expect(r.code).toBe('fits_month');
    expect(factOf(r, 'lean_months_judged')).toEqual({ from: '2026-10', to: '2027-09', leanLeft: 70_000 });
  });

  it('monthlyPart: no expected income for a month, or no everyday figure, asks for input', () => {
    const ctx = { asOf: '2026-10-03', purchase: monthlyOnly(25_000), available: mu(100_000), takenByOneOff: mu(0), expected: [] as ExpectedMonthIncome[] };
    expect(monthlyPart(leanMonth({}, { fullMonths: 6, months: [] }), mu(25_000), ctx)?.code).toBe('needs_input');
    expect(monthlyPart(leanMonth({ e: null }, { fullMonths: 6, months: [] }), mu(25_000), { ...ctx, expected: expectedAll(() => 40_000) })?.code).toBe('needs_input');
  });

  it('a steady earner is judged as before, with or without a picture', () => {
    const steady = picture({ treated: 'steady', stated: 'steady', months: [] });
    const a = judge(input({ month: month({ incomePicture: steady }), purchase: monthlyOnly(25_000) }));
    const b = judge(input({ month: month(), purchase: monthlyOnly(25_000) }));
    expect(a).toEqual(b);
    expect(a.facts.map((f) => f.code)).not.toEqual(expect.arrayContaining(['lean_months_judged']));
    expect(a.facts.map((f) => f.code)).not.toEqual(expect.arrayContaining(['low_month_judged']));
    expect(monthlyPart(month({ incomePicture: picture() }), mu(25_000))?.code).toBeDefined(); // no ctx: the steady rule
  });
});

describe('D-36 / D-37 gig and other variable earners', () => {
  const low = { left: mu(20_000), month: '2026-02', reason: 'second_lowest' } as const;
  const gigPic = (over: Partial<IncomePicture> = {}): IncomePicture =>
    picture({ stated: 'variable', treated: 'variable', fullMonths: 12, months: windowMonths((_, i) => ({ left: mu(i < 4 ? 20_000 : 60_000) })), ...over });
  const gig = (avail: number | null) => judge(input({ month: leanMonth({ low, incomePicture: gigPic() }), purchase: monthlyOnly(25_000), funds: funds(avail) }));

  it('D-36 the low month covers the payment: fits_month, low month judged, no bridge', () => {
    const r = judge(input({ month: leanMonth({ low: { ...low, left: mu(40_000) }, incomePicture: gigPic() }), purchase: monthlyOnly(25_000), funds: funds(50_000) }));
    expect(r.code).toBe('fits_month');
    expect(r.reasons).not.toContain('lean_months_used');
    expect(factOf(r, 'low_month_judged')).toEqual({ month: '2026-02', left: 40_000 });
  });

  it('D-37 the low month falls short: 4 months below the payment make the bridge; unspent covers it', () => {
    const r = gig(50_000);
    // Shortfall 25,000 - 20,000 = 5,000 x 4 months below 25,000 = 20,000; 50,000 leaves 30,000.
    expect(r.code).toBe('fits_unspent');
    expect(factOf(r, 'lean_bridge')).toEqual({ monthly: 25_000, leanLeft: 20_000, shortfall: 5_000, months: 4, until: '2027-01', bridge: 20_000, after: 30_000 });
    expect(factOf(r, 'low_month_judged')).toEqual({ month: '2026-02', left: 20_000 });
    expect(r.facts.map((f) => f.code)).not.toContain('lean_months_judged');
  });

  it('D-37 not enough unspent: not_yet', () => {
    const r = gig(15_000);
    expect(r.code).toBe('not_yet');
    expect(r.variant).toBe('not_covered');
    expect(r.readyBy).toEqual({ kind: 'month', month: '2026-11' });
  });

  it('D-37 unspent unknown: needs_input', () => {
    expect(gig(null).missing).toEqual(['unspent_not_confirmed']);
  });

  it('D-36 no low month recorded: the steady rule', () => {
    const r = judge(input({ month: leanMonth({ low: null, incomePicture: gigPic() }), purchase: monthlyOnly(25_000), funds: funds(50_000) }));
    expect(r.code).toBe('fits_month');
    expect(r.facts.map((f) => f.code)).not.toContain('low_month_judged');
  });

  it('D-37 a plan shorter than the run of low months limits the months carried', () => {
    const r = judge(input({ month: leanMonth({ low, incomePicture: gigPic() }), purchase: purchase({ dayOne: mu(0), whole: mu(50_000), monthly: mu(25_000), schedule: sched('2029-01-01') }), funds: funds(50_000) }));
    expect(factOf(r, 'lean_bridge')).toMatchObject({ months: 1, until: '2026-10', bridge: 5_000 });
  });
});

describe('D-36 / D-37 / D-46 monthly rules, together with the one-off part', () => {
  it('a not_yet monthly part leads over a one-off part that is covered', () => {
    const r = judge(input({ month: leanMonth(), purchase: monthlyOnly(25_000), funds: funds(100_000) }));
    expect(r.parts.oneOff).toBe('fits_month');
    expect(r.parts.monthly).toBe('not_yet');
  });

  it('when both parts are not yet, the one-off part leads when its ready-by is the later', () => {
    // One-off 300,000 not covered by 100,000 unspent (typical 42,500): ready in 5 months. Plus bridge 105,000: ready later.
    const base = { month: leanMonth(), funds: funds(100_000) };
    const both = judge(input({ ...base, purchase: purchase({ dayOne: mu(300_000), whole: mu(300_000), monthly: mu(25_000), runningMonthly: mu(25_000) }) }));
    expect(both.code).toBe('not_yet');
    expect(both.parts).toEqual({ oneOff: 'not_yet', monthly: 'not_yet' });
    const oneOnly = judge(input({ month: month(), funds: funds(100_000), purchase: purchase({ dayOne: mu(300_000), whole: mu(300_000) }) }));
    expect(readyKeyOf(both.readyBy) >= readyKeyOf(oneOnly.readyBy)).toBe(true);
  });

  it("the monthly part leads when its ready-by is later than the one-off part's", () => {
    const r = judge(input({ month: leanMonth(), funds: funds(0), purchase: purchase({ dayOne: mu(60_000), whole: mu(60_000), monthly: mu(25_000), runningMonthly: mu(25_000) }) }));
    expect(r.parts).toEqual({ oneOff: 'not_yet', monthly: 'not_yet' });
    expect(r.variant).toBe('not_covered');
    expect(r.readyBy).toEqual({ kind: 'month', month: '2027-05' }); // D-60: one-off 60,000 by April, bridge 105,000 only in May
  });

  it('D-36 the lean leftover is the lowest of the lean months', () => {
    const incomes = [50_000, 35_000, 45_000, 40_000, 40_000, 40_000, 40_000];
    const months = windowMonths((_, i) => (i < 7 ? { income: mu(incomes[i] as number), left: mu((incomes[i] as number) - 30_000) } : {}));
    const r = judge(input({ month: leanMonth({}, { months }), purchase: monthlyOnly(25_000), funds: funds(200_000) }));
    expect(factOf(r, 'lean_months_judged')).toMatchObject({ leanLeft: 5_000 });
    expect(factOf(r, 'lean_bridge')).toMatchObject({ shortfall: 20_000, months: 7, bridge: 140_000, after: 60_000 });
  });

  it('a payday one-off part and a monthly part: the later of the two leads', () => {
    const payday: CashCheck = { kind: 'payday', until: '2099-01-01', shortBy: mu(5_000) };
    const far = judge(input({ cash: payday, month: leanMonth(), purchase: monthlyOnly(25_000), funds: funds(100_000) }));
    expect(far.variant).toBe('payday');
    expect(far.readyBy).toEqual({ kind: 'date', date: '2099-01-01' });
    // The monthly part is never (a year that saves nothing): it leads, with no date.
    const never = judge(input({ cash: payday, month: leanMonth({}, { months: windowMonths(() => ({ income: mu(30_000), left: mu(0), lean: true })) }), purchase: monthlyOnly(25_000), funds: funds(100_000) }));
    expect(never.variant).toBe('not_covered');
    expect(never.readyBy).toBeNull();
    // Both never: the one-off part leads, still no date.
    const both = judge(input({ month: leanMonth({ monthLeft: mu(0) }, { months: windowMonths(() => ({ income: mu(30_000), left: mu(0), lean: true })) }), funds: funds(0), purchase: purchase({ dayOne: mu(60_000), whole: mu(60_000), monthly: mu(25_000), runningMonthly: mu(25_000) }) }));
    expect(both.parts).toEqual({ oneOff: 'not_yet', monthly: 'not_yet' });
    expect(both.readyBy).toBeNull();
  });

  it('D-60 a seasonal earner is ready in the month the season brings it, not after typical months', () => {
    // Bridge 105,000 against no unspent: lean months leave 10,000 each, busy months 170,000. From October the walk adds
    // Nov..Apr at 10,000 (60,000), then May at 170,000. The typical month (42,500) would say January.
    const r = judge(input({ month: leanMonth(), purchase: monthlyOnly(25_000), funds: funds(0) }));
    expect(r.code).toBe('not_yet');
    expect(r.readyBy).toEqual({ kind: 'month', month: '2027-05' });
  });

  it('a monthly not_yet with the one-off part covered carries its own ready-by', () => {
    const r = judge(input({ month: leanMonth(), purchase: monthlyOnly(25_000), funds: funds(0) }));
    expect(r.readyBy).toEqual({ kind: 'month', month: '2027-05' }); // D-60: Nov to Apr save 10,000 each (60,000), May saves 170,000
  });

  it('I9/I13 a cheaper payment is never worse and a dearer one is never ready sooner (seasonal)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1_000, max: 60_000 }), fc.integer({ min: 0, max: 40_000 }), fc.integer({ min: 0, max: 400_000 }), (m, d, avail) => {
        const lo = judge(input({ month: leanMonth(), purchase: monthlyOnly(m), funds: funds(avail) }));
        const hi = judge(input({ month: leanMonth(), purchase: monthlyOnly(m + d), funds: funds(avail) }));
        if (lo.code === 'needs_input' || hi.code === 'needs_input') return;
        expect(rankOf(lo.code)).toBeGreaterThanOrEqual(rankOf(hi.code));
        if (lo.code === 'not_yet' && hi.code === 'not_yet') expect(readyKeyOf(lo.readyBy) <= readyKeyOf(hi.readyBy)).toBe(true);
      }),
      { numRuns: 200, seed: 0x0546 }
    );
  });
});

describe('D-38 available unspent money', () => {
  const held = (value: number, available: number, heldBack: number): Funds =>
    funds(value, {
      unspent: unspentState(value, {
        available: mu(available),
        breakdown: { in: mu(0), everyday: mu(0), bills: mu(0), loans: mu(0), investedSaved: mu(0), other: mu(0), heldBack: mu(heldBack) },
      }),
    });

  it('D-38 and D-46 the ladder judges available money and says what is held back, right after the unspent figure', () => {
    const r = judge(input({ funds: held(240_000, 190_000, 50_000) }));
    expect(r.code).toBe('fits_unspent');
    // Room this month 42,500; 77,500 from earlier unspent; 190,000 - 42,500 - 77,500 = 70,000 left.
    expect(factOf(r, 'unspent_before_after')).toEqual({ before: 190_000, after: 70_000 });
    expect(factOf(r, 'unspent_held_back')).toEqual({ amount: 50_000 });
    const codes = r.facts.map((f) => f.code);
    expect(codes.indexOf('unspent_held_back')).toBe(codes.indexOf('unspent_before_after') + 1);
  });

  it('D-38 held back money is no longer there to cover the price', () => {
    const r = judge(input({ funds: held(240_000, 100_000, 140_000) }));
    expect(r.code).toBe('not_yet');
  });

  it('D-38 nothing held back: no unspent_held_back fact; steady answers are as before', () => {
    const r = judge(input());
    expect(r.facts.map((f) => f.code)).not.toContain('unspent_held_back');
  });

  it('D-38 drift reads the confirmed figure, not the available one', () => {
    const r = judge(input({ funds: held(240_000, 190_000, 50_000) }));
    expect(r.notices.map((n) => n.code)).not.toContain('unspent_drifted');
  });

  it('D-46 the bridge is judged against available money, with held back money said', () => {
    const r = judge(input({ month: leanMonth(), purchase: monthlyOnly(25_000), funds: held(150_000, 100_000, 50_000) }));
    expect(r.code).toBe('not_yet'); // 105,000 bridge against 100,000 available
    expect(factOf(r, 'unspent_held_back')).toEqual({ amount: 50_000 });
  });

  it('D-46 fact order: month, unspent, held back, emergency, purchase, low month, why months, bridge', () => {
    const r = judge(
      input({
        month: leanMonth(),
        purchase: purchase({ dayOne: mu(120_000), whole: mu(120_000), monthly: mu(25_000), runningMonthly: mu(25_000) }),
        funds: held(400_000, 350_000, 50_000),
        net: FULL_NET,
      })
    );
    expect(r.facts.map((f) => f.code)).toEqual([
      'month_left_after',
      'unspent_before_after',
      'unspent_held_back',
      'emergency_untouched',
      'lean_months_judged',
      'lean_bridge',
    ]);
  });
});

describe('D-49 D-50 D-54 D-58 D-62 notices', () => {
  it('D-49 envelopes linked to no account are said, with the count', () => {
    const r = judge(input({ funds: funds(240_000, { envelopesAssumedInside: 2 }) }));
    expect(r.notices).toContainEqual({ code: 'envelope_location_assumed', values: { count: 2 } });
    expect(judge(input()).notices.map((n) => n.code)).not.toContain('envelope_location_assumed');
  });

  it('D-50 money above what the records explain is asked about and said, with the amount', () => {
    const r = judge(input({ funds: funds(240_000, { unexplained: mu(50_000) }) }));
    expect(r.code).toBe('needs_input');
    expect(r.missing).toContain('unexplained_money_question');
    expect(r.notices).toContainEqual({ code: 'unexplained_money', values: { amount: 50_000 } });
    const small = judge(input({ funds: funds(240_000, { unexplained: mu(100) }) }));
    expect(small.notices.map((n) => n.code)).not.toContain('unexplained_money');
  });

  it('D-54 an account with no stated use: the first one and the count', () => {
    const r = judge(input({ funds: funds(240_000, { unstatedAccounts: ['a1', 'a2'] }) }));
    expect(r.missing).toContain('account_use_question');
    expect(r.notices).toContainEqual({ code: 'account_use_unknown', values: { accountId: 'a1', count: 2 } });
  });

  it('D-62 only the fund is unlinked: fund_account_unknown with the stated fund, no account_use_unknown', () => {
    const r = judge(input({ funds: funds(240_000, { fundUnlinked: true }) }));
    expect(r.missing).toContain('account_use_question');
    expect(r.notices).toContainEqual({ code: 'fund_account_unknown', values: { amount: 300_000 } });
    expect(r.notices.map((n) => n.code)).not.toContain('account_use_unknown');
    const none = judge(input({ funds: funds(240_000, { fundUnlinked: true, emergency: null }) }));
    expect(none.notices).toContainEqual({ code: 'fund_account_unknown', values: { amount: 0 } });
  });

  it('D-62 both apply: the account question comes first and the fund waits', () => {
    const r = judge(input({ funds: funds(240_000, { unstatedAccounts: ['a1'], fundUnlinked: true }) }));
    expect(r.notices.map((n) => n.code)).toContain('account_use_unknown');
    expect(r.notices.map((n) => n.code)).not.toContain('fund_account_unknown');
  });

  const unseen = (arrived: boolean | null, date = '2026-10-01') => ({ seriesId: 'p', date, amount: mu(70_000), arrived });

  it('D-58 the first unanswered pay is asked about; an answered "not yet" is counted missed with the pay_missed reason', () => {
    const r = judge(input({ month: month({ unseenPay: [unseen(false, '2026-09-15'), unseen(null)] }) }));
    expect(r.missing).toContain('pay_arrival_question');
    expect(r.notices).toContainEqual({ code: 'pay_not_seen', values: { amount: 70_000, date: '2026-10-01' } });
    expect(r.notices).toContainEqual({ code: 'pay_counted_missed', values: { amount: 70_000, date: '2026-09-15' } });
    expect(r.confidence.reasons).toEqual([{ code: 'pay_missed', numbers: { count: 1, amount: 70_000 }, weight: 50, audience: 'answer' }]);
  });

  it('D-58 only "not yet" answers: a careful answer that still works, with the pay left out named in the basis', () => {
    const r = judge(input({ month: month({ unseenPay: [unseen(false)] }) }));
    expect(r.code).not.toBe('needs_input');
    expect(r.notices.map((n) => n.code)).toContain('pay_counted_missed');
    expect(r.notices.map((n) => n.code)).not.toContain('pay_not_seen');
    expect(r.confidence).toEqual({
      reasons: [{ code: 'pay_missed', numbers: { count: 1, amount: 70_000 }, weight: 50, audience: 'answer' }],
      basis: { kind: 'records_with_reason', months: 3, upTo: '2026-10-03', reason: 'pay_missed' },
      nextStep: { reason: 'pay_missed', step: 'record_pay' },
    });
  });

  it('D-58 a pay that arrived adds no notice and no cap', () => {
    const r = judge(input({ month: month({ unseenPay: [unseen(true)] }) }));
    expect(r.notices.map((n) => n.code)).not.toContain('pay_counted_missed');
    expect(r.confidence.reasons).not.toContain('pay_missed');
  });
});

describe('D-59 missing in priority order', () => {
  it('D-59 the judge sorts what the purchase and needsInput ask for by MISSING_PRIORITY', () => {
    const r = judge(input({ purchase: purchase(), purchaseMissing: ['plan_rate_missing', 'no_price'] as MissingCode[], funds: funds(240_000, { unstatedAccounts: ['a1'] }) }));
    expect(r.missing).toEqual(['account_use_question', 'no_price', 'plan_rate_missing']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 05.1-50: D-48, the volatile income question.
// ---------------------------------------------------------------------------------------------------------------------

describe('D-48 volatile income', () => {
  const volatileMonth = (pic: Partial<IncomePicture> = {}, over: Partial<MonthModel> = {}) => leanMonth(over, { volatile: true, ...pic });
  const ask = (cover: boolean | null | undefined, m = volatileMonth(), avail: number | null = 120_000, p = monthlyOnly(25_000)) =>
    judge(input({ month: m, purchase: cover === undefined ? p : { ...p, volatileCover: cover }, funds: funds(avail) }));
  const noticeOf = (r: { notices: readonly { code: string; values: unknown }[] }) => r.notices.find((n) => n.code === 'income_volatile')?.values;
  const VALUES = { payment: 25_000, periods: 12, monthly: 25_000, months: 12, leanFrom: '2026-10', leanTo: '2027-04', leanLeft: 10_000 };

  it('D-48 the ask: volatile, step 1 fails, no answer: needs_input, volatile_cover_question, notice with values', () => {
    for (const cover of [undefined, null]) {
      const r = ask(cover);
      expect(r.code).toBe('needs_input');
      expect(r.missing).toEqual(['volatile_cover_question']);
      expect(r.parts).toEqual({ oneOff: 'fits_month', monthly: 'needs_input' });
      expect(noticeOf(r)).toEqual(VALUES);
    }
  });

  it('D-48 the ask is the same with no unspent figure (the question comes first)', () => {
    expect(ask(null, volatileMonth(), null).missing).toEqual(['volatile_cover_question']);
  });

  it('D-48 yes: the monthly part fits on the user word, rests_on_your_answer and the user_said_cover reason', () => {
    const r = ask(true);
    expect(r.code).toBe('fits_month');
    expect(r.parts).toEqual({ oneOff: 'fits_month', monthly: 'fits_month' });
    expect(factOf(r, 'rests_on_your_answer')).toEqual({ monthly: 25_000, months: 12 });
    expect(r.confidence.reasons).toEqual([{ code: 'user_said_cover', numbers: { monthly: 25_000, months: 12 }, weight: 10, audience: 'answer' }]);
    expect(r.confidence.basis).toEqual({ kind: 'records_with_reason', months: 3, upTo: '2026-10-03', reason: 'user_said_cover' });
    expect(r.confidence.nextStep).toBeNull();
    expect(noticeOf(r)).toEqual(VALUES);
    expect(r.facts.map((f) => f.code)).not.toContain('lean_bridge');
  });

  it('D-48 no: not_yet, not_covered, volatile_cover_declined, ready by the step 3 date, notice kept', () => {
    const r = ask(false, volatileMonth(), 100_000);
    expect(r.code).toBe('not_yet');
    expect(r.variant).toBe('not_covered');
    expect(r.reasons).toContain('volatile_cover_declined');
    expect(r.readyBy).toEqual({ kind: 'month', month: '2026-11' }); // bridge 105,000 against 100,000, as D-37 step 3
    expect(noticeOf(r)).toEqual(VALUES);
  });

  it('D-48 no: declined even when unspent would have covered the bridge, and the fund plays no part', () => {
    const r = judge(input({ month: volatileMonth(), purchase: { ...monthlyOnly(25_000), volatileCover: false }, funds: { ...funds(500_000), emergency: mu(900_000) } }));
    expect(r.code).toBe('not_yet');
    expect(r.reasons).toContain('volatile_cover_declined');
    expect(r.facts.map((f) => f.code)).not.toContain('emergency_used');
  });

  it('D-48 payment and periods come from the plan schedule (my part), months from the plan months', () => {
    const p = monthlyOnly(25_000, { schedule: sched('2026-10-15') });
    const r = ask(null, volatileMonth(), 120_000, p);
    expect(noticeOf(r)).toMatchObject({ payment: 25_000, periods: 6, monthly: 25_000 });
  });

  it('D-48 gig earner: the low month is both ends of the span', () => {
    const low = { left: mu(20_000), month: '2026-02', reason: 'second_lowest' } as const;
    const m = leanMonth({ low }, { stated: 'variable', treated: 'variable', volatile: true, months: windowMonths((_, i) => ({ left: mu(i < 4 ? 20_000 : 60_000) })) });
    const r = ask(null, m);
    expect(noticeOf(r)).toMatchObject({ leanFrom: '2026-02', leanTo: '2026-02', leanLeft: 20_000 });
  });

  it('D-48 step 1 passes: no question, no notice, the 05.1-46 result', () => {
    const m = volatileMonth({ months: windowMonths((_, i) => ({ income: mu(60_000), left: mu(30_000), lean: i < 7 })) });
    const r = ask(null, m);
    expect(r.code).toBe('fits_month');
    expect(r.notices.map((n) => n.code)).not.toContain('income_volatile');
    expect(r.confidence.reasons).not.toContain('user_said_cover');
  });

  it('D-48 not volatile: the answer is ignored and 05.1-46 runs', () => {
    for (const cover of [true, false, null]) {
      const r = judge(input({ month: leanMonth(), purchase: { ...monthlyOnly(25_000), volatileCover: cover }, funds: funds(120_000) }));
      expect(r.code).toBe('fits_unspent');
      expect(r.notices.map((n) => n.code)).not.toContain('income_volatile');
    }
  });
});

describe('05.3-70 purchasePreview fallback', () => {
  it('with no purchase and no preview: band null, layers empty', () => {
    const r = judge(input({ purchase: null, purchaseMissing: ['plan_rate_missing'] as MissingCode[] }));
    expect(r.band).toBeNull();
    expect(r.layers).toEqual([]);
  });
  it('with no purchase and a preview: the preview fills band and layers', () => {
    const r = judge(input({ purchase: null, purchaseMissing: ['plan_rate_missing'] as MissingCode[], purchasePreview: { band: 4, layers: ['L1p', 'L2'] as never } }));
    expect(r.band).toBe(4);
    expect(r.layers).toEqual(['L1p', 'L2']);
  });
});

describe('05.4 D-56: the overdraft split names extra savings and the safety net apart', () => {
  it('money above the size is extra_savings; only the rest is emergency', () => {
    const net: ResolvedNet = { ...FULL_NET, saved: minorUnits(320_000), aboveSize: minorUnits(20_000), state: 'above' };
    const r = judge(
      input({
        month: month({ monthLeft: mu(0), typicalLeft: mu(50_000) }),
        funds: funds(10_000),
        net,
        purchase: purchase({ dayOne: mu(100_000), whole: mu(100_000) }),
        cash: { kind: 'overdraft', lowest: { date: '2026-10-20', balance: mu(-5_000) } },
      })
    );
    expect(r.code).toBe('fits_uses_overdraft');
    expect(r.split).toEqual([
      { source: 'month', amount: 10_000 },
      { source: 'extra_savings', amount: 20_000 },
      { source: 'emergency', amount: 70_000 },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 05.4-21: no new monthly payment into a short month (FIN-06 / ENG-06) and the tight caution (FIN-07, D-40). The hand-built
// month spends recurringBills 0 + e 100,000 a month, so the tenth floor is 10,000; its usual room is 42,500.
// ---------------------------------------------------------------------------------------------------------------------

describe('05.4-21 short month (FIN-06 / ENG-06)', () => {
  const ctx = (p: Purchase, available: number | null) => ({ asOf: '2026-10-03', purchase: p, available: available === null ? null : mu(available), takenByOneOff: mu(0), expected: [] });
  const planIn = (first: string) => monthlyOnly(10_000, { schedule: sched(first), runningMonthly: mu(0) });

  it('a usual month at or below 0 is Short each month for any earner, before any other monthly rule', () => {
    expect(monthlyPart(month({ typicalLeft: mu(0) }), mu(1))?.code).toBe('monthly_short');
    expect(monthlyPart(month({ typicalLeft: mu(-5) }), mu(1))?.code).toBe('monthly_short');
    // a seasonal earner whose lean months would carry it is still blocked by the usual month
    const lean = leanMonth({ typicalLeft: mu(0) }, { treated: 'seasonal' });
    expect(monthlyPart(lean, mu(1_000), ctx(planIn('2027-01-03'), 500_000))?.code).toBe('monthly_short');
  });

  it('BR-06: this month heading below 0 and the first payment this month is Short each month; next month is not blocked by it', () => {
    expect(monthlyPart(month(), mu(10_000), ctx(planIn('2026-10-28'), -20_000))?.code).toBe('monthly_short');
    expect(monthlyPart(month(), mu(10_000), ctx(planIn('2026-11-28'), -20_000))?.code).toBe('fits_month');
    expect(monthlyPart(month(), mu(10_000), ctx(planIn('2026-10-28'), 0))?.code).toBe('fits_month');
  });

  it('spare money unknown: this month after its plans decides; a running cost with no schedule is not blocked by this rule', () => {
    expect(monthlyPart(month({ monthLeft: mu(-1) }), mu(10_000), ctx(planIn('2026-10-28'), null))?.code).toBe('monthly_short');
    expect(monthlyPart(month({ monthLeft: mu(0) }), mu(10_000), ctx(planIn('2026-10-28'), null))?.code).toBe('fits_month');
    expect(monthlyPart(month(), mu(10_000), ctx(monthlyOnly(10_000), -20_000))?.code).toBe('fits_month');
  });
});

describe('05.4-21 tight (FIN-07, D-40)', () => {
  const plan = (m: number, over: Partial<Purchase> = {}) => monthlyOnly(m, { schedule: sched('2026-11-03'), runningMonthly: mu(0), ...over });
  const factOfCode = (r: { facts: readonly { code: string; values: unknown }[] }, code: string) => r.facts.find((f) => f.code === code)?.values;

  it('a plan over 80% of the usual room is tight (35,000 of 42,500 is 82%)', () => {
    const r = judge(input({ purchase: plan(35_000) }));
    expect([r.code, r.variant]).toEqual(['fits_month', 'tight']);
    expect(factOfCode(r, 'tight_floor')).toEqual({ floor: 10_000, basis: 'tenth' });
  });

  it('a plan leaving under the floor is tight (33,000 leaves 9,500); leaving 10,500 at 75% is a plain fit', () => {
    expect(judge(input({ purchase: plan(33_000) })).variant).toBe('tight');
    const clean = judge(input({ purchase: plan(32_000) }));
    expect([clean.code, clean.variant]).toEqual(['fits_month', null]);
    expect(factOfCode(clean, 'tight_floor')).toBeUndefined();
  });

  it("the user's own line replaces the tenth (BR-09)", () => {
    const r = judge(input({ purchase: plan(25_000), inputsOver: { tightLine: mu(20_000) } }));
    expect(r.variant).toBe('tight');
    expect(factOfCode(r, 'tight_floor')).toEqual({ floor: 20_000, basis: 'user_line' });
    expect(judge(input({ purchase: plan(20_000), inputsOver: { tightLine: mu(20_000) } })).variant).toBeNull();
  });

  it('a plan whose deposit comes from earlier money keeps the monthly tight on fits_unspent', () => {
    const r = judge(input({ purchase: plan(35_000, { dayOne: mu(100_000) }) }));
    expect([r.code, r.variant]).toEqual(['fits_unspent', 'tight']);
  });

  it('a one-off leaving under the floor from spare money is tight: 240,000 - 235,000 = 5,000', () => {
    const r = judge(input({ purchase: purchase({ dayOne: mu(235_000), whole: mu(235_000) }) }));
    expect([r.code, r.variant]).toEqual(['fits_unspent', 'tight']);
    expect(judge(input({ purchase: purchase({ dayOne: mu(120_000), whole: mu(120_000) }) })).variant).toBeNull();
  });

  it('spare money unknown: the one-off reads this month after its plans (42,500 - 40,000 = 2,500)', () => {
    const r = judge(input({ funds: funds(null), purchase: purchase({ dayOne: mu(40_000), whole: mu(40_000) }) }));
    expect([r.code, r.variant]).toEqual(['fits_month', 'tight']);
    expect(judge(input({ funds: funds(null), purchase: purchase({ dayOne: mu(30_000), whole: mu(30_000) }) })).variant).toBeNull();
  });

  it('a one-off never reads the 80% share: all of the month with plenty of spare money left is a plain fit', () => {
    const r = judge(input({ purchase: purchase({ dayOne: mu(42_500), whole: mu(42_500) }) }));
    expect([r.code, r.variant]).toEqual(['fits_month', null]);
  });

  it('never on Dips into your safety net (D-50 (2))', () => {
    const r = judge(input({ net: FULL_NET, purchase: purchase({ dayOne: mu(400_000), whole: mu(400_000) }) }));
    expect(r.code).toBe('fits_uses_net');
    expect(r.variant).toBeNull();
    expect(factOfCode(r, 'tight_floor')).toBeUndefined();
  });

  it('a month-short headline leads, and the floor line is left out under it', () => {
    const r = judge(input({ month: month({ typicalLeft: mu(-1_000) }), purchase: purchase({ dayOne: mu(40_000), whole: mu(40_000) }) }));
    expect(r.variant).toBe('month_short_moderate'); // 40,000 eats more than a month of the 1,000 shortfall
    expect(factOfCode(r, 'tight_floor')).toBeUndefined();
  });

  it('a losing low_month keeps its fact under tight', () => {
    const r = judge(input({ month: month({ low: { month: '2026-09', left: mu(1_000), reason: 'lowest' } }), purchase: plan(35_000) }));
    expect(r.variant).toBe('tight');
    expect(factOfCode(r, 'low_month')).toEqual({ month: '2026-09', left: 1_000, monthly: 35_000 });
  });
});
