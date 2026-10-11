// 02.1-04: PDF issue codes show no issue text; the "Can’t verify" tag carries them.
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ReviewStep } from '../ReviewStep';
import type { useStatementImport } from '../useStatementImport';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

jest.mock('@shopify/flash-list', () => {
  const { View } = jest.requireActual('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListFooterComponent,
    }: {
      data: { key?: string }[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactElement;
      ListHeaderComponent?: React.ReactElement;
      ListFooterComponent?: React.ReactElement;
    }) => (
      <View>
        {ListHeaderComponent}
        {data.map((item, index) => (
          <View key={item.key ?? index}>{renderItem({ item, index })}</View>
        ))}
        {ListFooterComponent}
      </View>
    ),
  };
});

jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-GB', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    timeZone: 'UTC',
    today: '2026-10-06',
  }),
}));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({ data: [{ id: 'a1', name: 'Current', currency: 'GBP', kind: 'checking', archived_at: null }] }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => {
    const groceries = { id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null };
    return { all: [groceries], active: [groceries], byId: new Map([['c1', groceries]]), transferCategoryId: 'tc', loading: false };
  },
}));

type ImportState = ReturnType<typeof useStatementImport>;

function state(issues: string[]): ImportState {
  const row = {
    index: 0,
    converted: {
      index: 0,
      localDate: '2026-03-01',
      description: 'LINE 0',
      amount: -350,
      balance: null,
      availableSigned: null,
      rawAmount: '3.50',
      rawBalance: null,
      currency: 'GBP',
      externalId: null,
      trnType: null,
      issues,
    },
    check: 'cannot-verify',
    duplicate: null,
    categoryId: null,
    categorySource: 'none',
    included: true,
    locked: false,
    transfer: null,
    payMatch: null,
  };
  const fn = () => jest.fn();
  return {
    stage: 'review',
    accountId: 'a1',
    profile: { version: 1, source: 'pdf', accountFamily: 'deposit', positiveMeans: 'money-in', balanceMeans: 'held', statedLimit: null, decidedBy: 'user' },
    preview: {
      rows: [row],
      reconcile: { file: 'partial', rows: ['cannot-verify'], orientation: 'as-is', verifiedLinks: 0, failedLinks: 0 },
      fitidDisabled: false,
      limitOffer: null,
    },
    reconcile: { file: 'partial' },
    counts: { total: 1, included: 1, duplicates: 0, blocked: 0, cannotVerify: 1 },
    rowState: jest.fn(() => ({ included: true, categoryId: null, locked: false })),
    reviewGate: { required: false, count: 0 },
    rowsChecked: false,
    setRowsChecked: jest.fn(),
    toggleRow: fn(),
    setRowCategory: fn(),
    selectAllClean: fn(),
    limitOffer: null,
    limitAccepted: false,
    acceptLimit: fn(),
    transferRows: [],
    payMatchRows: [],
    refundRows: [],
    acceptRefund: fn(),
    dismissRefund: fn(),
    linkTransfer: fn(),
    dismissTransfer: fn(),
    setOrphanAccount: fn(),
    dismissOrphan: fn(),
    acceptPayMatch: fn(),
    dismissPayMatch: fn(),
    commit: fn(),
    commitProblem: null,
    overSuggestionCap: false,
    suggestionCap: 2999,
    transfersUnavailable: false,
    suggestions: [],
    acceptSuggestion: fn(),
    dismissSuggestion: fn(),
    back: fn(),
    continue: fn(),
  } as unknown as ImportState;
}

describe('ReviewStep issue lines', () => {
  it('a pdf code shows the Can’t verify tag and no issue text; a csv code still shows its text', async () => {
    await render(
      <ThemeProvider>
        <ReviewStep state={state(['bad-balance', 'pdf-no-date'])} />
      </ThemeProvider>
    );
    expect(screen.getByText('Can’t verify')).toBeTruthy();
    expect(screen.getByText('Balance not recognised')).toBeTruthy();
    expect(screen.queryByText(/pdf-no-date/)).toBeNull();
  });
});
