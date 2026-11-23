/* eslint-disable i18next/no-literal-string -- test doubles render fixed words */
// 10-27 (UI-SPEC section 2): the phone lock first, the signed-in devices below it, the app-switcher line once, last.
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { SecurityScreen } from '../SecurityScreen';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn() }) }));
const mockLockProps = jest.fn();
jest.mock('../LockSection', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: T } = require('react-native');
  return {
    LockSection: (p: unknown) => {
      mockLockProps(p);
      return <T>LOCK</T>;
    },
    SwitcherMetaLine: () => <T>META</T>,
  };
});
jest.mock('../DevicesSection', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: T } = require('react-native');
  return { DevicesSection: () => <T>DEVICES</T> };
});

describe('SecurityScreen', () => {
  it('orders the title, lock, devices, then the switcher line, which the lock group does not repeat', async () => {
    const r = await render(
      <ThemeProvider>
        <SecurityScreen />
      </ThemeProvider>
    );
    expect(r.getByText('Security')).toBeTruthy();
    const order = ['Security', 'LOCK', 'DEVICES', 'META'].map((w) => JSON.stringify(r.toJSON()).indexOf(`"${w}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(mockLockProps).toHaveBeenCalledWith(expect.objectContaining({ showSwitcherMeta: false }));
  });
});
