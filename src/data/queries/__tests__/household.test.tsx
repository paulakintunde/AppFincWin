import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import { resetHouseholdScope } from '../household';

jest.mock('@/services/supabase', () => ({ supabase: {} }));

describe('resetHouseholdScope (PATTERNS trap 4)', () => {
  it('invalidates the cached id and removes entries keyed by the old household only', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.household('u1'), 'old');
    qc.setQueryData(queryKeys.accounts('old'), [1]);
    qc.setQueryData(queryKeys.householdMemberRows('old'), [1]);
    qc.setQueryData(queryKeys.accounts('other'), [2]);

    resetHouseholdScope(qc, 'u1', 'old');

    expect(qc.getQueryData(queryKeys.accounts('old'))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.householdMemberRows('old'))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.accounts('other'))).toEqual([2]);
    expect(qc.getQueryState(queryKeys.household('u1'))?.isInvalidated).toBe(true);
  });

  it('only invalidates when there was no old household', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.accounts('h'), [1]);
    resetHouseholdScope(qc, 'u1', null);
    expect(qc.getQueryData(queryKeys.accounts('h'))).toEqual([1]);
  });
});
