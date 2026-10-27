/**
 * SC-6 end-to-end invariants (05.1-27) that need the whole engine: I1, I3, I4, I5, I7, I19, I20, I25, I29, I31, I38.
 * Every property runs through evaluate() over inputs built on the golden persons (see arbitraries.ts).
 * A failure names its invariant in the test title.
 */
import fc from 'fast-check';
import { evaluate } from '../../evaluate';
import type { CheckV2, Fact, Notice, Result, RoughFigures, V3Inputs, V3Line } from '../../types';
import { loadPersons, personById, toV3Inputs } from '../golden/adapter';
import { checkOnce } from '../helpers/fixtures';
import { v3Line, v3Series } from '../helpers/fixtures';
import {
  CUSTOM_PURPOSE_ID,
  PURPOSES,
  checkArb,
  checkOf,
  codeRank,
  inputsArb,
  mu,
  priceArb,
  recordedInputsArb,
  shapeArb,
} from './arbitraries';

const RUNS = { numRuns: 60 };

/** D-54: the fund sits in its own dedicated emergency account, so its amount never touches the spending balance (I31, D-43). */
function withFund(inputs: V3Inputs, amount: number | null): V3Inputs {
  const accounts = (inputs.accounts ?? []).filter((a) => !(a.use !== null && a.use.kind === 'dedicated' && a.use.purpose.kind === 'emergency'));
  if (amount === null) return { ...inputs, accounts, emergency: null };
  return {
    ...inputs,
    accounts: [...accounts, { id: 'fund-acct', balance: mu(amount), use: { kind: 'dedicated', purpose: { kind: 'emergency' } } }],
    emergency: { amount: mu(amount), accountId: 'fund-acct' },
  };
}

const has = (ns: readonly Notice[], code: string): boolean => ns.some((n) => n.code === code);
const noticesOf = (r: Result): readonly Notice[] => r.notices;

function currentMonth(inputs: V3Inputs): string {
  return inputs.asOf.slice(0, 7);
}

describe('end-to-end invariants through evaluate()', () => {
  it('I1 thin data is never better: with every history month thin the code is never better than the same data treated as full', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const ym = currentMonth(inputs);
        const treatedFull: V3Inputs = { ...inputs, months: inputs.months.map((m) => ({ ...m, full: true })) };
        const thin: V3Inputs = { ...inputs, months: inputs.months.map((m) => (m.month < ym ? { ...m, full: false } : m)) };
        const a = evaluate(thin, check).result;
        const b = evaluate(treatedFull, check).result;
        expect(codeRank(a.code)).toBeLessThanOrEqual(codeRank(b.code));
      }),
      { ...RUNS, seed: 0x0540 }
    );
  });

  it('I1 thin data is never more confident: thinning any history months never raises confidence', () => {
    const LEVEL = { rough: 0, fair: 1, firm: 2 } as const;
    fc.assert(
      fc.property(inputsArb, checkArb, fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }), (inputs, check, mask) => {
        const treatedFull: V3Inputs = { ...inputs, months: inputs.months.map((m) => ({ ...m, full: true })) };
        const thin: V3Inputs = { ...inputs, months: inputs.months.map((m, i) => ({ ...m, full: mask[i % mask.length]! })) };
        const a = evaluate(thin, check).result.confidence.level;
        const b = evaluate(treatedFull, check).result.confidence.level;
        expect(LEVEL[a]).toBeLessThanOrEqual(LEVEL[b]);
      }),
      { ...RUNS, seed: 0x0541 }
    );
  });

  // D-42: evaluate() takes the stricter of the as-given and the all-full reading, so partial thinning can never help.
  const LEVELS = { rough: 0, fair: 1, firm: 2 } as const;
  const partialThinning = (inputs: V3Inputs, check: Parameters<typeof evaluate>[1], mask: readonly boolean[]): void => {
    const treatedFull: V3Inputs = { ...inputs, months: inputs.months.map((m) => ({ ...m, full: true })) };
    const thin: V3Inputs = { ...inputs, months: inputs.months.map((m, i) => ({ ...m, full: mask[i % mask.length]! })) };
    const a = evaluate(thin, check).result;
    const b = evaluate(treatedFull, check).result;
    expect(codeRank(a.code)).toBeLessThanOrEqual(codeRank(b.code));
    expect(LEVELS[a.confidence.level]).toBeLessThanOrEqual(LEVELS[b.confidence.level]);
  };

  it('I1 thin data is never better: PARTIAL thinning, recorded counterexample (D-42)', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }), partialThinning),
      // Replays the recorded counterexample (seed and path from the failing run) so the finding stays a regression.
      { seed: 88886437, path: '54:3:1:0:1:1:1:1:2:10:3:6:3:4:4:4:2:2:11:7:4:4:4:6:4', endOnFailure: true }
    );
  });

  it('I1 thin data is never better: PARTIAL thinning, any mask (D-42)', () => {
    fc.assert(fc.property(inputsArb, checkArb, fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }), partialThinning), { numRuns: 100, seed: 0x0542 });
  });

  it('I3 uncertain income is not cash: removing pending income never improves the code', () => {
    fc.assert(
      fc.property(
        recordedInputsArb,
        checkArb,
        fc.integer({ min: 100, max: 2_000_000 }),
        fc.boolean(),
        (inputs, check, amount, expected) => {
          const ym = currentMonth(inputs);
          const line: V3Line = v3Line({ id: 'arb-pending', date: `${ym}-28`, amount, role: 'income', status: 'pending', expected });
          const withLine: V3Inputs = {
            ...inputs,
            months: inputs.months.map((m) => (m.month === ym ? { ...m, lines: [...m.lines, line] } : m)),
          };
          const before = evaluate(withLine, check).result;
          const without = evaluate(inputs, check).result;
          expect(codeRank(without.code)).toBeLessThanOrEqual(codeRank(before.code));
          // An unexpected pending line is not cash at all.
          const unmarked: V3Inputs = {
            ...inputs,
            months: inputs.months.map((m) => (m.month === ym ? { ...m, lines: [...m.lines, { ...line, expected: false }] } : m)),
          };
          expect(evaluate(unmarked, check).result).toEqual(without);
        }
      ),
      RUNS
    );
  });

  it('I4 the month is separate from the purchase: notices are present when typicalLeft or monthLeft is below zero', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const ev = evaluate(inputs, check);
        if (ev.month.typicalLeft !== null && ev.month.typicalLeft < 0) expect(has(noticesOf(ev.result), 'typical_short')).toBe(true);
        else expect(has(noticesOf(ev.result), 'typical_short')).toBe(false);
        if (ev.month.monthLeft < 0) expect(has(noticesOf(ev.result), 'month_heading_short')).toBe(true);
        else expect(has(noticesOf(ev.result), 'month_heading_short')).toBe(false);
        // Purchase facts report only the purchase's change: month left after = month left minus what the month funds.
        const fact = ev.result.facts.find((f: Fact) => f.code === 'month_left_after');
        if (fact !== undefined) {
          const fromMonth = ev.result.split.find((s) => s.source === 'month')?.amount ?? 0;
          expect(fact.values.left).toBe(ev.month.monthLeft - fromMonth);
        }
      }),
      RUNS
    );
  });

  it('I4 a short month never changes the code of an unrelated check (notices carry it)', () => {
    // Sam in a month so overspent monthLeft < 0: the notice is there and the cash/ladder decide the code.
    const sam = toV3Inputs(personById('sam'));
    const ym = currentMonth(sam);
    const overspent: V3Inputs = {
      ...sam,
      months: sam.months.map((m) =>
        m.month === ym ? { ...m, lines: [...m.lines, v3Line({ id: 'blow', date: `${ym}-02`, amount: 3_000_000, role: 'spending' })] } : m
      ),
    };
    const ev = evaluate(overspent, checkOnce(10_000));
    expect(ev.month.monthLeft).toBeLessThan(0);
    expect(has(ev.result.notices, 'month_heading_short')).toBe(true);
  });

  it('I5 not enough data: no figures at all is needs_input with no_income_figures, whatever the check', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const bare: V3Inputs = { ...inputs, months: [], series: [], profile: null, rough: null, everydayOverride: null };
        const r = evaluate(bare, check).result;
        expect(r.code).toBe('needs_input');
        expect(r.missing).toContain('no_income_figures');
      }),
      RUNS
    );
  });

  it('I25 condition in title: under 3 months used, every result is rough and says why', () => {
    fc.assert(
      fc.property(recordedInputsArb, checkArb, fc.integer({ min: 0, max: 2 }), (inputs, check, keep) => {
        const ym = currentMonth(inputs);
        const past = inputs.months.filter((m) => m.month < ym).slice(0, keep);
        const cur = inputs.months.filter((m) => m.month >= ym);
        const few: V3Inputs = { ...inputs, months: [...past, ...cur] };
        const ev = evaluate(few, check);
        expect(ev.month.monthsUsed.length).toBeLessThan(3);
        expect(ev.result.confidence.level).toBe('rough');
        expect(ev.result.confidence.reasons).toContain('few_months');
      }),
      RUNS
    );
  });

  it('I25 below Firm every result carries its reasons (a Firm result has none from the month)', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const c = evaluate(inputs, check).result.confidence;
        if (c.level !== 'firm') expect(c.reasons.length).toBeGreaterThan(0);
      }),
      RUNS
    );
  });

  it('I7 unsaved writes are never firm and the freshness notice shows', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, fc.integer({ min: 1, max: 9 }), (inputs, check, n) => {
        const r = evaluate({ ...inputs, unsavedWrites: n }, check).result;
        expect(r.confidence.level).not.toBe('firm');
        expect(r.confidence.reasons).toContain('unsaved_changes');
        const note = r.notices.find((x) => x.code === 'unsaved_changes');
        expect(note?.values.count).toBe(n);
      }),
      RUNS
    );
  });

  it('I19 no double count: earlier money funds at most unspent minus what the month funds, and unspent is the confirmed figure', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const ev = evaluate(inputs, check);
        const u = ev.funds.unspent?.value ?? null;
        const earlier = ev.result.split.find((s) => s.source === 'unspent_earlier')?.amount ?? 0;
        const fromMonth = ev.result.split.find((s) => s.source === 'month')?.amount ?? 0;
        if (earlier > 0) {
          expect(u).not.toBeNull();
          expect(earlier).toBeLessThanOrEqual(Math.max(0, (u as number) - fromMonth));
        }
        // This month's leftover is never added on top of unspent money.
        const fact = ev.result.facts.find((f) => f.code === 'unspent_before_after');
        if (fact !== undefined) {
          expect(fact.values.before).toBe(u);
          expect(fact.values.after).toBe((u as number) - fromMonth - earlier);
        }
        if (ev.result.split.length > 0 && ev.purchase !== null && ev.result.code !== 'emergency_use') {
          const total = ev.result.split.reduce((s, x) => s + x.amount, 0);
          expect(total).toBe(ev.purchase.dayOne);
        }
      }),
      RUNS
    );
  });

  it('I20 rough figures only lower figures for a person with records', () => {
    const roughArb: fc.Arbitrary<RoughFigures> = fc.record({
      income: fc.integer({ min: 0, max: 10_000_000 }).map(mu),
      expenses: fc.integer({ min: 0, max: 10_000_000 }).map(mu),
      saving: fc.integer({ min: 0, max: 1_000_000 }).map(mu),
      debt: fc.integer({ min: 0, max: 1_000_000 }).map(mu),
      invest: fc.integer({ min: 0, max: 1_000_000 }).map(mu),
      asOf: fc.constant('2026-10-03'),
    });
    fc.assert(
      fc.property(recordedInputsArb, roughArb, (inputs, rough) => {
        const check = checkOnce(10_000);
        const before = evaluate({ ...inputs, rough: null }, check);
        const after = evaluate({ ...inputs, rough: { ...rough, asOf: inputs.asOf } }, check);
        expect(after.month.monthLeft).toBeLessThanOrEqual(before.month.monthLeft);
        if (before.month.typicalLeft !== null && after.month.typicalLeft !== null) {
          expect(after.month.typicalLeft).toBeLessThanOrEqual(before.month.typicalLeft);
        }
        expect(after.funds.unspent?.value ?? 0).toBeLessThanOrEqual(before.funds.unspent?.value ?? 0);
      }),
      RUNS
    );
  });

  it('I20 a profile adapter never raises a left or cash figure (variable methods, no typed steady amount)', () => {
    const profileArb = fc.record({
      types: fc.constantFrom(['salary'], ['commission'], ['freelance'], ['salary', 'commission'], ['mix']),
      variable: fc.constantFrom('match' as const, 'spread' as const, 'balance' as const),
      steady: fc.constant(null),
      billsHorizonMonths: fc.constantFrom(null, 1 as const, 2 as const, 3 as const),
    });
    const persons = loadPersons().filter((p) => p.months.length > 0 && p.profile?.variable !== 'steady');
    fc.assert(
      fc.property(fc.constantFrom(...persons.map((p) => p.id)), profileArb, (id, profile) => {
        const inputs = toV3Inputs(personById(id));
        const check = checkOnce(10_000);
        const base = evaluate({ ...inputs, profile: null }, check);
        const adapted = evaluate({ ...inputs, profile: { ...profile, types: [...profile.types] } as V3Inputs['profile'] }, check);
        expect(adapted.month.monthLeft).toBeLessThanOrEqual(base.month.monthLeft);
      }),
      RUNS
    );
  });

  it('I29 no silent fallback: each fallback emits its reason code', () => {
    // band currency fallback and band rate missing
    const sam = toV3Inputs(personById('sam'));
    const fallback = evaluate({ ...sam, thresholds: { ...sam.thresholds, source: 'fallback' } }, checkOnce(15_000)).result;
    expect(fallback.reasons).toContain('band_currency_fallback');
    const missing = evaluate({ ...sam, thresholds: { ...sam.thresholds, bandEdges: [], source: 'missing' } }, checkOnce(15_000)).result;
    expect(missing.reasons).toContain('band_rate_missing');
    expect(missing.band).toBe(15);
    // typical-choice default: a yearly bill the user has not chosen for
    const yearly = v3Series({ id: 'ins', role: 'bill', cadence: { unit: 'month', every: 12 }, anchorDate: '2026-02-01', amount: 120_000 });
    const defaulted = evaluate({ ...sam, series: [...sam.series, yearly] }, checkOnce(15_000)).result;
    expect(defaulted.reasons).toContain('typical_choice_defaulted');
    expect(has(defaulted.notices, 'yearly_bill_choice_needed')).toBe(true);
    const chosen = evaluate({ ...sam, series: [...sam.series, { ...yearly, typicalChoice: 'monthly' }] }, checkOnce(15_000)).result;
    expect(chosen.reasons).not.toContain('typical_choice_defaulted');
    // missed pay: this month's pay has no line and the user answered not yet (D-58)
    const late: V3Inputs = {
      ...sam,
      asOf: '2026-10-20',
      payArrivals: [{ seriesId: 'sam-pay', date: '2026-10-01', arrived: false }], // D-58: the reason appears once the user says not yet
      months: sam.months.map((m) => (m.month === '2026-10' ? { ...m, lines: m.lines.filter((l) => l.id !== 'sam-pay-10') } : m)),
    };
    const missed = evaluate(late, checkOnce(15_000)).result;
    expect(missed.reasons).toContain('missed_pay_excluded');
    // a custom item type that is no longer there
    const gone: CheckV2 = checkOnce(15_000, { itemType: { kind: 'custom', id: 'deleted-type' } });
    expect(evaluate(sam, gone).result.reasons).toContain('custom_option_missing');
  });

  it('I29 band fallback reasons hold for any check', () => {
    fc.assert(
      fc.property(inputsArb, priceArb, (inputs, price) => {
        const check = checkOnce(price);
        const f = evaluate({ ...inputs, thresholds: { ...inputs.thresholds, source: 'fallback' } }, check).result;
        if (f.band !== null) expect(f.reasons).toContain('band_currency_fallback');
        const m = evaluate({ ...inputs, thresholds: { ...inputs.thresholds, bandEdges: [], source: 'missing' } }, check).result;
        if (m.band !== null) expect(m.reasons).toContain('band_rate_missing');
      }),
      RUNS
    );
  });

  it('I31 emergency locked end to end: with the flag off, a fund of $0 or $1M gives the same Result except its amount', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const off: CheckV2 = { ...check, emergency: false };
        const zero = evaluate(withFund(inputs, 0), off).result;
        const million = evaluate(withFund(inputs, 100_000_000), off).result;
        // D-43, D-54: the fund is out of the spending balance, so the suggested figure, drift, notices and confidence do not
        // move with it. Only the fund's own line (emergency_untouched) carries its amount.
        const norm = (r: Result): Result => ({
          ...r,
          facts: r.facts.map((f) => (f.code === 'emergency_untouched' ? { ...f, values: { amount: 0 } } : f)),
        });
        expect(norm(million)).toEqual(norm(zero));
        expect(million.code).not.toBe('emergency_use');
      }),
      { numRuns: 60, seed: 0x0543 }
    );
  });

  it('I31 a fund that is not set differs only by the emergency notice and fact', () => {
    fc.assert(
      fc.property(inputsArb, checkArb, (inputs, check) => {
        const off: CheckV2 = { ...check, emergency: false };
        const none = evaluate(withFund(inputs, null), off).result;
        const set = evaluate(withFund(inputs, 500_000), off).result;
        expect(none.code).toBe(set.code);
        expect(none.split).toEqual(set.split);
        expect(none.readyBy).toEqual(set.readyBy);
        expect(none.variant).toEqual(set.variant);
        expect(none.confidence).toEqual(set.confidence);
        const rest = (r: Result) => r.notices.filter((n) => n.code !== 'emergency_not_set');
        expect(rest(none)).toEqual(rest(set));
      }),
      { numRuns: 60, seed: 0x0544 }
    );
  });

  it('D-62 exception: an unlinked fund is subtracted, so its amount may move drift', () => {
    const sam = toV3Inputs(personById('sam'));
    const unlinked = (amount: number): V3Inputs => ({
      ...sam,
      emergency: { amount: mu(amount), accountId: null },
    });
    const none = evaluate(unlinked(0), checkOnce(1000)).funds;
    const big = evaluate(unlinked(300_000), checkOnce(1000)).funds;
    expect(big.fundUnlinked).toBe(true);
    expect(none.suggested - big.suggested).toBe(300_000);
  });

  it('I38 purpose never changes the maths when the check is not an emergency', () => {
    fc.assert(
      fc.property(inputsArb, shapeArb, priceArb, (inputs, shape, price) => {
        const results = PURPOSES.map((purpose) => evaluate(inputs, checkOf(price, { ...shape, purpose, emergency: false })).result);
        for (const r of results) expect(r).toEqual(results[0]);
      }),
      RUNS
    );
  });

  it('I38 only necessity and for-work can reach emergency_use; a custom purpose never can (D-19)', () => {
    fc.assert(
      fc.property(inputsArb, shapeArb, priceArb, fc.constantFrom(...PURPOSES), (inputs, shape, price, purpose) => {
        const big = { ...inputs, emergency: { amount: mu(100_000_000) } };
        const r = evaluate(big, checkOf(price, { ...shape, purpose, emergency: true })).result;
        const allowed = purpose !== null && purpose.kind === 'preset' && (purpose.value === 'necessity' || purpose.value === 'for_work');
        if (!allowed) {
          expect(r.code).not.toBe('emergency_use');
          expect(r.split.some((s) => s.source === 'emergency')).toBe(false);
        }
        if (purpose !== null && purpose.kind === 'custom') expect(purpose.id).toBe(CUSTOM_PURPOSE_ID);
      }),
      RUNS
    );
  });
});
