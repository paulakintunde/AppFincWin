// 06.1-13 (ARC-24): I bought it from a v3 check. The rows written equal the figures the engine shows.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { evaluate } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money/types';
import { percent } from '@/engine/payoff/types';
import { checkOnce, checkPlan, inputsOf } from '@/engine/decide/v3/__tests__/helpers/fixtures';
import type { DbClient } from '@/db/rows';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { goAheadInputOfV3, isGoAheadRefusal, registerDecideGoAheadMutations, useGoAheadV3, type GoAheadV3Context } from '../decideGoAhead';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockN = 0;
jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `uuid-${++mockN}`) }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/features/decide/notifications/waitReminder', () => ({
  scheduleCoolingOffReminder: jest.fn(async () => ({ scheduled: true })),
  cancelCheckReminders: jest.fn(async () => undefined),
}));

jest.setTimeout(60000);
const mu = minorUnits;
const mkCtx = (over: Partial<GoAheadV3Context> = {}): GoAheadV3Context => ({
  householdId: 'h1',
  currency: 'USD',
  timeZone: 'UTC',
  today: '2026-10-03',
  name: 'Headphones',
  debtCategoryId: 'cat-debt',
  mint: () => `m-${++mockN}`,
  ...over,
});

beforeEach(() => {
  mockN = 0;
  onlineManager.setOnline(true);
});

describe('goAheadInputOfV3', () => {
  it('headphones, cash: one pending one-off row equal to Purchase.whole on the purchase date', () => {
    const check = checkOnce(15000, { taxPercent: percent('10'), oneOffFees: mu(500) });
    const ev = evaluate(inputsOf({ balance: mu(500000) }), check);
    const w = goAheadInputOfV3(check, ev, 'acc1', mkCtx());
    expect(ev.purchase?.whole).toBe(17000);
    expect(w.rows).toHaveLength(1);
    expect(w.series).toHaveLength(0);
    expect(w.rows[0]).toMatchObject({
      original_amount: -17000,
      local_date: ev.result.purchaseDate,
      account_id: 'acc1',
      status: 'pending',
      one_off: true,
    });
    expect(w.decision).toMatchObject({ verdict: ev.result.legacyState, row_roles: ['day_one'], series_roles: [], estimate_day_one: 17000 });
  });

  it('a dated purchase writes on that date', () => {
    const check = checkOnce(15000, { purchaseDate: '2026-11-20' });
    const ev = evaluate(inputsOf({ balance: mu(500000) }), check);
    expect(goAheadInputOfV3(check, ev, 'acc1', mkCtx()).rows[0]?.local_date).toBe('2026-11-20');
  });

  it('used-car plan: the deposit on the day, then a payment series from the first payment date that adds up to the card', () => {
    const check = checkPlan(1200000, {
      cadence: { unit: 'month', every: 1 },
      count: 24,
      apr: percent('0'),
      deposit: mu(200000),
      firstPayment: { kind: 'one_period' },
    });
    const ev = evaluate(inputsOf({ balance: mu(900000) }), check);
    const p = ev.purchase;
    if (p === null || p.schedule === null || ev.planCard === null) throw new Error('expected a plan');
    const w = goAheadInputOfV3(check, ev, 'acc1', mkCtx());
    const day = w.rows.filter((_, i) => w.decision.row_roles[i] === 'day_one');
    expect(day).toHaveLength(1);
    expect(day[0]?.original_amount).toBe(-p.dayOne);
    expect(p.dayOne).toBeGreaterThanOrEqual(200000);
    const paid =
      w.series.reduce((s, x) => s + Math.abs(x.amount) * (x.occurrence_count ?? 0), 0) +
      w.rows.filter((_, i) => w.decision.row_roles[i] === 'payment').reduce((s, r) => s + Math.abs(r.original_amount), 0);
    expect(paid + p.dayOne).toBe(ev.planCard.total);
    expect(w.series[0]).toMatchObject({ anchor_date: p.schedule.firstDate, freq: 'monthly', category_id: 'cat-debt' });
    expect(w.decision.series_roles.every((r) => r === 'payment')).toBe(true);
    expect(w.decision.estimate_monthly_payment + w.decision.estimate_running).toBe(w.decision.estimate_monthly);
  });

  it('a final payment that differs becomes its own pending row after the series', () => {
    const check = checkPlan(100000, {
      cadence: { unit: 'month', every: 1 },
      count: 7,
      apr: percent('9.99'),
      firstPayment: { kind: 'one_period' },
    });
    const ev = evaluate(inputsOf({ balance: mu(900000) }), check);
    const w = goAheadInputOfV3(check, ev, 'acc1', mkCtx());
    const s = ev.purchase!.schedule!;
    if (s.payment !== s.finalPayment) {
      expect(w.series[0]?.occurrence_count).toBe(s.lastPaying - 1);
      const last = w.rows[w.rows.length - 1]!;
      expect(last.original_amount).toBe(-s.finalPayment);
    }
    expect(w.rows.length + w.series.length).toBeGreaterThan(0);
  });

  it('a plan on a cadence with no recurring frequency writes one row per payment', () => {
    const check = checkPlan(60000, {
      cadence: { unit: 'month', every: 2 },
      count: 3,
      apr: percent('0'),
      firstPayment: { kind: 'one_period' },
    });
    const ev = evaluate(inputsOf({ balance: mu(900000) }), check);
    const w = goAheadInputOfV3(check, ev, 'acc1', mkCtx());
    expect(w.series).toHaveLength(0);
    expect(w.rows.filter((_, i) => w.decision.row_roles[i] === 'payment')).toHaveLength(3);
  });

  it('refuses (not a bug) when the check has no purchase', () => {
    const check = checkOnce(0, { price: null });
    const ev = evaluate(inputsOf(), check);
    let err: unknown;
    try {
      goAheadInputOfV3(check, ev, 'acc1', mkCtx());
    } catch (e) {
      err = e;
    }
    expect(isGoAheadRefusal(err)).toBe(true);
  });
});

describe('useGoAheadV3', () => {
  it('sends ONE record_decide_go call with the rows, roles and one undo step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: { status: 'applied', undo_step_id: 'uuid-x' }, error: null, status: 200 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    registerDecideGoAheadMutations(qc);
    const check = checkOnce(15000);
    const ev = evaluate(inputsOf({ balance: mu(500000) }), check);
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = await renderHook(() => useGoAheadV3(), { wrapper });
    const stepId = result.current.goAhead({
      checkId: 'chk1', ownerId: 'u1', homeCurrency: 'USD', check, evaluation: ev, accountId: 'acc1', ctx: mkCtx(),
    });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    const calls = fake.calls.filter((c) => c.method === 'rpc');
    expect(calls).toHaveLength(1);
    const [name, args] = calls[0]!.args as [string, Record<string, unknown>];
    expect(name).toBe('record_decide_go');
    expect((args.p_rows as unknown[]).length).toBe(1);
    expect(args.p_undo_step).toMatchObject({ id: stepId, label_key: 'decisionWritten' });
  });
});
