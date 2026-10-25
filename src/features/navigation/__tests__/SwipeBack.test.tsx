import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { Platform, Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DURATION } from '@/theme/motion';
import { SwipeBack } from '../SwipeBack';
import { setSwipeBackInterceptor } from '../swipeBackGesture';

let mockReduced = false;
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useReduceMotion: () => mockReduced,
}));

const mockBack = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  router: { back: () => mockBack(), canGoBack: () => mockCanGoBack },
}));

const original = Platform.OS;
const setOS = (os: 'android' | 'ios') => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
};

beforeEach(() => {
  jest.useFakeTimers();
  mockReduced = false;
  mockBack.mockClear();
  mockCanGoBack = true;
  setOS('android');
});
afterEach(() => jest.useRealTimers());
afterAll(() => setOS(original as 'android' | 'ios'));

function Wrap({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SwipeBack enabled={enabled}>{children}</SwipeBack>
    </ThemeProvider>
  );
}

async function swipe(translationX: number, translationY = 0, velocityX = 900) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('swipe-back'), [
      { state: State.BEGAN, absoluteX: 5, translationX: 0 },
      {
        state: State.ACTIVE,
        absoluteX: 5 + translationX / 2,
        translationX: translationX / 2,
      },
      {
        state: State.END,
        absoluteX: 5 + translationX,
        translationX,
        translationY,
        velocityX,
      },
    ]);
  });
}

describe('SwipeBack', () => {
  it('does not go back when the system cancels the gesture after activation (WR-05)', async () => {
    await render(
      <Wrap enabled>
        <Text>{'x'}</Text>
      </Wrap>
    );
    await act(async () => {
      fireGestureHandler(getByGestureTestId('swipe-back'), [
        { state: State.BEGAN, absoluteX: 5, translationX: 0 },
        { state: State.ACTIVE, absoluteX: 65, translationX: 60 },
        { state: State.CANCELLED, absoluteX: 125, translationX: 120, translationY: 0, velocityX: 900 },
      ]);
    });
    await act(async () => {
      jest.advanceTimersByTime(DURATION.push * 2);
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('goes back on a qualifying edge swipe', async () => {
    await render(
      <Wrap enabled>
        <Text>{'x'}</Text>
      </Wrap>
    );
    await swipe(120);
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(DURATION.push);
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('does not go back when a screen intercepts the swipe (A8)', async () => {
    setSwipeBackInterceptor(() => true);
    try {
      await render(
        <Wrap enabled>
          <Text>{'x'}</Text>
        </Wrap>
      );
      await swipe(120);
      await act(async () => {
        jest.advanceTimersByTime(DURATION.push * 2);
      });
      expect(mockBack).not.toHaveBeenCalled();
    } finally {
      setSwipeBackInterceptor(null);
    }
  });
  it('does not go back if unmounted during the completion slide', async () => {
    const u = await render(
      <Wrap enabled>
        <Text>{'x'}</Text>
      </Wrap>
    );
    await swipe(120);
    await u.unmount();
    await act(async () => {
      jest.advanceTimersByTime(DURATION.push * 2);
    });
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('pops immediately at release under reduced motion', async () => {
    mockReduced = true;
    await render(
      <Wrap enabled>
        <Text>{'x'}</Text>
      </Wrap>
    );
    await swipe(120);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('exposes the moving layer', async () => {
    const u = await render(
      <Wrap enabled>
        <Text>{'x'}</Text>
      </Wrap>
    );
    expect(u.getByTestId('swipe-back-layer')).toBeTruthy();
  });
  it('does nothing when there is nothing to go back to', async () => {
    mockCanGoBack = false;
    await render(
      <Wrap enabled>
        <Text>{'x'}</Text>
      </Wrap>
    );
    await swipe(120);
    await act(async () => {
      jest.advanceTimersByTime(DURATION.push * 2);
    });
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('ignores a short slow swipe', async () => {
    await render(
      <Wrap enabled>
        <Text>{'x'}</Text>
      </Wrap>
    );
    await swipe(15, 0, 100);
    await act(async () => {
      jest.advanceTimersByTime(DURATION.push * 2);
    });
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('ignores a vertical swipe', async () => {
    await render(
      <Wrap enabled>
        <Text>{'x'}</Text>
      </Wrap>
    );
    await swipe(60, 200);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('renders children only when disabled', async () => {
    const u = await render(
      <Wrap enabled={false}>
        <Text>{'x'}</Text>
      </Wrap>
    );
    expect(u.getByText('x')).toBeTruthy();
    expect(() => getByGestureTestId('swipe-back')).toThrow();
  });
  it('renders children only on iOS', async () => {
    setOS('ios');
    const u = await render(
      <Wrap enabled>
        <Text>{'x'}</Text>
      </Wrap>
    );
    expect(u.getByText('x')).toBeTruthy();
    expect(() => getByGestureTestId('swipe-back')).toThrow();
  });
});
