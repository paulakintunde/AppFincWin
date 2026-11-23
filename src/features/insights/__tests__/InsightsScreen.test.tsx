/* eslint-disable i18next/no-literal-string -- stub section bodies in a test */
// 07-11: the Insights screen composes the sections under one scope and range, gated by level (D-16..D-19).
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { InsightsScreen } from '../InsightsScreen';

jest.setTimeout(60000);

const mock = {
  access: { insights: true, netWorthTrend: true, healthScore: true } as Record<string, boolean>,
  scope: 'mine' as 'mine' | 'household',
  showScope: false,
  status: 'ready' as 'loading' | 'error' | 'ready',
  months: ['2026-11'] as string[],
  setScope: jest.fn(),
  retry: jest.fn(),
};
const mockOpenEntry = jest.fn();
const seen: Record<string, unknown> = {};

jest.mock('@/features/levels/useFeatureAccess', () => ({ useFeatureAccess: (id: string) => ({ visible: mock.access[id] ?? false }) }));
jest.mock('@/features/record/entry/entryHost', () => ({ openEntry: (m: unknown) => mockOpenEntry(m) }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/shell/screen/TabRootScreen', () => ({ TabRootScreen: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/ui/SyncStatusLine', () => ({ SyncStatusLine: () => null }));
jest.mock('../useInsightsScope', () => ({
  useInsightsScope: () => ({
    scope: mock.scope,
    showScope: mock.showScope,
    setScope: mock.setScope,
    currency: 'USD',
    householdCurrency: 'USD',
    householdId: 'h',
    userId: 'u',
    today: '2026-11-10',
  }),
}));
jest.mock('@/data/queries/insights', () => ({
  useInsightsPrepared: () => ({ status: mock.status, prepared: mock.status === 'ready' ? {} : null, minePrepared: {}, errorKind: null, retry: mock.retry }),
}));
jest.mock('../model/everyday', () => ({ recordedMonths: () => mock.months }));
jest.mock('../sections/MoneyInOutSection', () => ({
  MoneyInOutSection: (p: { range: string }) => {
    seen.inOut = p.range;
    const { Text: T } = require('react-native');
    return <T testID="insights-in-out">in-out</T>;
  },
}));
jest.mock('../sections/WhereItWentSection', () => ({
  WhereItWentSection: (p: { range: string }) => {
    seen.where = p.range;
    const { Text: T } = require('react-native');
    return <T testID="insights-where">where</T>;
  },
}));
jest.mock('../sections/MonthAgainstLastSection', () => ({
  MonthAgainstLastSection: () => {
    const { Text: T } = require('react-native');
    return <T testID="insights-compare">compare</T>;
  },
}));
jest.mock('../sections/NetWorthSection', () => ({
  NetWorthSection: (p: { scope: string; range: string }) => {
    seen.nw = `${p.scope}/${p.range}`;
    const { Text: T } = require('react-native');
    return <T testID="net-worth-section">nw</T>;
  },
}));
jest.mock('../sections/ScoreCard', () => ({
  ScoreCard: (p: { scope: string }) => {
    seen.score = p.scope;
    const { Text: T } = require('react-native');
    return <T testID="score-card">score</T>;
  },
}));

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
      <ThemeProvider>
        <FontScaleProvider value={1}>
          <InsightsScreen />
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mock.access = { insights: true, netWorthTrend: true, healthScore: true };
  mock.scope = 'mine';
  mock.showScope = false;
  mock.status = 'ready';
  mock.months = ['2026-11'];
  for (const k of Object.keys(seen)) delete seen[k];
});

const FOOTER = 'Insights are worked out from your own records. FincWin holds no money and moves none.';

describe('InsightsScreen', () => {
  it('level 2: the three Everyday sections only', async () => {
    mock.access = { insights: true, netWorthTrend: false, healthScore: false };
    await renderScreen();
    expect(screen.getByTestId('insights-in-out')).toBeTruthy();
    expect(screen.getByTestId('insights-where')).toBeTruthy();
    expect(screen.getByTestId('insights-compare')).toBeTruthy();
    expect(screen.queryByTestId('net-worth-section')).toBeNull();
    expect(screen.queryByTestId('score-card')).toBeNull();
    expect(screen.getByText(FOOTER)).toBeTruthy();
  });

  it('level 3: Net worth then Score follow the Everyday sections', async () => {
    await renderScreen();
    expect(screen.getByTestId('net-worth-section')).toBeTruthy();
    expect(screen.getByTestId('score-card')).toBeTruthy();
  });

  it('shows no scope switch with one member, and a Just me / Household switch with two', async () => {
    const view = await renderScreen();
    expect(screen.queryByText('Household')).toBeNull();
    await view.unmount();
    mock.showScope = true;
    await renderScreen();
    await fireEvent.press(screen.getByText('Household'));
    expect(mock.setScope).toHaveBeenCalledWith('household');
  });

  it('passes the household scope to Net worth and the Score card', async () => {
    mock.showScope = true;
    mock.scope = 'household';
    await renderScreen();
    expect(String(seen.nw)).toBe('household/6m');
    expect(seen.score).toBe('household');
  });

  it('one range control re-renders every section with the new range', async () => {
    await renderScreen();
    expect(seen.inOut).toBe('6m');
    await fireEvent.press(screen.getByText('1Y'));
    expect(seen.inOut).toBe('1y');
    expect(seen.where).toBe('1y');
    expect(String(seen.nw)).toBe('mine/1y');
  });

  it('whole-tab empty state with no recorded months, and Add an entry opens a new out entry', async () => {
    mock.months = [];
    await renderScreen();
    expect(screen.getByText('Nothing to show yet')).toBeTruthy();
    expect(screen.queryByTestId('insights-in-out')).toBeNull();
    await fireEvent.press(screen.getByText('Add an entry'));
    expect(mockOpenEntry).toHaveBeenCalledWith({ kind: 'new', direction: 'out' });
  });

  it('household with nothing shared says so', async () => {
    mock.months = [];
    mock.scope = 'household';
    mock.showScope = true;
    await renderScreen();
    expect(screen.getByText('Nothing shared yet')).toBeTruthy();
    expect(screen.getByText('Add a shared entry')).toBeTruthy();
  });

  it('error shows the card and Try again retries', async () => {
    mock.status = 'error';
    await renderScreen();
    expect(screen.getByText('Couldn’t load this right now')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));
    expect(mock.retry).toHaveBeenCalled();
  });

  it('loading shows placeholders, no sections', async () => {
    mock.status = 'loading';
    await renderScreen();
    expect(screen.getByTestId('insights-loading')).toBeTruthy();
    expect(screen.queryByTestId('insights-in-out')).toBeNull();
  });

  it('a deep link while Insights is not visible renders the empty state, no sections (T-07-33)', async () => {
    mock.access = { insights: false };
    await renderScreen();
    expect(screen.getByTestId('insights-empty')).toBeTruthy();
    expect(screen.queryByTestId('insights-in-out')).toBeNull();
    expect(screen.queryByText('Add an entry')).toBeNull();
  });
});

void Text;
