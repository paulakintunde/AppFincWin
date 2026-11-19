import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { hapticTick } from '@/ui/haptics';
import { router } from 'expo-router';
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
  position: { unpaidCount: 5 },
  loading: false,
  dataState: 'ready' as string,
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
  scope: 'mine' as 'mine' | 'household',
  setScope: jest.fn(),
  showScope: false,
  figureCurrency: 'GBP',
};

jest.mock('../useHomeViewModel', () => ({ useHomeViewModel: () => mockVm }));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ byId: new Map() }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));
jest.mock('@/ui/haptics', () => ({ ...jest.requireActual('@/ui/haptics'), hapticTick: jest.fn() }));
jest.mock('@/features/auth/appHome', () => ({ ACTIVITY_HREF: '/activity-href' }));
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

const mockSeen: Record<string, Record<string, unknown>> = {};
function mockProbe(name: string) {
  const R = require('react');
  const { Text } = require('react-native');
  return (props: Record<string, unknown>) => {
    mockSeen[name] = props;
    return R.createElement(Text, { testID: `probe-${name}` }, name);
  };
}
jest.mock('../QuickActions', () => ({ QuickActions: mockProbe('quick') }));
jest.mock('../ThisMonthCard', () => ({ ThisMonthCard: mockProbe('month') }));
jest.mock('../ComingUpCard', () => ({ ComingUpCard: mockProbe('coming') }));
jest.mock('../AccountsCard', () => ({ AccountsCard: mockProbe('accounts') }));
jest.mock('@/features/levels/OfferSlot', () => ({ OfferSlot: mockProbe('offer') })); // 09-22: inline offer between the coming-up and accounts cards
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
    expect(at('coming')).toBeLessThan(at('offer'));
    expect(at('offer')).toBeLessThan(at('accounts'));
    expect(getByTestId('tab-root').props.refreshKeys).toBe(mockRefreshKeys);
  });

  it('06.2 D-02 / D-15: wraps each card in a once-per-session FadeIn, same order, nothing added', async () => {
    const { getByTestId, toJSON } = await render(<HomeScreen />);
    const json = JSON.stringify(toJSON());
    const ids = ['quick', 'thisMonth', 'comingUp', 'accounts'].map((n) => json.indexOf(`"home-card-${n}"`));
    expect(ids.every((i) => i > -1)).toBe(true);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    expect(within(getByTestId('home-card-quick')).getByTestId('probe-quick')).toBeTruthy();
    expect(within(getByTestId('home-card-thisMonth')).getByTestId('probe-month')).toBeTruthy();
    expect(within(getByTestId('home-card-comingUp')).getByTestId('probe-coming')).toBeTruthy();
    expect(within(getByTestId('home-card-accounts')).getByTestId('probe-accounts')).toBeTruthy();
  });

  it('06.2: gives Pay bills the month unpaid count (ready only) and Coming up today', async () => {
    await render(<HomeScreen />);
    expect(mockSeen.quick?.unpaidCount).toBe(5);
    expect(mockSeen.coming?.today).toBe('2026-09-10');
    mockVm.dataState = 'loading';
    await render(<HomeScreen />);
    expect(mockSeen.quick?.unpaidCount).toBe(0);
    mockVm.dataState = 'ready';
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

  it('passes the data state to both cards and the current month to This month', async () => {
    mockVm.dataState = 'error';
    await render(<HomeScreen />);
    expect(mockSeen.month?.state).toBe('error');
    expect(mockSeen.coming?.state).toBe('error');
    expect(mockSeen.month?.currentMonth).toBe('2026-09');
    mockVm.dataState = 'ready';
  });

  it('See all links to Activity through ACTIVITY_HREF', async () => {
    await render(<HomeScreen />);
    (mockSeen.coming?.onSeeAll as () => void)();
    expect(router.navigate).toHaveBeenCalledWith('/activity-href');
  });

  describe('08-25 Mine / Household switch (HH-09)', () => {
    afterEach(() => {
      mockVm.showScope = false;
      mockVm.scope = 'mine';
      mockVm.figureCurrency = 'GBP';
    });

    it('is hidden for a household of one: no switch, no note, home currency', async () => {
      await render(<HomeScreen />);
      expect(mockSeen.month?.scopeSwitch).toBeNull();
      expect(mockSeen.month?.scopeNote).toBeNull();
      expect(mockSeen.month?.homeCurrency).toBe('GBP');
    });

    it('Mine: the switch and the Mine note', async () => {
      mockVm.showScope = true;
      await render(<HomeScreen />);
      expect(mockSeen.month?.scopeSwitch).toBeTruthy();
      expect(mockSeen.month?.scopeNote).toBe('Your records plus your share of shared lines');
    });

    it('Household: the note names the household currency and the card formats in it', async () => {
      mockVm.showScope = true;
      mockVm.scope = 'household';
      mockVm.figureCurrency = 'EUR';
      await render(<HomeScreen />);
      expect(mockSeen.month?.scopeNote).toBe('Shared lines only, in EUR');
      expect(mockSeen.month?.homeCurrency).toBe('EUR');
    });

    it('switching sets the scope with no haptic (UI-SPEC: none for a scope switch)', async () => {
      mockVm.showScope = true;
      await render(<HomeScreen />);
      const toggle = await render(<ThemeProvider>{mockSeen.month?.scopeSwitch as React.ReactElement}</ThemeProvider>);
      fireEvent.press(toggle.getByLabelText('Household'));
      expect(mockVm.setScope).toHaveBeenCalledWith('household');
      expect(hapticTick).not.toHaveBeenCalled();
      expect(toggle.getByLabelText('Whose figures to show')).toBeTruthy();
    });
  });
});

