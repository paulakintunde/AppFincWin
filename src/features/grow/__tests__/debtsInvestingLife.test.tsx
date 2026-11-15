// 06.2-21 (D-12, D-14, D-16, D-19, D-20): Grow's debts and investing, calmly alive.
//  - the one-shot debt-cleared store, and the sale mutation marking it only when its payment clears the balance
//  - the debt detail: the debt-cleared icon, the "Debt cleared" badge and one Success tap once; the badge only after
//  - the payoff line draws once per session; Reduce Motion draws it at once
//  - investing values sit in FadeSwap (fade, never count up); ups and downs read by arrow and word; stale reads
//    "Updated N days ago" on the slate clock badge
/* eslint-disable import/first */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { DebtRow } from '@/db/debts';
import type { HoldingRow } from '@/db/holdings';
import { autoLoan } from '@/engine/grow/__tests__/fixtures/ledger';
import type { InvestingRead } from '@/features/grow/investing/useInvestingRead';

jest.setTimeout(30000);

const mockMilestone = jest.fn();
const mockLight = jest.fn();
jest.mock('@/ui/haptics', () => ({
  hapticMilestone: () => mockMilestone(),
  hapticTap: () => mockLight(),
  hapticWarn: jest.fn(),
  hapticTick: jest.fn(),
}));

let mockRows: DebtRow[] | undefined = [];
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/data/queries/decide', () => ({
  useDebts: () => ({ data: mockRows, isError: false, refetch: jest.fn() }),
  useDecideSettings: () => ({ data: { dsr_line: '36.0000', investing_floor: 20000 } }),
  useDecideSnapshot: () => ({ status: 'ready', result: { currency: 'USD' } }),
}));
jest.mock('@/features/grow/lines/monthBreakdown', () => ({ monthBreakdown: () => ({ income: 320000, result: 42500 }) }));
jest.mock('@/features/decide/screens/past/data/usePastDecisions', () => ({
  usePastContext: () => ({ userId: 'u1', householdId: 'h1', today: '2026-11-05', ctx: { home: 'USD', rates: [], customs: [], today: '2026-11-05', timeZone: 'UTC' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', today: '2026-11-06', userId: 'u1', householdId: 'h1', ready: true, showCents: false, region: null }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/activity', () => ({ useAccountBalances: () => ({ balances: new Map() }) }));
jest.mock('@/data/mutations/growDebts', () => ({
  ...jest.requireActual('@/data/mutations/growDebts'),
  useDebtSettling: () => false,
  useSaveDebtPlan: () => ({ save: jest.fn() }),
  useSaveGrowDebt: () => ({ save: jest.fn() }),
  useRecordDebtSale: () => ({ record: jest.fn() }),
}));
jest.mock('@/data/mutations/debts', () => ({ useRemoveDebt: () => ({ remove: jest.fn(() => 'step') }) }));
jest.mock('@/data/queries/growDebts', () => ({ useDebtPayments: () => ({ data: { next: null, paid: [] } }) }));
jest.mock('@/features/grow/goals/useGoalRecordDetail', () => ({
  useRecordLineDetail: () => ({ partnerOf: () => null, accountName: () => null, open: jest.fn(), element: null }),
}));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), navigate: jest.fn(), push: jest.fn() } }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const R = require('react');
  const { View, Text: RNText } = require('react-native');
  return {
    DetailScreen: (p: { title: string; right?: React.ReactNode; children?: React.ReactNode }) =>
      R.createElement(View, null, R.createElement(RNText, null, p.title), p.right, p.children),
  };
});
jest.mock('@/data/mutations/growHoldings', () => ({
  ...jest.requireActual('@/data/mutations/growHoldings'),
  useEditHolding: () => ({ edit: jest.fn(), remove: jest.fn() }),
  useAddHolding: () => ({ add: jest.fn() }),
  useAddHoldingLot: () => ({ add: jest.fn() }),
  useEditHoldingLot: () => ({ edit: jest.fn(), remove: jest.fn() }),
}));
let mockHoldings: HoldingRow[] = [];
jest.mock('@/data/queries/growHoldings', () => ({
  useHoldingRows: () => ({ data: mockHoldings }),
  useHoldingLotRows: () => ({ data: [] }),
}));
let mockRead: InvestingRead;
jest.mock('@/features/grow/investing/useInvestingRead', () => ({
  ...jest.requireActual('@/features/grow/investing/useInvestingRead'),
  useInvestingRead: () => mockRead,
}));

import { mutationKeys } from '@/data/keys';
import { registerGrowDebtMutations } from '@/data/mutations/growDebts';
import en from '@/i18n/locales/en';
import { DEBT_CLEARED_WINDOW_MS, markDebtCleared, resetDebtClearedForTests, takeDebtCleared } from '@/state/debtCleared';
import { DURATION } from '@/theme/motion';
import { resetSessionMotion } from '@/ui/motion/useOncePerSession';
import { DebtDetailScreen } from '@/features/grow/debts/DebtDetailScreen';
import { InvestingSegment, daysBetween } from '@/features/grow/investing/InvestingSegment';
import { buildInvestingModel } from '@/features/grow/investing/useInvestingRead';
import { LineChart, lineLength } from '@/features/grow/ui/LineChart';
/* eslint-enable import/first */

const opts = { includeHiddenElements: true };

async function wrap(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
      <ThemeProvider>
        <FontScaleProvider value={1}>{ui}</FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

const debt = (over: Partial<DebtRow> & { id: string; name: string }): DebtRow => ({
  household_id: 'h1', account_id: null, check_id: null, series_id: null, kind: 'loan', currency: 'USD', balance: 0, apr: null,
  minimum_payment: 0, secured: false, term_months: null, start_date: null, min_percent: null, min_interest_added: null,
  min_floor: null, paid_in_full: false, pays_in_full: null, paid_off_on: null, due_day: null, started_balance: null,
  payoff_order: null, payoff_extra: 0, extra_series_id: null, is_housing: false, is_sample: false, deleted_at: null, version: 1,
  updated_by: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...over,
});
const AUTO = debt({
  id: 'auto', name: 'Auto loan', balance: autoLoan.balance, apr: autoLoan.apr, minimum_payment: autoLoan.payment,
  due_day: autoLoan.dueDay, started_balance: autoLoan.startedBalance,
});
const AUTO_CLEARED = { ...AUTO, balance: 0, paid_off_on: '2026-11-05' };

function holding(over: Partial<HoldingRow> = {}): HoldingRow {
  return {
    id: 'h-ret', household_id: 'h1', created_by: 'u1', updated_by: null, name: 'Retirement fund', type: 'retirement', currency: 'USD',
    value: 645000, value_as_of: '2026-11-01', opening_put_in: 580000, account_id: null, paid_from_account_id: null, monthly_amount: 15000,
    day: 1, rate: null, is_sample: false, deleted_at: null, version: 1, created_at: '', updated_at: '', ...over,
  } as HoldingRow;
}
function readOf(rows: HoldingRow[]): InvestingRead {
  return { status: 'ready', model: buildInvestingModel(rows, [], (a: number) => a, '2026-11-06'), refetch: jest.fn(), userId: 'u1', householdId: 'h1', today: '2026-11-06' };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetDebtClearedForTests();
  resetSessionMotion();
  mockRows = [AUTO];
  mockHoldings = [holding()];
  mockRead = readOf(mockHoldings);
});

describe('debtCleared store', () => {
  it('is one-shot per id and ignores a mark older than 60 s', () => {
    markDebtCleared('a', 1_000);
    expect(takeDebtCleared('b', 1_000)).toBe(false);
    expect(takeDebtCleared('a', 1_000 + DEBT_CLEARED_WINDOW_MS)).toBe(true);
    expect(takeDebtCleared('a', 1_000 + DEBT_CLEARED_WINDOW_MS)).toBe(false);
    markDebtCleared('a', 1_000);
    expect(takeDebtCleared('a', 1_001 + DEBT_CLEARED_WINDOW_MS)).toBe(false);
    expect(takeDebtCleared('a', 1_000)).toBe(false);
  });
});

describe('the sale marks a cleared debt only when its payment clears the balance', () => {
  const onSuccessOf = () => {
    const qc = new QueryClient();
    registerGrowDebtMutations(qc);
    const defaults = qc.getMutationDefaults(mutationKeys.recordDebtSale);
    return (res: { paidOff: boolean | null; stillOwed: number | null }, vars: object) =>
      (defaults.onSuccess as unknown as (r: typeof res, v: object) => void)(res, vars);
  };
  const vars = (balanceBefore: number, payment: number | null) => ({
    ownerId: 'u1', cache: { userId: 'u1', householdId: 'h1' }, debtId: 'auto', expectedVersion: 1, name: 'Auto loan', stepId: 's',
    sale: { id: 's1', account_id: 'a1', amount: 100000, currency: 'USD', local_date: '2026-11-05', time_zone: 'UTC', name: 'Sold' },
    payment: payment === null ? null : { id: 'p1', account_id: 'a1', amount: payment, currency: 'USD', local_date: '2026-11-05', time_zone: 'UTC', name: 'Final' },
    balanceBefore,
  });

  it('a payment of the whole balance marks it', () => {
    onSuccessOf()({ paidOff: true, stillOwed: 0 }, vars(842000, 842000));
    expect(takeDebtCleared('auto')).toBe(true);
  });

  it('a partial payment, a sale alone, or the server keeping the debt open does not', () => {
    const run = onSuccessOf();
    run({ paidOff: false, stillOwed: 100 }, vars(842000, 841900));
    expect(takeDebtCleared('auto')).toBe(false);
    run({ paidOff: null, stillOwed: null }, vars(842000, null));
    expect(takeDebtCleared('auto')).toBe(false);
    run({ paidOff: false, stillOwed: 50 }, vars(842000, 842000));
    expect(takeDebtCleared('auto')).toBe(false);
  });
});

describe('debt detail: the debt-cleared moment (D-19, D-20)', () => {
  it('a debt just cleared plays the icon with "Debt cleared" and one Success tap, once', async () => {
    mockRows = [AUTO_CLEARED];
    markDebtCleared('auto');
    const first = await wrap(<DebtDetailScreen id="auto" />);
    expect(screen.getByTestId('grow-debt-cleared')).toBeTruthy();
    expect(screen.getByTestId('debt-cleared-moment')).toBeTruthy();
    expect(screen.getByTestId('debt-cleared-icon', opts)).toBeTruthy();
    expect(screen.getByText(en.appLife.debts.debtCleared)).toBeTruthy();
    expect(mockMilestone).toHaveBeenCalledTimes(1);
    await first.rerender(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
        <ThemeProvider>
          <FontScaleProvider value={1}>
            <DebtDetailScreen id="auto" />
          </FontScaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(mockMilestone).toHaveBeenCalledTimes(1);
    await first.unmount();

    // A later visit: the badge only, no icon and no tap.
    await wrap(<DebtDetailScreen id="auto" />);
    expect(screen.getByTestId('debt-cleared-badge')).toBeTruthy();
    expect(screen.queryByTestId('debt-cleared-moment')).toBeNull();
    expect(mockMilestone).toHaveBeenCalledTimes(1);
  });

  it('a mark that arrives while the cleared debt is open (the write finishing) plays the moment then', async () => {
    mockRows = [AUTO_CLEARED];
    await wrap(<DebtDetailScreen id="auto" />);
    expect(screen.queryByTestId('debt-cleared-moment')).toBeNull();
    await act(async () => {
      markDebtCleared('auto');
    });
    expect(screen.getByTestId('debt-cleared-moment')).toBeTruthy();
    expect(mockMilestone).toHaveBeenCalledTimes(1);
  });

  it('a debt still owed never plays it, even with a stray mark; the mark waits until it reads cleared', async () => {
    markDebtCleared('auto');
    await wrap(<DebtDetailScreen id="auto" />);
    expect(screen.queryByTestId('debt-cleared-moment')).toBeNull();
    expect(screen.queryByTestId('debt-cleared-badge')).toBeNull();
    expect(mockMilestone).not.toHaveBeenCalled();
  });

  it('a card paid in full each month is not "cleared"', async () => {
    mockRows = [debt({ id: 'visa', name: 'Visa card', kind: 'card', balance: 38000, pays_in_full: 'yes' })];
    markDebtCleared('visa');
    await wrap(<DebtDetailScreen id="visa" />);
    expect(screen.queryByTestId('debt-cleared-badge')).toBeNull();
    expect(mockMilestone).not.toHaveBeenCalled();
  });
});

describe('LineChart draws once per session (D-15)', () => {
  it('the first view reveals the stroke; a later view shows it drawn', async () => {
    const first = await wrap(<LineChart points={[0, 100, 250]} accessibilityLabel="Grows to $2.50 by 2030" />);
    const drawing = first.getByTestId('line-chart-path', opts);
    expect(drawing.props.strokeDasharray).toBeDefined();
    await first.unmount();
    const again = await wrap(<LineChart points={[0, 100, 250]} accessibilityLabel="Grows to $2.50 by 2030" />);
    expect(again.getByTestId('line-chart-path', opts).props.strokeDasharray).toBeUndefined();
  });

  it('Reduce Motion draws it at once', async () => {
    const original = AccessibilityInfo.isReduceMotionEnabled;
    AccessibilityInfo.isReduceMotionEnabled = jest.fn(() => Promise.resolve(true));
    try {
      await wrap(<LineChart points={[0, 100, 250]} accessibilityLabel="Reduced" />);
      await act(async () => {});
      expect(screen.getByTestId('line-chart-path', opts).props.strokeDasharray).toBeUndefined();
    } finally {
      AccessibilityInfo.isReduceMotionEnabled = original;
    }
  });

  it('reveals over DURATION.fill with a positive dash length', () => {
    expect(DURATION.fill).toBe(550);
    expect(lineLength([0, 100, 250], 330, 140)).toBeGreaterThan(300);
    expect(lineLength([5], 330, 140)).toBe(0);
  });
});

describe('Investing: fades, arrows and words (D-14, D-16)', () => {
  it('the hero and each holding value sit in FadeSwap', async () => {
    await wrap(<InvestingSegment />);
    expect(screen.getByTestId('investing-hero-fade')).toBeTruthy();
    expect(screen.getByTestId('holding-value-fade-h-ret')).toBeTruthy();
  });

  it('a gain reads "up N%" and a loss "down N%" with the arrow badge, not colour alone', async () => {
    // 645,000 against 580,000 put in: up 11.2%.
    mockHoldings = [holding(), holding({ id: 'h-loss', name: 'Index fund', value: 570000, opening_put_in: 580000 })];
    mockRead = readOf(mockHoldings);
    await wrap(<InvestingSegment />);
    expect(screen.getByTestId('holding-gain-h-ret')).toHaveTextContent('up 11.2%');
    expect(screen.getByTestId('holding-gain-h-ret').props.accessibilityLabel).toContain('above what you put in');
    expect(screen.getByTestId('holding-gain-h-loss')).toHaveTextContent('down 1.7%');
    expect(screen.getByTestId('holding-gain-h-loss').props.accessibilityLabel).toContain('below what you put in');
  });

  it('a stale holding shows the slate clock badge "Updated N days ago"', async () => {
    mockHoldings = [holding({ value_as_of: '2026-10-03' })];
    mockRead = readOf(mockHoldings);
    await wrap(<InvestingSegment />);
    expect(screen.getByTestId('investing-stale-badge')).toHaveTextContent('Updated 34 days ago');
    expect(daysBetween('2026-10-05', '2026-10-06')).toBe(1);
    expect(daysBetween('2026-10-07', '2026-10-06')).toBe(0);
  });

  it('nothing in these files counts a number up', () => {
    for (const file of ['investing/InvestingSegment.tsx', 'ui/LineChart.tsx', 'debts/DebtClearedMoment.tsx', 'debts/DebtDetailScreen.tsx']) {
      const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      expect(src).not.toMatch(/countUp|useCountUp|setInterval|requestAnimationFrame|withRepeat|withSpring/);
    }
  });
});

