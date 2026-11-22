// 08.1-24 (owner Q1 A, Q4 A, 2026-11-21): the caution sign before the verdict word. Two slow breaths (about 12% bigger, 0.6 s each
// way) once the card has risen in, then still. No animation starts until Reduce Motion is known to be off; turning it on mid-breath
// cancels; the saved view (still) never moves. 06.2 D-01: finite withSequence of withTiming, never withRepeat / withSpring.
import React from 'react';
import { Text as RNText } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { stateColors } from '@/theme/tokens';
import { BREATH_MS, BREATH_PEAK, BREATHS, CautionSign, breathSteps } from '../CautionSign';

jest.setTimeout(20000);

const mockWithTiming = jest.fn();
const mockWithSequence = jest.fn();
const mockCancel = jest.fn();
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    withTiming: (...a: unknown[]) => {
      mockWithTiming(...a);
      return actual.withTiming(...a);
    },
    withSequence: (...a: unknown[]) => {
      mockWithSequence(...a);
      return actual.withSequence(...a);
    },
    cancelAnimation: (...a: unknown[]) => {
      mockCancel(...a);
      return actual.cancelAnimation(...a);
    },
  };
});

/** The reduce-motion value the sign sees: null (not yet known), true or false; fire() changes it live. */
let mockKnown: boolean | null = false;
let mockSetKnown: ((v: boolean | null) => void) | null = null;
jest.mock('@/theme/motion', () => {
  const actual = jest.requireActual('@/theme/motion');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react');
  return {
    ...actual,
    useReduceMotionKnown: () => {
      const [v, setV] = R.useState(mockKnown);
      mockSetKnown = setV;
      return v;
    },
  };
});

const opts = { includeHiddenElements: true };

const setup = (props: Partial<React.ComponentProps<typeof CautionSign>> = {}) =>
  render(
    <ThemeProvider>
      <CautionSign text="· dips below $0 on Jun 14" animateKey="2027-06-14" {...props}>
        <RNText>{'Fits'}</RNText>
      </CautionSign>
    </ThemeProvider>,
  );

const scaleOf = () => {
  const s = getAnimatedStyle(screen.getByTestId('answer-caution-icon', opts) as never) as { transform?: { scale?: number }[] };
  return s.transform?.[0]?.scale;
};

beforeEach(() => {
  mockKnown = false;
  mockSetKnown = null;
  mockWithTiming.mockClear();
  mockWithSequence.mockClear();
  mockCancel.mockClear();
});

describe('breathSteps (Q4 A)', () => {
  it('is two breaths, 12% bigger, 600 ms each way', () => {
    expect(BREATHS).toBe(2);
    expect(BREATH_PEAK).toBeCloseTo(1.12);
    expect(BREATH_MS).toBe(600);
  });

  it('alternates peak and rest, and ends at rest', () => {
    const steps = breathSteps(BREATHS, false);
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.to)).toEqual([BREATH_PEAK, 1, BREATH_PEAK, 1]);
    expect(steps.every((s) => s.ms === BREATH_MS)).toBe(true);
    expect(steps.at(-1)?.to).toBe(1);
    expect(steps.reduce((n, s) => n + s.ms, 0)).toBe(2400);
  });

  it('is empty with Reduce Motion on, and for no breaths', () => {
    expect(breathSteps(BREATHS, true)).toEqual([]);
    expect(breathSteps(0, false)).toEqual([]);
  });
});

describe('CautionSign', () => {
  it('draws the caution icon (decorative) before the badge and the words in the tight colour', async () => {
    await setup();
    const row = screen.getByTestId('answer-caution', opts);
    expect(row).toBeTruthy();
    const glyph = screen.getByTestId('glyph-caution', opts);
    expect(glyph.props.accessible).toBe(false);
    expect(glyph.props.importantForAccessibility).toBe('no-hide-descendants');
    const words = screen.getByTestId('answer-caution-words', opts);
    expect(words.props.children).toBe('· dips below $0 on Jun 14');
    const color = ([] as { color?: string }[]).concat(words.props.style).find((s) => s && s.color)?.color;
    expect(color).toBe(stateColors.tight.color);
    // order: icon, badge word, then the caution words
    const texts = screen.getAllByText(/Fits|dips/, opts).map((n) => n.props.children);
    expect(texts).toEqual(['Fits', '· dips below $0 on Jun 14']);
  });

  it('breathes once Reduce Motion is known off: one finite sequence of four withTiming steps', async () => {
    await setup();
    expect(mockWithSequence).toHaveBeenCalledTimes(1);
    expect(mockWithTiming).toHaveBeenCalledTimes(4);
    expect(mockWithTiming.mock.calls.map((c) => c[0])).toEqual([BREATH_PEAK, 1, BREATH_PEAK, 1]);
    expect(mockWithTiming.mock.calls.every((c) => (c[1] as { duration: number }).duration === BREATH_MS)).toBe(true);
  });

  it('never animates with Reduce Motion on, and stays at scale 1', async () => {
    mockKnown = true;
    await setup();
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(mockWithSequence).not.toHaveBeenCalled();
    expect(scaleOf()).toBe(1);
  });

  it('starts nothing while Reduce Motion is unknown, then breathes once it is known off', async () => {
    mockKnown = null;
    await setup();
    expect(mockWithTiming).not.toHaveBeenCalled();
    await act(() => {
      mockSetKnown?.(false);
    });
    expect(mockWithSequence).toHaveBeenCalledTimes(1);
  });

  it('does not start when Reduce Motion turns out on', async () => {
    mockKnown = null;
    await setup();
    await act(() => {
      mockSetKnown?.(true);
    });
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(scaleOf()).toBe(1);
  });

  it('cancels and rests at 1 when Reduce Motion turns on mid-breath', async () => {
    await setup();
    expect(mockWithSequence).toHaveBeenCalledTimes(1);
    await act(() => {
      mockSetKnown?.(true);
    });
    expect(mockCancel).toHaveBeenCalled();
    expect(scaleOf()).toBe(1);
  });

  it('never animates when still (the saved view, Q3 A)', async () => {
    await setup({ still: true });
    expect(mockWithTiming).not.toHaveBeenCalled();
    expect(scaleOf()).toBe(1);
  });

  it('breathes again only when the dip date changes', async () => {
    const view = await setup();
    expect(mockWithSequence).toHaveBeenCalledTimes(1);
    const again = (key: string) => (
      <ThemeProvider>
        <CautionSign text="· dips below $0 on Jun 14" animateKey={key}>
          <RNText>{'Fits'}</RNText>
        </CautionSign>
      </ThemeProvider>
    );
    await view.rerender(again('2027-06-14'));
    expect(mockWithSequence).toHaveBeenCalledTimes(1);
    await view.rerender(again('2027-07-01'));
    expect(mockWithSequence).toHaveBeenCalledTimes(2);
  });
});
