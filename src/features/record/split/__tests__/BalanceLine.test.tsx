import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { BalanceLine } from '../BalanceLine';

jest.setTimeout(30000);

const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;

async function show(balance: React.ComponentProps<typeof BalanceLine>['balance']) {
  return render(
    <ThemeProvider>
      <BalanceLine balance={balance} money={money} />
    </ThemeProvider>,
  );
}

describe('BalanceLine', () => {
  it('reads Adds up in the fits tone', async () => {
    await show({ state: 'addsUp', amount: 0 });
    expect(screen.getByText('Adds up')).toBeTruthy();
    expect(screen.getByTestId('split-balance-addsUp')).toBeTruthy();
  });

  it('reads the amount left to place', async () => {
    await show({ state: 'left', amount: 2000 });
    expect(screen.getByText('$20.00 left to place')).toBeTruthy();
  });

  it('reads the amount over', async () => {
    await show({ state: 'over', amount: 500 });
    expect(screen.getByText('$5.00 over')).toBeTruthy();
  });

  it('is a polite live region that settles after 600 ms', async () => {
    jest.useFakeTimers();
    try {
      const view = await show({ state: 'left', amount: 2000 });
      const line = screen.getByTestId('split-balance');
      expect(line.props.accessibilityLiveRegion).toBe('polite');
      expect(line.props.accessibilityLabel).toBe('$20.00 left to place');
      await view.rerender(
        <ThemeProvider>
          <BalanceLine balance={{ state: 'left', amount: 1500 }} money={money} />
        </ThemeProvider>,
      );
      expect(screen.getByTestId('split-balance').props.accessibilityLabel).toBe('$20.00 left to place');
      await act(async () => {
        jest.advanceTimersByTime(650);
      });
      expect(screen.getByTestId('split-balance').props.accessibilityLabel).toBe('$15.00 left to place');
    } finally {
      jest.useRealTimers();
    }
  });
});
