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

/** 06.1-59 (G-10): the usual/low switch, its explainer and the records row sit behind the card's More row. */
const openMore = async (): Promise<void> => {
  await fireEvent.press(screen.getByTestId('month-more'));
};

describe('YourMonthCard short line first (06.1-59, G-10)', () => {
  it('shows the headline and the bar; the switch, explainer and records row open under More', async () => {
    await renderCard({ recordsUpTo: 'Nov 5', recordMonths: 2 });
    expect(screen.getByTestId('month-lead')).toBeTruthy();
    expect(screen.getByTestId('month-bars')).toBeTruthy();
    expect(screen.queryByTestId('month-basis')).toBeNull();
    expect(screen.queryByText('A usual month from your records: what comes in, less what goes out.')).toBeNull();
    expect(screen.queryByTestId('month-records')).toBeNull();
    await openMore();
    expect(screen.getByTestId('month-basis')).toBeTruthy();
    expect(screen.getByText('A usual month from your records: what comes in, less what goes out.')).toBeTruthy();
    expect(screen.getByText('Records up to Nov 5')).toBeTruthy();
    expect(screen.getByTestId('month-records-complete')).toHaveTextContent('2 of 3 months complete enough to use.');
  });

  it('a past month with no records date has nothing behind More, so no More row', async () => {
    await renderCard();
    await fireEvent.press(screen.getByTestId('month-earlier'));
    expect(screen.queryByTestId('month-more')).toBeNull();
  });
});

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
    await openMore();
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

  it('06.1-81: the legend, the switch and the spoken figures add up once rounded (left is rounded in minus rounded out)', async () => {
    // $4,999.60 in, $4,107.40 out, $892.20 left: rounded on their own they read $5,000 in, $4,107 out and $892 left, one unit off.
    const near = { comesIn: mu(499960), goesOut: mu(410740), left: mu(89220) };
    const shortNear = { month: '2026-09', comesIn: mu(420040), goesOut: mu(430060), left: mu(-10020) };
    await renderCard({ picture: { ...picture, usual: near, low: shortNear } as unknown as MonthPicture });
    expect(screen.getByText('Comes in $5,000\nGoes out $4,107 · Left $893', { includeHiddenElements: true })).toBeTruthy();
    await openMore();
    expect(screen.getByLabelText('Usual month, $893 left')).toBeTruthy();
    // $4,200.40 in, $4,300.60 out: $4,200 in and $4,301 out read $101 short, never $100.
    await fireEvent.press(screen.getByLabelText('Low month, $101 short'));
    expect(screen.getByText('Comes in $4,200\nGoes out $4,301 · Short $101', { includeHiddenElements: true })).toBeTruthy();
  });

  it('06.1-81: a past month’s headline and figures add up once rounded too', async () => {
    await renderCard({ bars: [{ month: '2026-10', comesIn: mu(499960), goesOut: mu(410740), left: mu(89220) }] as unknown as MonthBar[] });
    await fireEvent.press(screen.getByTestId('month-earlier'));
    expect(screen.getByTestId('month-lead').props.accessibilityLabel).toBe('$893 left in October');
    expect(screen.getByTestId('month-bars').props.accessibilityLabel).toBe('Comes in $5,000, goes out $4,107, left $893');
  });

  it('a short month stacks what comes in and the shortfall, and says Short', async () => {
    await renderCard();
    await openMore();
    await fireEvent.press(screen.getByText('Low month'));
    expect(screen.getByTestId('stacked-seg-in', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('stacked-seg-short', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('Comes in $4,200\nGoes out $4,300 · Short $100', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows no cents anywhere on the card for amounts that are whole once rounded', async () => {
    await renderCard({ recordsUpTo: 'Nov 5' });
    await openMore();
    expect(screen.queryAllByText(/\.\d\d/, { includeHiddenElements: true })).toHaveLength(0);
    expect(screen.queryAllByText(/\.00/, { includeHiddenElements: true })).toHaveLength(0);
  });

  it('the usual/low switch says what each month leaves under its word', async () => {
    await renderCard();
    await openMore();
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
    await openMore();
    expect(screen.getByLabelText('Low month')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Low month'));
    expect(screen.queryByTestId('month-bars')).toBeNull();
  });

  it('the records row has an n-of-3 bar and a chevron, and opens the records', async () => {
    const onRecords = jest.fn();
    await renderCard({ recordsUpTo: 'Nov 5', recordMonths: 2, onRecords });
    await openMore();
    expect(screen.getByText('Records up to Nov 5')).toBeTruthy();
    expect(screen.getByTestId('month-records-fill').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: '67%' })]));
    expect(screen.getByTestId('month-records').props.accessibilityLabel).toBe('Records up to Nov 5. 2 of 3 months complete enough to use.');
    await fireEvent.press(screen.getByTestId('month-records'));
    expect(onRecords).toHaveBeenCalled();
  });

  // 06.1-79 (DS-10, OQ-79-2 A): the count is the answer's (recordMonthsOf): months complete enough to use, of the months looked for.
  it('the records row says the answer’s count: 1 of 3 complete enough to use, with a third of the bar', async () => {
    await renderCard({ recordsUpTo: 'Nov 5', recordMonths: 1 });
    await openMore();
    expect(screen.getByTestId('month-records-complete')).toHaveTextContent('1 of 3 months complete enough to use.');
    expect(screen.queryByText(/3 of 3/)).toBeNull();
    expect(screen.getByTestId('month-records-fill').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: '33%' })]));
  });

  it('more months used than three: n of n, a full bar', async () => {
    await renderCard({ recordsUpTo: 'Nov 5', recordMonths: 6, recordMonthsTotal: 6 });
    await openMore();
    expect(screen.getByTestId('month-records-complete')).toHaveTextContent('6 of 6 months complete enough to use.');
    expect(screen.getByTestId('month-records-fill').props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: '100%' })]));
  });

  it('without a whole unit the formatter gets the amounts as they are', async () => {
    await renderCard({ wholeUnit: undefined });
    expect(within(screen.getByTestId('month-lead')).getByText('$2,190.95')).toBeTruthy();
  });
});
