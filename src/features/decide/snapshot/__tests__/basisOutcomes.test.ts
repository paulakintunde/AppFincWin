// 05-144 (D-107, DCU-40): the outcome of one check on each basis, computed in computeDetails only.
import { minorUnits } from '@/engine/money';
import { decide } from '@/engine/decide';
import type { BuyCheck, StackedCheckInput } from '@/engine/decide';
import * as decisionModule from '@/engine/decide/decision';
import { computeCheck, computeCore, computeDetails } from '../computeCheck';
import { emptyCheckInputs, toEngineCheck } from '../checkInputs';
import type { CheckInputs, SnapshotResult } from '../types';
import { CARD_CHOICE, TODAY, USD, loggedSource, month, noneSource, roughSource, unconvertedSource } from './helpers/snapshotFixtures';

const CTX = { currency: USD, cards: [CARD_CHOICE], dealerCap: minorUnits(5_000_000) };

function buy(over: Partial<CheckInputs> = {}): CheckInputs {
  return { ...emptyCheckInputs('buy', TODAY), name: 'Laptop', advertised: 150_000, method: 'cash', ...over };
}
const INST = { ...emptyCheckInputs('buy', TODAY).instalment, amount: 15_000, count: 12 };
function other(price: number): StackedCheckInput {
  const r = toEngineCheck(buy({ advertised: price, method: 'instalment', instalment: { ...INST, amount: 30_000 } }), CTX);
  if (!r.ok) throw new Error('other check');
  return { check: r.check, purchaseRule: null };
}
// the last month spends far more than the others, so the worst and average bases give different figures
const MONTHS = [month('2026-06', 500_000, 200_000), month('2026-07', 500_000, 200_000), month('2026-08', 500_000, 200_000), month('2026-09', 500_000, 480_000)];
function src(basisOverride: 'month' | 'worst' | 'average' | null, extra: Record<string, unknown> = {}): SnapshotResult {
  return { ...loggedSource({ months: MONTHS, basisOverride }), ...extra } as SnapshotResult;
}
afterEach(() => jest.restoreAllMocks());

describe('D-107 basis outcomes', () => {
  it('D-107 each basis gives its own state and month figure for the same check', () => {
    const inputs = buy({ advertised: 700_000 });
    const out = computeCheck(src('worst', { judgeOn: 'worst' }), inputs).basisOutcomes!;
    expect(out.rows.map((r) => r.basis)).toEqual(['month', 'worst', 'average']);
    const snap = (src('worst') as Extract<SnapshotResult, { kind: 'logged' }>).snapshot;
    const check = (toEngineCheck(inputs, CTX) as { ok: true; check: BuyCheck }).check;
    for (const row of out.rows) {
      const v = decide({ ...snap, basisOverride: row.basis }, check, []).verdict;
      if (v.state === 'missing') throw new Error('verdict');
      expect(row.state).toBe(v.state);
      expect(row.left).toBe(v.left);
    }
    expect(out.rows[1]!.left).not.toBe(out.rows[2]!.left);
  });

  it("D-107 the chosen row reuses the check's own verdict", () => {
    const inputs = buy();
    const spy = jest.spyOn(decisionModule, 'decide');
    const core = computeCore(src('worst', { judgeOn: 'worst' }), inputs);
    expect(spy).toHaveBeenCalledTimes(1);
    const details = computeDetails(core, inputs);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(details.basisOutcomes!.rows[1]!.left).toBe((core.verdict as { left: number }).left);
    const fb = computeCore(src('worst', { judgeOn: 'month', monthFallback: { currencies: ['EUR'] } }), inputs);
    spy.mockClear();
    computeDetails(fb, inputs);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("D-107 the chosen mark follows judgeOn, and the verdict context's basis when judgeOn is absent", () => {
    const inputs = buy();
    const chosen = (r: SnapshotResult): string[] => computeCheck(r, inputs).basisOutcomes!.rows.filter((x) => x.chosen).map((x) => x.basis);
    expect(chosen(src('average', { judgeOn: 'average' }))).toEqual(['average']);
    expect(chosen(src('month', { judgeOn: 'month' }))).toEqual(['month']);
    expect(chosen(src('worst'))).toEqual(['worst']);
    expect(chosen(src(null))).toHaveLength(1);
  });

  it('D-107 with the month fallback the month row shows the worst result and the waiting currencies, and the mark stays on month', () => {
    const inputs = buy({ advertised: 700_000 });
    const out = computeCheck(src('worst', { judgeOn: 'month', monthFallback: { currencies: ['EUR'] } }), inputs).basisOutcomes!;
    const [m, w, a] = out.rows;
    expect(m!.left).toBe(w!.left);
    expect(m!.state).toBe(w!.state);
    expect(m!.waitingCurrencies).toEqual(['EUR']);
    expect(w!.waitingCurrencies).toBeNull();
    expect(a!.waitingCurrencies).toBeNull();
    expect(out.rows.map((r) => r.chosen)).toEqual([true, false, false]);
  });

  it('D-107 stacked other checks and combine=false are honoured in every row', () => {
    const others = [other(360_000)];
    const alone = computeCheck(src('worst', { judgeOn: 'worst' }), buy({ advertised: 150_000, method: 'instalment', instalment: INST }), []).basisOutcomes!;
    const stacked = computeCheck(src('worst', { judgeOn: 'worst' }), buy({ advertised: 150_000, method: 'instalment', instalment: INST }), others).basisOutcomes!;
    const off = computeCheck(src('worst', { judgeOn: 'worst' }), buy({ advertised: 150_000, method: 'instalment', instalment: INST, combine: false }), others).basisOutcomes!;
    stacked.rows.forEach((r, i) => expect(r.left).toBeLessThanOrEqual(alone.rows[i]!.left));
    expect(stacked.rows.map((r) => r.left)).not.toEqual(alone.rows.map((r) => r.left));
    expect(off).toEqual(alone);
  });

  it('D-107 an invest check gets the three rows', () => {
    const inputs = { ...emptyCheckInputs('invest', TODAY), name: 'Fund', advertised: 20_000, method: 'monthly' as const, investTermMonths: 24 };
    expect(computeCheck(src('worst', { judgeOn: 'worst' }), inputs).basisOutcomes!.rows).toHaveLength(3);
  });

  it('D-107 null for first read, none, unconverted, incomplete and a missing verdict', () => {
    const inputs = buy();
    expect(computeCheck(roughSource(), inputs).basisOutcomes).toBeNull();
    expect(computeCheck(noneSource(), inputs).basisOutcomes).toBeNull();
    expect(computeCheck(unconvertedSource(), inputs).basisOutcomes).toBeNull();
    expect(computeCheck(src('worst'), buy({ advertised: null })).basisOutcomes).toBeNull();
    expect(computeCheck(loggedSource({ months: [], basisOverride: null }), inputs).basisOutcomes).toBeNull();
  });

  it('D-107 a variant that comes back missing makes the whole result null', () => {
    const inputs = buy();
    const core = computeCore(src('worst', { judgeOn: 'worst' }), inputs);
    const real = decisionModule.decide;
    jest.spyOn(decisionModule, 'decide').mockImplementation((s, c, o) => {
      const d = real(s, c, o);
      return s.basisOverride === 'average' ? { ...d, verdict: { state: 'missing', size: null } as never } : d;
    });
    expect(computeDetails(core, inputs).basisOutcomes).toBeNull();
  });

  it('D-107 a core with no engine handle gives null', () => {
    const inputs = buy();
    const { engineRun: _run, ...bare } = computeCore(src('worst', { judgeOn: 'worst' }), inputs);
    expect(computeDetails(bare, inputs).basisOutcomes).toBeNull();
  });

  it('D-107 computeCore does not compute it', () => {
    const core = computeCore(src('worst', { judgeOn: 'worst' }), buy());
    expect(core.basisOutcomes).toBeUndefined();
  });

  it('D-107 the figures are in minor units and equal verdict.left of each decide()', () => {
    const rows = computeCheck(src('worst', { judgeOn: 'worst' }), buy()).basisOutcomes!.rows;
    rows.forEach((r) => expect(Number.isInteger(r.left)).toBe(true));
  });

  it('D-107 no engine object or handle leaks into the returned computation', () => {
    const details = computeCheck(src('worst', { judgeOn: 'worst' }), buy());
    expect(Object.keys(details)).not.toContain('engineRun');
    expect(Object.keys(details)).not.toContain('inputs');
  });
});
