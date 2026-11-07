// 06-13 Task 2: the Calculators page and the four typed calculators, rendered with typed numbers only (no records, no network).
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { CalculatorsScreen } from '../typed/CalculatorsScreen';
import { LoanCalculator } from '../typed/LoanCalculator';
import { SavingsCalculator } from '../typed/SavingsCalculator';
import { CompoundCalculator } from '../typed/CompoundCalculator';
import { DebtPayoffCalculator } from '../typed/DebtPayoffCalculator';

jest.setTimeout(60000);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/ui/haptics', () => ({
  hapticSelection: jest.fn(),
  hapticLight: jest.fn(),
  hapticWarning: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticMedium: jest.fn(),
}));
// No records, no account: the calculators read only the home currency and today's date, both from cached preferences.
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ homeCurrency: 'USD', showCents: false, today: '2026-11-06', ready: true }),
}));
jest.mock('@/shell/screen/DetailScreen', () => {
  const R = jest.requireActual('react');
  return { DetailScreen: ({ children }: { children?: React.ReactNode }) => R.createElement(R.Fragment, null, children) };
});

const o = { includeHiddenElements: true };

async function wrap(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } }}>
      <ThemeProvider>
        <FontScaleProvider value={1}>{ui}</FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

const type = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label, o), text);
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 250)); });

beforeEach(() => mockPush.mockClear());

describe('CalculatorsScreen (GC01)', () => {
  it('lists the four calculators and opens each route', async () => {
    await wrap(<CalculatorsScreen />);
    expect(screen.getByText(/nothing you type here is saved/, o)).toBeTruthy();
    expect(screen.queryByText('With your records', o)).toBeNull();
    await fireEvent.press(screen.getByText('Loan calculator', o));
    await fireEvent.press(screen.getByText('Savings calculator', o));
    await fireEvent.press(screen.getByText('Compound growth', o));
    await fireEvent.press(screen.getByText('Debt payoff', o));
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual([
      '/grow/calculators/loan',
      '/grow/calculators/savings',
      '/grow/calculators/growth',
      '/grow/calculators/payoff',
    ]);
    expect(screen.getByText(/not offers, quotes or forecasts/, o)).toBeTruthy();
  });

  it('draws With your records only when it is given links', async () => {
    const onPress = jest.fn();
    await wrap(<CalculatorsScreen recordLinks={[{ key: 'g', glyph: 'calendar', label: 'Trip to Lisbon', sublabel: 'half way', onPress }]} />);
    expect(screen.getByText('With your records', o)).toBeTruthy();
    await fireEvent.press(screen.getByText('Trip to Lisbon', o));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('LoanCalculator (GC10)', () => {
  it('shows $400.76 a month for 20000 / 7.5 / 60 after the debounce, and nothing when a field is cleared', async () => {
    await wrap(<LoanCalculator />);
    expect(screen.getByText('Fill in the numbers above', o)).toBeTruthy();
    await type('Amount borrowed', '20000');
    await type('Rate a year (APR)', '7.5');
    await type('Length', '60');
    expect(screen.queryByText('$400.76', o)).toBeNull();
    await settle();
    await waitFor(() => expect(screen.getByText('$400.76', o)).toBeTruthy());
    expect(screen.getByText('$4,045.51', o)).toBeTruthy();
    expect(screen.getByText('$24,045.51', o)).toBeTruthy();
    expect(screen.getByText('$400.67', o)).toBeTruthy();
    expect(screen.getByText('How it was worked out', o)).toBeTruthy();
    await type('Length', '');
    await settle();
    await waitFor(() => expect(screen.getByText('Fill in the numbers above', o)).toBeTruthy());
    expect(screen.queryByText('How it was worked out', o)).toBeNull();
  });
});

describe('SavingsCalculator (GC20)', () => {
  it('reaches $5,000 in 18 months, May 2028, at 3%', async () => {
    await wrap(<SavingsCalculator />);
    await type('Target', '5000');
    await type('Saved so far', '500');
    await type('Each month', '250');
    await type('Interest a year', '3');
    await settle();
    await waitFor(() => expect(screen.getByText('18 months', o)).toBeTruthy());
    expect(screen.getByText(/by May 2028, with the first \$250\.00 next month \(Dec 2026\)/, o)).toBeTruthy();
    expect(screen.getByText('$5,119.90', o)).toBeTruthy();
    expect(screen.getByText('$119.90', o)).toBeTruthy();
  });
});

describe('CompoundCalculator (GC30)', () => {
  it('always shows the illustration badge, and a chart that names the end figure and the amount put in', async () => {
    await wrap(<CompoundCalculator />);
    expect(screen.getByText('Illustration, not a forecast', o)).toBeTruthy();
    await type('Start with', '0');
    await type('Add each month', '200');
    await type('Rate a year', '4');
    await settle();
    await waitFor(() => expect(screen.getByText('$29,449.98', o)).toBeTruthy());
    expect(screen.getByText('Illustration, not a forecast', o)).toBeTruthy();
    const chart = screen.getByTestId('bar-chart', o);
    expect(chart.props.accessibilityLabel).toContain('$29,449.98');
    expect(chart.props.accessibilityLabel).toContain('$24,000.00');
    expect(screen.getByText('$5,449.98', o)).toBeTruthy();
  });

  it('opens prefilled from route params, shows a result without typing, and stays editable', async () => {
    await wrap(<CompoundCalculator start="769000" rate="4" monthly="0" />);
    expect(screen.getByLabelText('Start with', o).props.value).toBe('7690.00');
    expect(screen.getByLabelText('Rate a year', o).props.value).toBe('4');
    expect(screen.getByLabelText('Add each month', o).props.value).toBe('0.00');
    const before = screen.getByTestId('calc-result-value', o).props.children;
    expect(before).toMatch(/^\$/);
    await type('Rate a year', '6');
    await settle();
    await waitFor(() => expect(screen.getByTestId('calc-result-value', o).props.children).not.toBe(before));
  });

  it('ignores a bad param and starts that field empty', async () => {
    await wrap(<CompoundCalculator start="abc" rate="4%" monthly="20000" />);
    expect(screen.getByLabelText('Start with', o).props.value).toBe('');
    expect(screen.getByLabelText('Rate a year', o).props.value).toBe('');
    expect(screen.getByLabelText('Add each month', o).props.value).toBe('200.00');
    expect(screen.getByText('Fill in the numbers above', o)).toBeTruthy();
  });
});

describe('DebtPayoffCalculator (GC40)', () => {
  async function fillTwoDebts() {
    await type('Debt 1, Owed', '4200');
    await type('Debt 1, Rate', '21.9');
    await type('Debt 1, Minimum', '120');
    await type('Debt 2, Owed', '1500');
    await type('Debt 2, Rate', '9.5');
    await type('Debt 2, Minimum', '75');
    await type('Extra each month', '100');
  }

  it('shows both orders with equal weight, plus minimums only', async () => {
    await wrap(<DebtPayoffCalculator />);
    expect(screen.getByText('Fill in the numbers above', o)).toBeTruthy();
    await fillTwoDebts();
    await settle();
    await waitFor(() => expect(screen.getByTestId('order-rate', o)).toBeTruthy());
    expect(screen.getByText('Highest rate first', o)).toBeTruthy();
    expect(screen.getByText('Smallest balance first', o)).toBeTruthy();
    expect(screen.getByText('$1,148.68', o)).toBeTruthy();
    expect(screen.getByText('$1,280.30', o)).toBeTruthy();
    expect(screen.getByText('$2,184.34', o)).toBeTruthy();
    expect(screen.getByText('Minimums only, no extra', o)).toBeTruthy();
    expect(screen.getByText('The choice is yours.', o)).toBeTruthy();
    // Equal weight: the two cards carry the same style.
    expect(screen.getByTestId('order-rate', o).props.style).toEqual(screen.getByTestId('order-balance', o).props.style);
    expect(screen.queryByText('With one debt, both orders are the same.', o)).toBeNull();
  });

  it('with one debt says both orders are the same, and a debt can be added back', async () => {
    await wrap(<DebtPayoffCalculator />);
    await fillTwoDebts();
    await fireEvent.press(screen.getByLabelText('Remove this debt, Debt 2', o));
    await settle();
    await waitFor(() => expect(screen.getByText('With one debt, both orders are the same.', o)).toBeTruthy());
    await fireEvent.press(screen.getByText('+ Add another debt', o));
    expect(screen.getByTestId('debt-2', o)).toBeTruthy();
  });
});

describe('never saved', () => {
  it('has no write path: the calculators import no mutation, storage or cache writes', () => {
    const fs = jest.requireActual('fs') as typeof import('fs');
    const path = jest.requireActual('path') as typeof import('path');
    const dir = path.join(__dirname, '..', 'typed');
    for (const file of fs.readdirSync(dir)) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(text).not.toMatch(/useMutation|AsyncStorage|setQueryData/);
    }
  });
});
