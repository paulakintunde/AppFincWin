import { evaluate } from '../evaluate';
import { minorUnits } from '../../../money/types';
import type { CustomOptions, ReasonCode, V3Inputs } from '../types';
import extraFile from './golden/extra-d18.json';
import scenariosFile from './golden/scenarios22.json';
import {
  loadPersons,
  personById,
  resolveScenarioPerson,
  toCheckV2,
  toV3Inputs,
  withMainBalance,
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
  // D-54: the override is the engine's spending balance, so it is stated as the main account (same rule as the adapter).
  const over: Partial<V3Inputs> = own ? { custom: OWN_PET } : {};
  const inputs = toV3Inputs(s.id === '14' ? withMainBalance(person, 300000) : person, over);
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

describe('D-43a the fund never cushions the cash check (D-54)', () => {
  const sam = () => toV3Inputs(personById('sam'));
  const base = () => (SCENARIOS.find((x) => x.id === '01') as Scenario).purchase;
  // Sam: spending 407,500 (total 1,307,500 less the 900,000 fund); the fund is in its own dedicated account.
  it('D-43a a purchase the spending money cannot carry is not_yet although the total balance would cover it', () => {
    const ev = evaluate(sam(), toCheckV2({ ...base(), price: 600_000 }));
    expect(ev.funds.spending).toBe(407_500);
    expect(ev.result.code).toBe('not_yet');
    expect(ev.cash.kind).not.toBe('ok');
  });

  it('D-43a even marked an emergency, a price the spending money cannot carry stays not_yet (the cash check comes first)', () => {
    const ev = evaluate(sam(), toCheckV2({ ...base(), price: 600_000, emergency: true, purpose: 'necessity' }));
    expect(ev.result.code).toBe('not_yet');
  });

  it('D-43a the fund is reached only through the ladder: 200,000 with unspent 10,000 is not covered unmarked, emergency_use when marked a necessity', () => {
    // D-50: 240,000 suggested against 10,000 confirmed is money the records do not explain; the user's answer (kept aside) covers it.
    const low: V3Inputs = {
      ...sam(),
      unspent: { amount: minorUnits(10_000), at: '2026-10-03' },
      unexplainedAnswer: { amount: minorUnits(230_000), use: 'set_aside_for_bill', at: '2026-10-03' },
    };
    const unmarked = evaluate(low, toCheckV2({ ...base(), price: 200_000 }));
    expect(unmarked.cash.kind).toBe('ok'); // 407,500 spending carries it: lowest point 240,000 - 200,000
    expect(unmarked.result.code).toBe('not_yet');
    const marked = evaluate(low, toCheckV2({ ...base(), price: 200_000, emergency: true, purpose: 'necessity' }));
    expect(marked.result.code).toBe('emergency_use');
  });
});

describe('fixtures state a balance that holds their fund and envelopes (no adapter clamp)', () => {
  it('every fixture has balance >= fund + envelopes saved', () => {
    const people = [...loadPersons(), ...[...SCENARIOS, ...EXTRAS].map((s) => resolveScenarioPerson(s as FixtureScenario))];
    for (const p of people) {
      const saved = p.envelopes.reduce((t, e) => t + e.saved, 0);
      expect(p.balance).toBeGreaterThanOrEqual((p.emergency ?? 0) + saved);
    }
  });
});

describe('D-54 stated account uses through evaluate', () => {
  it('Sam with an everyday, a mixed (envelope + 20,000 stated), an untouched, an unstated and a dedicated fund account', () => {
    const base = toV3Inputs(personById('sam'));
    const inputs: V3Inputs = {
      ...base,
      emergency: { amount: minorUnits(900_000), accountId: 'fund' },
      envelopes: [
        { id: 'car', kind: 'pot', target: null, monthlyAmount: null, readyBy: null, saved: minorUnits(50_000), purposeId: null, accountId: 'mix' },
      ],
      accounts: [
        { id: 'main', balance: minorUnits(400_000), use: { kind: 'everyday' } },
        { id: 'mix', balance: minorUnits(200_000), use: { kind: 'mixed', extraSetAside: minorUnits(20_000) } },
        { id: 'sav', balance: minorUnits(5_000_000), use: { kind: 'untouched' } },
        { id: 'old', balance: minorUnits(70_000), use: null },
        { id: 'fund', balance: minorUnits(900_000), use: { kind: 'dedicated', purpose: { kind: 'emergency' } } },
      ],
    };
    const purchase = (SCENARIOS.find((x) => x.id === '01') as Scenario).purchase;
    const ev = evaluate(inputs, toCheckV2({ ...purchase, price: 100 }));
    // spending = 400,000 + (200,000 - 50,000 - 20,000) = 530,000; Sam's bills still due + Erest = 167,500 (407,500 - 240,000)
    expect(ev.funds.spending).toBe(530_000);
    expect(ev.funds.unstatedAccounts).toEqual(['old']);
    expect(ev.funds.suggested).toBe(530_000 - 167_500);
    const withCar = evaluate(inputs, toCheckV2({ ...purchase, price: 100, envelopeId: 'car' }));
    expect(withCar.funds.ownEnvelope).toBe(50_000);
    expect(withCar.cash.kind).toBe('ok');
  });
});
