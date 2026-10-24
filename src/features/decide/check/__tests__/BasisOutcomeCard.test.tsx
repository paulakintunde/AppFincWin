import React from 'react';
import { screen } from '@testing-library/react-native';
import { BasisOutcomeCard } from '../BasisOutcomeCard';
import { wrap, whole } from '../steps/__tests__/helpers/stepProps';
import { moneyA11yFn, moneyFn } from '../steps/stepUi';
import type { BasisOutcome, BasisOutcomes } from '../../snapshot/types';
import { colors } from '@/theme/tokens';

jest.setTimeout(30000);

let mockWidth = 402;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 800, scale: 2, fontScale: 1 }),
}));

const fmt = moneyFn(whole, 'USD' as never);
const fmtA11y = moneyA11yFn(whole, 'USD' as never);

const row = (basis: BasisOutcome['basis'], state: BasisOutcome['state'], left: number, chosen = false, waiting: string[] | null = null): BasisOutcome =>
  ({ basis, state, left: left as never, chosen, waitingCurrencies: waiting });
const outcomes = (over: Partial<Record<BasisOutcome['basis'], BasisOutcome>> = {}): BasisOutcomes => ({
  rows: [
    over.month ?? row('month', 'fits', 12_000, true),
    over.worst ?? row('worst', 'adjust', 3_000),
    over.average ?? row('average', 'no', -4_500),
  ],
});

type P = Partial<React.ComponentProps<typeof BasisOutcomeCard>>;
const ui = (p: P = {}): React.JSX.Element => (
  <BasisOutcomeCard outcomes={outcomes()} checkKey="k1" fmt={fmt} fmtA11y={fmtA11y} busy={false} {...p} />
);

beforeEach(() => {
  mockWidth = 402;
});

describe('BasisOutcomeCard', () => {
  it('D-107 the card shows This month, Worst and Average side by side with chips and free / overspent figures', async () => {
    await wrap(ui());
    expect(screen.getByText('The outcome on each basis')).toBeTruthy();
    for (const w of ['This month', 'Worst month', 'Average month', 'It fits', 'Needs adjustment', 'Doesn’t fit right now', '$120 free', '$30 free', '$45 overspent']) {
      expect(screen.getByText(w)).toBeTruthy();
    }
    const month = screen.getByTestId('basis-outcome-month');
    const worst = screen.getByTestId('basis-outcome-worst');
    expect(StyleFlat(month).flex).toBe(1);
    expect(StyleFlat(worst).flex).toBe(1);
  });

  it('D-107 the chosen basis is marked and announced', async () => {
    await wrap(ui());
    const month = screen.getByTestId('basis-outcome-month');
    expect(month.props.accessibilityState).toEqual({ selected: true });
    expect(month.props.accessibilityLabel).toBe('This month: It fits, 120 dollars free. Used for this check.');
    expect(screen.getAllByText('Used for this check')).toHaveLength(1);
    expect(screen.getByTestId('basis-outcome-worst').props.accessibilityState).toBeUndefined();
  });

  it('D-107 an overspent figure has no minus and the danger tone', async () => {
    await wrap(ui());
    const node = screen.getByText('$45 overspent');
    expect(screen.queryByText(/-\$45|−/)).toBeNull();
    const style = StyleFlat(node);
    expect(style.color).toBe(colors.danger);
  });

  it('D-107 a fallback row shows the waiting line and the worst result', async () => {
    await wrap(ui({ outcomes: outcomes({ month: row('month', 'adjust', 3_000, true, ['EUR', 'GBP']) }) }));
    expect(screen.getByText('Waiting for a EUR, GBP rate, shown as the worst month')).toBeTruthy();
    expect(screen.getByTestId('basis-outcome-month').props.accessibilityLabel).toMatch(/Waiting for a EUR, GBP rate/);
    expect(screen.getAllByText('$30 free')).toHaveLength(2);
  });

  it('D-107 the card keeps its last values silently while busy', async () => {
    const { rerender } = await wrap(ui());
    await rerender(ui({ outcomes: null, busy: true }));
    expect(screen.getByText('$120 free')).toBeTruthy();
    expect(screen.getByText('The outcome on each basis')).toBeTruthy();
    expect(screen.queryByText(/Updating/)).toBeNull();
    expect(screen.getByTestId('basis-outcome-rows').props.accessibilityState).toEqual({ busy: true });
  });

  it('D-107 an incomplete check hides the card', async () => {
    const { rerender } = await wrap(ui());
    await rerender(ui({ outcomes: null, busy: false }));
    expect(screen.queryByText('The outcome on each basis')).toBeNull();
    // the held value was cleared: busy again with still nothing shows nothing
    await rerender(ui({ outcomes: null, busy: true }));
    expect(screen.queryByText('The outcome on each basis')).toBeNull();
  });

  it('D-107 held values never carry to another check', async () => {
    const { rerender } = await wrap(ui());
    await rerender(ui({ outcomes: null, busy: true, checkKey: 'k2' }));
    expect(screen.queryByText('The outcome on each basis')).toBeNull();
    expect(screen.queryByText('$120 free')).toBeNull();
  });

  it('D-107 nothing renders before the first settled value', async () => {
    await wrap(ui({ outcomes: null, busy: true }));
    expect(screen.queryByText('The outcome on each basis')).toBeNull();
    expect(screen.queryByTestId('basis-outcome-card')).toBeNull();
  });

  it('D-107 the rows stack at large text and narrow width without clipping', async () => {
    mockWidth = 320;
    await wrap(ui(), 2);
    const month = screen.getByTestId('basis-outcome-month');
    expect(StyleFlat(month).flex).toBeUndefined();
    expect(StyleFlat(month).alignSelf).toBe('stretch');
    for (const n of [screen.getByTestId('basis-outcome-card'), screen.getByTestId('basis-outcome-rows'), ...screen.getAllByTestId(/^basis-outcome-(month|worst|average)$/)]) {
      const s = StyleFlat(n);
      expect(s.height).toBeUndefined();
      expect(s.position).toBeUndefined();
      expect(n.props.numberOfLines).toBeUndefined();
    }
  });

  it('D-107 each row has one a11y label in reading order', async () => {
    await wrap(ui());
    const labelled = screen.getAllByTestId(/^basis-outcome-(month|worst|average)$/);
    expect(labelled.map((n) => n.props.accessibilityLabel)).toEqual([
      'This month: It fits, 120 dollars free. Used for this check.',
      'Worst month: Needs adjustment, 30 dollars free',
      'Average month: Doesn’t fit right now, 45 dollars overspent',
    ]);
  });

  it('D-107 the title is a heading and the card is not one stop', async () => {
    await wrap(ui());
    expect(screen.getByRole('header', { name: 'The outcome on each basis' })).toBeTruthy();
    expect(screen.getByTestId('basis-outcome-card').props.accessible).not.toBe(true);
  });
});

function StyleFlat(node: { props: { style?: unknown } }): Record<string, unknown> {
  const flat = (s: unknown): Record<string, unknown> =>
    Array.isArray(s) ? Object.assign({}, ...s.map(flat)) : s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
  return flat(node.props.style);
}
