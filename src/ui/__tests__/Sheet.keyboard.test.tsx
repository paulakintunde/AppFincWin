import React, { Profiler } from 'react';
import { Keyboard, Platform, StyleSheet, Text } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { KEYBOARD_MIN_DP, Sheet } from '../Sheet';

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

  it('DB-5: moves the panel once per show and once per hide (a repeat didShow is not a second move)', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { handlers } = captureKeyboard();
    let renders = 0;
    const screen = await render(
      <ThemeProvider>
        <Profiler id="sheet" onRender={() => { renders += 1; }}>
          <Sheet visible onDismiss={jest.fn()}>
            <Text>{'Body'}</Text>
          </Sheet>
        </Profiler>
      </ThemeProvider>
    );
    const commits = () => renders;
    const seen: number[] = [paddingBottom(screen)];
    const before = commits();
    const show = (height: number) =>
      act(async () => handlers.get('keyboardDidShow')!.forEach((h) => h({ endCoordinates: { height } })));
    await show(300);
    seen.push(paddingBottom(screen));
    const afterFirst = commits();
    await show(300);
    seen.push(paddingBottom(screen));
    expect(commits()).toBe(afterFirst); // the repeat is no layout change
    expect(afterFirst - before).toBe(1);
    await act(async () => handlers.get('keyboardDidHide')!.forEach((h) => h({ endCoordinates: { height: 0 } })));
    seen.push(paddingBottom(screen));
    expect(seen).toEqual([base, base + 300, base + 300, base]);
  });

  it('DB-5: a floating keyboard toolbar (under 100 dp) adds no pad, so a focus does not move the sheet', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const { handlers } = captureKeyboard();
    const screen = await render(
      <ThemeProvider>
        <Sheet visible onDismiss={jest.fn()}>
          <Text>{'Body'}</Text>
        </Sheet>
      </ThemeProvider>
    );
    expect(KEYBOARD_MIN_DP).toBe(100);
    await act(async () => handlers.get('keyboardDidShow')!.forEach((h) => h({ endCoordinates: { height: 63 } })));
    expect(paddingBottom(screen)).toBe(base);
    await act(async () => handlers.get('keyboardDidShow')!.forEach((h) => h({ endCoordinates: { height: 99 } })));
    expect(paddingBottom(screen)).toBe(base);
    await act(async () => handlers.get('keyboardDidShow')!.forEach((h) => h({ endCoordinates: { height: 100 } })));
    expect(paddingBottom(screen)).toBe(base + 100);
    await act(async () => handlers.get('keyboardDidHide')!.forEach((h) => h({ endCoordinates: { height: 0 } })));
    expect(paddingBottom(screen)).toBe(base);
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
