// 06.1-62 (H-1, CB-5 / CB-6): the stepper frame's Back chevron, Next pill and "See the answer now" link show a press at once.
import React from 'react';
import { Platform, StyleSheet, Text as RNText } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import en from '@/i18n/locales/en';
import { PRESSED_OPACITY } from '@/theme/layout';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { wrap } from '@/test/stepProps';
import { StepFrame } from '../StepFrame';

jest.setTimeout(30000);

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return { useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]) };
});
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useMotion: () => ({ reduced: true, duration: () => 0, easing: undefined }),
}));

const originalOS = Platform.OS;
const setOS = (os: 'ios' | 'android') => Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
afterEach(() => setOS(originalOS as 'ios' | 'android'));

type Host = { props: Record<string, unknown> };
const ripple = (n: Host) => n.props.nativeForegroundAndroid;
const flat = (n: Host) => (StyleSheet.flatten(n.props.style as never) ?? {}) as Record<string, unknown>;
const noop = (): void => undefined;

function frame(over: Partial<React.ComponentProps<typeof StepFrame>> = {}) {
  return wrap(
    <StepFrame step={2} title="Price" why="So the answer uses it." meta="Laptop · $1,200" onBack={noop} onJump={noop} onNext={noop} onSeeNow={noop} {...over}>
      <RNText>{'body'}</RNText>
    </StepFrame>,
  );
}

describe('StepFrame press feedback (06.1-62)', () => {
  it('the Back chevron keeps a hitSlop of at least 4 above and below (its own 8 dp)', async () => {
    await frame();
    const slop = screen.getByTestId('step-back').props.hitSlop as number | { top: number; bottom: number };
    const top = typeof slop === 'number' ? slop : slop.top;
    const bottom = typeof slop === 'number' ? slop : slop.bottom;
    expect(top + bottom).toBeGreaterThanOrEqual(4);
    expect(top).toBeGreaterThanOrEqual(LINK_HIT_SLOP.top);
  });

  it('Android: the Next pill, the Back chevron and the see-now link ripple', async () => {
    setOS('android');
    await frame();
    expect(ripple(screen.getByRole('button', { name: en.decide.screens.common.next }))).toBeDefined();
    expect(ripple(screen.getByTestId('step-back'))).toBeDefined();
    expect(ripple(screen.getByTestId('see-now'))).toBeDefined();
    expect(screen.getByTestId('see-now').props.hitSlop).toEqual(LINK_HIT_SLOP);
  });

  it('iOS: no ripple; Back still goes back and a disabled Next stays dimmed and inert', async () => {
    setOS('ios');
    const onBack = jest.fn();
    const onNext = jest.fn();
    await frame({ onBack, onNext, nextDisabled: true });
    expect(ripple(screen.getByTestId('step-back'))).toBeUndefined();
    await fireEvent.press(screen.getByTestId('step-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    const next = screen.getByRole('button', { name: en.decide.screens.common.next });
    expect(flat(next).opacity).toBe(0.5);
    expect(flat(next).opacity).not.toBe(PRESSED_OPACITY);
    await fireEvent.press(next);
    expect(onNext).not.toHaveBeenCalled();
  });
});
