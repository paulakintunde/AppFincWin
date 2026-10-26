import { evaluate } from '../evaluate';
import { minorUnits } from '../../../money/types';
import type { CustomOptions, ReasonCode, V3Inputs } from '../types';
import extraFile from './golden/extra-d18.json';
import scenariosFile from './golden/scenarios22.json';
import {
  personById,
  resolveScenarioPerson,
  toCheckV2,
  toV3Inputs,
  type FixtureExpect,
  type FixtureScenario,
} from './golden/adapter';

type Scenario = Omit<FixtureScenario, 'expect'> & { expect: FixtureExpect & { reasons?: ReasonCode[] } };

const SCENARIOS = (scenariosFile as unknown as { scenarios: Scenario[] }).scenarios;
const EXTRAS = (extraFile as unknown as { scenarios: Scenario[] }).scenarios;

/**
 * Situation 22 asks for the dog's food as a monthly running cost. 'food' is not a library question, so the situation
 * is run with the user's own item type: base general, one own monthly cash question 'food' (D-19).
 */
const OWN_PET: CustomOptions = {
  itemTypes: [
    { id: 'pet', base: 'general', questionIds: [], ownQuestions: [{ id: 'food', label: 'Food', cadence: 'monthly', cash: true }] },
  ],
  purposes: [],
  cadences: [],
  incomeKinds: [],
};

function run(s: Scenario) {
  const person = resolveScenarioPerson(s as FixtureScenario);
  const own = s.id === '22';
  // Situation 14: Jordan's persona balance (100,000) cannot carry the rest of October (Erest 100,000 + 15,000), so the cash
  // check would answer payday before the month does. The month is under test: run it with a balance that carries it.
  // Not in the fixture JSON because the D-14 legacy baseline is recorded against that fixture.
  const over: Partial<V3Inputs> = own ? { custom: OWN_PET } : s.id === '14' ? { balance: minorUnits(300000) } : {};
  const inputs = toV3Inputs(person, over);
  const check = toCheckV2(s.purchase);
  return evaluate(inputs, own ? { ...check, itemType: { kind: 'custom', id: 'pet' } } : check);
}

/** Exact equality: the engine is integer-exact (T-05.1-52). Only what the fixture lists is checked. */
function expectMatches(s: Scenario): void {
  const e = s.expect;
  const ev = run(s);
  const r = ev.result;
  expect(r.code).toBe(e.code);
  expect(r.variant).toBe(e.variant ?? null);
  expect(r.legacyState).toBe(e.legacyState);
  if (e.readyBy !== undefined) expect(r.readyBy).toEqual(e.readyBy);
  if (e.band !== undefined) expect(r.band).toBe(e.band);
  if (e.split !== undefined) expect(r.split.map((x) => ({ source: x.source, amount: x.amount }))).toEqual(e.split);
  for (const f of e.facts ?? []) expect(r.facts.map((x) => x.code)).toContain(f);
  for (const n of e.notices ?? []) expect(r.notices.map((x) => x.code)).toContain(n);
  for (const m of e.missing ?? []) expect(r.missing).toContain(m);
  for (const x of e.reasons ?? []) expect(r.reasons).toContain(x);
  const m = e.month;
  if (m) {
    if (m.moneyIn !== undefined) expect(ev.month.moneyIn).toBe(m.moneyIn);
    if (m.moneyOut !== undefined) expect(ev.month.moneyOut).toBe(m.moneyOut);
    if (m.monthLeft !== undefined) expect(ev.month.monthLeft).toBe(m.monthLeft);
    if (m.e !== undefined) expect(ev.month.e).toBe(m.e);
    if (m.typicalLeft !== undefined) expect(ev.month.typicalLeft).toBe(m.typicalLeft);
    if (m.lowLeft !== undefined) expect(ev.month.low?.left).toBe(m.lowLeft);
    if (m.lowMonth !== undefined) expect(ev.month.low?.month).toBe(m.lowMonth);
    if (m.erest !== undefined) expect(ev.month.erest).toBe(m.erest);
  }
  if (e.unspentAfter !== undefined) {
    const fact = r.facts.find((f) => f.code === 'unspent_before_after');
    expect(fact).toBeDefined();
    expect(fact?.values.after).toBe(e.unspentAfter);
  }
  if (e.confidence !== undefined) expect(r.confidence.level).toBe(e.confidence);
}

describe('C15 Sam yardstick through evaluate', () => {
  it('Sam with a 0-impact check keeps every untouched figure', () => {
    const sam = toV3Inputs(personById('sam'));
    const s = SCENARIOS.find((x) => x.id === '01') as Scenario;
    const ev = evaluate(sam, toCheckV2({ ...s.purchase, price: 100 }));
    expect(ev.month.monthLeft).toBe(42500);
    expect(ev.month.moneyOut).toBe(357500);
    expect(ev.month.e).toBe(147500);
    expect(ev.month.typicalLeft).toBe(42500);
    expect(ev.month.low?.left).toBe(5000);
    expect(ev.funds.unspent?.value).toBe(240000);
    expect(ev.funds.emergency).toBe(900000);
    const fact = ev.result.facts.find((f) => f.code === 'emergency_untouched');
    expect(fact).toEqual({ code: 'emergency_untouched', values: { amount: 900000 } });
  });
});

describe.each(SCENARIOS)('D-28 v3 §12 #$id $title', (s) => {
  it('matches the expectation', () => {
    expectMatches(s);
  });
});

describe.each(EXTRAS)('D-18 $id $title', (s) => {
  it('matches the expectation', () => {
    expectMatches(s);
  });
});

describe('settled golden questions (05.1-25)', () => {
  const byId = (id: string): Scenario => [...SCENARIOS, ...EXTRAS].find((s) => s.id === id) as Scenario;

  it('02 laptop: judge subtracts the price from unspent; D-18 refund: rolled unspent is the pre-purchase 240,000', () => {
    const laptop = run(byId('02'));
    const after = laptop.result.facts.find((f) => f.code === 'unspent_before_after');
    expect(after).toEqual({ code: 'unspent_before_after', values: { before: 240000, after: 120000 } });
    const refund = run(byId('d18-return-refund'));
    expect(refund.funds.unspent?.value).toBe(240000);
    expect(refund.funds.unspent?.drifted).toBe(false);
    expect(refund.result.facts.find((f) => f.code === 'unspent_before_after')).toEqual({
      code: 'unspent_before_after',
      values: { before: 240000, after: 235000 },
    });
  });

  it('12 Tia as first written (everyday not trimmed) is not_covered: payday needs the 90-day low to stay above zero', () => {
    const s = byId('12');
    const person = resolveScenarioPerson({ ...s, personOverrides: { ...s.personOverrides, everydayOverride: null } } as FixtureScenario);
    const ev = evaluate(toV3Inputs(person), toCheckV2(s.purchase));
    expect(ev.result.code).toBe('not_yet');
    expect(ev.result.variant).toBe('not_covered');
    expect(ev.cash.kind).toBe('not_covered');
  });

  it('18 Kim: other_in without countsAs stays out of money in; 05 Riley carries both notices', () => {
    expect(run(byId('18')).month.moneyIn).toBe(300000);
    const codes = run(byId('05')).result.notices.map((n) => n.code);
    expect(codes).toContain('typical_short');
    expect(codes).toContain('month_heading_short');
  });
});
