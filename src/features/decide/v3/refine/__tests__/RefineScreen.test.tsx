/** Plan 05.3-34: the review screen. Opening stamps once; the header counts checked cards; Done vs Done for now; a card shows its choices and status. */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { minorUnits } from '@/engine/money';
import type { RefineCard } from '@/engine/decide/v3';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { RefineScreen } from '../RefineScreen';

jest.setTimeout(60000);
const mockMarkShown = jest.fn();
const mockBack = jest.fn();
const mockChoose = jest.fn();
let mockCards: readonly RefineCard[] = [];
let mockResultNull = false;
let mockDecided = new Map<string, 'updated' | 'kept'>();

jest.mock('expo-router', () => ({ router: { back: () => mockBack(), replace: jest.fn() } }));
jest.mock('@/features/record/useRecordContext', () => ({ useRecordContext: () => ({ userId: 'u', householdId: 'h', today: '2026-10-30', homeCurrency: 'USD' }) }));
jest.mock('@/data/mutations/decideSetup', () => ({ useStampRefine: () => ({ markShown: mockMarkShown, snooze: jest.fn() }) }));
jest.mock('../useRefine', () => ({
  useRefine: () => ({ result: mockResultNull ? null : { due: true, triggers: ['three_months'], cards: mockCards }, snoozed: false, asOf: '2026-10-30' }),
}));
jest.mock('../useRefineChoices', () => {
  return { useRefineChoices: () => ({ choose: mockChoose, decided: mockDecided, pot: null, closePot: jest.fn() }) };
});
jest.mock('../../shared/useV3Format', () => {
  const money = (n: number) => `$${(n / 100).toFixed(0)}`;
  const f = { money, moneyA11y: money, monthYear: (ym: string) => ym, month: (ym: string) => ym, date: (d: string) => d };
  return { useV3Format: () => f };
});
jest.mock('../../../pots/PotSheet', () => ({ PotSheet: () => null }));
jest.mock('../../../setup/DebtSheet', () => ({ DebtSheetHost: () => null }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const { View, Text } = jest.requireActual('react-native');
  return { DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => <View><Text accessibilityRole="header">{title}</Text>{children}</View> };
});

const cards: readonly RefineCard[] = [
  { kind: 'pay', ref: 'pay1', month: null, current: minorUnits(300000), suggested: minorUnits(320000), noise: minorUnits(5000) },
  { kind: 'everyday', ref: null, month: null, current: minorUnits(90000), suggested: minorUnits(110000), noise: minorUnits(5000) },
  { kind: 'saving_bucket', ref: 'pot1', month: null, current: minorUnits(20000), suggested: null, noise: null },
];
const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };
const tree = (
  <SafeAreaProvider initialMetrics={METRICS}>
    <ThemeProvider>
      <RefineScreen />
    </ThemeProvider>
  </SafeAreaProvider>
);
const wrap = () => render(tree);

beforeEach(() => {
  jest.clearAllMocks();
  mockCards = cards;
  mockResultNull = false;
  mockDecided = new Map();
});

describe('RefineScreen', () => {
  it('stamps the shown time once on open', async () => {
    const view = await wrap();
    expect(mockMarkShown).toHaveBeenCalledTimes(1);
    expect(mockMarkShown).toHaveBeenCalledWith('2026-10-30');
    await view.rerender(tree);
    expect(mockMarkShown).toHaveBeenCalledTimes(1);
  });

  it('shows the header count, title, intro and one card per change, all To check', async () => {
    await wrap();
    expect(screen.getByText('Refine Decide · 0 of 3 checked')).toBeTruthy();
    expect(screen.getByText('Here’s what your records show now')).toBeTruthy();
    expect(screen.getAllByText('To check')).toHaveLength(3);
    expect(screen.getByText('Your pay looks like $3200')).toBeTruthy();
  });

  it('counts decided cards, shows their status and offers Done for now until all are checked', async () => {
    mockDecided = new Map([['pay:pay1', 'updated']]);
    await wrap();
    expect(screen.getByText('Refine Decide · 1 of 3 checked')).toBeTruthy();
    expect(screen.getByText('Updated')).toBeTruthy();
    expect(screen.getByText('Done for now')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('offers Done when every card is checked, and Done goes back', async () => {
    mockDecided = new Map([
      ['pay:pay1', 'updated'],
      ['everyday:', 'kept'],
      ['saving_bucket:pot1', 'kept'],
    ]);
    await wrap();
    expect(screen.getByText('Done')).toBeTruthy();
    await fireEvent.press(screen.getByText('Done'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('Done for now goes back too', async () => {
    await wrap();
    await fireEvent.press(screen.getByText('Done for now'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('a button is a radio and choosing passes the matching intent; nothing is chosen on open', async () => {
    await wrap();
    expect(mockChoose).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Use $3200'));
    expect(mockChoose).toHaveBeenCalledWith(cards[0], 'update');
    await fireEvent.press(screen.getByLabelText('Keep $3000'));
    expect(mockChoose).toHaveBeenLastCalledWith(cards[0], 'keep');
    // saving bucket: "Looks right" is the keep, "Change it" the update
    await fireEvent.press(screen.getByLabelText('Change it'));
    expect(mockChoose).toHaveBeenLastCalledWith(cards[2], 'update');
  });

  it('marks the chosen button checked', async () => {
    mockDecided = new Map([['pay:pay1', 'kept']]);
    await wrap();
    expect(screen.getByLabelText('Keep $3000').props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText('Use $3200').props.accessibilityState.checked).toBe(false);
  });

  it('describes each card as one group', async () => {
    await wrap();
    expect(screen.getByLabelText(/^Your pay\. Your pay looks like \$3200\. .*To check\.$/)).toBeTruthy();
  });
});
