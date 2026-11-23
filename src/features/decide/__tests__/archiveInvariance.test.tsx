// 10-16 (D-13, DAT-01, T-10-16-01): archiving a month never changes a Decide answer. The Decide v3 build (useDecideV3) is run over the
// same fixture with the person's archived_months cache entry empty, then populated, then random: the inputs and the evaluation must be
// deep-equal every time. archiveImportGuard.test.ts is the structural half (no money module can import archive state).
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import fc from 'fast-check';
import { EMPTY_DECIDE_SETTINGS } from '@/db/decideSettings';
import { queryKeys } from '@/data/keys';
import { demoSource } from '@/features/decide/__tests__/helpers/demoScenario';
import type { SnapshotSource } from '@/features/decide/snapshot/sourceTypes';
import { useDecideV3 } from '@/data/queries/decideV3';

const TODAY = '2026-10-03';
const USER = 'u1';
type Q = { data: unknown; isError: boolean; error?: unknown; refetch: jest.Mock };
const q = (data: unknown): Q => ({ data, isError: false, error: null, refetch: jest.fn() });

const mockState: { snapshot: Record<string, unknown>; settings: Q; answers: Q; dismissals: Q; checks: Q; links: Q } = {
  snapshot: {},
  settings: q(undefined),
  answers: q(undefined),
  dismissals: q(undefined),
  checks: q(undefined),
  links: q(undefined),
};
jest.mock('@/features/household/decide/useHouseholdScopeSource', () => ({ useHouseholdScopeSource: () => ({ source: undefined, pending: false }) }));
jest.mock('@/data/queries/decide', () => ({
  useDecideSnapshot: () => mockState.snapshot,
  useDecideSettings: () => mockState.settings,
  useDecideChecks: () => mockState.checks,
  useDecideLinks: () => mockState.links,
}));
jest.mock('@/data/queries/decideAnswers', () => ({ useDecideAnswers: () => mockState.answers }));
jest.mock('@/data/queries/recurringDismissals', () => ({ useRecurringDismissals: () => mockState.dismissals }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: USER, householdId: 'h1' }) }));

const source: SnapshotSource = demoSource(TODAY);

beforeEach(() => {
  mockState.snapshot = { status: 'ready', source, result: null, retry: jest.fn(), errorKind: undefined, missingReads: undefined };
  mockState.settings = q({ ...EMPTY_DECIDE_SETTINGS, user_id: USER, income_types: ['salary_or_wages'], income_pattern: 'steady', income_pattern_confirmed: true });
  mockState.answers = q([]);
  mockState.dismissals = q([]);
  mockState.checks = q([]);
  mockState.links = q([]);
});

async function decideWith(archived: readonly string[]) {
  const qc = new QueryClient();
  qc.setQueryData(queryKeys.archivedMonths(USER), [...archived]);
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const { result } = await renderHook(() => useDecideV3(), { wrapper });
  return { status: result.current.status, inputs: result.current.inputs, evaluation: result.current.evaluation };
}

describe('archive never changes Decide (D-13)', () => {
  it('gives identical inputs and answer with and without archived months', async () => {
    const none = await decideWith([]);
    const some = await decideWith(['2026-08', '2026-09']);
    expect(none.status).toBe('ready');
    expect(some).toEqual(none);
    expect(typeof none.evaluation!.result.code).toBe('string');
  });

  it('gives the same answer when every month is archived', async () => {
    const none = await decideWith([]);
    const all = await decideWith(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(all).toEqual(none);
  });

  it('property: any archived set leaves the answer unchanged', async () => {
    const baseline = await decideWith([]);
    const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    await fc.assert(
      fc.asyncProperty(fc.subarray(months), async (subset) => {
        const run = await decideWith(subset);
        expect(run).toEqual(baseline);
      }),
      { numRuns: 25 },
    );
  });
});
