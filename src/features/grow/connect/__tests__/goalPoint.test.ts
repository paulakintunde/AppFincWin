import { LEDGER_TODAY, goals } from '@/engine/grow/__tests__/fixtures/ledger';
import { MAX_ABS_AMOUNT_MINOR } from '@/engine/money';
import { envelopesOf, goalPointsOf, goalSaved } from '../index';
import type { GoalLineSource, GoalSourceRow } from '../types';

const identity = (amount: number, currency: string): number | null => (currency === 'USD' ? amount : null);

const lisbon: GoalSourceRow = {
  id: 'g-lisbon', name: 'Lisbon', currency: 'USD', target: goals.lisbon.target, monthly_amount: goals.lisbon.monthly,
  ready_by: '2027-06-01', opening_saved: goals.lisbon.opening, kind: 'pot', bucket: null, account_id: 'a-sav', check_id: null,
  done_at: null, deleted_at: null, locked: true,
};
const line = (over: Partial<GoalLineSource> & { id: string }): GoalLineSource => ({
  goal_id: 'g-lisbon', status: 'paid', deleted_at: null, transfer_id: 't1', original_amount: 5000, original_currency: 'USD',
  local_date: LEDGER_TODAY, ...over,
});
const twoDeposits = [line({ id: 'l1', transfer_id: 't1' }), line({ id: 'l2', transfer_id: 't2' })];

describe('goalSaved: opening amount plus goal-tagged paid lines, counted once', () => {
  it('Lisbon: opening 54000 plus two deposits of 5000 is 64000', () => {
    expect(goalSaved(lisbon, twoDeposits, identity)).toBe(goals.lisbon.saved);
  });

  it('"Take some out" (an out-leg of a transfer) lowers saved', () => {
    expect(goalSaved(lisbon, [...twoDeposits, line({ id: 'l3', transfer_id: 't3', original_amount: -20000 })], identity)).toBe(44000);
  });

  it('a goal-tagged non-transfer line counts its absolute amount', () => {
    expect(goalSaved(lisbon, [line({ id: 'l4', transfer_id: null, original_amount: -700 })], identity)).toBe(54700);
    expect(goalSaved(lisbon, [line({ id: 'l5', transfer_id: null, original_amount: 300 })], identity)).toBe(54300);
  });

  it('pending, deleted and other-goal lines are ignored (untagged too)', () => {
    const ignored = [
      line({ id: 'p', status: 'pending' }),
      line({ id: 'd', deleted_at: '2026-11-01T00:00:00Z' }),
      line({ id: 'o', goal_id: 'g-other' }),
      line({ id: 'n', goal_id: null }),
      line({ id: 'u', goal_id: undefined }),
    ];
    expect(goalSaved(lisbon, ignored, identity)).toBe(54000);
  });

  it('a line that cannot convert makes saved null; so does an opening amount that cannot convert', () => {
    expect(goalSaved(lisbon, [line({ id: 'x', original_currency: 'EUR' })], identity)).toBeNull();
    expect(goalSaved({ ...lisbon, currency: 'EUR' }, [], identity)).toBeNull();
  });
});

describe('goalPointsOf / envelopesOf', () => {
  it('Lisbon becomes an envelope with locked explicit', () => {
    const points = goalPointsOf([lisbon], twoDeposits, identity);
    expect(points).toEqual([
      {
        id: 'g-lisbon', name: 'Lisbon', kind: 'pot', target: 180000, saved: 64000, monthlyAmount: 5000, readyBy: '2027-06-01',
        locked: true, upFrontOnly: false, linkedCheckId: null, accountId: 'a-sav', bucket: false, done: false,
      },
    ]);
    expect(envelopesOf(points)).toEqual([
      { id: 'g-lisbon', kind: 'pot', target: 180000, monthlyAmount: 5000, readyBy: '2027-06-01', saved: 64000, purposeId: null, accountId: 'a-sav', bucket: false, name: 'Lisbon', locked: true },
    ]);
  });

  it('locked is always an explicit boolean; absent on a cached old row means locked', () => {
    const { locked: dropped, ...old } = lisbon;
    void dropped;
    const unlocked = { ...lisbon, id: 'g2', locked: false };
    const envelopes = envelopesOf(goalPointsOf([old, unlocked], [], identity));
    expect(envelopes.map((e) => e.locked)).toEqual([true, false]);
  });

  it('bucket, up_front_only and accountId defaults', () => {
    const row: GoalSourceRow = { ...lisbon, bucket: 'regular', account_id: undefined, up_front_only: true, check_id: 'c1', kind: 'wait', monthly_amount: null, target: null };
    const [p] = goalPointsOf([row], [], identity);
    expect(p).toMatchObject({ bucket: true, upFrontOnly: true, accountId: null, linkedCheckId: 'c1', kind: 'wait', monthlyAmount: null, target: null });
  });

  it('leaves out the safety-net goal, done and deleted goals, and goals that cannot convert', () => {
    const rows: GoalSourceRow[] = [
      lisbon,
      { ...lisbon, id: 'net', is_safety_net: true },
      { ...lisbon, id: 'done', done_at: '2026-10-01T00:00:00Z' },
      { ...lisbon, id: 'gone', deleted_at: '2026-10-01T00:00:00Z' },
      { ...lisbon, id: 'eur', currency: 'EUR' },
    ];
    expect(goalPointsOf(rows, [], identity).map((p) => p.id)).toEqual(['g-lisbon']);
  });

  it('06-10: saved never goes below 0 or past the money cap (the engine rejects both)', () => {
    const out = line({ id: 'big-out', transfer_id: 't9', original_amount: -900000 });
    expect(goalPointsOf([lisbon], [out], identity)[0]?.saved).toBe(0);
    expect(goalPointsOf([{ ...lisbon, opening_saved: MAX_ABS_AMOUNT_MINOR }], [line({ id: 'more' })], identity)[0]?.saved).toBe(MAX_ABS_AMOUNT_MINOR);
  });

  it('a target or monthly amount that cannot convert becomes null (the goal stays)', () => {
    const picky = (amount: number, currency: string): number | null => (amount === lisbon.target || amount === lisbon.monthly_amount ? null : identity(amount, currency));
    expect(goalPointsOf([lisbon], [], picky)[0]).toMatchObject({ target: null, monthlyAmount: null });
  });
});
