import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { UnpaidBanner } from '../UnpaidBanner';

describe('UnpaidBanner (D-41)', () => {
  it('says what is shown and calls onClear once from a 44pt-reaching button', async () => {
    const onClear = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <UnpaidBanner onClear={onClear} />
      </ThemeProvider>
    );
    expect(screen.getByText(/Showing unpaid bills/)).toBeTruthy();
    expect(screen.getByText('Clear')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Clear the unpaid filter' });
    expect(button.props.hitSlop).toEqual({ top: 12, bottom: 12, left: 8, right: 8 });
    await fireEvent.press(button);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
