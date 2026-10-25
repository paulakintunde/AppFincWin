// D-88 / R16.16 M2: a request that times out after the server committed is retried by the write queue, so every
// retried mutation must leave ONE row and ONE undo step. The server here is a small in-memory stand-in with the
// replay rules the real one has (a duplicate id is 23505, record_decide_go and apply_patches answer
// already-applied for a step id they have seen). The first request of each test commits and then loses its answer.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager, useMutation } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { Plan, RunningCosts } from '@/engine/decide';
import type { DbClient } from '@/db/rows';
import { mutationKeys } from '@/data/keys';
import { registerMutationDefaults } from '@/data/mutations';
import { useAddTransaction } from '@/data/mutations/transactions';
import { useGoAhead, type GoAheadContext, type GoAheadAssessment } from '@/data/mutations/decideGoAhead';
import type { EditTransferVars } from '@/data/mutations/transfers';
import { emptyCheckInputs } from '@/features/decide/snapshot/checkInputs';
import { clearVersionChains } from '@/data/sync/versionChain';
import { recordFailedWrite } from '@/data/sync/failedWrites';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `id-${++mockUuid}`) }));
jest.mock('@/services/locale/deviceLocale', () => ({ getDeviceTimeZone: jest.fn(() => 'UTC') }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/features/decide/notifications/waitReminder', () => ({
  scheduleCoolingOffReminder: jest.fn(async () => ({ scheduled: true as const, id: 'n1' })),
  cancelCheckReminders: jest.fn(async () => undefined),
}));

type Row = Record<string, unknown>;

/** The answer a request gets when the connection dies: postgrest-js flattens it to a status-0 error. */
const LOST = { data: null, error: { message: 'TypeError: Network request failed', code: '' }, status: 0 };
const dbOk = (data: unknown, status = 200) => ({ data, error: null, status });

class ServerSim {
  readonly tables: { transactions: Row[]; undo_log: Row[] } = { transactions: [], undo_log: [] };
  readonly rpcCalls: { name: string; stepId: string | null }[] = [];
  /** How many committing requests still commit and then lose their answer. */
  loseAnswers = 0;
  session = { access_token: 'fake-token' };

  auth = { getSession: async () => ({ data: { session: this.session }, error: null }) };

  private finish<T>(response: T): T | typeof LOST {
    if (this.loseAnswers > 0) {
      this.loseAnswers -= 1;
      return LOST;
    }
    return response;
  }

  private table(name: string): Row[] {
    if (name === 'undo_log') return this.tables.undo_log;
    if (name === 'transactions' || name === 'transactions_active') return this.tables.transactions;
    throw new Error(`ServerSim: unexpected table ${name}`);
  }

  rpc(name: string, args: Record<string, unknown>) {
    const step = (args.p_undo_step ?? null) as { id: string } | null;
    this.rpcCalls.push({ name, stepId: step?.id ?? null });
    let response: Row;
    const seen = step !== null && this.tables.undo_log.some((s) => s.id === step.id);
    if (name === 'record_decide_go') {
      if (seen) {
        response = dbOk({ status: 'already-applied', undo_step_id: step!.id });
      } else {
        for (const row of args.p_rows as Row[]) this.tables.transactions.push({ version: 1, deleted_at: null, ...row });
        this.tables.undo_log.push({ id: step!.id });
        response = dbOk({ status: 'applied', undo_step_id: step!.id });
      }
    } else if (name === 'apply_patches') {
      const ops = args.p_ops as { id: string; expectedVersion: number; patch: Row }[];
      if (!seen) {
        for (const op of ops) {
          const row = this.tables.transactions.find((r) => r.id === op.id)!;
          Object.assign(row, op.patch, { version: (row.version as number) + 1 });
        }
        this.tables.undo_log.push({ id: step!.id });
      }
      const rows = ops.map((op) => ({
        entity: 'transactions',
        id: op.id,
        version: this.tables.transactions.find((r) => r.id === op.id)!.version,
      }));
      response = dbOk({ status: seen ? 'already-applied' : 'applied', rows });
    } else {
      throw new Error(`ServerSim: unexpected rpc ${name}`);
    }
    const out = this.finish(response);
    return { then: <T,>(f: (v: unknown) => T, r?: (e: unknown) => T) => Promise.resolve(out).then(f, r) };
  }

  from(name: string) {
    let op: 'select' | 'insert' = 'select';
    let payload: Row | null = null;
    const filters: ((r: Row) => boolean)[] = [];
    const rows = (): Row[] => this.table(name).filter((r) => filters.every((f) => f(r)));
    const run = (single: 'single' | 'maybe' | null) => {
      if (op === 'insert') {
        const exists = this.table(name).some((r) => r.id === payload!.id);
        if (exists) return { data: null, error: { message: 'duplicate key', code: '23505' }, status: 409 };
        const row = { version: 1, deleted_at: null, ...payload! };
        this.table(name).push(row);
        return this.finish(dbOk(single ? row : [row], 201));
      }
      const found = rows();
      return dbOk(single ? (found[0] ?? null) : found);
    };
    const builder = {
      insert: (row: Row) => {
        op = 'insert';
        payload = row;
        return builder;
      },
      select: () => builder,
      eq: (col: string, value: unknown) => {
        filters.push((r) => r[col] === value);
        return builder;
      },
      in: (col: string, values: unknown[]) => {
        filters.push((r) => values.includes(r[col]));
        return builder;
      },
      is: (col: string, value: unknown) => {
        filters.push((r) => (r[col] ?? null) === value);
        return builder;
      },
      single: () => Promise.resolve(run('single')),
      maybeSingle: () => Promise.resolve(run('maybe')),
      then: <T,>(f: (v: unknown) => T, r?: (e: unknown) => T) => Promise.resolve(run(null)).then(f, r),
    };
    // The active view reads live rows only.
    if (name === 'transactions_active') filters.push((r) => (r.deleted_at ?? null) === null);
    return builder;
  }
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function setup(): { server: ServerSim; qc: QueryClient } {
  const server = new ServerSim();
  mockActiveClient = server as unknown as DbClient;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerMutationDefaults(qc);
  return { server, qc };
}

const settled = (qc: QueryClient) => async () => {
  const all = qc.getMutationCache().getAll();
  expect(all.length).toBeGreaterThan(0);
  expect(all.every((m) => m.state.status === 'success')).toBe(true);
};

const asMoney = (n: number) => n as never;

const ctx: GoAheadContext = {
  householdId: 'h1',
  currency: 'USD',
  timeZone: 'UTC',
  today: '2026-10-16',
  cashAccountId: 'cash',
  cardAccountId: 'card',
  debtCategoryId: 'cat-debt',
  savingsCategoryId: 'cat-savings',
  transferCategoryId: 'cat-transfer',
  investAccount: null,
  replacedSeries: [],
};

const RUNNING: RunningCosts = { gross: asMoney(0), replaced: asMoney(0), net: asMoney(0), countedCosts: 0, totalCosts: 0, countedReplaced: 0, nonCash: asMoney(0) };

function cashPlan(): Plan {
  return {
    price: asMoney(100000),
    dayOne: asMoney(100000),
    monthly: asMoney(0),
    months: 0,
    financed: asMoney(0),
    total: asMoney(100000),
    interest: asMoney(0),
    dayFees: asMoney(0),
    card: null,
    finalMonthly: null,
    impliedAnnualRate: null,
    paymentSteps: [],
    promo: null,
    lateFees: null,
  } as Plan;
}

beforeEach(() => {
  mockUuid = 0;
  clearVersionChains();
  (recordFailedWrite as jest.Mock).mockClear();
  onlineManager.setOnline(true);
  jest.useFakeTimers({ advanceTimers: true });
});

afterEach(() => {
  jest.useRealTimers();
  onlineManager.setOnline(true);
});

describe('timeout retry replays', () => {
  const scenarios: (() => Promise<void>)[] = [];
  const scenario = (_name: string, fn: () => Promise<void>) => {
    scenarios.push(fn);
  };

  scenario('Go ahead leaves one set of rows and one undo step', async () => {
    const { server, qc } = setup();
    server.loseAnswers = 1;
    const { result } = await renderHook(() => useGoAhead(), { wrapper: wrapper(qc) });

    const stepId = result.current.goAhead({
      checkId: 'chk1',
      ownerId: 'u1',
      homeCurrency: 'USD',
      inputs: { ...emptyCheckInputs('buy', ctx.today), name: 'Sofa', method: 'cash' as const, needBy: '2026-11-03' },
      assessment: {
        state: 'fits',
        plan: cashPlan(),
        size: 'from_spare_this_month',
        mineDayOne: cashPlan().dayOne,
        mineMonthly: cashPlan().monthly,
        mineRunning: asMoney(0),
        newMonthly: cashPlan().monthly,
      } as unknown as GoAheadAssessment,
      running: RUNNING,
      ctx,
    });

    await waitFor(settled(qc), { timeout: 10_000 });
    // asked twice (the answer to the first was lost), with the same replay key
    expect(server.rpcCalls).toEqual([
      { name: 'record_decide_go', stepId },
      { name: 'record_decide_go', stepId },
    ]);
    expect(server.tables.transactions).toHaveLength(1);
    expect(server.tables.undo_log).toEqual([{ id: stepId }]);
    expect(server.loseAnswers).toBe(0); // the first answer really was lost
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  scenario('a transaction insert leaves one row and one undo step', async () => {
    const { server, qc } = setup();
    server.loseAnswers = 1;
    const { result } = await renderHook(() => useAddTransaction(), { wrapper: wrapper(qc) });

    const id = result.current.add({
      householdId: 'h1',
      accountId: 'acc1',
      amount: 500 as never,
      currency: 'USD',
      homeCurrency: 'USD',
      userId: 'user-1',
      localDate: '2026-09-24',
      timeZone: 'UTC',
      undo: { stepId: 'step-tx', labelKey: 'added', labelParams: { name: 'Coffee' } },
    });

    await waitFor(settled(qc), { timeout: 10_000 });
    expect(server.tables.transactions.filter((r) => r.id === id)).toHaveLength(1);
    expect(server.tables.undo_log.filter((s) => s.id === 'step-tx')).toHaveLength(1);
    expect(server.loseAnswers).toBe(0); // the first answer really was lost
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  scenario('a transfer edit (apply_patches) changes each leg once and keeps one undo step', async () => {
    const { server, qc } = setup();
    server.tables.transactions.push(
      { id: 'o1', household_id: 'h1', transfer_id: 'T1', local_date: '2026-09-24', version: 2, deleted_at: null },
      { id: 'i1', household_id: 'h1', transfer_id: 'T1', local_date: '2026-09-24', version: 4, deleted_at: null }
    );
    server.loseAnswers = 1;
    const { result } = await renderHook(
      () => useMutation<unknown, unknown, EditTransferVars>({ mutationKey: mutationKeys.editTransfer }),
      { wrapper: wrapper(qc) }
    );

    result.current.mutate({
      householdId: 'h1',
      ownerId: 'user-1',
      stepId: 'step-edit',
      transferId: 'T1',
      labelName: 'Savings',
      legs: [
        { id: 'o1', version: 2, month: '2026-09', patch: { local_date: '2026-09-25' }, before: { local_date: '2026-09-24' } },
        { id: 'i1', version: 4, month: '2026-09', patch: { local_date: '2026-09-25' }, before: { local_date: '2026-09-24' } },
      ],
    });

    await waitFor(settled(qc), { timeout: 10_000 });
    expect(server.rpcCalls).toEqual([
      { name: 'apply_patches', stepId: 'step-edit' },
      { name: 'apply_patches', stepId: 'step-edit' },
    ]);
    // each leg moved once: version 2 -> 3 and 4 -> 5, not 3 -> 4 on the replay
    expect(server.tables.transactions.map((r) => [r.id, r.version, r.local_date])).toEqual([
      ['o1', 3, '2026-09-25'],
      ['i1', 5, '2026-09-25'],
    ]);
    expect(server.tables.undo_log).toEqual([{ id: 'step-edit' }]);
    expect(server.loseAnswers).toBe(0); // the first answer really was lost
    expect(recordFailedWrite).not.toHaveBeenCalled();
  });

  // R16.16 M2: Go ahead (record_decide_go), a transaction insert (23505 read back) and a transfer (apply_patches).
  it('D-88 timeout retry is idempotent', async () => {
    for (const run of scenarios) {
      clearVersionChains();
      (recordFailedWrite as jest.Mock).mockClear();
      await run();
    }
  });
});
