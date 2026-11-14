// 06.1-55 (A-RC-1): the Running costs line compares a usual month with a usual month, checked against the real v3 engine.
// before = the month picture's usual LEFT (no purchase); after = afterBuy.usualMonth once the costs (and any plan payment) start.
// The fixture is the approved right-answer case RC-01 (Sam's $6,000 used car, LEDGER-style usual month), run through prepare and
// judgeCheck exactly as the app does; only the data hooks at the query/mutation edge are mocked.
import React from 'react';
import { screen } from '@testing-library/react-native';
import { judgeCheck, monthPicture, prepare, toStoredV2, type CheckV2, type Prepared, type V3Inputs } from '@/engine/decide/v3';
import { currencyCode, formatAmount, minorUnits } from '@/engine/money';
import { loadCases } from '@/engine/decide/v3/__tests__/rightAnswers/loader';
import { toEngineInputs } from '@/engine/decide/v3/__tests__/rightAnswers/fixture';
import type { RightAnswerFixture } from '@/engine/decide/v3/__tests__/rightAnswers/schema';
import { wrap } from '@/test/stepProps';
import { CostsStep } from '../CostsStep';

jest.setTimeout(60000);

const ID = '22222222-2222-4222-8222-222222222222';
let mockRow: { id: string; name: string; inputs: unknown; furthest_step: number } | null = null;
let mockInputs: V3Inputs | null = null;
let mockPrepared: Prepared | null = null;

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return { router: { replace: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({}), useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]) };
});
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn() }));
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }), getDeviceRegion: () => 'US', getDeviceTimeZone: () => 'UTC' }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', region: 'US', today: '2026-11-15' }),
}));
jest.mock('@/data/queries/decide', () => ({
  useDecideChecks: () => ({ data: mockRow === null ? [] : [mockRow], isLoading: false }),
  useDebts: () => ({ data: [] }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategories: () => ({ data: [] }) }));
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => ({ status: 'ready', inputs: mockInputs, prepared: mockPrepared, v3: null, errorKind: null, missingReads: [] }) }));
jest.mock('@/data/mutations/decideChecks', () => ({
  useSaveCheckDraft: () => ({ save: jest.fn() }),
  useCreateCheck: () => ({ create: jest.fn(), pendingIds: [], pendingRows: [] }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/decide/perf/perfMarks', () => ({ perfMark: jest.fn(), usePerfMount: jest.fn() }));

const RC01 = loadCases().find((c) => c.id === 'RC-01');
if (RC01 === undefined) throw new Error('RC-01 is missing from the right-answer cases');

/** RC-01 as approved: paid in cash. */
const cashFixture: RightAnswerFixture = RC01.fixture;
/** The same car on a 12-payment, 0% plan, first payment a month after buying: $500.00 a month. */
const planFixture: RightAnswerFixture = {
  ...RC01.fixture,
  check: { ...RC01.fixture.check, pay: { mode: 'plan', months: 12, apr: '0', fees: 0, deposit: 0, firstPaymentDate: '2026-12-15', every: 'month' } },
};
const PLAN_PAYMENT = 50_000;

/** The step's own formatter (whole units, en-US), so the line is compared with formatMoney of each engine figure. */
const usd = (minor: number): string => formatAmount({ amount: minorUnits(minor), currency: currencyCode('USD') }, { locale: 'en-US', showCents: false });

/** Every running cost as a monthly figure, rounded as the step rounds it. */
const monthlyCosts = (check: CheckV2): number => (check.runningCosts ?? []).filter((l) => l.on).reduce((a, l) => a + Math.round(l.amount / l.everyMonths), 0);

function setUp(f: RightAnswerFixture): { before: number; after: number; check: CheckV2 } {
  const { inputs, check } = toEngineInputs(f);
  const prepared = prepare(inputs);
  mockInputs = inputs;
  mockPrepared = prepared;
  mockRow = { id: ID, name: 'Used car', inputs: toStoredV2(check), furthest_step: 3 };
  const usual = monthPicture(prepared).usual;
  const usualAfter = judgeCheck(prepared, check).result.afterBuy.usualMonth;
  if (usual === null || usualAfter === null) throw new Error('the fixture has no usual month');
  return { before: Number(usual.left), after: Number(usualAfter), check };
}

const lineOf = async (): Promise<string> => {
  const node = await screen.findByTestId('costs-total-after');
  return String(node.props.children);
};

describe('Running costs line: a usual month against a usual month (A-RC-1)', () => {
  it('cash: before is the usual LEFT, after is afterBuy.usualMonth, and before - after is the monthly running costs', async () => {
    const { before, after, check } = setUp(cashFixture);
    // RC-01: a usual month leaves $250.00; with insurance $150, fuel $120, upkeep $30 and $276 a year ($23.00 a month), -$73.00.
    expect(before).toBe(25_000);
    expect(after).toBe(-7_300);
    expect(before - after).toBe(monthlyCosts(check));
    await wrap(<CostsStep id={ID} />);
    expect(await lineOf()).toBe(`A usual month leaves ${usd(before)} today. With these costs, about ${usd(after)}.`);
    // The share uses the same before: $323 of $250.
    expect(screen.getByText(`${Math.round((monthlyCosts(check) * 100) / before)}% of what a usual month leaves`)).toBeTruthy();
  });

  it('plan: before - after is the monthly running costs plus the monthly plan payment', async () => {
    const { before, after, check } = setUp(planFixture);
    expect(before).toBe(25_000);
    expect(before - after).toBe(monthlyCosts(check) + PLAN_PAYMENT);
    await wrap(<CostsStep id={ID} />);
    expect(await lineOf()).toBe(`A usual month leaves ${usd(before)} today. With these costs, about ${usd(after)}.`);
  });

  it('a heavy month so far moves this month after plans, not the line: it stays usual against usual', async () => {
    // RC-01 with $1,500.00 of everyday spending already this month: this month after plans (homeFigure) drops; a usual month does not.
    const heavy: RightAnswerFixture = { ...cashFixture, thisMonth: { ...cashFixture.thisMonth, everydaySoFar: 150_000 } };
    const { before, after, check } = setUp(heavy);
    const homeFigure = Number(judgeCheck(mockPrepared as Prepared, check).result.afterBuy.before);
    expect(homeFigure).not.toBe(before);
    expect(before - after).toBe(monthlyCosts(check));
    await wrap(<CostsStep id={ID} />);
    const line = await lineOf();
    expect(line).toBe(`A usual month leaves ${usd(before)} today. With these costs, about ${usd(after)}.`);
    expect(line).not.toContain(usd(homeFigure));
  });

  it('no usual month: no line at all, never a mixed pair', async () => {
    setUp(cashFixture);
    mockPrepared = null;
    await wrap(<CostsStep id={ID} />);
    expect(await screen.findByTestId('costs-total')).toBeTruthy();
    expect(screen.queryByTestId('costs-total-after')).toBeNull();
    expect(screen.queryByText(/of what a usual month leaves/)).toBeNull();
  });
});
