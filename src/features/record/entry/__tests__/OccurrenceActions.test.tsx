// 05.2-44 (D-24): the occurrence actions offer "Stopped or paused" only on the new Decide (D-01).
// 06-37: a goal's Expected line is marked paid through the goal confirm, never a plain status patch.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { RecurringSeriesRow, TransactionRow } from '@/db/rows';
import { OccurrenceActions } from '../OccurrenceActions';
import { resetSeriesStatusHostForTests, useSeriesStatusRequest } from '../seriesStatusHost';

jest.setTimeout(30000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockMarkPaid = jest.fn((): string | null => 'paid-step');
const mockGoalPay = jest.fn((): boolean => true);
jest.mock('@/features/grow/goals/useGoalLinePay', () => ({
  useGoalLinePay: () => ({ pay: mockGoalPay }),
}));
jest.mock('@/data/mutations/transactions', () => ({
  useMarkPaid: () => ({ markPaid: mockMarkPaid }),
  useSkipOccurrence: () => ({ skip: jest.fn() }),
}));
jest.mock('@/data/mutations/recurringSeries', () => ({ useEndSeries: () => ({ end: jest.fn() }) }));
let mockV3 = true;
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-28', timeZone: 'UTC', showCents: false }),
}));

const row = { id: 't1', household_id: 'h1', status: 'pending', local_date: '2026-11-03', name: 'Rent', recurring_series_id: 's1' } as TransactionRow;
const series = { id: 's1', household_id: 'h1', name: 'Rent', version: 3, end_date: null } as RecurringSeriesRow;

function Probe(): React.JSX.Element {
  const req = useSeriesStatusRequest();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return <Text testID="req">{req?.id ?? 'none'}</Text>;
}

const onDone = jest.fn();
async function mount(r: TransactionRow = row, s: RecurringSeriesRow | undefined = series) {
  await render(
    <ThemeProvider>
      <OccurrenceActions row={r} series={s} onAdjust={jest.fn()} onDone={onDone} />
      <Probe />
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockV3 = true;
  onDone.mockClear();
  mockMarkPaid.mockClear();
  mockGoalPay.mockReset().mockReturnValue(true);
  resetSeriesStatusHostForTests();
});

describe('OccurrenceActions entry', () => {
  it('with the new Decide, shows Stopped or paused (not End) and opens the sheet for the series', async () => {
    await mount();
    expect(screen.queryByText('End this series')).toBeNull();
    await fireEvent.press(screen.getByText('Stopped or paused'));
    expect(screen.getByTestId('req').props.children).toBe('s1');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('without the new Decide, keeps today\'s end flow', async () => {
    mockV3 = false;
    await mount();
    expect(screen.queryByText('Stopped or paused')).toBeNull();
    expect(screen.getByRole('button', { name: /end/i })).toBeTruthy();
  });

  const goalSeries = { ...series, id: 's9', name: 'Lisbon', goal_id: 'g1' } as RecurringSeriesRow;
  const goalRow = { ...row, id: 't9', name: 'Lisbon', recurring_series_id: 's9', transfer_id: null } as TransactionRow;

  it('06-37 Mark paid on a goal line (tag from its series) confirms through the goal path, never markPaid', async () => {
    await mount(goalRow, goalSeries);
    await fireEvent.press(screen.getByText('Mark paid'));
    expect(mockGoalPay).toHaveBeenCalledWith(goalRow, 'g1');
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Adjust, then mark paid')).toBeNull();
  });

  it('06-37 a goal line tagged on the row, with the goal not loaded, writes nothing and stays open', async () => {
    mockGoalPay.mockReturnValue(false);
    await mount({ ...row, goal_id: 'g2', recurring_series_id: null } as TransactionRow, undefined);
    await fireEvent.press(screen.getByText('Mark paid'));
    expect(mockGoalPay).toHaveBeenCalledWith(expect.objectContaining({ goal_id: 'g2' }), 'g2');
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('P5-CR-01 a line whose goal was removed (loaded goals without it) is marked paid as a plain line and says why', async () => {
    resetToastForTests();
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.savingsGoals('u1', 'h1'), [{ id: 'g-other' }]);
    await render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <OccurrenceActions row={goalRow} series={goalSeries} onAdjust={jest.fn()} onDone={onDone} />
        </ThemeProvider>
      </QueryClientProvider>
    );
    expect(screen.getByText('Adjust, then mark paid')).toBeTruthy();
    await fireEvent.press(screen.getByText('Mark paid'));
    expect(mockGoalPay).not.toHaveBeenCalled();
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
    expect(getToast()?.text).toEqual({ key: 'record.sheet.goalGoneMarkedPaid' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a plain occurrence still uses markPaid and offers Adjust', async () => {
    await mount();
    expect(screen.getByText('Adjust, then mark paid')).toBeTruthy();
    await fireEvent.press(screen.getByText('Mark paid'));
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
    expect(mockGoalPay).not.toHaveBeenCalled();
  });
});
