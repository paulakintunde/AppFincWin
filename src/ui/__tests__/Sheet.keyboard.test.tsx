import React from 'react';
import { Keyboard, Platform, StyleSheet, Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { Sheet } from '../Sheet';

jest.setTimeout(20000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 10, left: 0, right: 0 }),
}));

type Handler = (e: { endCoordinates: { height: number } }) => void;

function captureKeyboard() {
  const handlers = new Map<string, Handler[]>();
  const remove = jest.fn();
  const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation(((name: string, h: Handler) => {
    handlers.set(name, [...(handlers.get(name) ?? []), h]);
    return { remove };
  }) as never);
  return { handlers, remove, spy };
}

const base = space.sheetPadBottom + 10;

function paddingBottom(screen: Awaited<ReturnType<typeof render>>): number {
  return StyleSheet.flatten(screen.getByTestId('sheet-container').props.style).paddingBottom as number;
}

afterEach(() => jest.restoreAllMocks());

describe('Sheet keyboard avoidance', () => {
  it('on Android pads the sheet by the keyboard height and removes it on hide and unmount', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { handlers, remove, spy } = captureKeyboard();
    const screen = await render(
      <ThemeProvider>
        <Sheet visible onDismiss={jest.fn()}>
          <Text>{'Body'}</Text>
        </Sheet>
      </ThemeProvider>
    );
    expect(paddingBottom(screen)).toBe(base);
    await act(async () => handlers.get('keyboardDidShow')!.forEach((h) => h({ endCoordinates: { height: 300 } })));
    expect(paddingBottom(screen)).toBe(base + 300);
    await act(async () => handlers.get('keyboardDidHide')!.forEach((h) => h({ endCoordinates: { height: 0 } })));
    expect(paddingBottom(screen)).toBe(base);
    await screen.unmount();
    const subscribed = spy.mock.calls.length;
    expect(subscribed).toBeGreaterThanOrEqual(2);
    expect(remove).toHaveBeenCalledTimes(subscribed); // every subscription is released
  });

  it('on iOS adds no did-show padding (KeyboardAvoidingView padding handles it)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const { spy } = captureKeyboard();
    await render(
      <ThemeProvider>
        <Sheet visible onDismiss={jest.fn()}>
          <Text>{'Body'}</Text>
        </Sheet>
      </ThemeProvider>
    );
    expect(spy.mock.calls.map((c) => c[0])).not.toContain('keyboardDidShow');
  });
});
