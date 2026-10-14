// Shared harness for shell component tests: safe area, theme, query client, a controllable back
// history and the layout provider. Lives under __tests__, so it is excluded from coverage and from
// the DSG-07 import rule.
import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { resetSheetStackForTests } from '@/state/sheetStack';
import { resetToastForTests } from '@/state/undoToast';
import {
  BackHistoryContext,
  type BackHistoryContextValue,
} from '@/shell/backHistory/BackHistoryProvider';
import { ShellLayoutProvider } from '@/shell/layout/ShellLayoutProvider';

export interface ShellTestOptions {
  backHistory?: Partial<BackHistoryContextValue>;
}

export function mockBackHistory(
  overrides?: Partial<BackHistoryContextValue>,
): BackHistoryContextValue {
  return {
    history: [],
    current: { area: 'tab', tab: 'home', href: '/home' },
    canGoBack: false,
    goBack: jest.fn(() => true),
    registerTabSwitcher: jest.fn(),
    ...overrides,
  };
}

/** Call from beforeEach so module stores never leak between tests. */
export function resetShellStores(): void {
  resetSheetStackForTests();
  resetToastForTests();
}

const INITIAL_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, bottom: 34, left: 0, right: 0 },
};

export function ShellTestProviders({
  children,
  options,
}: {
  children: React.ReactNode;
  options?: ShellTestOptions;
}): React.JSX.Element {
  const [client] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  const [backHistory] = React.useState(() => mockBackHistory(options?.backHistory));
  return (
    <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <BackHistoryContext.Provider value={backHistory}>
            <ShellLayoutProvider>{children}</ShellLayoutProvider>
          </BackHistoryContext.Provider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export function renderWithShellProviders(
  ui: React.ReactElement,
  options?: ShellTestOptions,
): ReturnType<typeof render> {
  return render(<ShellTestProviders options={options}>{ui}</ShellTestProviders>);
}
