/** 05-14 test helper: StepProps over a real computeCheck result (fixtures from 05-06/07), with plain fake formatters. */
import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { computeCheck } from '../../../../snapshot/computeCheck';
import { emptyCheckInputs } from '../../../../snapshot/checkInputs';
import type { CheckInputs, SnapshotResult } from '../../../../snapshot/types';
import { EMPTY_STACK } from '../../../../snapshot/types';
import { TODAY, loggedSource } from '../../../../snapshot/__tests__/helpers/snapshotFixtures';
import type { StepProps } from '../../../stepTypes';

export { TODAY };

export const whole: MoneyFormatter = {
  formatMoney: (m) => `$${Math.round(Number(m.amount) / 100)}`,
  formatMoneyA11y: (m) => `${Math.round(Number(m.amount) / 100)} dollars`,
  formatDate: (d) => `on ${d}`,
  locale: 'en-US',
};
export const exact: MoneyFormatter = {
  formatMoney: (m) => `$${(Number(m.amount) / 100).toFixed(2)}`,
  formatMoneyA11y: (m) => `${(Number(m.amount) / 100).toFixed(2)} dollars`,
  formatDate: (d) => `on ${d}`,
  locale: 'en-US',
};

export function buy(over: Partial<CheckInputs> = {}): CheckInputs {
  return { ...emptyCheckInputs('buy', TODAY), name: 'Laptop', advertised: 150_000, method: 'cash', ...over };
}

export function stepProps(inputs: CheckInputs, over: Partial<StepProps> = {}, source: SnapshotResult = loggedSource()): StepProps {
  return {
    inputs,
    update: jest.fn(),
    computation: computeCheck(source, inputs),
    source,
    goToStep: jest.fn(),
    whole,
    exact,
    today: TODAY,
    readOnly: false,
    stack: EMPTY_STACK,
    ...over,
  };
}

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

function providersAt(scale: number) {
  return function Providers({ children }: { children: React.ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <FontScaleProvider value={scale}>{children}</FontScaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  };
}

/** Renders inside the providers as a `wrapper`, so `rerender(ui)` keeps them mounted. */
export function wrap(ui: React.ReactElement, scale = 1) {
  return render(ui, { wrapper: providersAt(scale) });
}
