import React from 'react';
import { Text } from 'react-native';
import { screen } from '@testing-library/react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { useBackHistory } from '@/shell/backHistory/BackHistoryProvider';
import { useShellLayout } from '@/shell/layout/ShellLayoutProvider';
import { mockBackHistory, renderWithShellProviders } from './testUtils';

function Probe(): React.JSX.Element {
  useTheme();
  const { canGoBack } = useBackHistory();
  const { tabBarHeight } = useShellLayout();
  return <Text>{`ok ${String(canGoBack)} ${tabBarHeight}`}</Text>;
}

describe('shell test harness', () => {
  it('provides theme, back history and layout', async () => {
    await renderWithShellProviders(<Probe />, { backHistory: { canGoBack: true } });
    expect(screen.getByText('ok true 0')).toBeTruthy();
  });

  it('mockBackHistory applies overrides', () => {
    expect(mockBackHistory({ canGoBack: true }).canGoBack).toBe(true);
    expect(mockBackHistory().canGoBack).toBe(false);
  });
});
