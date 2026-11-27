// 10-review (L-4): the current-PIN sheet runs one check at a time; the pad is off until the check answers.
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import * as lockStore from '@/services/lock/lockStore';
import { PinCheckSheet } from '../PinCheckSheet';

jest.setTimeout(30000);

jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn(), hapticWarn: jest.fn(), hapticTick: jest.fn() }));
jest.mock('@/ui/Sheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View: V } = require('react-native');
  return { Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <V>{children}</V> : null) };
});
jest.mock('@/services/lock/lockStore', () => ({
  ...jest.requireActual('@/services/lock/lockStore'),
  checkPin: jest.fn(),
}));

const checkPin = lockStore.checkPin as jest.Mock;

function disabled(el: { props: Record<string, unknown> }): boolean {
  const state = el.props.accessibilityState as { disabled?: boolean } | undefined;
  return Boolean(state?.disabled ?? el.props['aria-disabled']);
}

describe('PinCheckSheet (L-4)', () => {
  it('turns the pad off while a check runs and starts no second check', async () => {
    let answer: (v: unknown) => void = () => undefined;
    checkPin.mockImplementation(() => new Promise((res) => (answer = res)));
    const onVerified = jest.fn();
    const r = await render(
      <ThemeProvider>
        <PinCheckSheet visible onClose={jest.fn()} onVerified={onVerified} />
      </ThemeProvider>
    );
    await waitFor(() => expect(r.getByTestId('pin-pad')).toBeTruthy());
    for (const d of '123456') await fireEvent.press(r.getByTestId(`pin-key-${d}`));
    expect(disabled(r.getByTestId('pin-key-1'))).toBe(true);
    await fireEvent.press(r.getByTestId('pin-key-backspace'));
    await fireEvent.press(r.getByTestId('pin-key-1'));
    expect(checkPin).toHaveBeenCalledTimes(1);
    await act(async () => answer({ ok: true }));
    expect(onVerified).toHaveBeenCalledTimes(1);
    expect(disabled(r.getByTestId('pin-key-1'))).toBe(false);
  });
});
