// 06.1-62 (H-1, CB-5 / CF-1 / CB-6): every Pill, Chip and segment shows that a tap landed.
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { act, fireEvent, render, renderHook } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY } from '@/theme/layout';
import { colors } from '@/theme/tokens';
import { ReadOnlyScope } from '@/ui/ReadOnlyScope';
import { Pill } from '@/ui/Pill';
import { Chip } from '@/ui/Chip';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { LINK_HIT_SLOP, usePressFeedback } from '@/ui/pressFeedback';

jest.setTimeout(30000);

type Host = { props: Record<string, unknown> };
const flat = (node: Host) => StyleSheet.flatten(node.props.style as never) as Record<string, unknown>;
const ripple = (node: Host) => node.props.nativeForegroundAndroid as Record<string, unknown> | undefined;

const original = Platform.OS;
function setOS(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}
afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
});

// a touch that lands and stays down, so the pressed style is on screen
async function touchDown(node: Host) {
  const nativeEvent = { pageX: 10, pageY: 10, locationX: 10, locationY: 10, timestamp: Date.now(), touches: [], changedTouches: [] };
  await act(async () => {
    await fireEvent(node as never, 'responderGrant', { persist: () => {}, nativeEvent, currentTarget: { measure: () => {} } });
  });
}

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('usePressFeedback', () => {
  it('on Android returns a foreground ripple in a theme token and no pressed style', async () => {
    setOS('android');
    const fill = await renderHook(() => usePressFeedback('fill'), { wrapper: ThemeProvider });
    expect(fill.result.current.android_ripple).toEqual({ color: colors.fill6, borderless: false, foreground: true });
    expect(fill.result.current.pressedStyle(true)).toEqual({});
    const row = await renderHook(() => usePressFeedback('row'), { wrapper: ThemeProvider });
    expect(row.result.current.android_ripple?.color).toBe(colors.line4);
  });

  it('on iOS returns no ripple and the app-wide pressed opacity', async () => {
    setOS('ios');
    const { result } = await renderHook(() => usePressFeedback('row'), { wrapper: ThemeProvider });
    expect(result.current.android_ripple).toBeUndefined();
    expect(result.current.pressedStyle(true)).toEqual({ opacity: PRESSED_OPACITY });
    expect(result.current.pressedStyle(false)).toEqual({});
  });

  it('LINK_HIT_SLOP lifts a 44 dp link past 48 dp without widening into a neighbour', () => {
    expect(LINK_HIT_SLOP).toEqual({ top: 4, bottom: 4, left: 12, right: 12 });
    expect(44 + LINK_HIT_SLOP.top + LINK_HIT_SLOP.bottom).toBeGreaterThanOrEqual(48);
  });
});

describe('Pill press feedback', () => {
  it('Android: a native ripple on a live pill', async () => {
    setOS('android');
    const s = await wrap(<Pill label="Next" variant="primary" onPress={() => {}} />);
    expect(ripple(s.getByLabelText('Next'))).toBeDefined();
  });

  it('iOS: no ripple, and the pill dims while the finger is down', async () => {
    setOS('ios');
    const s = await wrap(<Pill label="Next" variant="secondary" onPress={() => {}} />);
    const pill = s.getByLabelText('Next');
    expect(ripple(pill)).toBeUndefined();
    expect(flat(pill).opacity).toBe(1);
    await touchDown(pill);
    expect(flat(s.getByLabelText('Next')).opacity).toBe(PRESSED_OPACITY);
  });

  it('a disabled pill ignores presses and shows no ripple or pressed state', async () => {
    setOS('android');
    const onPress = jest.fn();
    const s = await wrap(<Pill label="Next" variant="primary" disabled onPress={onPress} />);
    const pill = s.getByLabelText('Next');
    expect(ripple(pill)).toBeUndefined();
    fireEvent.press(pill);
    expect(onPress).not.toHaveBeenCalled();
    expect(flat(pill).opacity).toBe(0.5);
  });

  it('a read-only-scoped pill ignores presses and shows no ripple', async () => {
    setOS('ios');
    const onPress = jest.fn();
    const s = await wrap(
      <ReadOnlyScope.Provider value>
        <Pill label="Next" variant="primary" onPress={onPress} />
      </ReadOnlyScope.Provider>,
    );
    const pill = s.getByLabelText('Next');
    fireEvent.press(pill);
    expect(onPress).not.toHaveBeenCalled();
    await touchDown(pill);
    expect(flat(s.getByLabelText('Next')).opacity).toBe(1);
  });

  it('pending: dimmed, announced busy, same label, two presses ignored', async () => {
    setOS('android');
    const onPress = jest.fn();
    const s = await wrap(<Pill label="Save" variant="primary" pending onPress={onPress} />);
    const pill = s.getByLabelText('Save');
    expect(pill.props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
    expect(flat(pill).opacity).toBe(0.5);
    expect(ripple(pill)).toBeUndefined();
    expect(s.getByText('Save')).toBeTruthy();
    fireEvent.press(pill);
    fireEvent.press(pill);
    expect(onPress).not.toHaveBeenCalled();
    // no spinner and no extra copy: the label is the only text
    expect(s.queryByRole('progressbar')).toBeNull();
    expect(s.toJSON()).toMatchObject({ children: [expect.objectContaining({ children: ['Save'] })] });
  });

  it('a pill that is not pending is not announced busy', async () => {
    const s = await wrap(<Pill label="Save" variant="primary" onPress={() => {}} />);
    expect(s.getByLabelText('Save').props.accessibilityState).not.toEqual(expect.objectContaining({ busy: true }));
  });
});

describe('Chip press feedback', () => {
  it('Android: a native ripple on light and dark chips', async () => {
    setOS('android');
    const s = await wrap(
      <>
        <Chip label="Food" onPress={() => {}} />
        <Chip label="12 months" tone="dark" onPress={() => {}} />
      </>,
    );
    expect(ripple(s.getByLabelText('Food'))).toBeDefined();
    expect(ripple(s.getByLabelText('12 months'))).toBeDefined();
  });

  it('iOS: the chip dims while the finger is down', async () => {
    setOS('ios');
    const s = await wrap(<Chip label="Food" onPress={() => {}} />);
    expect(ripple(s.getByLabelText('Food'))).toBeUndefined();
    expect(flat(s.getByLabelText('Food')).opacity).toBeUndefined();
    await touchDown(s.getByLabelText('Food'));
    expect(flat(s.getByLabelText('Food')).opacity).toBe(PRESSED_OPACITY);
  });

  it('a read-only chip shows no ripple', async () => {
    setOS('android');
    const s = await wrap(
      <ReadOnlyScope.Provider value>
        <Chip label="Food" onPress={() => {}} />
      </ReadOnlyScope.Provider>,
    );
    expect(ripple(s.getByLabelText('Food'))).toBeUndefined();
  });
});

describe('SegmentedControl press feedback', () => {
  const options = [
    { key: 'grow', label: 'Grow' },
    { key: 'decide', label: 'Decide' },
  ] as const;

  it('Android: every segment has a native ripple', async () => {
    setOS('android');
    const s = await wrap(<SegmentedControl options={options} value="grow" onChange={() => {}} accessibilityLabel="Mode" />);
    expect(ripple(s.getByLabelText('Grow'))).toBeDefined();
    expect(ripple(s.getByLabelText('Decide'))).toBeDefined();
  });

  it('iOS: a segment dims while the finger is down', async () => {
    setOS('ios');
    const s = await wrap(<SegmentedControl options={options} value="grow" onChange={() => {}} accessibilityLabel="Mode" />);
    expect(ripple(s.getByLabelText('Decide'))).toBeUndefined();
    await touchDown(s.getByLabelText('Decide'));
    expect(flat(s.getByLabelText('Decide')).opacity).toBe(PRESSED_OPACITY);
  });
});
