import { verdictRowFor } from '@/engine/decide/v3';
import type { Evaluation } from '@/engine/decide/v3';
import type { DecideCheckRow } from '@/db/decideChecks';
import { savedPlanRow } from '../savedPlanRow';

const live = (code: string, variant: string | null, readyBy: unknown = null, whole = 120000): Evaluation =>
  ({ result: { code, variant, readyBy, facts: [] }, purchase: { whole } }) as unknown as Evaluation;

const NOT_YET = { v: 3, code: 'not_yet', variant: 'not_covered', readyBy: { kind: 'month', month: '2027-02' }, unspentAfter: null, lineFacts: [] };

const row = (over: Record<string, unknown> = {}): DecideCheckRow =>
  ({ id: 'c1', name: 'Laptop', status: 'waiting', answer_v3: NOT_YET, verdict_at_decision: 'fits', ...over }) as unknown as DecideCheckRow;

describe('savedPlanRow', () => {
  it('shows the stored chip and no change when live matches', () => {
    const r = savedPlanRow({ row: row(), live: live('not_yet', 'not_covered', { kind: 'month', month: '2027-02' }), refundBetter: false });
    expect(r).toMatchObject({
      kind: 'saved',
      item: 'Laptop',
      price: 120000,
      chipKey: verdictRowFor('not_yet', 'not_covered').chipKey,
      tone: 'short',
      coveredByMonth: '2027-02',
      changed: false,
      refundLine: false,
      a11yKey: 'decide.v3.ui.home.savedRowA11y',
    });
  });

  it('flags a change but keeps the stored chip', () => {
    const r = savedPlanRow({ row: row(), live: live('fits_unspent', null), refundBetter: false });
    expect(r.changed).toBe(true);
    expect(r.chipKey).toBe(verdictRowFor('not_yet', 'not_covered').chipKey);
  });

  it('no stored answer: live chip (never verdict_at_decision) and no changed flag', () => {
    const r = savedPlanRow({ row: row({ answer_v3: null }), live: live('fits_month', null), refundBetter: false });
    expect(r.chipKey).toBe(verdictRowFor('fits_month', null).chipKey);
    expect(r.tone).toBe('fits');
    expect(r.changed).toBe(false);
    expect(r.coveredByMonth).toBeNull();
  });

  it('malformed stored answer falls back to the live chip', () => {
    for (const bad of [{ v: 2 }, 'x', { v: 3, code: 'nope' }, { v: 3, code: 'not_yet', variant: 'zzz' }]) {
      const r = savedPlanRow({ row: row({ answer_v3: bad }), live: live('fits_month', null), refundBetter: false });
      expect(r.chipKey).toBe(verdictRowFor('fits_month', null).chipKey);
      expect(r.changed).toBe(false);
    }
  });

  it('stored answer but no live evaluation: stored chip, not changed, no price', () => {
    const r = savedPlanRow({ row: row(), live: undefined, refundBetter: false });
    expect(r.chipKey).toBe(verdictRowFor('not_yet', 'not_covered').chipKey);
    expect(r.changed).toBe(false);
    expect(r.price).toBeNull();
  });

  it('no stored answer and no live: needs-input chip', () => {
    const r = savedPlanRow({ row: row({ answer_v3: null }), live: undefined, refundBetter: false });
    expect(r.chipKey).toBe(verdictRowFor('needs_input', null).chipKey);
  });

  it('live ready-by month is used when nothing is stored; a date ready-by gives no month', () => {
    const a = savedPlanRow({ row: row({ answer_v3: null }), live: live('not_yet', 'not_covered', { kind: 'month', month: '2027-03' }), refundBetter: false });
    expect(a.coveredByMonth).toBe('2027-03');
    const b = savedPlanRow({ row: row({ answer_v3: null }), live: live('not_yet', 'payday', { kind: 'date', date: '2027-03-05' }), refundBetter: false });
    expect(b.coveredByMonth).toBeNull();
    const c = savedPlanRow({ row: row({ answer_v3: { ...NOT_YET, readyBy: { kind: 'date', date: '2027-03-05' } } }), live: undefined, refundBetter: false });
    expect(c.coveredByMonth).toBeNull();
  });

  it('refund line', () => {
    const r = savedPlanRow({ row: row(), live: live('not_yet', 'not_covered'), refundBetter: true });
    expect(r.refundLine).toBe(true);
    expect(r.a11yKey).toBe('decide.v3.ui.home.savedRowA11yRefund');
  });

  it('open status is an unfinished row', () => {
    const r = savedPlanRow({ row: row({ status: 'open' }), live: live('fits_month', null), refundBetter: false });
    expect(r.kind).toBe('unfinished');
    expect(r.lineKey).toBe('decide.v3.ui.home.unfinishedLine');
    expect(r.a11yKey).toBe('decide.v3.ui.home.unfinishedRowA11y');
  });
});
