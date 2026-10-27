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
  Funds,
  LimitLine,
  LineSpec,
  MonthModel,
  Purchase,
  Purpose,
  ReadyBy,
  UnspentState,
  V3Inputs,
} from '../../types';
import { judge, monthlyPart, oneOffPart, type JudgeInput } from '../judge';

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
    confidence: { level: 'firm', reasons: [] },
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
    const r = judge(input());
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
    expect(r.variant).toBe('not_covered');
    expect(r.readyBy).toBeNull();
    expect(r.notices.map((n) => n.code)).toContain('typical_short');
    expect(r.facts.map((f) => f.code)).toContain('emergency_untouched');
  });

  it('v3 §12 #11 Leo: emergency use for work, rebuild months shown', () => {
    const r = judge(
      input({
        month: month({ monthLeft: mu(-2_000), typicalLeft: mu(12_000) }),
        funds: funds(10_000),
        purchase: purchase({ dayOne: mu(70_000), whole: mu(70_000), emergency: true, purpose: work, canUseEmergency: true }),
      })
    );
    expect(r.code).toBe('emergency_use');
    expect(r.split).toEqual([
      { source: 'unspent_earlier', amount: 10_000 },
      { source: 'emergency', amount: 60_000 },
    ]);
    expect(r.facts).toContainEqual({ code: 'emergency_used', values: { used: 60_000, months: 5 } });
    expect(r.legacyState).toBe('adjust');
  });

  it('M-03 emergency_used omits months when the rebuild time is unknown', () => {
    const r = judge(
      input({
        month: month({ monthLeft: mu(-2_000), typicalLeft: null }),
        funds: funds(10_000),
        purchase: purchase({ dayOne: mu(70_000), whole: mu(70_000), emergency: true, purpose: work, canUseEmergency: true }),
      })
    );
    const f = r.facts.find((x) => x.code === 'emergency_used');
    expect(f?.values).toEqual({ used: 60_000 });
    expect(f?.values).not.toHaveProperty('months');
  });

  it('an emergency need with no fund figure at all is not met from the fund', () => {
    const r = judge(
      input({
        month: month({ monthLeft: mu(-2_000), typicalLeft: mu(12_000) }),
        funds: funds(10_000, { emergency: null as unknown as MinorUnits }),
        purchase: purchase({ dayOne: mu(70_000), whole: mu(70_000), emergency: true, purpose: work, canUseEmergency: true }),
      })
    );
    expect(r.code).toBe('not_yet');
    expect(r.split).toEqual([]);
  });

  it('I38: emergency marked with a nice-to-have or custom purpose never uses the fund', () => {
    for (const purpose of [nice, { kind: 'custom', id: 'x' } as Purpose]) {
      const r = judge(
        input({
          month: month({ monthLeft: mu(-2_000), typicalLeft: mu(12_000) }),
          funds: funds(10_000),
          purchase: purchase({ dayOne: mu(70_000), whole: mu(70_000), emergency: true, purpose }),
        })
      );
      expect(r.code).toBe('not_yet');
    }
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

    it('payday on the first of the ladder month gives the ladder month', () => {
      const first: CashCheck = { kind: 'payday', until: '2026-11-01', shortBy: mu(5_000) };
      const r = judge(input({ cash: first, funds: funds(10_000), month: month({ typicalLeft: mu(1_000_000) }) }));
      expect(r.variant).toBe('not_covered');
      expect(r.readyBy).toEqual({ kind: 'month', month: '2026-11' });
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

    it('a pay date on or before the first of the ladder month leaves the ladder month', () => {
      const r = judge(input({ month: roomy, funds: funds(20_000), cash: { kind: 'not_covered', shortBy: mu(1), payDate: '2026-11-01' } }));
      expect(r.readyBy).toEqual({ kind: 'month', month: '2026-11' });
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
  it('D-30 drifted unspent: the user figure is judged, notice and rough confidence', () => {
    const f = funds(300_000, { suggested: mu(200_000) });
    const r = judge(
      input({
        funds: { ...f, unspent: unspentState(300_000, { drifted: true, rolled: true }) },
        purchase: purchase({ dayOne: mu(250_000), whole: mu(250_000) }),
      })
    );
    expect(r.code).toBe('fits_unspent');
    expect(r.notices).toContainEqual({ code: 'unspent_drifted', values: { suggested: 200_000 } });
    expect(r.confidence.level).toBe('rough');
    expect(r.confidence.reasons).toContain('unspent_drifted');
  });

  it('D-32 rough figures only: judged against the typical month with from_your_figures', () => {
    const r = judge(
      input({
        month: month({ typicalLeft: mu(115_000), reasons: ['rough_figures_used'] }),
        purchase: purchase({ dayOne: mu(0), whole: mu(10_000), monthly: mu(10_000) }),
      })
    );
    expect(r.parts.monthly).toBe('fits_month');
    expect(r.notices.map((n) => n.code)).toContain('from_your_figures');
    expect(r.confidence.level).toBe('rough');
    expect(r.reasons).toContain('rough_figures_used');
  });

  it('stale unspent caps confidence at fair with a days notice', () => {
    const f = funds(240_000);
    const r = judge(
      input({
        funds: { ...f, unspent: unspentState(240_000, { stale: true, anchor: { amount: mu(240_000), at: '2026-09-01' } }) },
      })
    );
    expect(r.confidence.level).toBe('fair');
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
        if (M > 0 && low !== null && low.left - M < 0) expect(r.variant).toBe('low_month');
        else expect(r.variant).toBeNull();
      }),
      { numRuns: 200 }
    );
  });
});
