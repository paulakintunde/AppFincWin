// Shared harness for the 05.3-97 device-sequence tests (one test file per variant: each needs its own module registry,
// because the write queue, version chains and in-flight maps are module state). The test file mocks supabase to read
// `holder.client` and expo-crypto to count with `uuidCounter`.
import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import { ShellTestProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { queryKeys } from '@/data/keys';
import { registerMutationDefaults } from '@/data/mutations';
import { clearVersionChains } from '@/data/sync/versionChain';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import { resetToastForTests } from '@/state/undoToast';
import { UndoToastHost } from '@/features/record/history/UndoToastHost';
import { useDeleteDecision } from '@/features/decide/past/useDeleteDecision';
import { useWaitAndSave } from '../decideOutcome';
import { useUndo } from '../undo';

export const holder: { client: unknown } = { client: null };
export const uuidCounter = { n: 0 };

const CHECKS = queryKeys.decideChecks('u1', 'h1');
const GOALS = queryKeys.savingsGoals('u1', 'h1');

interface Call {
  name: string;
  args: Record<string, unknown>;
}
interface Step {
  id: string;
  labelKey: string;
  touched: string[];
  status: 'available' | 'undone';
  undo: () => void;
}

/** A server keeping versions, row state and undo_log steps, applying and replaying steps the way the real one does. */
export function makeServer(opts: { slowMs?: number } = {}) {
  const versions: Record<string, number> = { 'decide_checks:chkA': 2, 'decide_checks:chkB': 2 };
  const checks: Record<string, { status: string; deleted: boolean }> = {
    chkA: { status: 'open', deleted: false },
    chkB: { status: 'open', deleted: false },
  };
  const goals: Record<string, { deleted: boolean }> = {};
  const steps = new Map<string, Step>();
  const calls: Call[] = [];
  const ok = (data: unknown) => ({ data, error: null, status: 200 });
  const wrap = (out: unknown, delay = 0) => ({
    then: <T,>(f: (v: unknown) => T, r?: (e: unknown) => T) =>
      new Promise((res) => (delay > 0 ? setTimeout(() => res(ok(out)), delay) : res(ok(out)))).then(f as never, r as never),
  });
  const rpc = (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    let out: unknown;
    let delay = 0;
    if (name === 'record_decide_outcome') {
      const checkId = args.p_check_id as string;
      const goal = (args.p_decision as { goal: { id: string } | null }).goal;
      versions[`decide_checks:${checkId}`] = versions[`decide_checks:${checkId}`]! + 1;
      checks[checkId]!.status = 'waiting';
      if (goal) {
        goals[goal.id] = { deleted: false };
        versions[`savings_goals:${goal.id}`] = 1;
      }
      const s = args.p_undo_step as { id: string; label_key: string };
      steps.set(s.id, {
        id: s.id,
        labelKey: s.label_key,
        touched: [checkId, ...(goal ? [goal.id] : [])],
        status: 'available',
        undo: () => {
          checks[checkId]!.status = 'open';
          if (goal) goals[goal.id]!.deleted = true;
        },
      });
      out = { status: 'applied', undo_step_id: s.id, check_version: versions[`decide_checks:${checkId}`], goal_version: goal ? 1 : null };
    } else if (name === 'apply_patches') {
      if (opts.slowMs) delay = opts.slowMs;
      const ops = args.p_ops as { entity: string; id: string; expectedVersion: number }[];
      const bad = ops.find((o) => versions[`${o.entity}:${o.id}`] !== o.expectedVersion);
      if (bad) {
        out = {
          status: 'conflict',
          conflict: { entity: bad.entity, id: bad.id, updated_by: null, record_name: null, builtin_key: null, reason: 'changed' },
        };
      } else {
        for (const o of ops) versions[`${o.entity}:${o.id}`] = versions[`${o.entity}:${o.id}`]! + 1;
        for (const o of ops) {
          if (o.entity === 'decide_checks') checks[o.id]!.deleted = true;
          else if (o.entity === 'savings_goals') goals[o.id]!.deleted = true;
        }
        const s = args.p_undo_step as { id: string; label_key: string } | undefined;
        if (s) {
          steps.set(s.id, {
            id: s.id,
            labelKey: s.label_key,
            touched: ops.map((o) => o.id),
            status: 'available',
            undo: () => {
              for (const o of ops) {
                if (o.entity === 'decide_checks') checks[o.id]!.deleted = false;
                else if (o.entity === 'savings_goals') goals[o.id]!.deleted = false;
              }
            },
          });
        }
        out = { status: 'applied', rows: ops.map((o) => ({ entity: o.entity, id: o.id, version: versions[`${o.entity}:${o.id}`] })) };
      }
    } else if (name === 'apply_undo_step') {
      const step = steps.get(args.p_step_id as string);
      if (!step) out = { status: 'not-found' };
      else if (step.status === 'undone') out = { status: 'already-undone' };
      else {
        step.status = 'undone';
        step.undo();
        out = { status: 'undone' };
      }
    } else {
      out = { status: 'applied' };
    }
    return wrap(out, delay);
  };
  const from = (table: string) => {
    let id = '';
    const q = {
      select: () => q,
      eq: (_c: string, v: string) => {
        id = v;
        return q;
      },
      maybeSingle: async () => {
        if (table !== 'undo_log') return ok(null);
        const s = steps.get(id);
        return ok(s ? { id: s.id, label_key: s.labelKey, status: s.status, touched_ids: s.touched } : null);
      },
    };
    return q;
  };
  const client = { rpc, from, auth: { getSession: async () => ({ data: { session: { access_token: 't' } }, error: null }) } };
  return { client, calls, versions, checks, goals, steps };
}

const mkCheck = (id: string, name: string): DecideCheckRow =>
  ({ id, created_by: 'u1', household_id: 'h1', name, kind: 'buy', inputs: { name }, status: 'open', deleted_at: null, version: 1 }) as unknown as DecideCheckRow;

export interface Api {
  save: ReturnType<typeof useWaitAndSave>;
  del: ReturnType<typeof useDeleteDecision>;
  undo: ReturnType<typeof useUndo>;
}
const apiRef: { current: Api | null } = { current: null };
export const getApi = (): Api => apiRef.current as Api;
function Harness() {
  const value: Api = { save: useWaitAndSave(), del: useDeleteDecision(), undo: useUndo() };
  React.useEffect(() => {
    apiRef.current = value;
  });
  return <UndoToastHost />;
}

export async function setup(opts: { slowMs?: number } = {}) {
  onlineManager.setOnline(true);
  resetToastForTests();
  resetShellStores();
  clearVersionChains();
  uuidCounter.n = 0;
  (recordFailedWrite as jest.Mock).mockClear();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(async () => false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never);
  const server = makeServer(opts);
  holder.client = server.client;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  qc.setQueryData(CHECKS, [mkCheck('chkA', 'Coffee beans'), mkCheck('chkB', 'Mug')]);
  await render(
    <ShellTestProviders>
      <QueryClientProvider client={qc}>
        <Harness />
      </QueryClientProvider>
    </ShellTestProviders>
  );
  return { server, qc };
}

const saveArgs = (check: DecideCheckRow, goalTarget: number) => ({
  check: { ...check, version: 1 } as never,
  verdict: 'adjust' as const,
  currency: 'USD',
  monthlyAmount: 25000,
  readyBy: '2027-03-01',
  today: '2026-10-16',
  goalTarget,
  coolingOff: false,
});

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function settle(qc: QueryClient) {
  await act(async () => {
    await sleep(10);
  });
  await waitFor(() => expect(qc.getMutationCache().findAll({ status: 'pending' }).filter((m) => !m.state.isPaused).length).toBe(0));
}

export async function saveBoth(qc: QueryClient, server: ReturnType<typeof makeServer>) {
  const [a, b] = qc.getQueryData<DecideCheckRow[]>(CHECKS)!;
  await act(async () => {
    await getApi().save.save(saveArgs(a!, 4000000));
  });
  await waitFor(() => expect(server.calls.filter((c) => c.name === 'record_decide_outcome').length).toBe(1));
  await settle(qc);
  await act(async () => {
    await getApi().save.save(saveArgs(b!, 3500));
  });
  await waitFor(() => expect(server.calls.filter((c) => c.name === 'record_decide_outcome').length).toBe(2));
  await settle(qc);
}

export function deleteB(qc: QueryClient) {
  const checks = qc.getQueryData<DecideCheckRow[]>(CHECKS)!;
  const goals = qc.getQueryData<SavingsGoalRow[]>(GOALS);
  act(() => {
    getApi().del.deleteDecision(checks.find((c) => c.id === 'chkB')!, goals);
  });
}

export const goalIdOf = (server: ReturnType<typeof makeServer>, checkId: string) =>
  [...server.steps.values()].find((s) => s.labelKey === 'planSaved' && s.touched[0] === checkId)!.touched[1]!;
export const stepOf = (server: ReturnType<typeof makeServer>, label: string, checkId: string) =>
  [...server.steps.values()].find((s) => s.labelKey === label && s.touched.includes(checkId))!;


