import React from 'react';
import { render } from '@testing-library/react-native';
import { HomeScreen } from '../HomeScreen';

jest.setTimeout(30000);

const mockRefreshKeys = [['k1'], ['k2']];
const mockVm = {
  rc: { userId: 'u1', householdId: 'h1', homeCurrency: 'GBP', today: '2026-09-10' },
  formatter: { locale: 'en-GB' },
  month: '2026-09',
  setMonth: jest.fn(),
  months: ['2026-09'],
  totals: {},
  position: {},
  loading: false,
  comingUp: [],
  comingUpTotal: 0,
  accounts: [],
  balances: new Map(),
  accountsLoading: false,
  rowActions: { pay: jest.fn() },
  flow: {
    detail: { visible: false },
    pendingDelete: null,
    entryMode: null,
    setEntryMode: jest.fn(),
    openDetail: jest.fn(),
    answerDelete: jest.fn(),
  },
  refreshKeys: mockRefreshKeys,
};

jest.mock('../useHomeViewModel', () => ({ useHomeViewModel: () => mockVm }));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ byId: new Map() }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
jest.mock('@/state/activityFocus', () => ({ requestActivityFocus: jest.fn() }));

jest.mock('@/shell/screen/TabRootScreen', () => {
  const R = require('react');
  const { View, Text } = require('react-native');
  return {
    TabRootScreen: (p: { title: string; eyebrow: string; refreshKeys: unknown; overlay: unknown; children: unknown }) =>
      R.createElement(
        View,
        { testID: 'tab-root', refreshKeys: p.refreshKeys },
        R.createElement(Text, null, p.eyebrow),
        R.createElement(Text, null, p.title),
        p.children,
        R.createElement(View, { testID: 'overlay' }, p.overlay)
      ),
  };
});

function mockProbe(name: string) {
  const R = require('react');
  const { Text } = require('react-native');
  return () => R.createElement(Text, { testID: `probe-${name}` }, name);
}
jest.mock('../QuickActions', () => ({ QuickActions: mockProbe('quick') }));
jest.mock('../ThisMonthCard', () => ({ ThisMonthCard: mockProbe('month') }));
jest.mock('../ComingUpCard', () => ({ ComingUpCard: mockProbe('coming') }));
jest.mock('../AccountsCard', () => ({ AccountsCard: mockProbe('accounts') }));
jest.mock('../ProjectionDetailSheet', () => ({ ProjectionDetailSheet: mockProbe('projection') }));
jest.mock('@/features/record/activity/TransactionDetailSheet', () => ({ TransactionDetailSheet: mockProbe('detail') }));
jest.mock('@/features/record/entry/EditScopePrompt', () => ({ EditScopePrompt: mockProbe('scope') }));
jest.mock('@/features/record/entry/TransactionSheet', () => ({ TransactionSheet: mockProbe('entry') }));
jest.mock('@/ui/ConfirmSheet', () => ({ ConfirmSheet: mockProbe('confirm') }));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HomeScreen', () => {
  it('renders the title, eyebrow and the four sections in order', async () => {
    const { getByText, getByTestId, toJSON } = await render(<HomeScreen />);
    expect(getByText('Overview')).toBeTruthy();
    expect(getByText(/^THURSDAY.*10.*SEP/)).toBeTruthy();
    const json = JSON.stringify(toJSON());
    const at = (n: string) => json.indexOf(`"probe-${n}"`);
    expect(at('quick')).toBeGreaterThan(-1);
    expect(at('quick')).toBeLessThan(at('month'));
    expect(at('month')).toBeLessThan(at('coming'));
    expect(at('coming')).toBeLessThan(at('accounts'));
    expect(getByTestId('tab-root').props.refreshKeys).toBe(mockRefreshKeys);
  });

  it('has no net worth, health or coach content', async () => {
    const { queryByText } = await render(<HomeScreen />);
    expect(queryByText(/net worth/i)).toBeNull();
    expect(queryByText(/health/i)).toBeNull();
    expect(queryByText(/coach/i)).toBeNull();
  });

  it('hosts the detail, prompts, entry and projection sheets in the overlay', async () => {
    const { getByTestId } = await render(<HomeScreen />);
    for (const n of ['detail', 'scope', 'confirm', 'entry', 'projection']) {
      expect(getByTestId(`probe-${n}`)).toBeTruthy();
    }
  });
});
