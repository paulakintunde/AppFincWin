import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { MonthRow } from '../header/MonthRow';
import { getToast, resetToastForTests } from '@/state/undoToast';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockState = {
  enabled: true,
  archived: new Set<string>(['2026-08']),
  count: 1,
  shared: true,
  archive: jest.fn(),
  restore: jest.fn(),
};
jest.mock('@/features/archive/useArchiveState', () => ({ useArchiveState: () => mockState }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/services/locale/deviceLocale', () => ({
  ...jest.requireActual('@/services/locale/deviceLocale'),
  getDeviceTimeZone: () => 'UTC',
}));

jest.setTimeout(30000);

const MONTHS = ['2026-11', '2026-10', '2026-09', '2026-08', '2026-07'];

async function open(month = '2026-10', onMonthChange = jest.fn()) {
  jest.useFakeTimers({ now: new Date('2026-11-23T12:00:00Z'), doNotFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'setImmediate', 'queueMicrotask', 'nextTick'] });
  const utils = await render(
    <ThemeProvider>
      <MonthRow
        month={month}
        months={MONTHS}
        locale="en-GB"
        onMonthChange={onMonthChange}
        activeFilterCount={0}
        onSearch={jest.fn()}
        onFilter={jest.fn()}
        onMore={jest.fn()}
      />
    </ThemeProvider>,
  );
  return { ...utils, onMonthChange };
}

beforeEach(() => {
  mockState.enabled = true;
  mockState.archived = new Set(['2026-08']);
  mockState.count = 1;
  mockState.archive.mockClear();
  mockState.restore.mockClear();
  mockPush.mockClear();
  resetToastForTests();
});
afterEach(() => jest.useRealTimers());

describe('month sheet archive (10-16)', () => {
  it('hides the archived month and offers Archive on past months only', async () => {
    const u = await open();
    await fireEvent.press(u.getByLabelText('October 2026, choose month'));
    expect(u.queryByText('August 2026')).toBeNull();
    expect(u.getByText('July 2026')).toBeTruthy();
    expect(u.getByLabelText('Archive October 2026, button')).toBeTruthy();
    expect(u.getByLabelText('Archive September 2026, button')).toBeTruthy();
    expect(u.queryByLabelText('Archive November 2026, button')).toBeNull(); // the current month
  });

  it('confirms, archives, and offers Undo in a toast', async () => {
    const u = await open();
    await fireEvent.press(u.getByLabelText('October 2026, choose month'));
    await fireEvent.press(u.getByLabelText('Archive September 2026, button'));
    expect(u.getByText('Archive September 2026?')).toBeTruthy();
    expect(u.getByText(/Only you\. Partners still see this month\./)).toBeTruthy();
    await fireEvent.press(u.getByText('Archive month'));
    expect(mockState.archive).toHaveBeenCalledWith('2026-09');
    const toast = getToast();
    expect(toast?.text?.key).toBe('system.archive.archivedToast');
    toast?.onUndo?.();
    expect(mockState.restore).toHaveBeenCalledWith('2026-09');
  });

  it('shows the footer and opens the archive list', async () => {
    const u = await open();
    await fireEvent.press(u.getByLabelText('October 2026, choose month'));
    await fireEvent.press(u.getByText('Archived months (1)'));
    expect(mockPush).toHaveBeenCalledWith('/archive');
  });

  it('moves the selection off a month that becomes archived', async () => {
    const onMonthChange = jest.fn();
    await open('2026-08', onMonthChange);
    expect(onMonthChange).toHaveBeenCalledWith('2026-09');
  });

  it('shows no links, no footer and no filtering when archive is off', async () => {
    mockState.enabled = false;
    mockState.archived = new Set();
    mockState.count = 0;
    const u = await open();
    await fireEvent.press(u.getByLabelText('October 2026, choose month'));
    expect(u.getByText('August 2026')).toBeTruthy();
    expect(u.queryByLabelText('Archive September 2026, button')).toBeNull();
    expect(u.queryByText(/Archived months/)).toBeNull();
  });
});
