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
const money = (n: number): string => `$${(n / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

function renderCard() {
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
    />,
  );
}

describe('YourMonthCard labels (A-HOME-1)', () => {
  it('labels the headline as after this month\'s plans and the tiles as a usual month', async () => {
    await renderCard();
    const lead = screen.getByTestId('month-lead');
    expect(within(lead).getByText('$2,190.95')).toBeTruthy();
    expect(within(lead).getByText('short in November')).toBeTruthy();
    expect(within(lead).getByText('after this month’s plans')).toBeTruthy();
    expect(screen.getByTestId('month-tiles-label').props.children).toBe('A usual month');
    expect(within(screen.getByTestId('month-bars')).getByText('$892.62')).toBeTruthy();
  });

  it('puts the two figures in different accessibility stops, each with its own label', async () => {
    await renderCard();
    const lead = screen.getByTestId('month-lead');
    const tiles = screen.getByTestId('month-bars');
    expect(lead.props.accessible).toBe(true);
    expect(tiles.props.accessible).toBe(true);
    expect(lead.props.accessibilityLabel).toBe('$2,190.95 short in November, after this month’s plans');
    expect(lead.props.accessibilityLabel).not.toContain('$892.62');
    expect(tiles.props.accessibilityLabel).toBe('A usual month: Comes in $5,000.00, goes out $4,107.38, left $892.62');
    expect(tiles.props.accessibilityLabel).not.toContain('$2,190.95');
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
    expect(lead.props.accessibilityLabel).toBe('$800.00 left in October');
    expect(screen.getByTestId('month-bars').props.accessibilityLabel).toBe('Comes in $4,800.00, goes out $4,000.00, left $800.00');
  });
});
