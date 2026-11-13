// 06.1-55 (A-HOME-1, DS-11): the Your month card labels its two figures. The headline is left after this month's plans (monthEnd);
// the tiles are a usual month, or the low month. A short headline over a positive LEFT tile reads as two labelled figures.
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react-native';
import type { MonthBar, MonthPicture } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { wrap } from '@/test/stepProps';
import { YourMonthCard } from '../YourMonthCard';

jest.mock('@/ui/haptics', () => ({ hapticSelection: jest.fn(), hapticLight: jest.fn() }));

const mu = minorUnits;
// Like the app's no-cents formatter: cents only when the amount is not whole.
const money = (n: number): string =>
  `$${(n / 100).toLocaleString('en-US', n % 100 === 0 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const picture = {
  asOf: '2026-11-12',
  balanceOn: mu(300000),
  afterBillsBeforePayday: mu(100000),
  monthEnd: mu(-219095),
  unusedOverdraft: mu(0),
  payday: '2026-12-01',
  usual: { comesIn: mu(500000), goesOut: mu(410738), left: mu(89262) },
  low: { month: '2026-09', comesIn: mu(420000), goesOut: mu(430000), left: mu(-10000) },
} as unknown as MonthPicture;

const bars = [{ month: '2026-10', comesIn: mu(480000), goesOut: mu(400000), left: mu(80000) }] as unknown as MonthBar[];

const names: Record<string, string> = { '2026-11': 'November', '2026-10': 'October' };

function renderCard(over: Partial<React.ComponentProps<typeof YourMonthCard>> = {}) {
  return wrap(
    <YourMonthCard
      picture={picture}
      bars={bars}
      thisMonth="2026-11"
      monthName={(ym) => names[ym] ?? ym}
      formatMoney={money}
      recordsUpTo={null}
      recordMonths={3}
      onRecords={() => undefined}
      wholeUnit={100}
      {...over}
    />,
  );
}

describe('YourMonthCard labels (A-HOME-1)', () => {
  it('labels the headline as after this month\'s plans and the tiles as a usual month', async () => {
    await renderCard();
    const lead = screen.getByTestId('month-lead');
    expect(within(lead).getByText('$2,191')).toBeTruthy();
    expect(within(lead).getByText('short in November')).toBeTruthy();
    expect(within(lead).getByText('after this month’s plans')).toBeTruthy();
    expect(screen.getByTestId('month-tiles-label').props.children).toBe('A usual month');
    expect(screen.getByTestId('month-bars').props.accessibilityLabel).toContain('$893');
  });

  it('puts the two figures in different accessibility stops, each with its own label', async () => {
    await renderCard();
    const lead = screen.getByTestId('month-lead');
    const tiles = screen.getByTestId('month-bars');
    expect(lead.props.accessible).toBe(true);
    expect(tiles.props.accessible).toBe(true);
    expect(lead.props.accessibilityLabel).toBe('$2,191 short in November, after this month’s plans');
    expect(lead.props.accessibilityLabel).not.toContain('$893');
    expect(tiles.props.accessibilityLabel).toBe('A usual month: Comes in $5,000, goes out $4,107, left $893');
    expect(tiles.props.accessibilityLabel).not.toContain('$2,191');
  });

  it('the tiles label follows the usual/low switch', async () => {
    await renderCard();
    await fireEvent.press(screen.getByText('Low month'));
    expect(screen.getByTestId('month-tiles-label').props.children).toBe('Your low month');
    expect(screen.getByTestId('month-bars').props.accessibilityLabel).toMatch(/^Your low month: /);
  });

  it('a past month is its own records: no headline label and no tiles basis label', async () => {
    await renderCard();
    await fireEvent.press(screen.getByTestId('month-earlier'));
    const lead = screen.getByTestId('month-lead');
    expect(within(lead).getByText('left in October')).toBeTruthy();
    expect(screen.queryByTestId('month-lead-label')).toBeNull();
    expect(screen.queryByTestId('month-tiles-label')).toBeNull();
    expect(lead.props.accessibilityLabel).toBe('$800 left in October');
    expect(screen.getByTestId('month-bars').props.accessibilityLabel).toBe('Comes in $4,800, goes out $4,000, left $800');
  });
});

describe('YourMonthCard layout (06.1-56, A-HOME-6)', () => {
  it('names the month between the arrows, and the arrows step through it', async () => {
    await renderCard();
    expect(screen.getByText('Your month')).toBeTruthy();
    expect(screen.getByTestId('month-name')).toHaveTextContent('November');
    await fireEvent.press(screen.getByTestId('month-earlier'));
    expect(screen.getByTestId('month-name')).toHaveTextContent('October');
    await fireEvent.press(screen.getByTestId('month-later'));
    expect(screen.getByTestId('month-name')).toHaveTextContent('November');
  });

  it('draws one stacked bar with a two-line legend: goes out and left', async () => {
    await renderCard();
    expect(screen.getAllByTestId('stacked-bar', { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.getByTestId('stacked-seg-out', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('stacked-seg-left', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Comes in $5,000\nGoes out $4,107 · Left $893', { includeHiddenElements: true })).toBeTruthy();
  });

  it('a short month stacks what comes in and the shortfall, and says Short', async () => {
    await renderCard();
    await fireEvent.press(screen.getByText('Low month'));
    expect(screen.getByTestId('stacked-seg-in', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('stacked-seg-short', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Comes in $4,200\nGoes out $4,300 · Short $100', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows no cents anywhere on the card for amounts that are whole once rounded', async () => {
    await renderCard({ recordsUpTo: 'Nov 5' });
    expect(screen.queryAllByText(/\.\d\d/, { includeHiddenElements: true })).toHaveLength(0);
    expect(screen.queryAllByText(/\.00/, { includeHiddenElements: true })).toHaveLength(0);
  });

  it('the usual/low switch says what each month leaves under its word', async () => {
    await renderCard();
    expect(screen.getByText('$893 left')).toBeTruthy();
    expect(screen.getByText('$100 short')).toBeTruthy();
    expect(screen.getByLabelText('Usual month, $893 left').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByLabelText('Low month, $100 short'));
    expect(screen.getByLabelText('Low month, $100 short').props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByLabelText('Low month, $100 short'));
    expect(screen.getByLabelText('Low month, $100 short').props.accessibilityState.checked).toBe(true);
  });

  it('a picture with no low month shows the word with no sub-line', async () => {
    await renderCard({ picture: { ...picture, low: null } as unknown as MonthPicture });
    expect(screen.getByLabelText('Low month')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Low month'));
    expect(screen.queryByTestId('month-bars')).toBeNull();
  });

  it('the records row has an n-of-3 bar and a chevron, and opens the records', async () => {
    const onRecords = jest.fn();
    await renderCard({ recordsUpTo: 'Nov 5', recordMonths: 2, onRecords });
    expect(screen.getByText('Records up to Nov 5 · 2 of 3 months')).toBeTruthy();
    expect(screen.getByTestId('month-records-fill').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: '67%' })]));
    await fireEvent.press(screen.getByTestId('month-records'));
    expect(onRecords).toHaveBeenCalled();
  });

  it('without a whole unit the formatter gets the amounts as they are', async () => {
    await renderCard({ wholeUnit: undefined });
    expect(within(screen.getByTestId('month-lead')).getByText('$2,190.95')).toBeTruthy();
  });
});
