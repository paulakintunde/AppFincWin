// D-19 / DCU-11: the demo scenario through the real snapshot builder and engine.
import { decide } from '@/engine/decide';
import { buildDecideSnapshot } from '../snapshot/buildSnapshot';
import { computeCheck } from '../snapshot/computeCheck';
import { toEngineCheck } from '../snapshot/checkInputs';
import type { CheckInputs } from '../snapshot/types';
import { carInputs, demoSource, sofaInputs } from './helpers/demoScenario';

const DATES = ['2026-10-15', '2026-11-01', '2026-12-31', '2027-03-15'] as const;

describe.each(DATES)('demo scenario at %s', (today) => {
  const built = buildDecideSnapshot(demoSource(today));
  if (built.kind !== 'logged') throw new Error('demo snapshot must be logged');
  const ctx = { currency: built.currency, cards: built.cards, dealerCap: built.dealerCap };
  const engine = (inputs: CheckInputs) => {
    const r = toEngineCheck(inputs, ctx);
    if (!r.ok) throw new Error('incomplete demo check');
    return r.check;
  };

  it('builds a logged snapshot with six full months and no card line', () => {
    expect(built.meta.fullMonths).toBeGreaterThanOrEqual(6);
    expect(built.unconverted).toBeNull();
    expect(built.conversions).toEqual([]);
    expect(built.meta.cardsWithoutMinimum).toBe(0);
    expect(built.meta.cardsMinimumWithoutRate).toBe(0);
    expect(built.cards).toHaveLength(1);
    expect(built.cards[0]?.terms.paidInFull).toBe(true);
    expect(built.snapshot.incomeSeries).toHaveLength(1);
  });

  it('a zero investing floor is not set, so neither demo check is on the edge at the investing line', () => {
    for (const inputs of [sofaInputs, carInputs]) {
      const margins = decide(built.snapshot, engine(inputs)).margins;
      expect(margins.find((x) => x.line === 'inv')?.flag ?? null).toBeNull();
    }
  });

  it('the sofa fits', () => {
    expect(computeCheck(built, sofaInputs).verdict?.state).toBe('fits');
  });

  it('the car needs adjusting and spreading, with few suppressed alternatives', () => {
    const c = computeCheck(built, carInputs);
    const v = c.verdict;
    expect(v?.state).toBe('adjust');
    if (v?.state !== 'adjust') return;
    expect(v.warnings.length).toBeGreaterThanOrEqual(2);
    expect(v.size).toBe('needs_spreading');
    const suppressed = (c.alternatives?.rows ?? []).filter((r) => r.suppression).length;
    expect(suppressed).toBeLessThanOrEqual(3);
  });

  it('the car APR is the typed text and the sofa stands alone', () => {
    expect(carInputs.loan.aprText).toBe('6.9');
    expect(sofaInputs.combine).toBe(false);
  });

  it('stacked: the sofa changes neither verdict; both read strong with a cash path', () => {
    const sofa = engine(sofaInputs);
    const sofaOnly = decide(built.snapshot, sofa, []);
    const carStacked = decide(built.snapshot, engine(carInputs), [{ check: sofa, purchaseRule: null }]);
    expect(sofaOnly.verdict.state).toBe('fits');
    expect(sofaOnly.combinedDiffers).toBe(false);
    expect(carStacked.verdict.state).toBe('adjust');
    expect(carStacked.combinedDiffers).toBe(false);
    if (carStacked.verdict.state !== 'adjust') return;
    expect(carStacked.verdict.warnings.length).toBeGreaterThanOrEqual(2);
    expect(carStacked.verdict.size).toBe('needs_spreading');
    for (const d of [sofaOnly, carStacked]) {
      const v = d.verdict;
      if (v.state === 'missing') throw new Error('missing');
      expect(v.confidence.level).toBe('strong');
      expect(v.basisCodes).toEqual([]);
      expect(v.cashPath.status).toBe('available');
      expect(JSON.stringify(v.facts)).not.toContain('cash_tight_before_payday');
      expect(d.margins.every((m) => m.flag === null)).toBe(true);
      expect(d.worstMonth?.differsFromNow).toBe(false);
    }
  });
});
