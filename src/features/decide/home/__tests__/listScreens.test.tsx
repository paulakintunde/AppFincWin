// 05-113 (D-99, R17.3): the three list screens keep today's lists, Delete with confirm and Undo, markers and editors.
import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { DecideChangeRow } from '@/db/decideChanges';
import type { DecideCheckRow } from '@/db/decideChecks';
import { showToast } from '@/state/undoToast';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { emptyCheckInputs } from '../../snapshot/checkInputs';
import type { SnapshotResult } from '../../snapshot/types';
import { TODAY, loggedSource, month } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { ChangesScreen } from '../ChangesScreen';
import { CHANGES_HREF, LINES_HREF, OPEN_HREF } from '../checkHref';
import { LinesScreen } from '../LinesScreen';
import { OpenChecksScreen } from '../OpenChecksScreen';

jest.setTimeout(30000);

let mockChecks: DecideCheckRow[] = [];
let mockChanges: DecideChangeRow[] = [];
let mockSource: SnapshotResult = loggedSource();
const mockAbandon = jest.fn(() => 'step-1');
const mockRemove = jest.fn(() => 's-remove');
const mockPush = jest.fn();

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', today: '2026-10-15', ready: true }),
}));
jest.mock('@/data/queries/decide', () => ({
  useDecideSnapshot: () => ({ status: 'ready', result: mockSource, source: null, retry: jest.fn() }),
  useDecideChecks: () => ({ data: mockChecks }),
  useOpenChecks: () => ({ data: mockChecks }),
  useDecideSettings: () => ({ data: null }),
  useDecideChanges: () => ({ data: mockChanges }),
}));
jest.mock('@/data/mutations/decideChecks', () => ({ useAbandonCheck: () => ({ abandon: (...a: unknown[]) => (mockAbandon as (...x: unknown[]) => string)(...a) }) }));
jest.mock('@/data/mutations/decideChanges', () => ({
  useAddChange: () => ({ add: jest.fn() }),
  useEditChange: () => ({ edit: jest.fn() }),
  useRemoveChange: () => ({ remove: (...a: unknown[]) => (mockRemove as (...x: unknown[]) => string)(...a) }),
}));
jest.mock('@/data/mutations/decideSettings', () => ({ useUpdateDecideSettings: () => ({ update: jest.fn() }) }));
jest.mock('../../notifications/waitReminder', () => ({ reconcileWaitReminders: () => Promise.resolve() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'new-id' }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const { View, Text } = require('react-native');
  return {
    DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <View>
        <Text accessibilityRole="header">{`screen:${title}`}</Text>
        {children}
      </View>
    ),
  };
});
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: R.forwardRef((props: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      R.useImperativeHandle(ref, () => ({ close: jest.fn() }));
      return <View>{props.children}</View>;
    }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockChecks = [];
  mockChanges = [];
  mockSource = loggedSource();
});

function checkRow(id: string, over: Partial<DecideCheckRow> = {}): DecideCheckRow {
  const inp = { ...emptyCheckInputs('buy', TODAY), name: 'Laptop', advertised: 150_000, method: 'cash' as const };
  return {
    id,
    household_id: 'h1',
    created_by: 'u1',
    kind: 'buy',
    name: 'Laptop',
    inputs: inp as unknown as Record<string, unknown>,
    status: 'open',
    furthest_step: 1,
    last_seen_state: null,
    last_seen_basis: null,
    reopened_from: null,
    decided_at: null,
    verdict_at_decision: null,
    estimate_day_one: null,
    estimate_monthly: null,
    wait_monthly: null,
    ready_by: null,
    broke_line: false,
    cooling_off_at: null,
    estimate_monthly_payment: null,
    estimate_running: null,
    is_sample: false,
    deleted_at: null,
    version: 1,
    updated_by: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...over,
  } as DecideCheckRow;
}

function change(): DecideChangeRow {
  return {
    id: 'c1',
    household_id: 'h1',
    created_by: 'u1',
    updated_by: null,
    kind: 'income',
    name: 'Raise',
    monthly_amount: 30_000,
    currency: 'USD',
    start_month: '2026-11',
    end_month: null,
    is_sample: false,
    deleted_at: null,
    version: 3,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  };
}

describe('list screens', () => {
  it('D-99 the hrefs name the three routes', () => {
    expect(OPEN_HREF).toBe('/decide/open');
    expect(CHANGES_HREF).toBe('/decide/changes');
    expect(LINES_HREF).toBe('/decide/lines');
  });

  it('D-99 the Open checks screen keeps swipe and ⋯ Delete and the markers', async () => {
    mockSource = loggedSource({ months: ['2026-06', '2026-07', '2026-08', '2026-09'].map((m) => month(m, 500_000, 480_000)) });
    mockChecks = [checkRow('a', { last_seen_state: 'fits' })];
    await wrap(<OpenChecksScreen />);
    expect(screen.getByText('screen:Open checks')).toBeTruthy();
    expect(screen.getByText('Laptop')).toBeTruthy();
    expect(screen.getByText(/Changed since you looked/)).toBeTruthy();
    expect(screen.getByText('+ Purchase')).toBeTruthy();
    expect(screen.getByText('+ Investment')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('More for Laptop'));
    await fireEvent.press(screen.getByLabelText('Delete'));
    expect(screen.getByText('Delete this check?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Delete', { exact: true }));
    expect(mockAbandon).toHaveBeenCalledWith(mockChecks[0], 'deleted');
    expect(showToast).toHaveBeenCalledWith({ kind: 'destructive', text: expect.objectContaining({ key: 'decide.delete.toastCheck' }), stepId: 'step-1' });
  });

  it('D-99 the Open checks screen with no checks shows only the heading links', async () => {
    await wrap(<OpenChecksScreen />);
    expect(screen.getByText('+ Purchase')).toBeTruthy();
    expect(screen.queryByText('Laptop')).toBeNull();
    await fireEvent.press(screen.getByText('+ Investment'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/decide/check/[id]', params: { id: 'new-id', kind: 'invest' } });
  });

  it('D-99 the Changes screen deletes with confirm and Undo', async () => {
    mockChanges = [change()];
    await wrap(<ChangesScreen />);
    expect(screen.getByText('screen:Changes coming up')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('More for Raise'));
    await fireEvent.press(screen.getByLabelText('Delete'));
    expect(screen.getByText('Delete this change?')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Delete', { exact: true }));
    expect(mockRemove).toHaveBeenCalledWith(mockChanges[0]);
    expect(showToast).toHaveBeenCalledWith({ kind: 'destructive', text: { key: 'decide.delete.toastChange' }, stepId: 's-remove' });
  });

  it('D-99 the Changes screen keeps + Add a change with no changes and opens the editor', async () => {
    await wrap(<ChangesScreen />);
    await fireEvent.press(screen.getByText('+ Add a change'));
    expect(screen.getByText('Add a change')).toBeTruthy();
  });

  it('D-99 the Lines screen opens the limit editor', async () => {
    await wrap(<LinesScreen />);
    expect(screen.getByText('screen:Lines you will not cross')).toBeTruthy();
    expect(screen.getByText('These decide what counts as affordable. Tap any of them to change it.')).toBeTruthy();
    for (const key of ['reserve', 'dsr', 'unsecured', 'investing', 'saving']) expect(screen.getByTestId(`line-row-${key}`)).toBeTruthy();
    await act(async () => {});
    await fireEvent.press(screen.getByTestId('line-row-reserve'));
    expect(screen.getByLabelText('Save limit')).toBeTruthy();
  });
});
