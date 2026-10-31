// 05.3-78 (walkthrough step 45): save the plan -> delete it straight away -> Undo. A server that keeps real versions
// refuses any apply_patches whose expectedVersion is stale. Before the fix the delete was sent with the cached
// versions (check 1, goal 1) while the server was at check 3 (answer save + outcome) and goal 1 -> conflict.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { queryKeys } from '@/data/keys';
import { registerMutationDefaults } from '@/data/mutations';
import { clearVersionChains } from '@/data/sync/versionChain';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { resetToastForTests } from '@/state/undoToast';
import { useWaitAndSave } from '../decideOutcome';
import { useRemoveDecision } from '../decideChecks';
import { useUndo } from '../undo';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `id-${++mockUuid}`) }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/features/decide/notifications/waitReminder', () => ({
  scheduleWaitReminder: jest.fn(async () => ({ scheduled: true, id: 'n1' })),
  scheduleCoolingOffReminder: jest.fn(async () => ({ scheduled: true, id: 'n2' })),
}));

jest.setTimeout(60000);

const CHECKS = queryKeys.decideChecks('u1', 'h1');
const GOALS = queryKeys.savingsGoals('u1', 'h1');

interface Call {
  name: string;
  args: Record<string, unknown>;
}

/** A server that keeps real versions: refuses a mismatched expectedVersion, otherwise bumps each row by one. */
function makeServer() {
  const versions: Record<string, number> = { 'decide_checks:chk1': 2 }; // 1 -> 2: the answer save queued just before
  const calls: Call[] = [];
  const ok = (data: unknown) => ({ data, error: null, status: 200 });
  const rpc = (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    let out: unknown;
    if (name === 'record_decide_outcome') {
      versions['decide_checks:chk1'] = versions['decide_checks:chk1']! + 1;
      const goal = (args.p_decision as { goal: { id: string } | null }).goal;
      if (goal) versions[`savings_goals:${goal.id}`] = 1;
      out = {
        status: 'applied',
        undo_step_id: (args.p_undo_step as { id: string }).id,
        check_version: versions['decide_checks:chk1'],
        goal_version: goal ? 1 : null,
      };
    } else if (name === 'apply_patches') {
      const ops = args.p_ops as { entity: string; id: string; expectedVersion: number }[];
      const bad = ops.find((o) => versions[`${o.entity}:${o.id}`] !== o.expectedVersion);
      if (bad) {
        out = {
          status: 'conflict',
          conflict: { entity: bad.entity, id: bad.id, updated_by: null, record_name: null, builtin_key: null, reason: 'changed' },
        };
      } else {
        for (const o of ops) versions[`${o.entity}:${o.id}`] = versions[`${o.entity}:${o.id}`]! + 1;
        out = { status: 'applied', rows: ops.map((o) => ({ entity: o.entity, id: o.id, version: versions[`${o.entity}:${o.id}`] })) };
      }
    } else if (name === 'apply_undo_step') {
      out = { status: 'undone' };
    } else {
      out = { status: 'applied' };
    }
    return {
      then: <T,>(f: (v: unknown) => T, r?: (e: unknown) => T) => Promise.resolve(ok(out)).then(f, r),
    };
  };
  const client = { rpc, auth: { getSession: async () => ({ data: { session: { access_token: 't' } }, error: null }) } };
  return { client, calls, versions };
}

const check = {
  id: 'chk1',
  created_by: 'u1',
  household_id: 'h1',
  name: 'Sofa',
  kind: 'buy',
  inputs: { name: 'Sofa' },
  status: 'open',
  deleted_at: null,
  version: 1,
} as unknown as DecideCheckRow;

it('save the plan, delete it before any refetch, then Undo restores it with no conflict', async () => {
  onlineManager.setOnline(true);
  resetToastForTests();
  clearVersionChains();
  mockUuid = 0;
  (recordFailedWrite as jest.Mock).mockClear();
  const server = makeServer();
  mockActiveClient = server.client;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  qc.setQueryData(CHECKS, [check]);
  // No query function is mounted, so a refetch never lands: the cache keeps what the mutation wrote.
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const { result } = await renderHook(() => ({ save: useWaitAndSave(), remove: useRemoveDecision(), undo: useUndo() }), { wrapper });

  await result.current.save.save({
    check: { ...check, version: 1 } as never,
    verdict: 'adjust',
    currency: 'USD',
    monthlyAmount: 25000,
    readyBy: '2027-03-01',
    today: '2026-10-16',
    goalTarget: 100000,
    coolingOff: false,
  });
  await waitFor(() => expect(server.calls.some((c) => c.name === 'record_decide_outcome')).toBe(true));
  await waitFor(() => expect(qc.getMutationCache().findAll({ status: 'pending' }).length).toBe(0));

  const cachedCheck = qc.getQueryData<DecideCheckRow[]>(CHECKS)![0]!;
  const cachedGoal = qc.getQueryData<SavingsGoalRow[]>(GOALS)![0]!;
  const stepId = result.current.remove.remove(cachedCheck, cachedGoal);
  await waitFor(() => expect(server.calls.some((c) => c.name === 'apply_patches')).toBe(true));
  await waitFor(() => expect(qc.getMutationCache().findAll({ status: 'pending' }).length).toBe(0));

  const patches = server.calls.find((c) => c.name === 'apply_patches')!.args.p_ops as { entity: string; expectedVersion: number }[];
  expect(patches.find((o) => o.entity === 'decide_checks')?.expectedVersion).toBe(3);
  expect(patches.find((o) => o.entity === 'savings_goals')?.expectedVersion).toBe(1);
  const step = server.calls.find((c) => c.name === 'apply_patches')!.args.p_undo_step as { ops: { entity: string; expectedVersion: number }[] };
  expect(step.ops.find((o) => o.entity === 'decide_checks')?.expectedVersion).toBe(4);
  expect(step.ops.find((o) => o.entity === 'savings_goals')?.expectedVersion).toBe(2);
  expect(recordFailedWrite).not.toHaveBeenCalled();

  result.current.undo.undo({ stepId, ownerId: 'u1', householdId: 'h1', labelKey: 'decisionDeleted', labelParams: { name: 'Sofa' } });
  await waitFor(() => expect(server.calls.some((c) => c.name === 'apply_undo_step')).toBe(true));
  expect(server.calls.find((c) => c.name === 'apply_undo_step')!.args).toEqual({ p_step_id: stepId });
  expect(recordFailedWrite).not.toHaveBeenCalled();
});
