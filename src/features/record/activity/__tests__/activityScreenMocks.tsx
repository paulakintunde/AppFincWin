// Shared jest mocks for tests that render ActivityScreen: the screen now reaches the offer,
// add-month, series, transfer and paste modules, none of which a screen test should hit.
// Import this file BEFORE the screen. Handles are exported for assertions.
import type { SeriesOffer } from '@/engine/recurring';

export const mockScreen = {
  addMonth: jest.fn((): string => 'add-month-step'),
  offers: [] as SeriesOffer[],
  removeTransfer: jest.fn((): string => 'tdel-step'),
  end: jest.fn((): string => 'end-step'),
  apply: jest.fn((): string => 'bulk-step'),
};

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/data/mutations/addMonth', () => ({ useAddMonth: () => ({ add: (...a: unknown[]) => (mockScreen.addMonth as (...x: unknown[]) => string)(...a) }) }));
jest.mock('@/data/mutations/cloneMonth', () => ({ useCloneMonth: () => ({ clone: jest.fn() }) }));
jest.mock('@/data/mutations/transfers', () => ({ useDeleteTransfer: () => ({ remove: (...a: unknown[]) => (mockScreen.removeTransfer as (...x: unknown[]) => string)(...a) }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({ useEndSeries: () => ({ end: (...a: unknown[]) => (mockScreen.end as (...x: unknown[]) => string)(...a) }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/offers', () => ({
  useSeriesOffers: () => ({ offers: mockScreen.offers, rowsById: new Map(), isLoading: false }),
}));
jest.mock('@/features/record/import/PasteSheet', () => {
  const { Text } = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  return { PasteSheet: (p: { visible: boolean; month: string }) => (p.visible ? R.createElement(Text, null, `paste:${p.month}`) : null) };
});
jest.mock('../RecurringReviewSheet', () => {
  const { Text } = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  return { RecurringReviewSheet: (p: { visible: boolean }) => (p.visible ? R.createElement(Text, null, 'review-sheet') : null) };
});
jest.mock('../SeriesOfferCard', () => {
  const { Text, Pressable } = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  return {
    SeriesOfferCard: (p: { offers: unknown[]; onReview: () => void }) =>
      R.createElement(
        Pressable,
        { onPress: p.onReview },
        R.createElement(Text, null, `offer-card:${p.offers.length}`),
        R.createElement(Text, null, 'Review each')
      ),
  };
});
