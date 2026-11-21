// 08.1-10: the household reads behind a Household check. Off reads nothing for it; on waits for the figures and then hands the builder
// the viewer, their weight and each other member's one shared figure.
import { renderHook } from '@testing-library/react-native';
import { useHouseholdScopeSource, useHouseholdShare } from '../useHouseholdScopeSource';

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
const mockMembers = [{ user_id: 'me', weight: 50 }, { user_id: 'sam', weight: 50 }];
jest.mock('@/data/queries/household', () => ({ useHouseholdId: () => ({ data: 'h1' }), useHouseholdMembers: () => ({ data: mockMembersNow }) }));
let mockMembersNow: typeof mockMembers | undefined = mockMembers;
let mockTotals: { data: unknown; status: string; dataUpdatedAt: number; isPending: boolean }[] = [];
const mockTotalsCall = jest.fn();
jest.mock('@/data/queries/partnerMoney', () => ({
  usePartnerMoneyTotals: (...a: unknown[]) => {
    mockTotalsCall(...a);
    return mockTotals;
  },
}));
jest.mock('@/data/queries/householdBalances', () => ({
  useSettlements: (h: unknown) => ({ data: h === undefined ? undefined : [] }),
  useHouseholdBalances: () => ({ data: { pairs: [{ net: -2500 }] } }),
  useSplitDefaults: () => ({ data: [{ category_ref: null, rule: 'weight' }] }),
}));

// 08.1-22: the spending rule and the joint facts (never a live client)
let mockRule: { data: unknown; isPending: boolean } = { data: null, isPending: false };
let mockJoint: { data: unknown; isPending: boolean } = { data: { purposes: [], balances: [], month: [] }, isPending: false };
jest.mock('@/data/queries/householdSpendRule', () => ({ useHouseholdSpendRule: () => mockRule }));
jest.mock('@/data/queries/jointAccounts', () => ({ useJointAccountFacts: () => mockJoint }));

beforeEach(() => {
  mockRule = { data: null, isPending: false };
  mockJoint = { data: { purposes: [], balances: [], month: [] }, isPending: false };
  mockMembersNow = mockMembers;
  mockTotals = [];
  mockTotalsCall.mockClear();
});

describe('useHouseholdScopeSource', () => {
  it('Just me: no source, not waiting, and the partner figures are not asked for', async () => {
    const { result } = await renderHook(() => useHouseholdScopeSource(false));
    expect(result.current).toEqual({ source: undefined, pending: false });
    expect(mockTotalsCall).toHaveBeenCalledWith('me', [], false);
  });

  it('Household: waits while a partner figure is still loading', async () => {
    mockTotals = [{ data: undefined, status: 'pending', dataUpdatedAt: 0, isPending: true }];
    const { result } = await renderHook(() => useHouseholdScopeSource(true));
    expect(result.current.pending).toBe(true);
    expect(mockTotalsCall).toHaveBeenCalledWith('me', ['sam'], true);
  });

  it('Household: waits for the member list', async () => {
    mockMembersNow = undefined;
    const { result } = await renderHook(() => useHouseholdScopeSource(true));
    expect(result.current).toMatchObject({ source: undefined, pending: true });
  });

  it('Household: hands the builder the viewer, the weights, the shared figure and what is owed', async () => {
    mockTotals = [{ data: { ok: true, rounded_left: 200000, currency: 'USD', as_of: 'd' }, status: 'success', dataUpdatedAt: 5, isPending: false }];
    const { result } = await renderHook(() => useHouseholdScopeSource(true));
    expect(result.current.pending).toBe(false);
    expect(result.current.source).toEqual({
      scope: 'household',
      viewerId: 'me',
      myWeight: 50,
      partners: [{ key: 'sam', weight: 50, sharing: true, roundedLeft: 200000, currency: 'USD' }],
      settleUp: { lapsedAsPayer: false, owed: 2500 },
      memberKeys: ['me', 'sam'],
      setting: null,
      billWeights: { me: 50, sam: 50 },
      joint: [],
    });
  });

  it('08.1-22: the saved rule and the joint accounts reach the source, and a Just me check with a joint account gets a source too', async () => {
    mockRule = { data: { rule: 'bill', setup: 'joint', shares: null }, isPending: false };
    mockJoint = {
      data: {
        purposes: [{ id: 'j1', currency: 'USD', opening_balance: 1000, joint_purpose: 'everyday', joint_savings_spendable: false, version: 1 }],
        balances: [{ account_id: 'j1', balance: 500, currency: 'USD' }],
        month: [{ account_id: 'j1', currency: 'USD', money_in: 300, money_out: 100, paid_in_by: { me: 300 } }],
      },
      isPending: false,
    };
    const { result } = await renderHook(() => useHouseholdScopeSource(false));
    expect(result.current.pending).toBe(false);
    expect(result.current.source).toMatchObject({
      scope: 'me',
      viewerId: 'me',
      setting: { rule: 'bill', setup: 'joint', shares: null },
      joint: [{ id: 'j1', balance: 1500, monthIn: 300, monthOut: 100, paidInBy: { me: 300 } }],
      settleUp: null,
    });
    expect(mockTotalsCall).toHaveBeenCalledWith('me', [], false);
  });

  it('08.1-22: waits for the rule and the joint facts, in either scope, so there is no flash of a different answer', async () => {
    mockRule = { data: undefined, isPending: true };
    expect((await renderHook(() => useHouseholdScopeSource(false))).result.current).toEqual({ source: undefined, pending: true });
    mockRule = { data: null, isPending: false };
    mockJoint = { data: undefined, isPending: true };
    expect((await renderHook(() => useHouseholdScopeSource(false))).result.current).toEqual({ source: undefined, pending: true });
    mockTotals = [{ data: { ok: false, reason: 'x' }, status: 'success', dataUpdatedAt: 1, isPending: false }];
    expect((await renderHook(() => useHouseholdScopeSource(true))).result.current).toEqual({ source: undefined, pending: true });
  });

  it('a partner who has not shared is still handed over, as not sharing (the caveat names them)', async () => {
    mockTotals = [{ data: { ok: false, reason: 'not_both_on' }, status: 'success', dataUpdatedAt: 5, isPending: false }];
    const { result } = await renderHook(() => useHouseholdScopeSource(true));
    expect(result.current.source?.partners).toEqual([{ key: 'sam', weight: 50, sharing: false, roundedLeft: null, currency: '' }]);
  });
});

describe('useHouseholdShare', () => {
  it('gives the household scope, with the default split rule, and the member count', async () => {
    const { result } = await renderHook(() => useHouseholdShare());
    expect(result.current.memberCount).toBe(2);
    expect(result.current.shareScope).toEqual({ kind: 'household', memberCount: 2, myIndex: 0, rule: { kind: 'weight', weights: [50, 50] } });
  });

  it('has none while the member list is loading', async () => {
    mockMembersNow = undefined;
    const { result } = await renderHook(() => useHouseholdShare());
    expect(result.current).toEqual({ shareScope: null, memberCount: 0 });
  });
});
