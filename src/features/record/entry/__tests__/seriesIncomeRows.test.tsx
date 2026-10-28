import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { RecurringSeriesRow } from '@/db/rows';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { SeriesIncomeRows } from '../SeriesIncomeRows';

let mockV3 = true;
const mockPatchImpl = jest.fn();
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: mockV3 }) }));
jest.mock('@/data/mutations/seriesAttributes', () => ({
  usePatchSeriesAttributes: () => ({ patch: (...a: unknown[]) => mockPatchImpl(...a) }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const series = (over: Partial<RecurringSeriesRow> = {}) =>
  ({ id: 's1', name: 'Pay', version: 2, counts_as: 'available', income_kind: 'salary', ...over }) as RecurringSeriesRow;

async function show(s: RecurringSeriesRow) {
  return render(
    <ThemeProvider>
      <SeriesIncomeRows series={s} householdId="h1" ownerId="u1" />
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockV3 = true;
  mockPatchImpl.mockReset();
  mockPatchImpl.mockReturnValue({ stepId: 'st1' });
  resetToastForTests();
});

describe('SeriesIncomeRows', () => {
  it('shows the current kind and the counting switch', async () => {
    const { getByText, getByRole } = await show(series());
    expect(getByText('Salary or wages')).toBeTruthy();
    expect(getByRole('switch', { name: 'Counts toward my month' }).props.accessibilityState.checked).toBe(true);
  });

  it('says Not set when there is no kind', async () => {
    const { getByText } = await show(series({ income_kind: null }));
    expect(getByText('Not set')).toBeTruthy();
  });

  it('toggling counting off writes counts_as kept with an Undo toast', async () => {
    const s = series();
    const { getByRole } = await show(s);
    await fireEvent.press(getByRole('switch', { name: 'Counts toward my month' }));
    expect(mockPatchImpl).toHaveBeenCalledWith([{ series: s, attributes: { counts_as: 'kept' } }], 'incomeTypeSaved', 'Pay');
    expect(getToast()?.stepId).toBe('st1');
  });

  it('picking a kind writes income_kind', async () => {
    const s = series();
    const { getByText } = await show(s);
    await fireEvent.press(getByText('Income type'));
    await fireEvent.press(getByText('Commission or tips'));
    expect(mockPatchImpl).toHaveBeenCalledWith([{ series: s, attributes: { income_kind: 'commission' } }], 'incomeTypeSaved', 'Pay');
  });

  it('an unchanged pick writes nothing and shows no toast', async () => {
    mockPatchImpl.mockReturnValue(null);
    const { getByText, getAllByText } = await show(series());
    await fireEvent.press(getByText('Income type'));
    await fireEvent.press(getAllByText('Salary or wages')[1]!);
    expect(getToast()).toBeNull();
  });

  it('renders nothing when v3 is off', async () => {
    mockV3 = false;
    const { queryByText } = await show(series());
    expect(queryByText('Income type')).toBeNull();
  });
});
