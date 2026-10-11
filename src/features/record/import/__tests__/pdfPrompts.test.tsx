import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ReadingProgress } from '../ReadingProgress';
import { PasswordPromptSheet } from '../PasswordPromptSheet';
import { ClosingBalancePrompt } from '../ClosingBalancePrompt';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-GB', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ ready: true, userId: 'u1', householdId: 'h1', homeCurrency: 'GBP', showCents: true, region: 'GB', timeZone: 'UTC', today: '2026-10-06' }),
}));

jest.setTimeout(30000);

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('ReadingProgress', () => {
  it('announces politely with a labelled indicator and the helper for pdf', async () => {
    await wrap(<ReadingProgress format="pdf" />);
    expect(screen.getByText('Reading your statement…')).toBeTruthy();
    expect(screen.getByLabelText('Reading statement')).toBeTruthy();
    expect(screen.getByText('This can take up to 10 seconds.')).toBeTruthy();
    let node = screen.getByText('Reading your statement…') as unknown as { props: Record<string, unknown>; parent: unknown } | null;
    let live: unknown;
    while (node && live === undefined) {
      live = node.props.accessibilityLiveRegion;
      node = node.parent as typeof node;
    }
    expect(live).toBe('polite');
  });
  it('omits the helper for csv', async () => {
    await wrap(<ReadingProgress format="csv" />);
    expect(screen.queryByText('This can take up to 10 seconds.')).toBeNull();
  });
});

describe('PasswordPromptSheet', () => {
  it('has a secure labelled field; Unlock is disabled until typed, then passes the value', async () => {
    const onUnlock = jest.fn();
    await wrap(<PasswordPromptSheet visible wrong={false} onUnlock={onUnlock} onCancel={jest.fn()} />);
    const field = screen.getByLabelText('Password');
    expect(field.props.secureTextEntry).toBe(true);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    await fireEvent.changeText(field, 'hunter2');
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock' }));
    expect(onUnlock).toHaveBeenCalledWith('hunter2');
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });
  it('shows the wrong-password line politely and Cancel calls onCancel', async () => {
    const onCancel = jest.fn();
    await wrap(<PasswordPromptSheet visible wrong onUnlock={jest.fn()} onCancel={onCancel} />);
    const line = screen.getByText('That password didn’t open the file. Try again.');
    expect(line.parent?.props.accessibilityLiveRegion).toBe('polite');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('ClosingBalancePrompt', () => {
  it('checks the typed text and skips', async () => {
    const onCheck = jest.fn(() => ({ ok: true as const }));
    const onSkip = jest.fn();
    await wrap(<ClosingBalancePrompt currency="GBP" onCheck={onCheck} onSkip={onSkip} />);
    const field = screen.getByLabelText('Closing balance');
    expect(field.props.keyboardType).toBe('decimal-pad');
    await fireEvent.changeText(field, '123.45');
    await fireEvent.press(screen.getByRole('button', { name: 'Check balance' }));
    expect(onCheck).toHaveBeenCalledWith('123.45');
    await fireEvent.press(screen.getByRole('button', { name: 'Skip' }));
    expect(onSkip).toHaveBeenCalled();
  });
  it('shows the parser error text when the check fails', async () => {
    const onCheck = jest.fn(() => ({ ok: false as const, error: 'empty' as const, maxDecimals: 2 }));
    await wrap(<ClosingBalancePrompt currency="GBP" onCheck={onCheck} onSkip={jest.fn()} />);
    await fireEvent.changeText(screen.getByLabelText('Closing balance'), 'abc');
    await fireEvent.press(screen.getByRole('button', { name: 'Check balance' }));
    expect(screen.queryByText(/amount/i)).toBeTruthy();
  });
});
