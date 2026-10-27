/**
 * Arbitraries for the end-to-end invariant suites (05.1-27, SC-6). Test helper, not a suite.
 * Everything is built on the golden persons: a person is picked, then perturbed (everyday lines scaled, balance shifted,
 * unspent anchor toggled, emergency fund set, extra everyday lines). Every draw is deterministic given fast-check's seed.
 */
import fc from 'fast-check';
import { minorUnits, type MinorUnits } from '../../../../money/types';
import { percent } from '../../../../payoff/types';
import { CODE_PRECEDENCE } from '../../constants';
import type { CheckV2, Code, FirstPayment, PayV2, Purpose, V3Inputs } from '../../types';
import { loadPersons, toV3Inputs, type FixturePerson } from '../golden/adapter';
import { checkOnce, checkPlan } from '../helpers/fixtures';

export const mu = (n: number): MinorUnits => minorUnits(n);

/** Lower = stricter. "Never better" means rank(after) <= rank(before) in the direction of the change. */
export function codeRank(code: Code): number {
  return CODE_PRECEDENCE.indexOf(code);
}

export const PERSON_IDS: readonly string[] = loadPersons().map((p) => p.id);
export const RECORDED_IDS: readonly string[] = loadPersons().filter((p) => p.months.length > 0).map((p) => p.id);

export const CUSTOM_PURPOSE_ID = 'my-purpose';

export interface Tweak {
  readonly everydayPct: number; // 50..150
  readonly balancePct: number; // 50..150
  readonly unspentMode: 'keep' | 'none' | 'anchor';
  readonly unspentPct: number; // 0..100 of the balance, for 'anchor'
  readonly emergency: number | null;
  readonly extras: readonly { readonly day: number; readonly amount: number }[];
}

export const tweakArb: fc.Arbitrary<Tweak> = fc.record({
  everydayPct: fc.integer({ min: 50, max: 150 }),
  balancePct: fc.integer({ min: 50, max: 150 }),
  unspentMode: fc.constantFrom('keep' as const, 'none' as const, 'anchor' as const),
  unspentPct: fc.integer({ min: 0, max: 100 }),
  emergency: fc.option(fc.integer({ min: 0, max: 100_000_000 }), { nil: null }),
  extras: fc.array(fc.record({ day: fc.integer({ min: 1, max: 28 }), amount: fc.integer({ min: 100, max: 50_000 }) }), { maxLength: 2 }),
});

const scale = (n: number, pct: number): number => Math.round((n * pct) / 100);

export function perturbPerson(base: FixturePerson, t: Tweak): FixturePerson {
  const ym = base.asOf.slice(0, 7);
  const asOfDay = Number(base.asOf.slice(8, 10));
  const months = base.months.map((m) => ({
    ...m,
    lines: m.lines.map((l) => (l.role === 'spending' && !l.seriesId ? { ...l, amount: Math.max(1, scale(l.amount, t.everydayPct)) } : l)),
  }));
  const withExtras = months.map((m) =>
    m.month === ym
      ? {
          ...m,
          lines: [
            ...m.lines,
            ...t.extras.map((x, i) => ({
              id: `arb-extra-${i}`,
              date: `${ym}-${String(Math.min(x.day, asOfDay)).padStart(2, '0')}`,
              amount: x.amount,
              role: 'spending' as const,
            })),
          ],
        }
      : m
  );
  const balance = scale(base.balance, t.balancePct);
  let unspent = base.unspent;
  if (t.unspentMode === 'none') unspent = null;
  else if (t.unspentMode === 'anchor') unspent = { amount: scale(balance, t.unspentPct), at: base.asOf };
  return { ...base, months: withExtras, balance, unspent, emergency: t.emergency };
}

export function inputsOfPerson(id: string, t: Tweak): V3Inputs {
  const base = loadPersons().find((p) => p.id === id);
  if (!base) throw new RangeError(`no fixture person ${id}`);
  return toV3Inputs(perturbPerson(base, t), { custom: { itemTypes: [], purposes: [{ id: CUSTOM_PURPOSE_ID }], cadences: [], incomeKinds: [] } });
}

export const inputsArb: fc.Arbitrary<V3Inputs> = fc.tuple(fc.constantFrom(...PERSON_IDS), tweakArb).map(([id, t]) => inputsOfPerson(id, t));
export const recordedInputsArb: fc.Arbitrary<V3Inputs> = fc.tuple(fc.constantFrom(...RECORDED_IDS), tweakArb).map(([id, t]) => inputsOfPerson(id, t));

const CADENCES = [
  { unit: 'week', every: 1 },
  { unit: 'week', every: 2 },
  { unit: 'month', every: 1 },
  { unit: 'month', every: 3 },
  { unit: 'month', every: 12 },
] as const;

const cadenceArb = fc.oneof(
  fc.constantFrom(...CADENCES),
  fc.record({ unit: fc.constantFrom('week' as const, 'month' as const), every: fc.integer({ min: 1, max: 12 }) })
);

const firstPaymentArb: fc.Arbitrary<FirstPayment> = fc.constantFrom({ kind: 'today' } as const, { kind: 'one_period' } as const);

export const PURPOSES: readonly (Purpose | null)[] = [
  null,
  { kind: 'preset', value: 'invest_in_me' },
  { kind: 'preset', value: 'for_work' },
  { kind: 'preset', value: 'necessity' },
  { kind: 'preset', value: 'nice_to_have' },
  { kind: 'preset', value: 'treat' },
  { kind: 'preset', value: 'luxury' },
  { kind: 'custom', id: CUSTOM_PURPOSE_ID },
];
export const purposeArb: fc.Arbitrary<Purpose | null> = fc.constantFrom(...PURPOSES);

export const planPayArb: fc.Arbitrary<Partial<Extract<PayV2, { mode: 'plan' }>>> = fc.record({
  cadence: cadenceArb,
  count: fc.integer({ min: 1, max: 60 }),
  apr: fc.integer({ min: 0, max: 30 }).map((n) => percent(String(n))),
  firstPayment: firstPaymentArb,
});

export const priceArb: fc.Arbitrary<number> = fc.integer({ min: 100, max: 10_000_000 });

export interface CheckShape {
  readonly plan: Partial<Extract<PayV2, { mode: 'plan' }>> | null;
  readonly purpose: Purpose | null;
  readonly emergency: boolean;
}

export const shapeArb: fc.Arbitrary<CheckShape> = fc.record({
  plan: fc.option(planPayArb, { nil: null }),
  purpose: purposeArb,
  emergency: fc.boolean(),
});

export function checkOf(price: number, s: CheckShape): CheckV2 {
  const over: Partial<CheckV2> = { purpose: s.purpose, emergency: s.emergency };
  return s.plan === null ? checkOnce(price, over) : checkPlan(price, s.plan, over);
}

/** A check: once or plan, price 100..1e7, purpose, emergency flag. */
export const checkArb: fc.Arbitrary<CheckV2> = fc.tuple(priceArb, shapeArb).map(([p, s]) => checkOf(p, s));

/**
 * A recorded person with every pay series moved to a late-month pay day (20..28), its paid lines re-dated to that day in
 * each history month, and asOf on either side of the pay day (05.1-41, I13 residual). The current month keeps its pay
 * line only when the pay day has already passed; lines dated after the new asOf are dropped so the month stays honest.
 * Pure: every draw comes from fast-check.
 */
export const latePayInputsArb: fc.Arbitrary<V3Inputs> = fc
  .tuple(fc.constantFrom(...RECORDED_IDS), tweakArb, fc.integer({ min: 20, max: 28 }), fc.integer({ min: 1, max: 27 }))
  .map(([id, t, payDay, rawDay]) => {
    const base = loadPersons().find((p) => p.id === id);
    if (!base) throw new RangeError(`no fixture person ${id}`);
    const person = perturbPerson(base, t);
    const asOfDay = rawDay >= payDay ? rawDay + 1 : rawDay; // 1..28 excluding payDay: both sides of payday
    const ym = person.asOf.slice(0, 7);
    const asOf = `${ym}-${String(asOfDay).padStart(2, '0')}`;
    const pad = (d: number): string => String(d).padStart(2, '0');
    const paySeries = new Set(person.series.filter((s) => s.role === 'pay').map((s) => s.id));
    const series = person.series.map((s) => (s.role === 'pay' ? { ...s, anchorDate: `${s.anchorDate.slice(0, 8)}${pad(payDay)}` } : s));
    const months = person.months.map((m) => ({
      ...m,
      lines: m.lines
        .map((l) => (l.seriesId && paySeries.has(l.seriesId) ? { ...l, date: `${l.date.slice(0, 8)}${pad(payDay)}` } : l))
        .filter((l) => (m.month === ym ? l.date <= asOf : true)),
    }));
    const unspent = person.unspent === null ? null : { ...person.unspent, at: asOf };
    return toV3Inputs({ ...person, asOf, series, months, unspent }, { custom: { itemTypes: [], purposes: [{ id: CUSTOM_PURPOSE_ID }], cadences: [], incomeKinds: [] } });
  });
