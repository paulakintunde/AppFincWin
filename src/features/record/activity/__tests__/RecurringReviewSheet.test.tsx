import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { RecurringReviewSheet } from '../RecurringReviewSheet';
import { offer, rowsFor } from './offerFixtures';

const mockMarkAll = jest.fn();
const mockMarkOne = jest.fn();
const mockDismiss = jest.fn();
jest.mock('@/data/mutations/markMonthly', () => ({ useMarkMonthly: () => ({ markAll: mockMarkAll, markOne: mockMarkOne }) }));
jest.mock('@/data/mutations/dismissedOffers', () => ({ useDismissOffers: () => ({ dismiss: mockDismiss }) }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: [], active: [], byId: new Map(), builtinIds: new Map(), transferCategoryId: null, loading: false }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    timeZone: 'Europe/London',
    today: '2026-10-25',
    weekStart: 1,
  }),
}));

const OFFERS = [offer(1), offer(2), offer(3)];

function renderSheet(onClose = jest.fn()) {
  return render(
    <ThemeProvider>
      <RecurringReviewSheet visible offers={OFFERS} rowsById={rowsFor(1, 2, 3)} onClose={onClose} />
    </ThemeProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

describe('RecurringReviewSheet', () => {
  it('lists each offer with name, amount, category and day', async () => {
    const screen = await renderSheet();
    expect(screen.getByText('Recurring review')).toBeTruthy();
    expect(screen.getByText('Name1')).toBeTruthy();
    expect(screen.getByText('−£10.00 · Uncategorised · day 5')).toBeTruthy();
  });

  it('Monthly marks one offer and removes it; One-off dismisses it and removes it', async () => {
    const screen = await renderSheet();
    await fireEvent.press(screen.getByLabelText('Monthly, Name1'));
    expect(mockMarkOne).toHaveBeenCalledTimes(1);
    expect(mockMarkOne.mock.calls[0][0].offer).toBe(OFFERS[0]);
    expect(screen.queryByText('Name1')).toBeNull();
    await fireEvent.press(screen.getByLabelText('One-off, Name2'));
    expect(mockDismiss).toHaveBeenCalledWith(['name2|GBP|-1']);
    expect(screen.queryByText('Name2')).toBeNull();
  });

  it('footer Mark all monthly marks the remaining offers', async () => {
    const onClose = jest.fn();
    const screen = await renderSheet(onClose);
    await fireEvent.press(screen.getByLabelText('One-off, Name1'));
    await fireEvent.press(screen.getByLabelText('Mark all monthly'));
    expect(mockMarkAll).toHaveBeenCalledTimes(1);
    expect(mockMarkAll.mock.calls[0][0].offers).toEqual([OFFERS[1], OFFERS[2]]);
    expect(onClose).toHaveBeenCalled();
  });

  it('Leave them all dismisses the remaining keys and closes; an emptied list shows the empty copy', async () => {
    const onClose = jest.fn();
    const screen = await renderSheet(onClose);
    await fireEvent.press(screen.getByLabelText('Leave them all'));
    expect(mockDismiss).toHaveBeenCalledWith(['name1|GBP|-1', 'name2|GBP|-1', 'name3|GBP|-1']);
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByText(/^Nothing left to review/)).toBeTruthy();
  });
});
