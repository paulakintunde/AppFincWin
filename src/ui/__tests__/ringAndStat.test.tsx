/**
 * 06.2-09: the shared ProgressRing (D-24: 36 and 124, fills once per session, D-17 no sweep under Reduce Motion, D-19 no
 * quarter-mark events) and StatTile / StatTileRow (D-24: about 88 tall, two across, one spoken element, fits at every
 * MATRIX point).
 */
import React from 'react';
import { StyleSheet, Text as RNText } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { colors } from '@/theme/tokens';
import { DURATION } from '@/theme/motion';
import { step } from '@/theme/layout';
import { MATRIX, expectFits, matrixName } from '@/test/textFitMatrix';
import { resetSessionMotion } from '../motion/useOncePerSession';
import { ProgressRing, RING_STROKE, ringGeometry, ringSweeps } from '../ProgressRing';
import { StatTile, StatTileRow, statTileLabel } from '../StatTile';
import * as haptics from '../haptics';

jest.setTimeout(60000);

// withTiming wrapped in a spy so the tests can see whether a sweep was started, and with what timing.
const mockWithTiming = jest.fn();
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    withTiming: (...args: unknown[]) => {
      mockWithTiming(...args);
      return actual.withTiming(...args);
    },
  };
});

let mockReduced = false;
jest.mock('@/theme/motion', () => {
  const actual = jest.requireActual('@/theme/motion');
  return {
    ...actual,
    useMotion: () => ({
      reduced: mockReduced,
      duration: (ms: number) => (mockReduced ? 0 : ms),
      easing: actual.EASING,
      fade: (ms: number) => (mockReduced ? actual.DURATION.press : ms),
    }),
  };
});

let mockWidth = 402;
let mockScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 874, scale: 2, fontScale: mockScale }),
}));

beforeEach(() => {
  mockReduced = false;
  mockWidth = 402;
  mockScale = 1;
  resetSessionMotion();
  mockWithTiming.mockClear();
});

const hidden = { includeHiddenElements: true };
const setup = (ui: React.ReactElement, scale = 1) =>
  render(
    <ThemeProvider>
      <FontScaleProvider value={scale}>{ui}</FontScaleProvider>
    </ThemeProvider>,
  );
const flat = (el: { props: { style?: unknown } }) => (StyleSheet.flatten(el.props.style as never) ?? {}) as Record<string, unknown>;
const argb = (hex: string) => parseInt(`FF${hex.slice(1)}`, 16);

/** The arc's first-frame dash offset as a fraction of the circumference still empty (1 = empty, 0 = full). */
function arcEmptyFraction(size: 36 | 124): number {
  const arc = screen.getByTestId('progress-ring-arc', hidden);
  // The first frame the arc is drawn with (Jest does not run the UI-thread animation).
  const offset = Number(arc.props.strokeDashoffset);
  return offset / ringGeometry(size).circumference;
}

describe('ProgressRing (06.2 D-24)', () => {
  it('size 36 uses stroke 4 and size 124 uses stroke 10', async () => {
    expect(RING_STROKE).toEqual({ 36: 4, 124: 10 });
    await setup(<ProgressRing percent={40} accessibilityLabel="40% of $1,000" />);
    expect(screen.getByTestId('progress-ring-arc', hidden).props.strokeWidth).toBe(4);
    expect(screen.getByTestId('progress-ring-svg', hidden).props.width).toBe(36);
    await setup(<ProgressRing percent={40} size={124} accessibilityLabel="40% of $1,000" />);
    expect(screen.getByTestId('progress-ring-arc', hidden).props.strokeWidth).toBe(10);
    expect(screen.getByTestId('progress-ring-svg', hidden).props.width).toBe(124);
  });

  it('track is line2 and the arc defaults to the accent; a colour prop replaces it', async () => {
    await setup(<ProgressRing percent={40} accessibilityLabel="ring" />);
    const track = JSON.stringify(screen.getByTestId('progress-ring-track', hidden).props.stroke);
    expect(track).toContain(String(argb(colors.line2)));
    const accentArc = JSON.stringify(screen.getByTestId('progress-ring-arc', hidden).props.stroke);
    expect(accentArc).not.toContain(String(argb(colors.line2)));
    await setup(<ProgressRing percent={40} color={colors.ink} accessibilityLabel="ring" />);
    expect(JSON.stringify(screen.getByTestId('progress-ring-arc', hidden).props.stroke)).toContain(String(argb(colors.ink)));
  });

  it('is one progressbar with min/max/now (clamped) and the caller label', async () => {
    await setup(<ProgressRing percent={140} accessibilityLabel="100% of $1,000" />);
    const ring = screen.getByRole('progressbar');
    expect(ring.props.accessibilityLabel).toBe('100% of $1,000');
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
    await setup(<ProgressRing percent={-5} accessibilityLabel="0% of $1,000" />);
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 0 });
  });

  it('ringSweeps: only a first-seen session key with motion allowed sweeps', () => {
    expect(ringSweeps({ sessionKey: 'g', firstView: true, reduced: false })).toBe(true);
    expect(ringSweeps({ sessionKey: 'g', firstView: false, reduced: false })).toBe(false);
    expect(ringSweeps({ sessionKey: 'g', firstView: true, reduced: true })).toBe(false);
    expect(ringSweeps({ firstView: true, reduced: false })).toBe(false);
  });

  it('first view per session starts empty and sweeps to the value over DURATION.fill; a later mount is drawn at once', async () => {
    await setup(<ProgressRing percent={50} sessionKey="goal.a" accessibilityLabel="50% of $1,000" />);
    expect(arcEmptyFraction(36)).toBeCloseTo(1, 3);
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
    expect(mockWithTiming.mock.calls[0]![0]).toBe(50);
    expect(mockWithTiming.mock.calls[0]![1]).toMatchObject({ duration: DURATION.fill });
    mockWithTiming.mockClear();
    await setup(<ProgressRing percent={50} sessionKey="goal.a" accessibilityLabel="50% of $1,000" />);
    expect(arcEmptyFraction(36)).toBeCloseTo(0.5, 3);
    expect(mockWithTiming).not.toHaveBeenCalled();
  });

  it('with no session key the ring is drawn at its value at once', async () => {
    await setup(<ProgressRing percent={75} accessibilityLabel="75% of $1,000" />);
    expect(arcEmptyFraction(36)).toBeCloseTo(0.25, 3);
  });

  it('D-17: under Reduce Motion a first-seen key is drawn at its value with no sweep', async () => {
    mockReduced = true;
    await setup(<ProgressRing percent={30} size={124} sessionKey="goal.b" accessibilityLabel="30% of $1,000" />);
    expect(arcEmptyFraction(124)).toBeCloseTo(0.7, 3);
  });

  it('D-19: no haptic at quarter marks or on reaching 100%; 100% closes the ring', async () => {
    const spies = (['hapticTap', 'hapticWarn', 'hapticMilestone', 'hapticFailed', 'hapticTick'] as const).map((k) =>
      jest.spyOn(haptics, k),
    );
    const view = await setup(<ProgressRing percent={25} accessibilityLabel="ring" />);
    for (const p of [50, 75, 100]) {
      await view.rerender(
        <ThemeProvider>
          <FontScaleProvider value={1}>
            <ProgressRing percent={p} accessibilityLabel="ring" />
          </FontScaleProvider>
        </ThemeProvider>,
      );
    }
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ min: 0, max: 100, now: 100 });
    expect(mockWithTiming).not.toHaveBeenCalled();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });

  it('at 100% the ring is closed (no gap left in the arc)', async () => {
    await setup(<ProgressRing percent={100} size={124} accessibilityLabel="100% of $1,000" />);
    expect(arcEmptyFraction(124)).toBeCloseTo(0, 3);
  });

  it('renders children centred inside the ring', async () => {
    await setup(
      <ProgressRing percent={60} size={124} accessibilityLabel="60% of $1,000">
        <RNText>{'60%'}</RNText>
      </ProgressRing>,
    );
    expect(screen.getByText('60%')).toBeTruthy();
    const box = flat(screen.getByRole('progressbar'));
    expect(box).toMatchObject({ width: 124, height: 124, alignItems: 'center', justifyContent: 'center' });
  });
});

describe('StatTile (06.2 D-24)', () => {
  it('is a white card about 88 tall with card padding, no fixed height', async () => {
    await setup(<StatTile label="Saved" value="$1,240" />);
    const s = flat(screen.getByTestId('stat-tile'));
    expect(s.minHeight).toBe(88);
    expect(s).not.toHaveProperty('height');
    expect(s.padding).toBe(step.card);
    expect(s.backgroundColor).toBe(colors.surface);
  });

  it('label is muted over a tabular value', async () => {
    await setup(<StatTile label="Saved" value="$1,240" />);
    expect(flat(screen.getByTestId('stat-tile-label', hidden)).color).toBe(colors.inkMuted);
    expect(flat(screen.getByTestId('stat-tile-value', hidden)).fontVariant).toEqual(['tabular-nums']);
  });

  it('is one accessible element reading label, value[, status word]', async () => {
    expect(statTileLabel('Saved', '$1,240')).toBe('Saved, $1,240');
    await setup(<StatTile label="Saved" value="$1,240" status={<RNText>{'On track'}</RNText>} statusText="On track" />);
    expect(screen.getByLabelText('Saved, $1,240, On track')).toBeTruthy();
    expect(screen.getByText('On track', hidden)).toBeTruthy();
  });

  it('StatTileRow sets two tiles side by side with a tight gap at 402 and 1.0x', async () => {
    await setup(
      <StatTileRow>
        <StatTile label="Saved" value="$1,240" />
        <StatTile label="Left" value="$760" />
      </StatTileRow>,
    );
    const row = flat(screen.getByTestId('stat-tile-row'));
    expect(row).toMatchObject({ flexDirection: 'row', gap: step.tight });
    expect(screen.getAllByTestId('stat-tile-cell')).toHaveLength(2);
    expect(flat(screen.getAllByTestId('stat-tile-cell')[0]!)).toMatchObject({ flex: 1 });
  });

  it('StatTileRow stacks one per line at 320 and 2.0x', async () => {
    mockWidth = 320;
    mockScale = 2;
    await setup(
      <StatTileRow>
        <StatTile label="Saved" value="$1,240" />
        <StatTile label="Left" value="$760" />
      </StatTileRow>,
      2,
    );
    expect(flat(screen.getByTestId('stat-tile-row')).flexDirection).toBe('column');
  });

  for (const m of MATRIX) {
    it(`fits at ${matrixName(m)}`, async () => {
      mockWidth = m.width;
      mockScale = m.scale;
      await setup(
        <StatTileRow>
          <StatTile label="Saved this month" value="$12,345.67" statusText="On track" status={<RNText>{'On track'}</RNText>} />
          <StatTile label="Still to save" value="$4,000.00" />
        </StatTileRow>,
        m.scale,
      );
      expectFits();
    });
  }
});
