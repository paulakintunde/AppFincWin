// 06.1-47 (G-2, audit B-8): Past decisions (and the home facts that ride on it) read decide_links through the same cached key
// as useDecideV3, so the links are fetched once with both mounted, and the reads that need nothing from another start on the
// first render together. Real query hooks on one QueryClient; the db fetchers are mocks.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { DecideLinkRow } from '@/db/decideLinks';
import { demoSource } from '@/features/decide/__tests__/helpers/demoScenario';
import type { SnapshotSource } from '@/features/decide/snapshot/buildSnapshot';
import { useDecideV3 } from '@/data/queries/decideV3';
import { queryKeys } from '@/data/keys';
import { usePastDecisions, type PastDecisionsModel } from '../data/usePastDecisions';

const mockChecks: { rows: DecideCheckRow[] } = { rows: [] };
const mockLinks: { rows: DecideLinkRow[] } = { rows: [] };
// the network read; an empty id list never reaches it (fetchDecideLinks returns [] at once, as the real one does)
const mockFetchLinks = jest.fn(async (_ids: readonly string[]) => mockLinks.rows);
const mockFetchChecks = jest.fn((): Promise<DecideCheckRow[]> => Promise.resolve(mockChecks.rows));
const mockFetchGoals = jest.fn((): Promise<unknown[]> => Promise.resolve([]));
const never = () => new Promise(() => undefined);

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/db/decideChecks', () => ({ ...jest.requireActual('@/db/decideChecks'), fetchDecideChecks: () => mockFetchChecks() }));
jest.mock('@/db/decideLinks', () => ({
  ...jest.requireActual('@/db/decideLinks'),
  fetchDecideLinks: async (_c: unknown, ids: readonly string[]) => (ids.length === 0 ? [] : mockFetchLinks(ids)),
  fetchLinkedLines: async () => [],
}));
jest.mock('@/db/savingsGoals', () => ({ ...jest.requireActual('@/db/savingsGoals'), fetchSavingsGoals: () => mockFetchGoals(), fetchGoalLines: async () => [] }));
jest.mock('@/db/decideSettings', () => ({ ...jest.requireActual('@/db/decideSettings'), fetchDecideSettings: () => never() }));
jest.mock('@/db/decideAnswers', () => ({ ...jest.requireActual('@/db/decideAnswers'), fetchDecideAnswers: () => never() }));
jest.mock('@/db/recurringDismissals', () => ({ ...jest.requireActual('@/db/recurringDismissals'), fetchDismissals: () => never() }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [] }) }));
jest.mock('@/ui/money/useMoneyFormatter', () => ({
  useMoneyFormatter: () => ({ formatMoney: () => '', formatMoneyA11y: () => '', formatDate: (d: string) => d, locale: 'en-US' }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-03', timeZone: 'UTC' }),
}));
const mockSnap = { status: 'ready' as const, source: null as SnapshotSource | null, result: null, retry: () => undefined, unsavedWrites: 0 };
jest.mock('@/data/queries/decide', () => ({ ...jest.requireActual('@/data/queries/decide'), useDecideSnapshot: () => mockSnap }));

const row = (id: string, over: Partial<DecideCheckRow> = {}): DecideCheckRow =>
  ({
    id,
    status: 'open',
    deleted_at: null,
    kind: 'cash',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    decided_at: null,
    reopened_from: null,
    inputs: { v: 2, item: 'Sofa', price: 120_000 },
    ...over,
  }) as unknown as DecideCheckRow;
const link = (id: string, checkId: string): DecideLinkRow =>
  ({ id, check_id: checkId, entity: 'transactions', target_id: `t-${id}`, deleted_at: null }) as unknown as DecideLinkRow;

const pastStates: PastDecisionsModel[] = [];
function Past() {
  pastStates.push(usePastDecisions());
  return null;
}
const last = (): PastDecisionsModel => pastStates[pastStates.length - 1]!;
function V3() {
  useDecideV3();
  return null;
}

let client: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  pastStates.length = 0;
  mockSnap.source = demoSource('2026-10-03');
  mockChecks.rows = [
    row('c-open'),
    row('c-bought', { status: 'bought', decided_at: '2026-09-10T00:00:00Z' }),
    row('c-passed', { status: 'passed', decided_at: '2026-09-20T00:00:00Z' }),
  ];
  mockLinks.rows = [link('l1', 'c-bought'), link('l2', 'c-open'), link('l3', 'c-passed')];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
});

const mount = (children: React.ReactNode) => render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);

describe('Past decisions reads (06.1-47, B-8)', () => {
  it('with useDecideV3 and usePastDecisions mounted together, the links are fetched once', async () => {
    await mount(
      <>
        <V3 />
        <Past />
      </>
    );
    await waitFor(() => expect(last().linksByCheck.size).toBe(2));
    await act(async () => {});
    expect(mockFetchLinks).toHaveBeenCalledTimes(1);
    expect(mockFetchLinks).toHaveBeenCalledWith(['c-bought', 'c-open', 'c-passed']);
    // one links query with ids in the cache, keyed on every check id, sorted (the '' key is the empty list held before the
    // checks arrive; it never reaches the network)
    const linkQueries = client.getQueryCache().findAll({ queryKey: queryKeys.decideLinks('u1', 'h1') });
    expect(linkQueries.map((q) => q.queryKey[q.queryKey.length - 1]).filter((k) => k !== '')).toEqual(['c-bought,c-open,c-passed']);
  });

  it('keeps only the decided checks links, newest decision first (output unchanged)', async () => {
    await mount(<Past />);
    await waitFor(() => expect(last().linksByCheck.size).toBe(2));
    expect(last().decisions.map((d) => d.id)).toEqual(['c-passed', 'c-bought']);
    expect([...last().linksByCheck.keys()].sort()).toEqual(['c-bought', 'c-passed']);
    expect(last().linksByCheck.get('c-bought')!.map((l) => l.id)).toEqual(['l1']);
    expect(last().linksByCheck.has('c-open')).toBe(false);
  });

  it('the independent reads (checks and savings goals) start together on the first render', async () => {
    // held open, so the first render's state is what is checked
    mockFetchChecks.mockImplementation(() => never() as Promise<DecideCheckRow[]>);
    mockFetchGoals.mockImplementation(() => never() as Promise<unknown[]>);
    await mount(<Past />);
    const status = (key: readonly unknown[]) => client.getQueryCache().find({ queryKey: key, exact: true })?.state.fetchStatus;
    expect(status(queryKeys.decideChecks('u1', 'h1'))).toBe('fetching');
    expect(status(queryKeys.savingsGoals('u1', 'h1'))).toBe('fetching');
    expect(mockFetchChecks).toHaveBeenCalledTimes(1);
    expect(mockFetchGoals).toHaveBeenCalledTimes(1);
  });
});
