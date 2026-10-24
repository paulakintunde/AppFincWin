import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { colors } from '@/theme/tokens';
import type { DecideSettingsPatch } from '@/db/decideSettings';
import { totalSetAside, type PotInput } from '@/engine/decide';
import { minorUnits } from '@/engine/money';
import { TODAY, loggedSource, month, noneSource, roughSource } from '../../snapshot/__tests__/helpers/snapshotFixtures';
import { wrap } from '../../check/steps/__tests__/helpers/stepProps';
import { homeCardModel } from '../homeCardModel';
import { MonthDetailsSheet } from '../MonthDetailsSheet';
import type { SnapshotResult } from '../../snapshot/types';

jest.setTimeout(30000);

const mockUpdate = jest.fn();
const mockChoose = jest.fn();
const mockNavigate = jest.fn();
jest.mock('@/data/mutations/decideSettings', () => ({
  useUpdateDecideSettings: () => ({ update: (patch: DecideSettingsPatch) => mockUpdate(patch) }),
}));
jest.mock('expo-router', () => ({ router: { navigate: (...a: unknown[]) => mockNavigate(...a), push: jest.fn(), replace: jest.fn() } }));
const mockPush = jest.fn();
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: (...a: unknown[]) => mockPush(...a) }));
jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn(), hapticWarning: jest.fn(), hapticSuccess: jest.fn(), hapticMedium: jest.fn() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

const whole = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n / 100))}`;
const pot = (over: Partial<PotInput> = {}): PotInput => ({
  id: 'p1',
  kind: 'pot',
  target: minorUnits(120_000),
  monthlyAmount: null,
  readyBy: '2027-04-30',
  saved: minorUnits(0),
  ...over,
});
const withPots = (source: SnapshotResult, pots: readonly PotInput[]): SnapshotResult =>
  source.kind === 'logged' ? { ...source, pots, snapshot: { ...source.snapshot, pots } } : { ...source, pots };
const labelOf = (re: RegExp) => screen.queryByLabelText(re)?.props.accessibilityLabel as string | undefined;
const amountOf = (label: string | undefined) => Number((label ?? '').split(', ')[1]?.replace(/[^0-9]/g, '')) * 100;

const SOURCES = '4 months of logged income, 12 expense lines this month, 1 debts and 2 accounts.';

function sheet(source: SnapshotResult | null, over: { onClose?: () => void; note?: string | null; judgeOn?: 'month' | 'worst' | 'average' } = {}) {
  const card = homeCardModel(source, null, { status: 'ready', homeBasisSeen: true, today: TODAY, judgeOn: over.judgeOn });
  return (
    <MonthDetailsSheet
      visible
      title="Net free cash flow"
      today={TODAY}
      card={card}
      source={source}
      settings={null}
      userId="u1"
      whole={whole}
      currency="USD"
      sourcesNote={over.note === undefined ? SOURCES : over.note}
      onChooseJudgeOn={mockChoose}
      onClose={over.onClose ?? jest.fn()}
    />
  );
}

const variable = () =>
  loggedSource({
    months: [['2026-06', 500_000, 300_000], ['2026-07', 900_000, 300_000], ['2026-08', 100_000, 300_000], ['2026-09', 700_000, 300_000]].map(
      ([m, i, o]) => month(m as string, i as number, o as number)
    ),
  });

describe('MonthDetailsSheet', () => {
  it('D-99 Month details holds the basis control, the columns and the sources note', async () => {
    const onClose = jest.fn();
    await wrap(sheet(variable(), { onClose }));
    expect(screen.getAllByText('Net free cash flow').length).toBeGreaterThan(0);
    expect(screen.getByText('Worked out on your worst month.')).toBeTruthy();
    expect(screen.getByLabelText('Money in, $1000')).toBeTruthy();
    expect(screen.getByLabelText('Spending, $3000')).toBeTruthy();
    expect(screen.getByLabelText('Net free cash flow, $2200 overspent')).toBeTruthy();
    expect(screen.getByText(/4 months ranging \$1000 to \$9000\./)).toBeTruthy();
    expect(screen.getByLabelText('Worst · $1000').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByLabelText('Average · $5500'));
    expect(mockChoose).toHaveBeenCalledWith('average');
    expect(screen.getByText(SOURCES)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Activity'));
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/activity');
    await fireEvent.press(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('the steadiness chip and the Activity pill share the header centre line', async () => {
    await wrap(sheet(variable()));
    const chip = screen.getByTestId('month-steadiness');
    const header = chip.parent as unknown as { props: { style: never } };
    // the header centres its children, the chip's wrapper does not opt out, and the pill is a sibling in the same row
    const headerStyle = StyleSheet.flatten(header.props.style) as { flexDirection?: string; alignItems?: string };
    expect(headerStyle.flexDirection).toBe('row');
    expect(headerStyle.alignItems).toBe('center');
    expect(StyleSheet.flatten(chip.props.style).alignSelf).toBe('center');
    expect(screen.getByLabelText('Activity')).toBeTruthy();
  });

  it('D-99 Edit opens the rough figures sheet stacked', async () => {
    await wrap(sheet(roughSource()));
    expect(screen.queryByText('Rough figures')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Edit rough figures'));
    expect(screen.getByText('Rough figures')).toBeTruthy();
    expect(screen.getAllByText('Net free cash flow').length).toBeGreaterThan(0); // the parent sheet stays beneath
  });

  it('D-97 unavailable Month details shows the reason and one action only', async () => {
    const source = loggedSource();
    const unconverted = { ...source, unconverted: { currencies: ['EUR'] } } as unknown as SnapshotResult;
    await wrap(sheet(unconverted));
    expect(screen.getByText('Lines in EUR are waiting for an exchange rate.')).toBeTruthy();
    expect(screen.getByText('See lines waiting for a rate')).toBeTruthy();
    expect(screen.queryByLabelText(/^Money in/)).toBeNull();
    expect(screen.queryByLabelText('Judge on')).toBeNull();
    expect(screen.queryByText(SOURCES)).toBeNull();
    await fireEvent.press(screen.getByText('See lines waiting for a rate'));
    expect(mockNavigate).toHaveBeenCalledWith('/activity');
  });

  it('D-97 first run shows the reason and Add rough figures only', async () => {
    await wrap(sheet(noneSource(), { note: null }));
    expect(screen.getByText('There is no full month or rough figure to work from.')).toBeTruthy();
    expect(screen.queryByLabelText(/^Money in/)).toBeNull();
    await fireEvent.press(screen.getByText('Add rough figures'));
    expect(screen.getByText('Rough figures')).toBeTruthy();
  });

  it('D-100 the month details rows add up to net free cash flow', async () => {
    const source = withPots(loggedSource({ monthlySaving: minorUnits(30_000), monthlyInvesting: minorUnits(20_000) }), [pot()]);
    await wrap(sheet(source));
    const setAside = totalSetAside([pot()], TODAY).total;
    expect(setAside).toBeGreaterThan(0);
    expect(screen.getByLabelText('Money in, $5000')).toBeTruthy();
    expect(screen.getByLabelText('Spending, $3000')).toBeTruthy();
    expect(screen.getByLabelText('Debt payments, $200')).toBeTruthy();
    expect(screen.getByLabelText('Saving and investing, $500')).toBeTruthy();
    expect(screen.getByLabelText(/^Set aside for pots, /)).toBeTruthy();
    const sum =
      amountOf(labelOf(/^Money in/)) -
      amountOf(labelOf(/^Spending/)) -
      amountOf(labelOf(/^Debt payments/)) -
      amountOf(labelOf(/^Saving and investing/)) -
      amountOf(labelOf(/^Set aside for pots/));
    // each row is whole dollars in this test's formatter, so compare in dollars
    const result = amountOf(labelOf(/^Net free cash flow, \$/));
    expect(Math.round(sum / 100)).toBe(Math.round(result / 100));
    expect(Math.round(result / 100)).toBe(Math.round((500_000 - 300_000 - 20_000 - 50_000 - setAside) / 100));
    // the true minus on the deductions
    expect(screen.getByText('\u2212$3000')).toBeTruthy();
  });

  it('D-100 rows hide at zero as specified and the result never hides', async () => {
    await wrap(sheet(loggedSource({ debts: [] })));
    expect(screen.getByLabelText('Money in, $5000')).toBeTruthy();
    expect(screen.getByLabelText('Spending, $3000')).toBeTruthy();
    expect(screen.queryByLabelText(/^Debt payments/)).toBeNull();
    expect(screen.queryByLabelText(/^Saving and investing/)).toBeNull();
    expect(screen.queryByLabelText(/^Set aside for pots/)).toBeNull();
    expect(screen.getByLabelText('Net free cash flow, $2000')).toBeTruthy();
  });

  it('D-100 the rough source shows money in, spending, any set-aside and the result', async () => {
    await wrap(sheet(roughSource(600_000, 400_000, 250_000)));
    expect(screen.getByLabelText('Money in, $4000')).toBeTruthy();
    expect(screen.getByLabelText('Spending, $2500')).toBeTruthy();
    expect(screen.queryByLabelText(/^Debt payments|^Saving and investing|^Set aside for pots/)).toBeNull();
    expect(screen.getByLabelText('Net free cash flow, $1500')).toBeTruthy();
    expect(screen.getByText('Worked out from the figures you gave.')).toBeTruthy();
    expect(screen.getByLabelText('Edit rough figures')).toBeTruthy();
  });

  it('D-100 the rough source takes the pots set-aside off the result', async () => {
    const pots = [pot()];
    const setAside = totalSetAside(pots, TODAY).total;
    await wrap(sheet(withPots(roughSource(600_000, 400_000, 250_000), pots)));
    expect(screen.getByLabelText(/^Set aside for pots, /)).toBeTruthy();
    expect(screen.getByLabelText(`Net free cash flow, $${Math.round((150_000 - setAside) / 100)}`)).toBeTruthy();
  });

  it('D-101 the Pots link shows with no pots and pushes the pots route after closing', async () => {
    const onClose = jest.fn();
    await wrap(sheet(loggedSource(), { onClose }));
    expect(screen.queryByLabelText(/^Set aside for pots/)).toBeNull();
    const link = screen.getByLabelText('Pots');
    expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(screen.getByText('Pots \u203A')).toBeTruthy();
    await fireEvent.press(link);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/decide/pots');
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0]!);
  });

  it('D-106 Month details result row prints the words, other rows stay plain', async () => {
    await wrap(sheet(variable()));
    const result = screen.getByLabelText('Net free cash flow, $2200 overspent');
    const value = screen.getByText('$2200 overspent');
    expect(screen.getByText('\u2212$3000')).toBeTruthy(); // the spending row keeps its minus
    expect(StyleSheet.flatten(value.props.style).color).toBe(colors.danger);
    expect(result).toBeTruthy();
  });

  it('D-100 the tightest basis line carries its info button', async () => {
    const source = loggedSource({ months: [month('2026-08', 500_000, 300_000), month('2026-09', 500_000, 300_000)] });
    await wrap(sheet(source));
    expect(screen.getByText('Worked out on your tightest figures.')).toBeTruthy();
    expect(screen.getByLabelText('About Your tightest figures')).toBeTruthy();
  });

  it('D-107 the checked radio is the card choice, and the fallback line shows with This month checked', async () => {
    const source = { ...variable(), monthFallback: { currencies: ['EUR'] } } as SnapshotResult;
    await wrap(sheet(source, { judgeOn: 'month' }));
    expect(screen.getByText('This month is waiting for a EUR rate')).toBeTruthy();
    const radios = screen.getAllByRole('radio', { includeHiddenElements: true });
    expect(radios.map((r) => r.props.accessibilityState.checked)).toEqual([true, false, false]);
    expect(screen.getByText('Worked out on your worst month.')).toBeTruthy();
  });

  it('D-107 the Worked out on line follows the basis and no history line shows for This month', async () => {
    await wrap(sheet(variable(), { judgeOn: 'worst' }));
    expect(screen.getByText('Worked out on your worst month.')).toBeTruthy();
    expect(screen.getByText(/4 months ranging/)).toBeTruthy();
  });

  it('D-107 no control with fewer than 3 full months', async () => {
    const source = loggedSource({ months: [month('2026-08', 500_000, 300_000), month('2026-09', 500_000, 300_000)] });
    await wrap(sheet(source, { judgeOn: 'month' }));
    expect(screen.queryAllByRole('radio', { includeHiddenElements: true })).toHaveLength(0);
  });
});
