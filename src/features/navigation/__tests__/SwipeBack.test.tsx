import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { Platform, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SwipeBack } from '../SwipeBack';

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
  mockBack.mockClear();
  mockCanGoBack = true;
  setOS('android');
});
afterAll(() => setOS(original as 'android' | 'ios'));

function swipe(translationX: number, translationY = 0, velocityX = 900) {
  fireGestureHandler(getByGestureTestId('swipe-back'), [
    { state: State.BEGAN, absoluteX: 5, translationX: 0 },
    { state: State.ACTIVE, absoluteX: 5 + translationX / 2, translationX: translationX / 2 },
    { state: State.END, absoluteX: 5 + translationX, translationX, translationY, velocityX },
  ]);
}

describe('SwipeBack', () => {
  it('goes back on a qualifying edge swipe', async () => {
    await render(
      <SwipeBack enabled>
        <Text>x</Text>
      </SwipeBack>
    );
    swipe(120);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
  it('does nothing when there is nothing to go back to', async () => {
    mockCanGoBack = false;
    await render(
      <SwipeBack enabled>
        <Text>x</Text>
      </SwipeBack>
    );
    swipe(120);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('ignores a short slow swipe', async () => {
    await render(
      <SwipeBack enabled>
        <Text>x</Text>
      </SwipeBack>
    );
    swipe(15, 0, 100);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('ignores a vertical swipe', async () => {
    await render(
      <SwipeBack enabled>
        <Text>x</Text>
      </SwipeBack>
    );
    swipe(60, 200);
    expect(mockBack).not.toHaveBeenCalled();
  });
  it('renders children only when disabled', async () => {
    const u = await render(
      <SwipeBack enabled={false}>
        <Text>x</Text>
      </SwipeBack>
    );
    expect(u.getByText('x')).toBeTruthy();
    expect(() => getByGestureTestId('swipe-back')).toThrow();
  });
  it('renders children only on iOS', async () => {
    setOS('ios');
    const u = await render(
      <SwipeBack enabled>
        <Text>x</Text>
      </SwipeBack>
    );
    expect(u.getByText('x')).toBeTruthy();
    expect(() => getByGestureTestId('swipe-back')).toThrow();
  });
});
