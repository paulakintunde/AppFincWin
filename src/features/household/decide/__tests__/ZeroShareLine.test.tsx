// 08.1-25 (CMP-F19, owner one-earner fix 2026-11-21, Q2 A, Q4 A): the line on a member's own answer when their share of the joint
// money is $0 because of the rule. Navigation and haptics are mocked; AsyncStorage is the jest mock from jest.setup.ts.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { Caveat } from '@/engine/decide/v3';
import { ZeroShareLine, loadZeroShareNotNow, zeroShareNotNowKey } from '../ZeroShareLine';

jest.setTimeout(30000);
jest.mock('@/services/locale/deviceLocale', () => ({ useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC' }) }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticTick: jest.fn(), hapticFailed: jest.fn(), hapticWarn: jest.fn() }));
const mockPush = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));

// The suggestion target is one constant; a test-only target swaps the words and the action with no other edit.
let mockTarget = 'equalShares';
jest.mock('../../rules/zeroShareSuggestion', () => {
  const actual = jest.requireActual('../../rules/zeroShareSuggestion');
  const registry = {
    ...actual.SUGGESTIONS,
    testOnly: {
      ...actual.SUGGESTIONS.equalShares,
      lineKey: 'household.rules.spending.bring.helper',
      actionKey: 'household.rules.spending.update',
      route: { pathname: '/household/spending', params: { suggest: 'testOnly' } },
    },
  };
  return { ...actual, currentSuggestion: () => actual.suggestionFor(mockTarget, registry) };
});

const LINE_BRING = 'Under “What each person brings,” your share of joint money is $0 this month. With equal shares, everyone counts the same amount.';
const zero = (rule: string): Caveat => ({ code: 'share_zero_by_rule', values: { rule } });

async function show(props: Partial<React.ComponentProps<typeof ZeroShareLine>> = {}) {
  await render(
    <ThemeProvider>
      <ZeroShareLine householdId="h" caveat={zero('bring')} currency="USD" today="2026-11-21" {...props} />
    </ThemeProvider>,
  );
}

beforeEach(async () => {
  mockTarget = 'equalShares';
  mockPush.mockClear();
  await AsyncStorage.clear();
});

describe('ZeroShareLine', () => {
  it('shows the rule-named line with See equal shares, which opens the editor route with suggest=equalShares', async () => {
    await show();
    expect(await screen.findByText(LINE_BRING)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('See equal shares'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/household/spending', params: { suggest: 'equalShares' } });
  });

  it('names the bill split rule, and the currency’s own zero', async () => {
    await show({ caveat: zero('bill'), currency: 'GBP' });
    expect(await screen.findByText('Under “Same as the bill split,” your share of joint money is £0 this month. With equal shares, everyone counts the same amount.')).toBeTruthy();
  });

  it('shows nothing without the caveat, without a household, or for a rule it cannot name', async () => {
    await show({ caveat: undefined });
    expect(screen.queryByTestId('zero-share-line')).toBeNull();
    await screen.unmount();
    await show({ householdId: null });
    expect(screen.queryByTestId('zero-share-line')).toBeNull();
    await screen.unmount();
    await show({ caveat: zero('custom') });
    await waitFor(() => expect(screen.queryByTestId('zero-share-line')).toBeNull());
  });

  it('Not now hides it on this phone until next month (Q4 A)', async () => {
    await show();
    await fireEvent.press(await screen.findByLabelText('Not now'));
    await waitFor(() => expect(screen.queryByTestId('zero-share-line')).toBeNull());
    await waitFor(async () => expect(await loadZeroShareNotNow('h')).toBe('2026-11'));
    expect(await AsyncStorage.getItem(zeroShareNotNowKey('h'))).toBe('2026-11');
    expect(zeroShareNotNowKey('h').startsWith('fincwin:')).toBe(true); // wiped on sign-out and account deletion
    await screen.unmount();
    // the same month: still hidden; another household: shown
    await show();
    await waitFor(() => expect(screen.queryByTestId('zero-share-line')).toBeNull());
    await screen.unmount();
    await show({ householdId: 'other' });
    expect(await screen.findByTestId('zero-share-line')).toBeTruthy();
    await screen.unmount();
    // next month, if it is still true, it shows again
    await show({ today: '2026-12-01' });
    expect(await screen.findByText(LINE_BRING)).toBeTruthy();
  });

  it('the buttons are buttons with plain labels (Pill keeps the 44 pt touch minimum, space.touchMin)', async () => {
    await show();
    for (const name of ['See equal shares', 'Not now']) {
      const b = await screen.findByLabelText(name);
      expect(b.props.accessibilityRole).toBe('button');
    }
  });

  it('a test-only target swaps the words and the action with no other edit', async () => {
    mockTarget = 'testOnly';
    await show();
    expect(await screen.findByText('Each person’s checks count their own money plus their share of any joint account, never someone else’s personal money.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Update shares'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/household/spending', params: { suggest: 'testOnly' } });
  });
});
