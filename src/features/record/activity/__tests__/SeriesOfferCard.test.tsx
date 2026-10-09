import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { SeriesOfferCard } from '../SeriesOfferCard';
import { offer, rowsFor } from './offerFixtures';

const mockMarkAll = jest.fn();
const mockDismiss = jest.fn();
jest.mock('@/data/mutations/markMonthly', () => ({ useMarkMonthly: () => ({ markAll: mockMarkAll, markOne: jest.fn() }) }));
jest.mock('@/data/mutations/dismissedOffers', () => ({ useDismissOffers: () => ({ dismiss: mockDismiss }) }));
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

function renderCard(offers: ReturnType<typeof offer>[], onReview = jest.fn()) {
  return render(
    <ThemeProvider>
      <SeriesOfferCard offers={offers} rowsById={rowsFor(1, 2)} onReview={onReview} />
    </ThemeProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

describe('SeriesOfferCard', () => {
  it('reads the plural and singular sentences', async () => {
    const two = await renderCard([offer(1), offer(2)]);
    expect(two.getByText('2 lines also ran in Sep at about the same amount. Mark them monthly?')).toBeTruthy();
    await two.unmount();
    const one = await renderCard([offer(1)]);
    expect(one.getByText('1 line also ran in Sep at about the same amount. Mark it monthly?')).toBeTruthy();
  });

  it('renders nothing without offers', async () => {
    const screen = await renderCard([]);
    expect(screen.queryByText('Mark all monthly')).toBeNull();
  });

  it('Mark all monthly sends both offers once', async () => {
    const offers = [offer(1), offer(2)];
    const screen = await renderCard(offers);
    await fireEvent.press(screen.getByLabelText('Mark all monthly'));
    expect(mockMarkAll).toHaveBeenCalledTimes(1);
    expect(mockMarkAll.mock.calls[0][0].offers).toEqual(offers);
    expect(mockMarkAll.mock.calls[0][0]).toMatchObject({ householdId: 'h1', ownerId: 'u1', timeZone: 'Europe/London' });
  });

  it('Not now dismisses both keys and Review each opens the sheet', async () => {
    const onReview = jest.fn();
    const screen = await renderCard([offer(1), offer(2)], onReview);
    await fireEvent.press(screen.getByLabelText('Not now'));
    expect(mockDismiss).toHaveBeenCalledWith(['name1|GBP|-1', 'name2|GBP|-1']);
    await fireEvent.press(screen.getByLabelText('Review each'));
    expect(onReview).toHaveBeenCalledTimes(1);
  });
});
