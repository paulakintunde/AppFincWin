// 06-10 (D-02, criteria 7 and 8): Decide's builder reads goals, the safety net and debts through the Grow connection points only.
import { evaluate, readStoredCheck, type CheckV2, type V3Inputs } from '@/engine/decide/v3';
import { debtToV3Debt, envelopesOf, goalPointsOf } from '@/features/grow/connect';
import { makeConverter } from '../../conversion';
import { carInputs, demoSource, sofaInputs } from '../../../__tests__/helpers/demoScenario';
import type { SnapshotSource } from '../../buildSnapshot';
import { buildV3Inputs } from '../buildV3Inputs';
import type { V3SettingsSource } from '../types';
import baseline from './growConnect.baseline.json';
import { scenarios, SETTINGS, TODAY, USES } from './growScenarios';

type Goal = SnapshotSource['goals'][number];
const NEW_FACTS = new Set(['locked_goals_kept', 'net_and_goals_kept', 'unlocked_goals_counted']);
const checks = [sofaInputs, carInputs].map((s) => readStoredCheck(s).check as CheckV2);
const SOFA = checks[0]!;
const plain = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)));

/** The old fixtures carried no goal names (a null name); the connection point carries an empty one. Same meaning. */
const unblank = (x: unknown): unknown => JSON.parse(JSON.stringify(x), (k, v) => (k === 'name' && v === '' ? null : v));

const net = (over: Partial<Goal> = {}): Goal => ({
  id: 'net', name: 'Safety net', kind: 'pot', check_id: null, currency: 'USD', target: 230000, monthly_amount: null, ready_by: null,
  opening_saved: 130000, done_at: null, deleted_at: null, account_id: 'demo-acct-savings', is_safety_net: true, locked: true, protect: true, ...over,
});
const withGoals = (goals: Goal[], base: SnapshotSource = demoSource(TODAY)): SnapshotSource => ({ ...base, goals });
const build = (source: SnapshotSource, v3: V3SettingsSource = SETTINGS): V3Inputs => buildV3Inputs(source, v3, undefined, USES);

describe('06-10 the builder keeps every existing answer (T-06-10-03)', () => {
  it.each(scenarios().map((s) => [s.name, s] as const))('%s: same numbers, code and variant; only the three D-06 facts may be added', (name, s) => {
    const expected = (baseline as Record<string, { debts: unknown; results: { result: Record<string, unknown>; funds: Record<string, unknown> }[] }>)[name]!;
    const inputs = build(s.source);
    expect(plain(inputs.debts)).toEqual(expected.debts);
    checks.forEach((c, n) => {
      const got = evaluate(inputs, c);
      const result = unblank(plain(got.result)) as Record<string, unknown>;
      const facts = (result.facts as { code: string }[]).filter((f) => !NEW_FACTS.has(f.code));
      // With no safety-net goal the net record is absent, so the engine says "emergency not set" (true, and it was unsaid before).
      const notices = (result.notices as { code: string }[]).filter((x) => x.code !== 'emergency_not_set');
      expect({ ...result, facts, notices }).toEqual(expected.results[n]!.result);
      const { lockedNamedSaved: _l, unlockedSaved: _u, ...funds } = plain(got.funds) as Record<string, unknown>;
      const { lockedNamedSaved: _el, unlockedSaved: _eu, ...expectedFunds } = expected.results[n]!.funds;
      expect(funds).toEqual(expectedFunds);
    });
  });

  it('a verdict case: the baseline holds real answers, not only needs-input', () => {
    const codes = Object.values(baseline as Record<string, { results: { result: { code: string } }[] }>).flatMap((s) => s.results.map((r) => r.result.code));
    expect(codes).toContain('fits_unspent');
  });
});

describe('06-10 safety net comes from the flagged goal only (criterion 7)', () => {
  it('a flagged goal gives the net and the emergency fund', () => {
    const i = build(withGoals([net()]));
    expect(i.safetyNet).toEqual({ protect: true, size: 230000, saved: 130000, locked: true });
    expect(i.emergency).toEqual({ amount: 130000, accountId: 'demo-acct-savings' });
  });

  it('the safety-net goal is not an envelope', () => {
    expect(build(withGoals([net()])).envelopes).toEqual([]);
  });

  it('changing the goal size changes the net and the next answer', () => {
    const before = build(withGoals([net()]));
    const after = build(withGoals([net({ target: 277500 })]));
    expect(after.safetyNet?.size).toBe(277500);
    const a = evaluate(before, SOFA);
    const b = evaluate(after, SOFA);
    expect(a.net?.size).toBe(230000);
    expect(b.net?.size).toBe(277500);
    expect(plain(b.result)).not.toEqual(plain(a.result));
  });

  it('the interim settings columns and the typed reserve are ignored entirely', () => {
    const source = withGoals([net()]);
    const loud = { ...SETTINGS, safety_net_size: 999, safety_net_protect: false, safety_net_locked: false, reserve_account_id: 'demo-acct-cash' } as V3SettingsSource;
    const withReserve: SnapshotSource = { ...source, settings: { ...source.settings!, reserve: 5000 } };
    expect(plain(build(withReserve, loud))).toEqual(plain(build(source)));
  });

  it('no flagged goal: no net and no emergency fund, whatever the old columns hold', () => {
    const source = demoSource(TODAY);
    const loud = { ...SETTINGS, safety_net_size: 999 } as V3SettingsSource;
    const withReserve: SnapshotSource = { ...source, settings: { ...source.settings!, reserve: 5000 } };
    const i = build(withReserve, loud);
    expect(i.safetyNet).toBeNull();
    expect(i.emergency).toBeNull();
  });

  it('a deleted flagged goal is no net', () => {
    expect(build(withGoals([net({ deleted_at: '2026-09-01T00:00:00Z' })])).safetyNet).toBeNull();
  });
});

describe('06-10 envelopes, debts and holdings', () => {
  const lisbon: Goal = { id: 'g-lisbon', name: 'Lisbon', kind: 'pot', check_id: null, currency: 'USD', target: 640000, monthly_amount: 5000, ready_by: null, opening_saved: 64000, done_at: null, deleted_at: null, locked: false };

  it('envelopes equal envelopesOf(goalPointsOf(...)) with an explicit locked', () => {
    const source = withGoals([lisbon, net()]);
    const toHome = makeConverter({ home: source.homeCurrency, rates: source.rates, customs: source.customCurrencies, today: TODAY }).toHome;
    const expected = envelopesOf(goalPointsOf(source.goals as never, source.rows, toHome));
    const got = build(source).envelopes;
    expect(got).toEqual(expected);
    expect(got).toHaveLength(1);
    expect(got[0]!.locked).toBe(false);
  });

  it('a goal with no stored locked flag reads as locked', () => {
    const { locked: _drop, ...bare } = lisbon;
    expect(build(withGoals([bare])).envelopes[0]!.locked).toBe(true);
  });

  it('debts equal debtToV3Debt for each built debt', () => {
    const source = demoSource(TODAY);
    const got = build(source).debts;
    expect(got.length).toBeGreaterThan(0);
    const kindOf = (id: string): string => source.accounts.find((a) => a.id === id)?.kind ?? '';
    for (const d of got) {
      const row = source.debts.find((r) => r.id === d.id);
      const card = source.debts.find((r) => r.deleted_at === null && r.kind === 'card' && r.account_id === d.id);
      expect(d).toEqual(debtToV3Debt({ id: d.id, balance: d.balance, minimumPayment: d.minimum, apr: d.apr, secured: d.secured }, row, card, kindOf));
    }
  });

  it('Decide receives no holdings: neither the inputs nor the source carry any (D-11)', () => {
    const i = build(withGoals([lisbon, net()]));
    expect(Object.keys(i).filter((k) => /holding/i.test(k))).toEqual([]);
    expect(Object.keys(demoSource(TODAY)).filter((k) => /holding/i.test(k))).toEqual([]);
  });
});
