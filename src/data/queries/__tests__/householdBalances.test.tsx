// 08-15 (HH-07, D-23): balances come from the engine over stored splits and live settle-up lines.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { LiveSettlementLine, SettlementStatus } from '@/db/settlements';
import type { SharedLineRow, SplitRow } from '@/db/transactionSplits';
import {
  computeBalances,
  computePairLines,
  payerKeyOf,
  toBalanceLines,
  useHouseholdBalances,
  usePairLines,
  type BalanceInputs,
} from '../householdBalances';

let mockInputs: BalanceInputs;

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/db/accounts', () => ({ fetchJointAccountIds: async () => mockInputs.jointAccountIds }));
jest.mock('@/db/transactionSplits', () => ({
  fetchOpenSharedLines: async () => mockInputs.lines,
  fetchSplitsForLines: async () => mockInputs.splits,
  fetchSplitDefaults: async () => [],
}));
jest.mock('@/db/settlements', () => ({
  fetchLiveSettlementLines: async () => mockInputs.live,
  fetchMySettlements: async () => [],
}));

const NOW = Date.parse('2026-11-15T12:00:00Z');
const ME = 'me';
const SAM = 'sam';

function line(id: string, over: Partial<SharedLineRow> = {}): SharedLineRow {
  return {
    id,
    household_id: 'h',
    account_id: 'acc-me',
    created_by: ME,
    paid_by: null,
    paid_by_former_key: null,
    household_amount: -1000,
    household_currency: 'USD',
    original_amount: -1000,
    original_currency: 'USD',
    local_date: '2026-11-10',
    name: id,
    note: null,
    category_id: null,
    split_rule: 'even',
    split_manual: false,
    status: 'paid',
    version: 1,
    ...over,
  };
}

/** An even two-way split of an expense: stored shares are negative, like the line. */
function evenSplit(id: string, a: string, b: string, total = -1000): SplitRow[] {
  return [
    { transaction_id: id, member_id: a, former_member_key: null, position: 0, share: total / 2 },
    { transaction_id: id, member_id: b, former_member_key: null, position: 1, share: total / 2 },
  ];
}

function live(lineId: string, status: SettlementStatus, expires = '2026-11-20T00:00:00Z'): LiveSettlementLine {
  return {
    settlement_id: `s-${lineId}`,
    transaction_id: lineId,
    household_id: 'h',
    amount: 500,
    live: true,
    settlement: { status, expires_at: expires, payer_id: SAM, receiver_id: ME },
  };
}

function inputs(over: Partial<BalanceInputs>): BalanceInputs {
  return { lines: [], splits: [], live: [], jointAccountIds: [], ...over };
}

describe('toBalanceLines', () => {
  it('negates stored expense shares into amounts owed and keeps the payer', () => {
    const out = toBalanceLines(inputs({ lines: [line('l1')], splits: evenSplit('l1', ME, SAM) }), NOW);
    expect(out).toHaveLength(1);
    expect(out[0]?.payerKey).toBe(ME);
    expect(out[0]?.shares.map((s) => s.amount)).toEqual([500, 500]);
    expect(out[0]?.status).toBe('open');
  });

  it('finds the payer through paid_by, then the former key, then the creator (08-14)', () => {
    expect(payerKeyOf(line('a', { paid_by: SAM }))).toBe(SAM);
    expect(payerKeyOf(line('b', { paid_by: null, paid_by_former_key: 'k1' }))).toBe('k1');
    expect(payerKeyOf(line('c'))).toBe(ME);
    expect(payerKeyOf(line('d', { created_by: null }))).toBeNull();
  });

  it('keys a share by the former key once the member id is gone', () => {
    const splits: SplitRow[] = [
      { transaction_id: 'l1', member_id: ME, former_member_key: null, position: 0, share: -500 },
      { transaction_id: 'l1', member_id: null, former_member_key: 'k-sam', position: 1, share: -500 },
    ];
    expect(toBalanceLines(inputs({ lines: [line('l1')], splits }), NOW)[0]?.shares.map((s) => s.memberKey)).toEqual([ME, 'k-sam']);
  });

  it('leaves out a line with no payer or no splits, and a share with no key', () => {
    const out = toBalanceLines(
      inputs({ lines: [line('nopay', { created_by: null }), line('nosplit')], splits: evenSplit('nopay', ME, SAM) }),
      NOW,
    );
    expect(out).toEqual([]);
  });

  it('reads status from the live settle-up: pending only until expiry, confirmed and written off settle', () => {
    const lines = ['p', 'late', 'c', 'w'].map((id) => line(id));
    const splits = lines.flatMap((l) => evenSplit(l.id, ME, SAM));
    const out = toBalanceLines(
      inputs({
        lines,
        splits,
        live: [live('p', 'pending'), live('late', 'pending', '2026-11-14T00:00:00Z'), live('c', 'confirmed'), live('w', 'written_off')],
      }),
      NOW,
    );
    const status = Object.fromEntries(out.map((l) => [l.lineId, l.status]));
    expect(status).toEqual({ p: 'pending', late: 'open', c: 'settled', w: 'written_off' });
    expect(out.find((l) => l.lineId === 'p')?.pendingSettlementId).toBe('s-p');
  });
});

describe('computeBalances (engine pairBalances over stored data)', () => {
  it('creates a pair from an open shared line the viewer paid', () => {
    const b = computeBalances(inputs({ lines: [line('l1')], splits: evenSplit('l1', ME, SAM) }), ME, NOW);
    expect(b.pairs).toHaveLength(1);
    expect(b.pairs[0]).toMatchObject({ otherKey: SAM, net: 500, pending: 0 });
    expect(b.owedToMe).toBe(500);
  });

  it('shows what the viewer owes as a negative net', () => {
    const b = computeBalances(inputs({ lines: [line('l1', { paid_by: SAM })], splits: evenSplit('l1', ME, SAM) }), ME, NOW);
    expect(b.pairs[0]).toMatchObject({ otherKey: SAM, net: -500 });
    expect(b.owedToMe).toBe(0);
  });

  it('creates no pair for a line paid from a joint account (D-17)', () => {
    const b = computeBalances(
      inputs({ lines: [line('l1', { account_id: 'joint' })], splits: evenSplit('l1', ME, SAM), jointAccountIds: ['joint'] }),
      ME,
      NOW,
    );
    expect(b.pairs).toEqual([]);
  });

  it('shows pending lines in the pending part of the net', () => {
    const b = computeBalances(
      inputs({ lines: [line('l1'), line('l2')], splits: [...evenSplit('l1', ME, SAM), ...evenSplit('l2', ME, SAM)], live: [live('l1', 'pending')] }),
      ME,
      NOW,
    );
    expect(b.pairs[0]).toMatchObject({ net: 1000, pending: 500 });
  });

  it('leaves settled and written-off lines out', () => {
    const lines = [line('c'), line('w')];
    const b = computeBalances(
      inputs({ lines, splits: lines.flatMap((l) => evenSplit(l.id, ME, SAM)), live: [live('c', 'confirmed'), live('w', 'written_off')] }),
      ME,
      NOW,
    );
    expect(b.pairs).toEqual([]);
  });

  it('keeps a balance with a former member under their key', () => {
    const splits: SplitRow[] = [
      { transaction_id: 'l1', member_id: ME, former_member_key: null, position: 0, share: -500 },
      { transaction_id: 'l1', member_id: null, former_member_key: 'k-sam', position: 1, share: -500 },
    ];
    expect(computeBalances(inputs({ lines: [line('l1')], splits }), ME, NOW).pairs[0]).toMatchObject({ otherKey: 'k-sam', net: 500 });
  });
});

describe('computePairLines', () => {
  it('traces the lines behind a pair with signed contributions', () => {
    const data = inputs({
      lines: [line('mine'), line('theirs', { paid_by: SAM, local_date: '2026-11-11' })],
      splits: [...evenSplit('mine', ME, SAM), ...evenSplit('theirs', ME, SAM, -400)],
    });
    const rows = computePairLines(data, ME, SAM, NOW);
    expect(Object.fromEntries(rows.map((r) => [r.line.id, r.signed]))).toEqual({ mine: 500, theirs: -200 });
    expect(computePairLines(data, ME, 'nobody', NOW)).toEqual([]);
  });
});

describe('hooks', () => {
  function wrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return function W({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    };
  }

  it('useHouseholdBalances returns the engine pairs and owedToMe from one read', async () => {
    mockInputs = inputs({ lines: [line('l1')], splits: evenSplit('l1', ME, SAM) });
    const { result } = await renderHook(() => useHouseholdBalances('h', ME), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.pairs[0]).toMatchObject({ otherKey: SAM, net: 500 });
    expect(result.current.data?.owedToMe).toBe(500);
  });

  it('usePairLines returns the traced lines for one other person', async () => {
    mockInputs = inputs({ lines: [line('l1')], splits: evenSplit('l1', ME, SAM) });
    const { result } = await renderHook(() => usePairLines('h', ME, SAM), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map((r) => r.line.id)).toEqual(['l1']);
  });

  it('does not read until there is a household and a viewer', async () => {
    mockInputs = inputs({});
    const { result } = await renderHook(() => useHouseholdBalances(undefined, ME), { wrapper: wrapper() });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
