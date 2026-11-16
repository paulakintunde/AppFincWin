import { eligibleToShare } from '../BulkShare';
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/household/useHouseholdScope', () => ({ useHouseholdScope: jest.fn() }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: jest.fn() }));

import type { TransactionRow } from '@/db/rows';

function line(over: Record<string, unknown>): TransactionRow {
  return {
    id: 'a',
    created_by: 'me',
    is_shared: false,
    is_settlement: false,
    transfer_id: null,
    original_amount: -5000,
    debt_id: null,
    goal_id: null,
    account_id: 'acc1',
    ...over,
  } as unknown as TransactionRow;
}

describe('bulk share eligibility (D-13: the count is explicit)', () => {
  it('counts only own, unshared, personal-account expense lines', () => {
    const rows = [
      line({ id: 'ok' }),
      line({ id: 'already', is_shared: true }),
      line({ id: 'joint', account_id: 'jointAcc' }),
      line({ id: 'debt', debt_id: 'd1' }),
      line({ id: 'goal', goal_id: 'g1' }),
      line({ id: 'theirs', created_by: 'sam' }),
      line({ id: 'transfer', transfer_id: 't1' }),
      line({ id: 'income', original_amount: 5000 }),
      line({ id: 'settle', is_settlement: true }),
    ];
    const out = eligibleToShare(rows, 'me', new Set(['jointAcc']));
    expect(out.map((r) => r.id)).toEqual(['ok']);
  });
});
