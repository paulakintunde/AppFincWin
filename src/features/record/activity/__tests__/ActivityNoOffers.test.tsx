// Regression (activity-white-screen): ActivityScreen always mounts the real RecurringReviewSheet
// and SeriesOfferCard. With no series offers (every new user) the sheet computed a month name
// from '' and Intl threw RangeError, white-screening the app. Nothing here is mocked at the
// offer UI level on purpose; only data hooks are stubbed.
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ActivityScreen } from '../ActivityScreen';
import { RecurringReviewSheet } from '../RecurringReviewSheet';
import { shortMonthName } from '../SeriesOfferCard';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.setTimeout(30000);

jest.mock('@shopify/flash-list', () => {
  const { View } = jest.requireActual('react-native');
  return {
    FlashList: ({ data, ListEmptyComponent }: { data: unknown[]; ListEmptyComponent?: React.ReactElement }) => (
      <View>{data.length === 0 ? ListEmptyComponent : null}</View>
    ),
  };
});
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/data/mutations/addMonth', () => ({ useAddMonth: () => ({ add: jest.fn() }) }));
jest.mock('@/data/mutations/cloneMonth', () => ({ useCloneMonth: () => ({ clone: jest.fn() }) }));
jest.mock('@/data/mutations/transfers', () => ({ useDeleteTransfer: () => ({ remove: jest.fn() }) }));
jest.mock('@/data/mutations/recurringSeries', () => ({ useEndSeries: () => ({ end: jest.fn() }) }));
jest.mock('@/data/mutations/markMonthly', () => ({ useMarkMonthly: () => ({ markAll: jest.fn(), markOne: jest.fn() }) }));
jest.mock('@/data/mutations/dismissedOffers', () => ({ useDismissOffers: () => ({ dismiss: jest.fn() }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/offers', () => ({
  useSeriesOffers: () => ({ offers: [], rowsById: new Map(), isLoading: false }),
}));
jest.mock('@/features/record/import/PasteSheet', () => ({ PasteSheet: () => null }));
jest.mock('@/data/mutations/patches', () => ({
  useBulkDelete: () => ({ remove: jest.fn() }),
  useBulkMarkPaid: () => ({ markPaid: jest.fn() }),
  useBulkMarkUnpaid: () => ({ markUnpaid: jest.fn() }),
  useBulkPatch: () => ({ apply: jest.fn() }),
}));
jest.mock('@/data/mutations/transactions', () => ({
  useMarkPaid: () => ({ markPaid: jest.fn() }),
  useDeleteTransaction: () => ({ remove: jest.fn() }),
}));
jest.mock('@/data/queries/activity', () => ({
  useMonthView: () => ({
    rows: [],
    projections: [],
    totals: { paidIn: 0, paidOut: 0, net: 0, stillToCome: 0, pendingCount: 0, projectedCount: 0, unconvertedCount: 0, transferCount: 0, count: 0 },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useTransactionMonths: () => ({ months: ['2026-09'], counts: new Map([['2026-09', 0]]), isLoading: false }),
  SEARCH_MIN_CHARS: 2,
  useTransactionsSearch: () => ({ rows: [], isLoading: false, enabled: false, isPending: false, fetchStatus: 'idle', isError: false, isSuccess: false }),
}));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/pendingSplit', () => ({ usePaidBefore: () => ({ legs: [], isLoading: false }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: [], active: [], byId: new Map(), builtinIds: new Map(), transferCategoryId: null, loading: false }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    timeZone: 'Europe/London',
    today: '2026-09-25',
    weekStart: 1,
  }),
}));
jest.mock('@/features/record/entry/TransactionSheet', () => ({ TransactionSheet: () => null }));

describe('no series offers (new user)', () => {
  it('shortMonthName returns an empty string for a blank or malformed month', () => {
    expect(shortMonthName('', 'en-GB')).toBe('');
    expect(shortMonthName('nope', 'en-GB')).toBe('');
    expect(shortMonthName('2026-09', 'en-GB')).toBe('Sept');
  });

  it('the real RecurringReviewSheet renders nothing with zero offers', async () => {
    const screen = await render(
      <ThemeProvider>
        <RecurringReviewSheet visible offers={[]} rowsById={new Map()} onClose={jest.fn()} />
      </ThemeProvider>
    );
    expect(screen.queryByText('Recurring review')).toBeNull();
  });

  it('ActivityScreen mounts with the real offer UI and zero offers without throwing', async () => {
    const screen = await render(
      <ThemeProvider>
        <ActivityScreen onOpenAccounts={jest.fn()} onOpenHistory={jest.fn()} onOpenYou={jest.fn()} initialMonth="2026-09" />
      </ThemeProvider>
    );
    expect(screen.toJSON()).not.toBeNull();
  });
});
