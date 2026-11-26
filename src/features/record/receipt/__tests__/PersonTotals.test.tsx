// 10.1-27 (D-15; UI-SPEC 6 and Accessibility): "Each person's share".
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { PersonTotals } from '../PersonTotals';

jest.mock('@/features/household/components/MemberAvatar', () => ({ MemberAvatar: () => null }));

const MEMBERS = [
  { id: 'alex', name: 'Alex' },
  { id: 'sam', name: 'Sam' },
  { id: 'kim', name: 'Kim' },
];
const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;
const spoken = (minor: number) => `${(minor / 100).toFixed(2)} dollars`;

async function show(shares: { memberId: string; items: number; extras: number; total: number; itemCount: number }[], total: number) {
  return render(
    <ThemeProvider>
      <PersonTotals householdId="h" members={MEMBERS} shares={shares} total={total} money={money} spoken={spoken} />
    </ThemeProvider>,
  );
}

describe('PersonTotals', () => {
  it('lists each share, "Nothing" and "No items" for a person with none, and the total that adds up', async () => {
    jest.useFakeTimers();
    await show(
      [
        { memberId: 'alex', items: 1700, extras: 170, total: 1870, itemCount: 2 },
        { memberId: 'sam', items: 500, extras: 50, total: 550, itemCount: 1 },
        { memberId: 'kim', items: 0, extras: 0, total: 0, itemCount: 0 },
      ],
      2420,
    );
    expect(screen.getByText('Each person’s share')).toBeTruthy();
    expect(screen.getByText('$18.70')).toBeTruthy();
    expect(screen.getByText('2 items · $1.70 tax, tip and discounts')).toBeTruthy();
    expect(screen.getByText('Nothing')).toBeTruthy();
    expect(screen.getByText('No items')).toBeTruthy();
    expect(screen.getByText('Total $24.20')).toBeTruthy();
    expect(screen.getByText('Adds up')).toBeTruthy();
    expect(screen.getByLabelText('Alex, 18.70 dollars, 2 items')).toBeTruthy();
    expect(screen.getByLabelText('Kim, Nothing, 0 items')).toBeTruthy();

    const live = screen.getByTestId('person-totals-total');
    expect(live.props.accessibilityLiveRegion).toBe('polite');
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.getByTestId('person-totals-total').props.accessibilityLabel).toBe(
      'Alex 18.70 dollars, Sam 5.50 dollars, Kim Nothing. Adds up',
    );
    jest.useRealTimers();
  });

  it('says how much is left when the shares fall short of the total, with a glyph and words', async () => {
    await show([{ memberId: 'alex', items: 1000, extras: 0, total: 1000, itemCount: 1 }], 1200);
    expect(screen.getByText('$2.00 left to place')).toBeTruthy();
    expect(screen.getByTestId('person-totals-left')).toBeTruthy();
  });

  it('shows a negative extras share with a minus', async () => {
    await show([{ memberId: 'alex', items: 1000, extras: -100, total: 900, itemCount: 1 }], 900);
    expect(screen.getByText('1 item · -$1.00 tax, tip and discounts')).toBeTruthy();
  });
});
