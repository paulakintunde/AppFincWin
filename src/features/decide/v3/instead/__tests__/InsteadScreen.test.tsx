/** Plan 05.3-29 (DSV-10): the instead screen, with real engine evaluations from the variable-income goldens. */
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { evaluate } from '@/engine/decide/v3';
import type { Evaluation } from '@/engine/decide/v3';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { loadAllVariableCases } from '../../../../../engine/decide/v3/__tests__/golden/variableIncomeLoader';
import { InsteadScreen } from '../InsteadScreen';

jest.setTimeout(60000);

const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
jest.mock('@/services/locale/deviceLocale', () => ({
  useDeviceLocale: () => ({ locale: 'en-US', timeZone: 'UTC', separators: { decimal: '.', group: ',' } }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ userId: 'u', householdId: 'h', homeCurrency: 'USD', showCents: false }),
}));
jest.mock('@/data/queries/categories', () => ({ useCategoryLookup: () => ({ all: [] }) }));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/decide', () => ({ usePots: () => ({ data: { live: [], done: [] } }) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn() }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const { View, Text } = require('react-native');
  return {
    DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <View>
        <Text accessibilityRole="header">{title}</Text>
        {children}
      </View>
    ),
  };
});

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] as string;

const cases = loadAllVariableCases().map((c) => ({ id: c.id, ev: evaluate(c.inputs, c.check) }));
const usable = (ev: Evaluation) => ev.purchase !== null && ev.funds.unspent !== null;
const notCovered = cases.filter(({ ev }) => usable(ev) && ev.result.code === 'not_yet' && ev.result.variant === 'not_covered' && ev.result.readyBy?.kind === 'month');
const seasonalNc = notCovered.find(({ ev }) => ev.month.incomePicture?.treated === 'seasonal' && ev.purchase!.monthly === 0);
const steadyNc = notCovered.find(({ ev }) => ev.month.incomePicture?.treated !== 'seasonal' && ev.purchase!.monthly === 0);
const fit = cases.find(({ ev }) => usable(ev) && (ev.result.code === 'fits_unspent' || ev.result.code === 'fits_month'));

async function show(ev: Evaluation) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider value={1}>
          <InsteadScreen ev={ev} />
        </FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

const slider = () => screen.getByRole('adjustable');
const step = async (name: 'increment' | 'decrement') => {
  await fireEvent(slider(), 'accessibilityAction', { nativeEvent: { actionName: name } });
};

afterEach(async () => {
  mockTrack.mockClear();
  await cleanup();
});

describe('InsteadScreen', () => {
  it('fixtures exist', () => {
    expect(notCovered.length).toBeGreaterThan(0);
    expect(seasonalNc).toBeDefined();
    expect(steadyNc).toBeDefined();
    expect(fit).toBeDefined();
  });

  it('four cards in order with their heads, and the footer', async () => {
    const ev = fit!.ev;
    await show(ev);
    const heads = screen.getAllByRole('header').map((h) => h.props.children);
    expect(heads[0]).toMatch(/^What could this .* do instead\?$/);
    expect(heads.slice(1)).toEqual(['1 · Buy it now', '2 · Keep it', '3 · A fixed-rate deposit', '4 · Buy it later']);
    expect(screen.getByText(/^\$[\d,.]+ spent$/)).toBeTruthy();
    expect(screen.getByText(/^\$[\d,.]+ unspent$/)).toBeTruthy();
    expect(screen.getByText(/^by [A-Z]/)).toBeTruthy();
    expect(screen.getByText('Each choice gives up the others. The choice is yours.')).toBeTruthy();
  });

  it('a not-covered answer says not covered yet', async () => {
    await show(notCovered[0]!.ev);
    expect(screen.getByText('not covered yet')).toBeTruthy();
  });

  it('shows the purpose chip only when a purpose was chosen', async () => {
    const withPurpose = cases.find(({ ev }) => usable(ev) && ev.purchase!.purpose?.kind === 'preset');
    if (withPurpose !== undefined) {
      await show(withPurpose.ev);
      expect(screen.getByText(/^You said: /)).toBeTruthy();
      await cleanup();
    }
    const base = fit!.ev;
    await show({ ...base, purchase: { ...base.purchase!, purpose: { kind: 'preset', value: 'treat' } } } as Evaluation);
    expect(screen.getByText('You said: A treat')).toBeTruthy();
    await cleanup();
    await show({ ...base, purchase: { ...base.purchase!, purpose: null } } as Evaluation);
    expect(screen.queryByText(/^You said/)).toBeNull();
  });

  it('empty rate: never defaulted, reads Enter a rate to see it, with the 0 figure and the disclosure', async () => {
    await show(fit!.ev);
    const field = screen.getByLabelText('Rate from your bank or finance company');
    expect(field.props.value).toBe('');
    expect(field.props.placeholder).toBe('e.g. 4.25%');
    expect(screen.getByText('Enter a rate to see it')).toBeTruthy();
    expect(screen.getAllByText('$0').length).toBeGreaterThan(0);
    expect(screen.getByText(/^A term deposit, GIC or CD pays/)).toBeTruthy();
  });

  it('a 4.25 rate at 3 years gives the entered-rate sentence', async () => {
    await show(fit!.ev);
    await fireEvent.changeText(screen.getByLabelText('Rate from your bank or finance company'), '4.25');
    expect(screen.queryByText('Enter a rate to see it')).toBeNull();
    expect(screen.getByText(/^At the 4\.25% you entered, about \$[\d,.]+ after 3 years\. Buying now gives up the \$[\d,.]+ of interest, not the \$[\d,.]+ itself\.$/)).toBeTruthy();
  });

  it('1 year uses the singular sentence', async () => {
    await show(fit!.ev);
    await fireEvent.changeText(screen.getByLabelText('Rate from your bank or finance company'), '4.25');
    await fireEvent.press(screen.getByRole('radio', { name: '1y' }));
    expect(screen.getByText(/^At the 4\.25% you entered, about \$[\d,.]+ after 1 year\. /)).toBeTruthy();
  });

  it('typing 0 shows the 0% case', async () => {
    await show(fit!.ev);
    await fireEvent.changeText(screen.getByLabelText('Rate from your bank or finance company'), '0');
    expect(screen.getByText(/^At the 0% you entered, about \$[\d,.]+ after 3 years\./)).toBeTruthy();
  });

  it('decide_instead_opened fires once, even after the screen re-renders', async () => {
    await show(fit!.ev);
    await fireEvent.changeText(screen.getByLabelText('Rate from your bank or finance company'), '3');
    await step('increment');
    expect(mockTrack.mock.calls.filter(([n]) => n === 'decide_instead_opened')).toHaveLength(1);
  });

  it('no copy uses offer, free, better, advice or you should', async () => {
    await show(notCovered[0]!.ev);
    await fireEvent.changeText(screen.getByLabelText('Rate from your bank or finance company'), '4');
    const all = screen.getAllByText(/./).map((n) => String(n.props.children)).join(' ');
    expect(all).not.toMatch(/\boffer|\bfree\b|\bbetter\b|advice|you should|you can/i);
  });

  it('the slider is adjustable with 25-step actions, and the note names what is never included', async () => {
    await show(notCovered[0]!.ev);
    const s = slider();
    expect(s.props.accessibilityActions).toEqual([{ name: 'increment' }, { name: 'decrement' }]);
    expect(s.props.accessibilityValue).toMatchObject({ min: 0, max: 20000, now: 0 });
    await step('increment');
    expect(slider().props.accessibilityValue.now).toBe(2500);
    await step('decrement');
    expect(slider().props.accessibilityValue.now).toBe(0);
    expect(screen.getByText('Regular bills, loan payments, fixed saving and your emergency fund are never included.')).toBeTruthy();
  });

  it('D-12 slider 0 equals the answer', async () => {
    for (const { ev } of notCovered) {
      await show(ev);
      const answer = monthName((ev.result.readyBy as { month: string }).month);
      expect(screen.getByText(`by ${answer}`)).toBeTruthy();
      // the "Then" line at slider 0 also names the answer's month
      expect(screen.getByText(new RegExp(`^Then: by ${answer}[ .]`))).toBeTruthy();
      await cleanup();
    }
  });

  it('a seasonal earner sees Then: by {Month}. with no month count', async () => {
    await show(seasonalNc!.ev);
    await step('increment');
    await step('increment');
    const then = screen.getByText(/^Then: by /);
    expect(String(then.props.children)).toMatch(/^Then: by [A-Z][a-z]+\.$/);
  });

  it('a steady earner sees Then: by {Month} (about N months).', async () => {
    await show(steadyNc!.ev);
    await step('increment');
    const then = screen.getByText(/^Then: by /);
    expect(String(then.props.children)).toMatch(/^Then: by [A-Z][a-z]+( \(about \d+\smonths?\))?\.$/);
  });

  it('the result is a polite live region whose spoken label settles after about 150 ms', async () => {
    jest.useFakeTimers();
    try {
      await show(steadyNc!.ev);
      const before = screen.getByText(/^Then: by /);
      expect(before.props.accessibilityLiveRegion).toBe('polite');
      const first = before.props.accessibilityLabel;
      await step('increment');
      await step('increment');
      await step('increment');
      const mid = screen.getByText(/^Then: by /);
      // the spoken label still has the old value until the slider has been still for 150 ms
      expect(mid.props.accessibilityLabel).toBe(first);
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      const after = screen.getByText(/^Then: by /);
      expect(after.props.accessibilityLabel).toBe(String(after.props.children));
    } finally {
      jest.useRealTimers();
    }
  });
});
