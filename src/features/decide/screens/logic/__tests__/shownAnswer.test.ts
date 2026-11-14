// 06.1-82: what the answer screen shows of an evaluation. G-61-8 (an answered "None" leaves the debts ask out), G-61-3 (a decided
// check's own Grow goal does not make its answer Not ready) and G-61-11 (the plan payment without the running costs).
import type { Evaluation, ReadinessItem } from '@/engine/decide/v3';
import { planPaymentOf, shownEvaluation } from '../shownAnswer';

const envItem = (envelopeId: string): ReadinessItem => ({
  kind: 'envelopes',
  code: 'envelopes_unconfirmed',
  month: '2026-11',
  seriesId: null,
  envelopeId,
  lineId: null,
  name: 'laptop',
  amount: null,
  date: null,
});
const billItem: ReadinessItem = { ...envItem('x'), kind: 'bill', code: 'past_month_missing', month: '2026-10', envelopeId: null, seriesId: 's1' };

function evaluationOf(result: Partial<Evaluation['result']>): Evaluation {
  return { result: { code: 'fits', facts: [], ...result } } as unknown as Evaluation;
}
const ASK = { code: 'ask_debts_not_recorded' as const, values: { kind: 'card' } };
const OTHER = { code: 'month_left_after' as const, values: { left: 100 } };
const NONE = { noDebtsAnswered: false, ownGoalIds: [] as readonly string[] };

describe('shownEvaluation', () => {
  it('returns null for no evaluation', () => {
    expect(shownEvaluation(null, NONE)).toBeNull();
  });

  it('keeps the same evaluation when nothing applies', () => {
    const e = evaluationOf({ facts: [ASK, OTHER] as never });
    expect(shownEvaluation(e, NONE)).toBe(e);
  });

  it('G-61-8: an answered "None" leaves the debts ask out, other facts kept', () => {
    const e = evaluationOf({ facts: [ASK, OTHER] as never });
    const shown = shownEvaluation(e, { ...NONE, noDebtsAnswered: true });
    expect(shown?.result.facts.map((f) => f.code)).toEqual(['month_left_after']);
  });

  it('G-61-8: with no ask on the answer the evaluation is the same object', () => {
    const e = evaluationOf({ facts: [OTHER] as never });
    expect(shownEvaluation(e, { ...NONE, noDebtsAnswered: true })).toBe(e);
  });

  it('G-61-3: the check’s own goal leaves the readiness items; the answer is ready when none remain', () => {
    const e = evaluationOf({ readiness: { ready: false, missing: ['envelopes_unconfirmed'], items: [envItem('g1')], waived: [] } as never });
    const shown = shownEvaluation(e, { ...NONE, ownGoalIds: ['g1'] });
    expect(shown?.result.readiness).toEqual({ ready: true, missing: [], items: [], waived: [] });
  });

  it('G-61-3: other goals and other items stay, and the codes are recounted', () => {
    const items = [billItem, envItem('g1'), envItem('g2')];
    const e = evaluationOf({ readiness: { ready: false, missing: ['envelopes_unconfirmed', 'past_month_missing'], items, waived: [] } as never });
    const shown = shownEvaluation(e, { ...NONE, ownGoalIds: ['g1'] });
    expect(shown?.result.readiness?.items).toEqual([billItem, envItem('g2')]);
    expect(shown?.result.readiness?.missing).toEqual(['envelopes_unconfirmed', 'past_month_missing']);
    expect(shown?.result.readiness?.ready).toBe(false);
  });

  it('G-61-3: only the own goal named, the other codes kept sorted', () => {
    const e = evaluationOf({ readiness: { ready: false, missing: ['envelopes_unconfirmed', 'past_month_missing'], items: [envItem('g1'), billItem] } as never });
    const shown = shownEvaluation(e, { ...NONE, ownGoalIds: ['g1'] });
    expect(shown?.result.readiness).toEqual({ ready: false, missing: ['past_month_missing'], items: [billItem] });
  });

  it('G-61-3: a readiness with no own goal on it, or with no items listed, is the same object', () => {
    const e = evaluationOf({ readiness: { ready: false, missing: ['envelopes_unconfirmed'], items: [envItem('g2')] } as never });
    expect(shownEvaluation(e, { ...NONE, ownGoalIds: ['g1'] })).toBe(e);
    const bare = evaluationOf({ readiness: { ready: false, missing: ['envelopes_unconfirmed'] } as never });
    expect(shownEvaluation(bare, { ...NONE, ownGoalIds: ['g1'] })).toBe(bare);
    const none = evaluationOf({});
    expect(shownEvaluation(none, { ...NONE, ownGoalIds: ['g1'] })).toBe(none);
  });

  it('G-61-3: an envelope item with no id is never taken for the own goal', () => {
    const e = evaluationOf({ readiness: { ready: false, missing: ['envelopes_unconfirmed'], items: [{ ...envItem('g1'), envelopeId: null }] } as never });
    expect(shownEvaluation(e, { ...NONE, ownGoalIds: ['g1'] })).toBe(e);
  });

  it('both at once', () => {
    const e = evaluationOf({ facts: [ASK] as never, readiness: { ready: false, missing: ['envelopes_unconfirmed'], items: [envItem('g1')] } as never });
    const shown = shownEvaluation(e, { noDebtsAnswered: true, ownGoalIds: ['g1'] });
    expect(shown?.result.facts).toEqual([]);
    expect(shown?.result.readiness?.ready).toBe(true);
  });
});

describe('planPaymentOf', () => {
  it('G-61-11: the plan payment is the monthly less the running costs', () => {
    expect(planPaymentOf({ monthly: 73417, runningMonthly: 32300 })).toBe(41117);
  });
  it('with no running costs it is the monthly', () => {
    expect(planPaymentOf({ monthly: 41117, runningMonthly: 0 })).toBe(41117);
  });
  it('never below zero, and null with no purchase', () => {
    expect(planPaymentOf({ monthly: 100, runningMonthly: 300 })).toBe(0);
    expect(planPaymentOf(null)).toBeNull();
    expect(planPaymentOf(undefined)).toBeNull();
  });
});
