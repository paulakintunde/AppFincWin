// 08.1-23 (Q7, 22 Q14): "Your spare money" asks a person with a joint account to type only their own accounts' money, since joint
// money is counted separately. Nobody else sees the line.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { SpareMoneySheet } from '../SpareMoneySheet';

jest.setTimeout(30000);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const show = (hasJointAccount: boolean | undefined, figure: number | null = 50_000) =>
  render(
    <ThemeProvider>
      <SpareMoneySheet visible figure={figure} currency="USD" formatMoney={(m) => `$${m / 100}`} onConfirm={jest.fn()} onDismiss={jest.fn()} hasJointAccount={hasJointAccount} />
    </ThemeProvider>,
  );

const LINE = 'Count only your own accounts. Joint accounts are counted separately.';

describe('SpareMoneySheet joint-account line', () => {
  it('shows under the own-figure field when the person has a joint account', async () => {
    await show(true);
    expect(screen.queryByText(LINE)).toBeNull(); // the field is not open yet
    await fireEvent.press(screen.getByText('Use my own figure'));
    expect(screen.getByLabelText('Your spare money now')).toBeTruthy();
    expect(screen.getByTestId('spare-joint-note').props.children).toBe(LINE);
  });

  it('shows straight away when there is no app figure and the field is open', async () => {
    await show(true, null);
    expect(screen.getByText(LINE)).toBeTruthy();
  });

  it('is not there without a joint account', async () => {
    await show(false, null);
    expect(screen.queryByText(LINE)).toBeNull();
    await show(undefined, null);
    expect(screen.queryByText(LINE)).toBeNull();
  });
});
