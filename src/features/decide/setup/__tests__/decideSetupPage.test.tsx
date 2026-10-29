/**
 * Plan 05.2-35 (D-18, D-19): the test-account setup page, its status card and readout; and the Decide tab choosing it.
 * The engine and the reads are faked at their hook boundary; the readout model has its own suite.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { MATRIX, expectFits, matrixName } from '@/features/decide/__tests__/helpers/r18Fit';
import type { SetupFacts } from '../setupFlow';
import type { UnspentView } from '../unspentView';
import { DecideSetupPage } from '../DecideSetupPage';
import DecideRoute from '../../../../../app/(app)/(tabs)/decide';

jest.setTimeout(60000);
let mockScale = 1;
let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));
jest.mock('@/theme/FontScaleProvider', () => {
  const actual = jest.requireActual('@/theme/FontScaleProvider');
  return { ...actual, useFontScale: () => mockScale };
});
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('@/features/decide/home/DecideHomeScreen', () => ({ DecideHomeScreen: () => null }));
jest.mock('@/features/decide/dev/ShadowExportDevMenu', () => ({ ShadowExportDevMenu: () => null }));

// The real scaffold pulls in the avatar's Supabase client; the header props and the children are what matter here.
const mockTabProps: Record<string, unknown>[] = [];
jest.mock('@/shell/screen/TabRootScreen', () => {
  const R = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    TabRootScreen: (p: { children?: React.ReactNode; overlay?: React.ReactNode } & Record<string, unknown>) => {
      mockTabProps.push(p);
      return R.createElement(View, null, p.children, p.overlay);
    },
  };
});

const mockPush = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (h: unknown) => mockPush(h) }));
let mockAccess = { v3: true };
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => mockAccess }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u1', householdId: 'h1', homeCurrency: 'USD', timeZone: 'UTC', today: '2026-10-15' }),
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', name: 'High-interest savings' }] }) }));

interface V3State {
  status: 'loading' | 'error' | 'ready';
  inputs: unknown;
  evaluation: unknown;
  refetch: jest.Mock;
}
let mockV3: V3State;
let mockFacts: SetupFacts | null;
let mockView: UnspentView | null;
jest.mock('@/data/queries/decideV3', () => ({ useDecideV3: () => mockV3 }));
jest.mock('../useSetupFacts', () => ({ useSetupFacts: () => mockFacts }));
jest.mock('../useUnspent', () => ({ useUnspent: () => ({ view: mockView }) }));
jest.mock('../UnspentSheet', () => {
  const { Text } = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  return { UnspentSheet: (p: { visible: boolean }) => (p.visible ? R.createElement(Text, null, 'unspent-sheet-open') : null) };
});
jest.mock('../EmergencyFundSheet', () => {
  const { Text } = jest.requireActual('react-native');
  const R = jest.requireActual('react');
  return { EmergencyFundSheet: (p: { visible: boolean }) => (p.visible ? R.createElement(Text, null, 'emergency-sheet-open') : null) };
});

const FACTS: SetupFacts = {
  incomeTypes: ['salary_or_wages'],
  hasRegularPaySeries: true,
  method: null,
  spreadMonths: null,
  steadyAmount: null,
  holdMonths: null,
  fullMonthsOfRecords: 6,
  moneyAccountIds: ['a1'],
  accountIdsWithUse: ['a1'],
  everydayOverride: null,
  unspentAnchorSet: true,
  roughTyped: false,
  setupDoneAt: '2026-10-10T00:00:00Z',
};

const readyState = (): V3State => ({
  status: 'ready',
  refetch: jest.fn(),
  inputs: {
    asOf: '2026-10-15',
    currency: 'USD',
    months: [],
    profile: { types: ['salary'], variable: null, steady: null, billsHorizonMonths: null, pattern: 'steady' },
    unspent: { amount: 240000, at: '2026-10-03' },
    emergency: { amount: 900000, accountId: 'a1' },
    envelopes: [{ id: 'e1', saved: 250000, accountId: 'a1' }],
    everydayOverride: 120000,
    accounts: [
      { id: 'a1', balance: 1, use: { kind: 'everyday' } },
      { id: 'a2', balance: 1, use: null },
    ],
  },
  evaluation: { month: { e: 90000 }, funds: { envelopesSaved: 250000 }, result: { missing: [], notices: [] } },
});

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

async function mount(node: React.ReactNode = <DecideSetupPage />) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider value={mockScale}>{node}</FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  mockScale = 1;
  mockWidth = 402;
  mockTabProps.length = 0;
  mockPush.mockClear();
  mockAccess = { v3: true };
  mockV3 = readyState();
  mockFacts = FACTS;
  mockView = { kind: 'fresh', value: 240000, anchor: 240000, anchorAt: '2026-10-03' };
});

describe('setup status card', () => {
  it('not started: "Set up Decide" opens the flow', async () => {
    mockFacts = { ...FACTS, incomeTypes: null, setupDoneAt: null, hasRegularPaySeries: false, unspentAnchorSet: false };
    await mount();
    expect(screen.getByText('A few questions so Decide can check purchases against your real month.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Set up Decide' }));
    expect(mockPush).toHaveBeenCalledWith('/decide/setup');
  });

  it('rough: chip, steps left by name, and "Finish setup" opens at the first one', async () => {
    mockFacts = { ...FACTS, unspentAnchorSet: false, accountIdsWithUse: [], setupDoneAt: null };
    await mount();
    expect(screen.getByText('Rough')).toBeTruthy();
    expect(screen.getByText('Decide is using rough answers')).toBeTruthy();
    expect(screen.getByText('2 required steps left: What each account is for, Unspent money.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Finish setup' }));
    expect(mockPush).toHaveBeenCalledWith('/decide/setup?startAt=accountUse');
  });

  it('done: "Decide is set up" and "Change an answer" opens settings', async () => {
    await mount();
    expect(screen.getByText('Decide is set up')).toBeTruthy();
    expect(screen.getByText('Answers are worked out from your records and what you told us.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Change an answer' }));
    expect(mockPush).toHaveBeenCalledWith('/decide/settings');
  });
});

describe('rows card', () => {
  it('Decide settings opens settings; Unspent and Emergency open their sheets', async () => {
    await mount();
    await fireEvent.press(screen.getByRole('button', { name: 'Decide settings' }));
    expect(mockPush).toHaveBeenCalledWith('/decide/settings');
    await fireEvent.press(screen.getByRole('button', { name: /^Unspent money/ }));
    expect(screen.getByText('unspent-sheet-open')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Emergency fund/ }));
    expect(screen.getByText('emergency-sheet-open')).toBeTruthy();
  });

  it.each<[UnspentView, string]>([
    [{ kind: 'notConfirmed', sum: 5 }, 'Not confirmed'],
    [{ kind: 'fresh', value: 240000, anchor: 240000, anchorAt: '2026-10-03' }, 'Confirmed '],
    [{ kind: 'drifted', rolled: 100, sum: 200, anchorAt: '2026-10-03' }, 'Differs from your accounts'],
    [{ kind: 'stale', value: 240000, days: 41, anchorAt: '2026-09-01' }, 'Last confirmed 41 days ago'],
  ])('the unspent chip reads %j', async (view, text) => {
    mockView = view;
    await mount();
    expect(screen.getByText(new RegExp(`^${text}`))).toBeTruthy();
  });

  it('the emergency fund reads "Not set" when there is none', async () => {
    const s = readyState();
    (s.inputs as { emergency: unknown }).emergency = null;
    mockV3 = s;
    await mount();
    expect(screen.getByText('Not set')).toBeTruthy();
  });
});

describe('engine readout', () => {
  it('draws the eyebrow, the test-accounts chip, the rows with something to say and the footer', async () => {
    await mount();
    expect(screen.getByText('WHAT DECIDE RECEIVES')).toBeTruthy();
    expect(screen.getByText('Test accounts only')).toBeTruthy();
    expect(screen.getByText('Accounts counted')).toBeTruthy();
    expect(screen.getByText('1 of 2 · 1 not set up')).toBeTruthy();
    expect(screen.getByText('Salary · steady')).toBeTruthy();
    expect(screen.getByText('Typical month used')).toBeTruthy();
    expect(screen.queryByText('Refunds linked')).toBeNull();
    expect(screen.queryByText('Next question')).toBeNull();
    expect(screen.getByText('The full Decide arrives in the next update.')).toBeTruthy();
  });

  it('readout text is selectable', async () => {
    await mount();
    expect(screen.getByText('Accounts counted').props.selectable).toBe(true);
    expect(screen.getByText('1 of 2 · 1 not set up').props.selectable).toBe(true);
  });

  it('header carries the eyebrow and title', async () => {
    await mount();
    expect(mockTabProps.at(-1)).toMatchObject({ eyebrow: 'DECIDE', title: 'Can I afford it' });
  });
});

describe('states', () => {
  it('loading draws a busy skeleton and no readout', async () => {
    mockV3 = { ...readyState(), status: 'loading', inputs: null, evaluation: null };
    await mount();
    expect(screen.getByLabelText('Loading your figures').props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.queryByText('WHAT DECIDE RECEIVES')).toBeNull();
  });

  it('error draws the shipped message and Try again refetches', async () => {
    mockV3 = { ...readyState(), status: 'error', inputs: null, evaluation: null };
    await mount();
    expect(screen.getByText('Your figures didn’t load')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(mockV3.refetch).toHaveBeenCalledTimes(1);
  });

  it('a ready state built from cached data (offline) draws the readout as usual', async () => {
    await mount();
    expect(screen.getByText('WHAT DECIDE RECEIVES')).toBeTruthy();
  });
});

describe('the Decide tab', () => {
  it('shows the setup page for a switch-on account', async () => {
    await mount(<DecideRoute />);
    expect(screen.getByText('WHAT DECIDE RECEIVES')).toBeTruthy();
    expect(screen.queryByText('A better Decide is on its way')).toBeNull();
  });

  it('shows Coming soon for everyone else', async () => {
    mockAccess = { v3: false };
    await mount(<DecideRoute />);
    expect(screen.getByText('A better Decide is on its way')).toBeTruthy();
    expect(screen.queryByText('WHAT DECIDE RECEIVES')).toBeNull();
  });
});

describe('text fit', () => {
  for (const m of MATRIX) {
    it(`the page fits at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      mockFacts = { ...FACTS, unspentAnchorSet: false, accountIdsWithUse: [], setupDoneAt: null };
      await mount();
      expect(screen.getByText('WHAT DECIDE RECEIVES')).toBeTruthy();
      expectFits();
      await cleanup();
    });
  }
});
