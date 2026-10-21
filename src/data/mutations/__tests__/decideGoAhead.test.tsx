// 05-20 (D-09): Go ahead builds exactly what 05-17's writtenLines shows and writes it as one undoable step.
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
globalThis.crypto = globalThis.crypto ?? (require('crypto').webcrypto as Crypto);

import React from 'react';
import fc from 'fast-check';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { Assessment, PaymentStep, Plan, RunningCosts } from '@/engine/decide';
import type { DbClient } from '@/db/rows';
import type { DecideCheckRow } from '@/db/decideChecks';
import { createFakeSupabase, type FakeSupabase } from '@/db/__tests__/fakeSupabase';
import { queryKeys } from '@/data/keys';
import type { WithPending } from '@/data/types';
import { emptyCheckInputs } from '@/features/decide/snapshot/checkInputs';
import type { CheckInputs } from '@/features/decide/snapshot/types';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { recordFailedWrite } from '@/data/sync/failedWrites';
import {
  buildGoAheadWrite,
  registerDecideGoAheadMutations,
  useGoAhead,
  type GoAheadAssessment,
  type GoAheadContext,
} from '../decideGoAhead';
/* eslint-enable import/first, @typescript-eslint/no-require-imports */

let mockActiveClient: unknown;
let mockUuid = 0;
const mockTrack = jest.fn();
const mockCooling = jest.fn(async () => ({ scheduled: true as const, id: 'n1' }));

jest.mock('@/services/supabase', () => ({
  get supabase() {
    return mockActiveClient;
  },
}));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `id-${++mockUuid}`) }));
jest.mock('@/data/sync/failedWrites', () => ({ recordFailedWrite: jest.fn(async () => undefined) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
const mockCancelReminders = jest.fn(async () => undefined);
jest.mock('@/features/decide/notifications/waitReminder', () => ({
  scheduleCoolingOffReminder: (...a: unknown[]) => (mockCooling as (...x: unknown[]) => Promise<unknown>)(...a),
  cancelCheckReminders: (...a: unknown[]) => (mockCancelReminders as (...x: unknown[]) => Promise<unknown>)(...a),
}));

const TODAY = '2026-10-16';

const ctx: GoAheadContext = {
  householdId: 'h1',
  currency: 'USD',
  timeZone: 'UTC',
  today: TODAY,
  cashAccountId: 'cash',
  cardAccountId: 'card',
  debtCategoryId: 'cat-debt',
  savingsCategoryId: 'cat-savings',
  transferCategoryId: 'cat-transfer',
  investAccount: null,
  replacedSeries: [],
};

function counter(): () => string {
  let n = 0;
  return () => `m-${++n}`;
}

const asMoney = (n: number) => n as never;

function makePlan(over: Partial<Plan> = {}): Plan {
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
    ...over,
  } as Plan;
}

function assessment(plan: Plan, over: Partial<GoAheadAssessment> = {}): GoAheadAssessment {
  return {
    state: 'fits',
    plan,
    size: 'from_spare_this_month',
    mineDayOne: plan.dayOne,
    mineMonthly: plan.monthly,
    mineRunning: asMoney(0),
    newMonthly: plan.monthly,
    ...over,
  } as GoAheadAssessment;
}

function buyInputs(over: Partial<CheckInputs> = {}): CheckInputs {
  return { ...emptyCheckInputs('buy', TODAY), name: 'Sofa', ...over };
}

const step = (fromMonth: number, toMonth: number, amount: number): PaymentStep => ({ fromMonth, toMonth, amount: asMoney(amount) });

const RUNNING: RunningCosts = { gross: asMoney(0), replaced: asMoney(0), net: asMoney(0), countedCosts: 0, totalCosts: 0, countedReplaced: 0, nonCash: asMoney(0) };

function build(inputs: CheckInputs, plan: Plan, over: Partial<GoAheadAssessment> = {}, c: GoAheadContext = ctx, running: RunningCosts | null = RUNNING) {
  return buildGoAheadWrite({ inputs, assessment: assessment(plan, over), running, ctx: c, mint: counter() });
}

const total = (w: ReturnType<typeof build>): number =>
  w.series.reduce((sum, s) => sum + -s.amount * (s.occurrence_count ?? 0), 0) +
  w.rows.reduce((sum, r, i) => (w.decision.row_roles[i] === 'payment' ? sum - r.original_amount : sum), 0);

describe('buildGoAheadWrite', () => {
  it('cash writes one pending expense on the need-by date', () => {
    const w = build(buyInputs({ method: 'cash', needBy: '2026-11-03' }), makePlan());
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ account_id: 'cash', original_amount: -100000, local_date: '2026-11-03', status: 'pending', name: 'Sofa' });
    expect(w.series).toEqual([]);
    expect(w.debt).toBeNull();
    expect(w.decision.row_roles).toEqual(['day_one']);
  });

  it('cash dated today when there is no need-by date', () => {
    const w = build(buyInputs({ method: 'cash' }), makePlan());
    expect(w.rows[0]!.local_date).toBe(TODAY);
  });

  it('a loan writes the deposit, one payment series and a debt record', () => {
    const plan = makePlan({ dayOne: asMoney(20000), financed: asMoney(80000), monthly: asMoney(2500), months: 36, total: asMoney(110000), paymentSteps: [step(1, 36, 2500)] });
    const inputs = buyInputs({ method: 'loan', loan: { ...emptyCheckInputs('buy', TODAY).loan, aprText: '6.5', termMonths: 48, secured: true } });
    const w = build(inputs, plan);
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ original_amount: -20000, category_id: null });
    expect(w.series).toHaveLength(1);
    expect(w.series[0]).toMatchObject({ amount: -2500, freq: 'monthly', occurrence_count: 36, category_id: 'cat-debt', anchor_date: '2026-11-16' });
    expect(w.debt).toMatchObject({ kind: 'loan', balance: 80000, apr: '6.5', minimum_payment: 2500, secured: true, term_months: 48, start_date: TODAY });
    expect(w.decision.series_roles).toEqual(['payment']);
  });

  it('the loan debt names its payment series', () => {
    const plan = makePlan({ dayOne: asMoney(0), financed: asMoney(80000), monthly: asMoney(2500), months: 36, total: asMoney(90000), paymentSteps: [step(1, 36, 2500)] });
    const write = build(buyInputs({ method: 'loan' }), plan);
    expect(write.debt).not.toBeNull();
    expect(write.debt!.series_id).toBe(write.series[0]!.id);
    expect(write.debt!.apr).toBeNull();
  });

  it('a loan with nothing financed writes no debt', () => {
    const plan = makePlan({ dayOne: asMoney(100000), financed: asMoney(0), paymentSteps: [] });
    const w = build(buyInputs({ method: 'loan' }), plan);
    expect(w.debt).toBeNull();
    expect(w.series).toEqual([]);
    expect(w.rows).toHaveLength(1);
  });

  it('a loan final payment of one month is a pending row in the Debt category', () => {
    const plan = makePlan({ dayOne: asMoney(0), financed: asMoney(10000), monthly: asMoney(4000), months: 3, total: asMoney(10000), paymentSteps: [step(1, 2, 4000), step(3, 3, 2000)] });
    const w = build(buyInputs({ method: 'loan' }), plan);
    expect(w.series).toHaveLength(1);
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ original_amount: -2000, local_date: '2027-01-16', status: 'pending', category_id: 'cat-debt' });
    expect(w.decision.row_roles).toEqual(['payment']);
    expect(w.debt!.series_id).toBe(w.series[0]!.id);
  });

  it('a loan whose only run is one month has no series id on its debt', () => {
    const plan = makePlan({ dayOne: asMoney(0), financed: asMoney(5000), monthly: asMoney(5000), months: 1, total: asMoney(5000), paymentSteps: [step(1, 1, 5000)] });
    const w = build(buyInputs({ method: 'loan' }), plan);
    expect(w.series).toEqual([]);
    expect(w.debt!.series_id).toBeNull();
  });

  it('every payment run of a promo loan is a payment link', () => {
    const plan = makePlan({ dayOne: asMoney(0), financed: asMoney(60000), monthly: asMoney(5000), months: 18, total: asMoney(80000), paymentSteps: [step(1, 12, 1000), step(13, 18, 11333)] });
    const w = build(buyInputs({ method: 'loan' }), plan);
    expect(w.series).toHaveLength(2);
    expect(w.decision.series_roles).toEqual(['payment', 'payment']);
    expect(w.debt!.series_id).toBe(w.series[0]!.id);
    expect(w.series[1]).toMatchObject({ anchor_date: '2027-11-16', occurrence_count: 6 });
  });

  it('an instalment writes its payment run as a series with a count', () => {
    const plan = makePlan({ dayOne: asMoney(0), financed: asMoney(60000), monthly: asMoney(5000), months: 12, total: asMoney(60000), paymentSteps: [step(1, 12, 5000)] });
    const w = build(buyInputs({ method: 'instalment' }), plan);
    expect(w.rows).toEqual([]);
    expect(w.series).toHaveLength(1);
    expect(w.series[0]).toMatchObject({ amount: -5000, occurrence_count: 12, category_id: null });
    expect(w.debt).toBeNull();
  });

  it('a card paid over months writes its payment series', () => {
    const plan = makePlan({
      dayOne: asMoney(1500),
      total: asMoney(121500),
      paymentSteps: [step(1, 12, 10000)],
      card: { eligibility: 'ok', onCard: asMoney(98500), remainderOnDay: asMoney(1000), payoff: 'months', payoffMonths: 12, minimumOutcome: null, remainingAtCap: null, fees: asMoney(500), cardCosts: null } as never,
    });
    const inputs = buyInputs({ method: 'card', card: { ...emptyCheckInputs('buy', TODAY).card, payoff: 'months' } });
    const w = build(inputs, plan);
    expect(w.rows).toHaveLength(2);
    expect(w.rows[0]).toMatchObject({ account_id: 'card', original_amount: -98500 });
    expect(w.rows[1]).toMatchObject({ account_id: 'cash', original_amount: -1500 });
    expect(w.series).toHaveLength(1);
    expect(w.series[0]).toMatchObject({ account_id: 'cash', amount: -10000, occurrence_count: 12, category_id: 'cat-debt' });
    expect(w.decision.series_roles.every((r) => r === 'payment')).toBe(true);
    expect(total(w)).toBe(120000);
    expect(w.debt).toBeNull();
  });

  it('a card paid over months writes a run of one as a series too', () => {
    const plan = makePlan({
      dayOne: asMoney(0),
      total: asMoney(30000),
      paymentSteps: [step(1, 2, 12000), step(3, 3, 6000)],
      card: { eligibility: 'ok', onCard: asMoney(30000), remainderOnDay: asMoney(0), payoff: 'months', payoffMonths: 3, minimumOutcome: null, remainingAtCap: null, fees: asMoney(0), cardCosts: null } as never,
    });
    const w = build(buyInputs({ method: 'card' }), plan);
    expect(w.rows).toHaveLength(1);
    expect(w.series.map((s) => s.occurrence_count)).toEqual([2, 1]);
    expect(w.decision.series_roles).toEqual(['payment', 'payment']);
  });

  it('a card paid in full writes no payment series', () => {
    const plan = makePlan({
      dayOne: asMoney(100000),
      card: { eligibility: 'ok', onCard: asMoney(100000), remainderOnDay: asMoney(0), payoff: 'full', payoffMonths: 1, minimumOutcome: null, remainingAtCap: null, fees: asMoney(0), cardCosts: null } as never,
    });
    const w = build(buyInputs({ method: 'card', card: { ...emptyCheckInputs('buy', TODAY).card, payoff: 'full' } }), plan);
    expect(w.series).toEqual([]);
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ account_id: 'card', original_amount: -100000 });
    expect(w.debt).toBeNull();
  });

  it('running costs become monthly series and replaced recurring expenses end on the need-by date', () => {
    const inputs = buyInputs({
      method: 'cash',
      needBy: '2026-12-01',
      runningCosts: [
        { id: 'r1', name: 'Insurance', amount: 4000, note: '', counted: true, seriesId: null, category: null },
        { id: 'r2', name: 'Skipped', amount: 900, note: '', counted: false, seriesId: null, category: null },
      ],
      replaces: [
        { id: 'p1', name: 'Old', amount: 3000, note: '', counted: true, seriesId: 's-old', category: null },
        { id: 'p2', name: 'Gone', amount: 100, note: '', counted: true, seriesId: 's-gone', category: null },
      ],
    });
    const w = build(inputs, makePlan(), {}, { ...ctx, replacedSeries: [{ id: 's-old', version: 4 }] }, { ...RUNNING, countedCosts: 1, countedReplaced: 2 });
    expect(w.series).toHaveLength(1);
    expect(w.series[0]).toMatchObject({ name: 'Insurance', amount: -4000, anchor_date: '2026-12-01', occurrence_count: null, end_date: null });
    expect(w.decision.series_roles).toEqual(['running_cost']);
    expect(w.endSeries).toEqual([{ id: 's-old', expected_version: 4, end_date: '2026-12-01' }]);
  });

  it('IN-C07: a legacy loss_of_value running-cost line writes no series', () => {
    const inputs = buyInputs({
      method: 'cash',
      runningCosts: [
        { id: 'l1', name: 'Loss', amount: 9_999, note: '', counted: true, seriesId: null, category: 'loss_of_value' },
        { id: 'r1', name: 'Insurance', amount: 4000, note: '', counted: true, seriesId: null, category: null },
      ],
    });
    const w = build(inputs, makePlan(), {}, ctx, { ...RUNNING, countedCosts: 1 });
    expect(w.series.map((s) => s.name)).toEqual(['Insurance']);
  });

  it('CR-C02: a recurring bill named twice is ended once', () => {
    const twice = { id: 'p1', name: 'Old', amount: 3000, note: '', counted: true, seriesId: 's-old', category: null };
    const inputs = buyInputs({ method: 'cash', needBy: '2026-12-01', replaces: [twice, { ...twice, id: 'p2' }] });
    const w = build(inputs, makePlan(), {}, { ...ctx, replacedSeries: [{ id: 's-old', version: 4 }] }, { ...RUNNING, countedReplaced: 1 });
    expect(w.endSeries).toEqual([{ id: 's-old', expected_version: 4, end_date: '2026-12-01' }]);
  });

  it('a lump investment into a tracked account writes a pending transfer', () => {
    const plan = makePlan({ dayOne: asMoney(50000), total: asMoney(50000) });
    const inputs = { ...emptyCheckInputs('invest', TODAY), name: 'Fund', method: 'lump' as const, investAccountId: 'inv' };
    const w = build(inputs, plan, {}, { ...ctx, investAccount: { id: 'inv', currency: 'USD' } });
    expect(w.rows).toHaveLength(2);
    expect(w.rows[0]!.original_amount).toBe(-50000);
    expect(w.rows[1]!.original_amount).toBe(50000);
    expect(w.rows[0]!.transfer_id).toBeTruthy();
    expect(w.rows[0]!.transfer_id).toBe(w.rows[1]!.transfer_id);
    expect(w.rows.map((r) => r.status)).toEqual(['pending', 'pending']);
    expect(w.rows.every((r) => r.category_id === 'cat-transfer')).toBe(true);
    expect(w.decision.row_roles).toEqual(['day_one', 'day_one']);
    expect(w.debt).toBeNull();
  });

  it('a lump investment with no account writes one pending outflow', () => {
    const plan = makePlan({ dayOne: asMoney(50000), total: asMoney(50000) });
    const inputs = { ...emptyCheckInputs('invest', TODAY), name: 'Fund', method: 'lump' as const, needBy: '2026-11-20' };
    const w = build(inputs, plan);
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ account_id: 'cash', original_amount: -50000, local_date: '2026-11-20', status: 'pending', category_id: null });
    const undated = build({ ...inputs, needBy: null }, plan);
    expect(undated.rows[0]!.local_date).toBe(TODAY);
    expect(undated.debt).toBeNull();
  });

  it('a lump investment into an account in another currency falls back to one pending outflow', () => {
    const plan = makePlan({ dayOne: asMoney(50000), total: asMoney(50000) });
    const inputs = { ...emptyCheckInputs('invest', TODAY), name: 'Fund', method: 'lump' as const, investAccountId: 'inv' };
    const w = build(inputs, plan, {}, { ...ctx, investAccount: { id: 'inv', currency: 'EUR' } });
    expect(w.rows).toHaveLength(1);
  });

  it('a monthly investment writes one series for the term', () => {
    const plan = makePlan({ dayOne: asMoney(0), monthly: asMoney(20000), months: 24, total: asMoney(480000), paymentSteps: [step(1, 24, 20000)] });
    const inputs = { ...emptyCheckInputs('invest', TODAY), name: 'Fund', method: 'monthly' as const };
    const w = build(inputs, plan);
    expect(w.rows).toEqual([]);
    expect(w.series).toHaveLength(1);
    expect(w.series[0]).toMatchObject({ amount: -20000, occurrence_count: 24, category_id: 'cat-savings', anchor_date: TODAY });
    expect(w.debt).toBeNull();
  });

  it('the decision stores the day-one and monthly estimates', () => {
    const plan = makePlan({ dayOne: asMoney(20000), financed: asMoney(80000), monthly: asMoney(2500), months: 36, paymentSteps: [step(1, 36, 2500)] });
    const w = build(buyInputs({ method: 'loan', coolingOff: true }), plan, {
      state: 'adjust',
      mineDayOne: asMoney(10000),
      mineMonthly: asMoney(1250),
      mineRunning: asMoney(300),
      newMonthly: asMoney(1550),
      size: 'needs_spreading',
    });
    expect(w.decision).toMatchObject({
      verdict: 'adjust',
      estimate_day_one: 10000,
      estimate_monthly: 1550,
      estimate_monthly_payment: 1250,
      estimate_running: 300,
      broke_line: true,
      cooling_off: true,
    });
  });

  it('cooling off is only sent for a needs_spreading size', () => {
    const plan = makePlan();
    expect(build(buyInputs({ method: 'cash', coolingOff: true }), plan).decision.cooling_off).toBe(false);
    expect(build(buyInputs({ method: 'cash', coolingOff: false }), plan, { size: 'needs_spreading' }).decision.cooling_off).toBe(false);
  });

  it('the monthly estimate is payment plus running', () => {
    const plan = makePlan({ dayOne: asMoney(0), financed: asMoney(50000), monthly: asMoney(2000), months: 24, paymentSteps: [step(1, 24, 2000)] });
    const w = build(buyInputs({ method: 'loan' }), plan, { mineMonthly: asMoney(2000), mineRunning: asMoney(-400), newMonthly: asMoney(1600) });
    expect(w.decision.estimate_monthly).toBe(w.decision.estimate_monthly_payment + w.decision.estimate_running);
  });

  it('breaking a line is recorded; a fit is not', () => {
    expect(build(buyInputs({ method: 'cash' }), makePlan(), { state: 'no' }).decision.broke_line).toBe(true);
    expect(build(buyInputs({ method: 'cash' }), makePlan(), { state: 'fits' }).decision.broke_line).toBe(false);
  });

  it('the result is JSON only', () => {
    const plan = makePlan({ dayOne: asMoney(20000), financed: asMoney(80000), monthly: asMoney(2500), months: 36, paymentSteps: [step(1, 36, 2500)] });
    const w = build(buyInputs({ method: 'loan' }), plan);
    expect(JSON.parse(JSON.stringify(w))).toEqual(w);
  });

  it('payment writes sum to the plan total less day one for any step list', () => {
    const stepsArb = fc
      .array(fc.tuple(fc.integer({ min: 1, max: 24 }), fc.integer({ min: 1, max: 5_000_000 })), { minLength: 1, maxLength: 4 })
      .map((parts) => {
        let from = 1;
        return parts.map(([run, amount]) => {
          const s = step(from, from + run - 1, amount);
          from += run;
          return s;
        });
      });
    fc.assert(
      fc.property(stepsArb, fc.integer({ min: 0, max: 1_000_000 }), fc.constantFrom('loan' as const, 'instalment' as const), (steps, dayOne, method) => {
        const owed = steps.reduce((sum, s) => sum + s.amount * (s.toMonth - s.fromMonth + 1), 0);
        const plan = makePlan({ dayOne: asMoney(dayOne), financed: asMoney(owed), monthly: steps[0]!.amount, months: steps[steps.length - 1]!.toMonth, total: asMoney(dayOne + owed), paymentSteps: steps });
        const w = build(buyInputs({ method }), plan);
        return total(w) === (plan.total as number) - (plan.dayOne as number);
      })
    );
  });

  it('the day-one writes sum to the plan day one', () => {
    const dayOnes = (w: ReturnType<typeof build>, includeCard: (id: string) => boolean): number =>
      w.rows.reduce((sum, r, i) => (w.decision.row_roles[i] === 'day_one' && includeCard(r.account_id) ? sum - r.original_amount : sum), 0);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5_000_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        fc.constantFrom('full' as const, 'months' as const, 'minimum' as const),
        (onCard, remainder, fees, deposit, payoff) => {
          // cash
          const cash = build(buyInputs({ method: 'cash' }), makePlan({ dayOne: asMoney(onCard) }));
          if (dayOnes(cash, () => true) !== onCard) return false;
          // loan and instalment: deposit/fees paid on the day, rest financed
          for (const method of ['loan', 'instalment'] as const) {
            const plan = makePlan({ dayOne: asMoney(deposit), financed: asMoney(onCard), monthly: asMoney(1), months: 1, total: asMoney(deposit + onCard), paymentSteps: [step(1, 1, onCard)] });
            if (dayOnes(build(buyInputs({ method }), plan), () => true) !== deposit) return false;
          }
          // card: onCard counts toward day one only when paid in full
          const cardDetail = { eligibility: 'ok', onCard: asMoney(onCard), remainderOnDay: asMoney(remainder), payoff, payoffMonths: 1, minimumOutcome: null, remainingAtCap: null, fees: asMoney(fees), cardCosts: null } as never;
          const dayOne = remainder + fees + (payoff === 'full' ? onCard : 0);
          const card = build(
            buyInputs({ method: 'card', card: { ...emptyCheckInputs('buy', TODAY).card, payoff } }),
            makePlan({ dayOne: asMoney(dayOne), total: asMoney(dayOne), card: cardDetail })
          );
          return dayOnes(card, (account) => payoff === 'full' || account !== 'card') === dayOne;
        }
      )
    );
  });

  it('WR-A11: a prompted running cost keeps its category; a line the user added has none', () => {
    const inputs = buyInputs({
      method: 'cash',
      runningCosts: [
        { id: 'r1', name: 'Insurance', amount: 4000, note: '', counted: true, seriesId: null, category: 'insurance' },
        { id: 'r2', name: 'Fuel', amount: 9000, note: '', counted: true, seriesId: null, category: 'fuel' },
        { id: 'r3', name: 'Parking', amount: 1500, note: '', counted: true, seriesId: null, category: null },
        { id: 'r4', name: 'Registration', amount: 800, note: '', counted: true, seriesId: null, category: 'registration' },
      ],
    });
    const w = build(inputs, makePlan(), {}, { ...ctx, runningCostCategoryIds: { insurance: 'cat-ins', fuel: 'cat-trans' } }, { ...RUNNING, countedCosts: 4 });
    expect(w.series.map((s) => [s.name, s.category_id])).toEqual([
      ['Insurance', 'cat-ins'],
      ['Fuel', 'cat-trans'],
      ['Parking', null],
      ['Registration', null],
    ]);
    // without the map (an older context) every running cost stays uncategorised
    expect(build(inputs, makePlan(), {}, ctx, RUNNING).series.every((s) => s.category_id === null)).toBe(true);
  });

  it('D-66 (WR-A06): the day-one purchase lump is one-off; payment rows and transfer legs stay regular', () => {
    // cash
    const cash = build(buyInputs({ method: 'cash' }), makePlan());
    expect(cash.rows.map((r) => r.one_off)).toEqual([true]);
    // loan: the deposit is one-off; a one-month final payment row is a payment and stays regular
    const loanPlan = makePlan({ dayOne: asMoney(5000), financed: asMoney(10000), monthly: asMoney(4000), months: 3, total: asMoney(15000), paymentSteps: [step(1, 2, 4000), step(3, 3, 2000)] });
    const loan = build(buyInputs({ method: 'loan' }), loanPlan);
    expect(loan.decision.row_roles).toEqual(['day_one', 'payment']);
    expect(loan.rows.map((r) => r.one_off)).toEqual([true, undefined]);
    // credit: the purchase on the card and the cash remainder are both one-off
    const cardPlan = makePlan({
      dayOne: asMoney(1500),
      total: asMoney(121500),
      paymentSteps: [step(1, 12, 10000)],
      card: { eligibility: 'ok', onCard: asMoney(98500), remainderOnDay: asMoney(1000), payoff: 'months', payoffMonths: 12, minimumOutcome: null, remainingAtCap: null, fees: asMoney(500), cardCosts: null } as never,
    });
    const card = build(buyInputs({ method: 'card', card: { ...emptyCheckInputs('buy', TODAY).card, payoff: 'months' } }), cardPlan);
    expect(card.rows.map((r) => [r.account_id, r.one_off])).toEqual([['card', true], ['cash', true]]);
    // running costs and payment runs are series, which carry no one-off flag
    expect(card.series.every((s) => !('one_off' in s))).toBe(true);
    // a lump into a tracked investment account is a transfer, never a one-off expense
    const lump = build(
      { ...emptyCheckInputs('invest', TODAY), name: 'Fund', method: 'lump' as const, investAccountId: 'inv' },
      makePlan({ dayOne: asMoney(50000), total: asMoney(50000) }),
      {},
      { ...ctx, investAccount: { id: 'inv', currency: 'USD' } }
    );
    expect(lump.rows.map((r) => r.one_off)).toEqual([undefined, undefined]);
    // with no tracked account the lump is a plain outflow, and one-off like a purchase
    const plain = build({ ...emptyCheckInputs('invest', TODAY), name: 'Fund', method: 'lump' as const }, makePlan({ dayOne: asMoney(50000), total: asMoney(50000) }));
    expect(plain.rows.map((r) => r.one_off)).toEqual([true]);
  });

  it('refuses a card plan with no card account', () => {
    const plan = makePlan({ card: { eligibility: 'ok', onCard: asMoney(1), remainderOnDay: asMoney(0), payoff: 'full', payoffMonths: 1, minimumOutcome: null, remainingAtCap: null, fees: asMoney(0), cardCosts: null } as never });
    expect(() => build(buyInputs({ method: 'card' }), plan, {}, { ...ctx, cardAccountId: null })).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// the mutation

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const ok = (data: unknown) => ({ data, error: null, status: 200 });
const applied = () => ok({ status: 'applied', undo_step_id: 'step-1' });

function newClient(): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerDecideGoAheadMutations(qc);
  return qc;
}

const checkRow = (): WithPending<DecideCheckRow> =>
  ({ id: 'chk1', household_id: 'h1', created_by: 'u1', kind: 'buy', name: 'Sofa', inputs: {}, status: 'open', furthest_step: 5, version: 1 }) as unknown as WithPending<DecideCheckRow>;

function args(over: { coolingOff?: boolean } = {}) {
  const plan = makePlan({ dayOne: asMoney(20000), financed: asMoney(80000), monthly: asMoney(2500), months: 36, paymentSteps: [step(1, 36, 2500)] });
  return {
    checkId: 'chk1',
    ownerId: 'u1',
    homeCurrency: 'USD',
    inputs: buyInputs({ method: 'loan', coolingOff: over.coolingOff ?? false }),
    assessment: assessment(plan, over.coolingOff ? { size: 'needs_spreading' } : {}),
    running: RUNNING,
    ctx,
  };
}

describe('useGoAhead', () => {
  beforeEach(() => {
    mockUuid = 0;
    mockTrack.mockClear();
    mockCooling.mockClear();
    mockCancelReminders.mockClear();
    (recordFailedWrite as jest.Mock).mockClear();
    resetToastForTests();
    onlineManager.setOnline(true);
  });

  it('a failed Go ahead write shows the failed-save toast and cancels its cooling-off reminder', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'denied', code: '42501' }, status: 403 });
    const qc = newClient();
    const { result } = await renderHook(() => useGoAhead(), { wrapper: wrapper(qc) });
    result.current.goAhead(args({ coolingOff: true }));
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    expect(getToast()?.kind).toBe('refusal');
    expect(getToast()?.text).toEqual({ key: 'decide.toast.outcomeFailed' });
    expect(mockCancelReminders).toHaveBeenCalledWith('chk1');
  });

  it('a Go ahead queued offline shows no toast', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);
    const qc = newClient();
    const { result } = await renderHook(() => useGoAhead(), { wrapper: wrapper(qc) });
    result.current.goAhead(args());
    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.isPaused).toBe(true));
    expect(fake.calls).toHaveLength(0);
    expect(getToast()).toBeNull();
    expect(recordFailedWrite).not.toHaveBeenCalled();
    expect(mockCancelReminders).not.toHaveBeenCalled();
  });

  it('writes the rows and the decision in ONE record_decide_go call with the step id, marks the check bought and tracks go', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied());
    const qc = newClient();
    qc.setQueryData(queryKeys.decideChecks('u1', 'h1'), [checkRow()]);
    const { result } = await renderHook(() => useGoAhead(), { wrapper: wrapper(qc) });

    const stepId = result.current.goAhead(args());
    await waitFor(() => expect(qc.getQueryData<DecideCheckRow[]>(queryKeys.decideChecks('u1', 'h1'))?.[0]?.status).toBe('bought'));
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));

    // WR-A02: no separate insert request; the server inserts the rows in the decision's transaction.
    expect(fake.calls.some((c) => c.method === 'upsert' || c.method === 'insert')).toBe(false);
    const rpcs = fake.calls.filter((c) => c.method === 'rpc');
    expect(rpcs).toHaveLength(1);
    const [name, payload] = rpcs[0]!.args as [string, Record<string, unknown>];
    expect(name).toBe('record_decide_go');
    expect(payload.p_undo_step).toMatchObject({ id: stepId, label_key: 'decisionWritten' });
    expect(payload.p_check_id).toBe('chk1');
    expect(payload).not.toHaveProperty('p_row_ids');
    expect(payload.p_rows as unknown[]).toHaveLength(1);
    expect((payload.p_rows as Record<string, unknown>[])[0]).toMatchObject({ account_id: 'cash', original_amount: -20000, status: 'pending' });
    expect(payload.p_debt).toMatchObject({ kind: 'loan', balance: 80000 });
    expect(mockTrack).toHaveBeenCalledWith('decision_recorded', { decision: 'go' });
    expect(mockCooling).not.toHaveBeenCalled();
  });

  it('schedules the cooling-off reminder when the decision asks for it', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied());
    const qc = newClient();
    const { result } = await renderHook(() => useGoAhead(), { wrapper: wrapper(qc) });
    result.current.goAhead(args({ coolingOff: true }));
    expect(mockCooling).toHaveBeenCalledTimes(1);
    const call = mockCooling.mock.calls[0] as unknown as [string, string, Date];
    expect(call[0]).toBe('chk1');
    expect(new Date(call[1]).getTime() - call[2].getTime()).toBe(48 * 3600 * 1000);
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
  });

  it('WR-A02: a refused decision (e.g. already decided) leaves nothing written: the rows leave the cache and the toast says nothing was changed', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith({ data: null, error: { message: 'bad', code: '22023' }, status: 400 });
    const qc = newClient();
    qc.setQueryData(queryKeys.transactionsMonth('h1', '2026-10'), []);
    const { result } = await renderHook(() => useGoAhead(), { wrapper: wrapper(qc) });
    result.current.goAhead(args({ coolingOff: true }));
    await waitFor(() => expect(recordFailedWrite).toHaveBeenCalled());
    // The single request was the RPC; no insert ran before it, so there is nothing landed to keep.
    expect(fake.calls.filter((c) => c.method === 'rpc')).toHaveLength(1);
    expect(fake.calls.some((c) => c.method === 'upsert' || c.method === 'insert')).toBe(false);
    expect(qc.getQueryData<unknown[]>(queryKeys.transactionsMonth('h1', '2026-10'))).toEqual([]);
    expect(recordFailedWrite).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'decide_checks', entityId: 'chk1', attempted: { checkId: 'chk1', count: 1 } })
    );
    expect(JSON.stringify((recordFailedWrite as jest.Mock).mock.calls[0])).not.toContain('Sofa');
    expect(getToast()?.text).toEqual({ key: 'decide.toast.outcomeFailed' });
    expect(mockCancelReminders).toHaveBeenCalledWith('chk1');
  });

  it('WR-A02: a second Go ahead for a check whose Go ahead is still queued returns the same step and queues nothing', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    onlineManager.setOnline(false);
    const qc = newClient();
    const { result } = await renderHook(() => useGoAhead(), { wrapper: wrapper(qc) });
    const first = result.current.goAhead(args({ coolingOff: true }));
    await waitFor(() => expect(qc.getMutationCache().getAll()[0]?.state.isPaused).toBe(true));
    const second = result.current.goAhead(args({ coolingOff: true }));
    expect(second).toBe(first);
    expect(qc.getMutationCache().getAll()).toHaveLength(1);
    expect(mockCooling).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('a loan with nothing to insert still records the step', async () => {
    const fake = createFakeSupabase() as FakeSupabase & DbClient;
    mockActiveClient = fake;
    fake.respondWith(applied());
    const qc = newClient();
    const { result } = await renderHook(() => useGoAhead(), { wrapper: wrapper(qc) });
    const plan = makePlan({ dayOne: asMoney(0), financed: asMoney(80000), monthly: asMoney(2500), months: 36, paymentSteps: [step(1, 36, 2500)] });
    result.current.goAhead({ ...args(), assessment: assessment(plan) });
    await waitFor(() => expect(fake.calls.some((c) => c.method === 'rpc')).toBe(true));
    expect(fake.calls.some((c) => c.method === 'upsert')).toBe(false);
  });
});
