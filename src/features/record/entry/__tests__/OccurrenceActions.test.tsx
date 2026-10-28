// 05.2-44 (D-24): the occurrence actions offer "Stopped or paused" only on the new Decide (D-01).
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { RecurringSeriesRow, TransactionRow } from '@/db/rows';
import { OccurrenceActions } from '../OccurrenceActions';
import { resetSeriesStatusHostForTests, useSeriesStatusRequest } from '../seriesStatusHost';

jest.setTimeout(30000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/data/mutations/transactions', () => ({
  useMarkPaid: () => ({ markPaid: jest.fn() }),
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
async function mount() {
  await render(
    <ThemeProvider>
      <OccurrenceActions row={row} series={series} onAdjust={jest.fn()} onDone={onDone} />
      <Probe />
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockV3 = true;
  onDone.mockClear();
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
});
