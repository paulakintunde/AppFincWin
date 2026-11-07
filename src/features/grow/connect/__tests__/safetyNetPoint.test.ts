import { goals } from '@/engine/grow/__tests__/fixtures/ledger';
import { safetyNetInputsOf, safetyNetPointOf } from '../index';
import type { GoalSourceRow } from '../types';

const identity = (amount: number, currency: string): number | null => (currency === 'USD' ? amount : null);
const net: GoalSourceRow = {
  id: 'net', name: 'Safety net', currency: 'USD', target: goals.safetyNet.target, monthly_amount: 10000, ready_by: null,
  opening_saved: goals.safetyNet.saved, kind: 'pot', account_id: 'a-sav', check_id: null, done_at: null, deleted_at: null,
  is_safety_net: true, locked: true, protect: true, net_confirmed_at: '2026-10-01T00:00:00Z',
};

describe('safetyNetPointOf / safetyNetInputsOf', () => {
  it('no live safety-net row gives no net and no emergency fund', () => {
    const none: GoalSourceRow[][] = [[], [{ ...net, is_safety_net: false }], [{ ...net, deleted_at: '2026-10-01T00:00:00Z' }], [{ ...net, is_safety_net: undefined }]];
    for (const rows of none) {
      expect(safetyNetInputsOf(safetyNetPointOf(rows, [], identity, 'USD'))).toEqual({ safetyNet: null, emergency: null });
    }
  });

  it('a flagged row gives size, saved, protect, locked and the fund', () => {
    const p = safetyNetPointOf([net], [], identity, 'USD');
    expect(p).toEqual({ goalId: 'net', size: 230000, saved: 130000, protect: true, locked: true, accountId: 'a-sav', confirmedAt: '2026-10-01T00:00:00Z' });
    expect(safetyNetInputsOf(p)).toEqual({
      safetyNet: { protect: true, size: 230000, saved: 130000, locked: true },
      emergency: { amount: 130000, accountId: 'a-sav' },
    });
  });

  it('goal-tagged paid lines add to saved', () => {
    const l = { id: 'l', goal_id: 'net', status: 'paid', deleted_at: null, transfer_id: 't', original_amount: 10000, original_currency: 'USD', local_date: '2026-11-01' };
    expect(safetyNetPointOf([net], [l], identity, 'USD')?.saved).toBe(140000);
  });

  it('protect false, and a cached old row with no protect and no confirm date', () => {
    expect(safetyNetPointOf([{ ...net, protect: false }], [], identity, 'USD')?.protect).toBe(false);
    const { protect: p0, net_confirmed_at: n0, ...old } = net;
    void p0;
    void n0;
    expect(safetyNetPointOf([old], [], identity, 'USD')).toMatchObject({ protect: true, confirmedAt: null });
  });

  it('target null gives size null (the starter), never 0', () => {
    const p = safetyNetPointOf([{ ...net, target: null }], [], identity, 'USD');
    expect(p?.size).toBeNull();
    expect(safetyNetInputsOf(p).safetyNet?.size).toBeNull();
  });

  it('a goal in another currency than home gives size null, saved 0 and no fund (CR-03 rule)', () => {
    const p = safetyNetPointOf([{ ...net, currency: 'GBP' }], [], identity, 'USD');
    expect(p).toMatchObject({ size: null, saved: 0, accountId: null });
    expect(safetyNetInputsOf(p)).toEqual({ safetyNet: { protect: true, size: null, saved: 0, locked: true }, emergency: null });
  });

  it('saved 0 with no account gives no fund; saved 0 with an account keeps it', () => {
    expect(safetyNetInputsOf(safetyNetPointOf([{ ...net, opening_saved: 0, account_id: null }], [], identity, 'USD')).emergency).toBeNull();
    expect(safetyNetInputsOf(safetyNetPointOf([{ ...net, opening_saved: 0, account_id: undefined }], [], identity, 'USD')).emergency).toBeNull();
    expect(safetyNetInputsOf(safetyNetPointOf([{ ...net, opening_saved: 0 }], [], identity, 'USD')).emergency).toEqual({ amount: 0, accountId: 'a-sav' });
  });

  it('saved or target that cannot convert reads as 0 and as the starter', () => {
    const picky = (amount: number, currency: string): number | null => (amount === 230000 || amount === 130000 ? null : identity(amount, currency));
    expect(safetyNetPointOf([net], [], picky, 'USD')).toMatchObject({ size: null, saved: 0 });
  });
});
