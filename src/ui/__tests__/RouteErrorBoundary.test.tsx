import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { RouteErrorBoundary } from '../RouteErrorBoundary';

const mockCapture = jest.fn();
jest.mock('@/services/errors', () => ({ captureError: (...a: unknown[]) => mockCapture(...a) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('RouteErrorBoundary', () => {
  it('shows the fallback, reports the error and retries', async () => {
    const error = new Error('boom');
    const retry = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <RouteErrorBoundary error={error} retry={retry} />
      </ThemeProvider>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(mockCapture).toHaveBeenCalledWith(error, { area: 'ui' });
    await fireEvent.press(screen.getByText('Try again'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
