// 06.1-46 (G-2, audit B-1): every useDecideV3 mounted at the same time shares one settings source and one Prepared, so the
// snapshot -> inputs -> prepare build runs once per data version, not once per hook. The Decide reads are real hooks on one
// seeded QueryClient; only the snapshot hook is a stand-in (its own sharing is covered in decide.test.tsx).
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import { EMPTY_DECIDE_SETTINGS } from '@/db/decideSettings';
import { demoSource } from '@/features/decide/__tests__/helpers/demoScenario';
import type { SnapshotSource } from '@/features/decide/snapshot/buildSnapshot';
import * as buildV3InputsModule from '@/features/decide/snapshot/v3/buildV3Inputs';
import { queryKeys } from '../../keys';
import { useDecideV3, type DecideV3State } from '../decideV3';

jest.mock('@/services/supabase', () => ({ supabase: {} }));
const never = () => new Promise(() => undefined);
jest.mock('@/db/decideChecks', () => ({ fetchDecideChecks: () => never() }));
jest.mock('@/db/decideSettings', () => ({ ...jest.requireActual('@/db/decideSettings'), fetchDecideSettings: () => never() }));
jest.mock('@/db/decideAnswers', () => ({ fetchDecideAnswers: () => never() }));
jest.mock('@/db/recurringDismissals', () => ({ fetchDismissals: () => never() }));
jest.mock('@/db/decideLinks', () => ({ fetchDecideLinks: () => never() }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u1', householdId: 'h1' }) }));

const TODAY = '2026-10-03';
const mockSnap = {
  status: 'ready' as const,
  source: null as SnapshotSource | null,
  result: null,
  retry: () => undefined,
  unsavedWrites: 0,
};
jest.mock('../decide', () => ({
  ...jest.requireActual('../decide'),
  useDecideSnapshot: () => mockSnap,
}));

const check = (id: string, over: Partial<DecideCheckRow> = {}): DecideCheckRow =>
  ({ id, status: 'open', deleted_at: null, kind: 'cash', created_at: '2026-10-01', inputs: { v: 2, item: 'Sofa', price: 120_000 }, ...over }) as unknown as DecideCheckRow;

function seed(client: QueryClient, checks: DecideCheckRow[]): void {
  client.setQueryData(queryKeys.decideSettings('u1'), { ...EMPTY_DECIDE_SETTINGS, user_id: 'u1', income_types: ['salary_or_wages'], income_pattern: 'steady', income_pattern_confirmed: true });
  client.setQueryData(queryKeys.decideAnswers('u1', 'h1'), []);
  client.setQueryData(queryKeys.recurringDismissals('h1'), []);
  client.setQueryData(queryKeys.decideChecks('u1', 'h1'), checks);
  client.setQueryData([...queryKeys.decideLinks('u1', 'h1'), checks.map((c) => c.id).sort().join(',')], []);
}

const states: DecideV3State[][] = [];
function Consumer({ slot }: { slot: number }) {
  const s = useDecideV3();
  (states[slot] ??= []).push(s);
  return null;
}
const CONSUMERS = 8;
function Screen() {
  return (
    <>
      {Array.from({ length: CONSUMERS }, (_, i) => (
        <Consumer key={i} slot={i} />
      ))}
    </>
  );
}
const last = (slot: number): DecideV3State => states[slot]![states[slot]!.length - 1]!;

let client: QueryClient;
let builds: jest.SpyInstance;
beforeEach(() => {
  states.length = 0;
  mockSnap.source = demoSource(TODAY);
  mockSnap.unsavedWrites = 0;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  builds = jest.spyOn(buildV3InputsModule, 'buildV3Inputs');
});
afterEach(() => builds.mockRestore());

async function mount() {
  return render(
    <QueryClientProvider client={client}>
      <Screen />
    </QueryClientProvider>
  );
}

describe('useDecideV3: one build per data version (B-1)', () => {
  it('8 consumers mounted together build the inputs once and share one Prepared and one evaluation', async () => {
    seed(client, [check('c1')]);
    await mount();
    expect(builds).toHaveBeenCalledTimes(1);
    const first = last(0);
    expect(first.status).toBe('ready');
    for (let i = 1; i < CONSUMERS; i++) {
      expect(last(i).prepared).toBe(first.prepared);
      expect(last(i).v3).toBe(first.v3);
      expect(last(i).evaluation).toBe(first.evaluation);
    }
  });

  it('a draft save that changes only one check\'s stored inputs does not rebuild', async () => {
    seed(client, [check('c1'), check('c2', { status: 'bought' })]);
    await mount();
    expect(builds).toHaveBeenCalledTimes(1);
    const before = last(0).prepared;
    const rows = client.getQueryData<DecideCheckRow[]>(queryKeys.decideChecks('u1', 'h1'))!;
    await act(async () => {
      client.setQueryData(queryKeys.decideChecks('u1', 'h1'), rows.map((r) => (r.id === 'c1' ? { ...r, inputs: { v: 2, item: 'Sofa', price: 99_000 } } : { ...r })));
    });
    expect(builds).toHaveBeenCalledTimes(1);
    expect(last(0).prepared).toBe(before);
  });

  it('a check becoming bought changes the live bridge list and rebuilds once for all consumers', async () => {
    seed(client, [check('c1')]);
    await mount();
    const rows = client.getQueryData<DecideCheckRow[]>(queryKeys.decideChecks('u1', 'h1'))!;
    await act(async () => {
      client.setQueryData(queryKeys.decideChecks('u1', 'h1'), rows.map((r) => ({ ...r, status: 'bought' })));
    });
    expect(builds).toHaveBeenCalledTimes(2);
    expect(last(0).v3!.live_bridge_check_ids).toEqual(['c1']);
    for (let i = 1; i < CONSUMERS; i++) expect(last(i).prepared).toBe(last(0).prepared);
  });
});
