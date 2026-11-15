/**
 * 06.2-20 (Specifics: Grow; D-12, D-15, D-19, D-20): goal rows and the safety-net card carry 36 ProgressRing tiles that
 * fill on the first view per session only; the reached moment plays the goal-reached icon once with one Success haptic,
 * and under Reduce Motion shows the icon's last frame. Nothing fires at 25/50/75%, and the safety net has no Success haptic.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { minorUnits } from '@/engine/money';
import type { GoalPoint, SafetyNetPoint } from '@/features/grow/connect';
import { resetSessionMotion } from '@/ui/motion/useOncePerSession';
import { resetAnimatedIcons } from '@/ui/icons/AnimatedIcon';
import { ringGeometry } from '@/ui/ProgressRing';
import { GoalRow, goalIconName, type GoalRowMoney } from '../home/GoalRow';
import { SafetyNetCard } from '../home/SafetyNetCard';
import { ReachedMoment } from '../goals/ReachedMoment';

jest.setTimeout(30000);

jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));

const mockMilestone = jest.fn();
const mockOtherHaptic = jest.fn();
jest.mock('@/ui/haptics', () => ({
  hapticMilestone: () => mockMilestone(),
  hapticSuccess: () => mockOtherHaptic('success'),
  hapticTap: () => mockOtherHaptic('tap'),
  hapticLight: () => mockOtherHaptic('tap'),
  hapticWarn: () => mockOtherHaptic('warn'),
  hapticWarning: () => mockOtherHaptic('warn'),
  hapticTick: () => mockOtherHaptic('tick'),
  hapticSelection: () => mockOtherHaptic('tick'),
  hapticMedium: () => mockOtherHaptic('tick'),
  hapticFailed: () => mockOtherHaptic('failed'),
}));

let mockReduced = false;
jest.mock('@/theme/motion', () => {
  const actual = jest.requireActual('@/theme/motion');
  return {
    ...actual,
    useReduceMotion: () => mockReduced,
    useMotion: () => ({
      reduced: mockReduced,
      duration: (ms: number) => (mockReduced ? 0 : ms),
      easing: actual.EASING,
      fade: (ms: number) => (mockReduced ? actual.DURATION.press : ms),
    }),
  };
});

const hidden = { includeHiddenElements: true };

const money: GoalRowMoney = {
  amount: (m) => `$${(m / 100).toLocaleString('en-US')}`,
  spoken: (m) => `${m / 100} dollars`,
  monthYear: () => 'Oct 2028',
  monthYearLong: () => 'October 2028',
};

function goal(over: Partial<GoalPoint> = {}): GoalPoint {
  return {
    id: 'g1',
    name: 'Trip to Lisbon',
    kind: 'pot',
    target: minorUnits(180_000),
    saved: minorUnits(90_000),
    monthlyAmount: minorUnits(5_000),
    readyBy: null,
    locked: false,
    upFrontOnly: false,
    linkedCheckId: null,
    accountId: null,
    bucket: false,
    done: false,
    ...over,
  };
}

const NET: SafetyNetPoint = {
  goalId: 'net',
  size: minorUnits(200_000),
  saved: minorUnits(50_000),
  protect: true,
  locked: true,
  accountId: null,
  confirmedAt: '2026-11-01',
};

const setup = (ui: React.ReactElement) =>
  render(
    <ThemeProvider>
      <FontScaleProvider value={1}>{ui}</FontScaleProvider>
    </ThemeProvider>,
  );

/** The first-frame arc offset as a fraction of the circumference still empty (1 = empty, 0 = drawn at its value). */
function arcEmpty(testID: string): number {
  const ring = screen.getByTestId(testID, hidden);
  const arc = within(ring).queryAllByTestId('progress-ring-arc', hidden)[0]!;
  return Number(arc.props.strokeDashoffset) / ringGeometry(36).circumference;
}

beforeEach(() => {
  mockReduced = false;
  mockMilestone.mockClear();
  mockOtherHaptic.mockClear();
  resetSessionMotion();
  resetAnimatedIcons();
});

describe('goal row (06.2-20 Task 1)', () => {
  it('a goal with a target leads with a 36 ring holding its icon; the thin bar is gone; the row is 64 tall', async () => {
    await setup(<GoalRow goal={goal()} reachesOn="2028-10-01" money={money} icon="transport" />);
    const ring = screen.getByTestId('grow-goal-ring-g1', hidden);
    expect(StyleSheet.flatten(ring.props.style)).toMatchObject({ width: 36, height: 36 });
    expect(ring.props.accessibilityRole).toBe('progressbar');
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50 });
    expect(ring.props.accessibilityLabel).toBe('50% of $1,800');
    expect(within(ring).queryAllByTestId('glyph-transport', hidden).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('grow-progress', hidden)).toBeNull();
    expect(StyleSheet.flatten(screen.getByTestId('grow-goal-row-g1', hidden).props.style)).toMatchObject({ minHeight: 64 });
  });

  it('the row spoken label is unchanged: every figure, read from the row', async () => {
    await setup(<GoalRow goal={goal()} reachesOn="2028-10-01" money={money} />);
    const row = screen.getByRole('button');
    expect(row.props.accessibilityLabel).toContain('Trip to Lisbon');
    expect(row.props.accessibilityLabel).toContain('50');
  });

  it('the ring fills on the first view per session only (sessionKey grow.goal.<id>)', async () => {
    const first = await setup(<GoalRow goal={goal()} reachesOn={null} money={money} />);
    expect(arcEmpty('grow-goal-ring-g1')).toBeCloseTo(1, 5); // sweeps from empty
    await first.unmount();
    await setup(<GoalRow goal={goal()} reachesOn={null} money={money} />);
    expect(arcEmpty('grow-goal-ring-g1')).toBeCloseTo(0.5, 5); // drawn at its value
  });

  it('Reduce Motion: the ring is drawn at its value on its first view', async () => {
    mockReduced = true;
    await setup(<GoalRow goal={goal()} reachesOn={null} money={money} />);
    expect(arcEmpty('grow-goal-ring-g1')).toBeCloseTo(0.5, 5);
  });

  it('a goal without a target keeps a 36 icon tile and no ring', async () => {
    await setup(<GoalRow goal={goal({ target: null, linkedCheckId: 'c1' })} reachesOn={null} money={money} />);
    expect(screen.queryByTestId('grow-goal-ring-g1', hidden)).toBeNull();
    const tile = screen.getByTestId('grow-goal-tile-g1', hidden);
    expect(StyleSheet.flatten(tile.props.style)).toMatchObject({ width: 36, height: 36 });
    expect(within(tile).queryAllByTestId('glyph-checkBuy', hidden).length).toBeGreaterThan(0);
  });

  it('the goal icons map to kit icons; phone has none and keeps the Grow glyph', async () => {
    expect(goalIconName('checkbuy')).toBe('checkBuy');
    expect(goalIconName('calendar')).toBe('calendar');
    expect(goalIconName('phone')).toBeNull();
    await setup(<GoalRow goal={goal()} reachesOn={null} money={money} icon="phone" />);
    const ring = screen.getByTestId('grow-goal-ring-g1', hidden);
    expect(within(ring).queryAllByTestId('grow-glyph-phone', hidden).length).toBeGreaterThan(0);
  });

  it('D-19: nothing fires at 25/50/75%, and a full goal row closes its ring with no haptic and no icon', async () => {
    for (const saved of [45_000, 90_000, 135_000, 180_000]) {
      const r = await setup(<GoalRow goal={goal({ id: `q${saved}`, saved: minorUnits(saved) })} reachesOn={null} money={money} />);
      await r.unmount();
    }
    expect(mockMilestone).not.toHaveBeenCalled();
    expect(mockOtherHaptic).not.toHaveBeenCalled();
    expect(screen.queryByTestId('goal-reached-icon', hidden)).toBeNull();
  });

  it('D-12: the to-confirm count uses the shared StatusBadge', async () => {
    await setup(<GoalRow goal={goal()} reachesOn={null} money={money} pending={2} />);
    expect(screen.getByTestId('status-badge-pending', hidden)).toBeTruthy();
  });
});

describe('safety-net card (06.2-20 Task 1)', () => {
  it('shows the padlock as a 36 tile, the progress as a 36 ring, and the Locked badge as StatusBadge safetyNet', async () => {
    await setup(<SafetyNetCard net={NET} money={money} />);
    const tile = screen.getByTestId('grow-safety-net-tile', hidden);
    expect(StyleSheet.flatten(tile.props.style)).toMatchObject({ width: 36, height: 36 });
    expect(within(tile).queryAllByTestId('glyph-stateSafetyNet', hidden).length).toBeGreaterThan(0);
    const ring = screen.getByTestId('grow-safety-net-ring', hidden);
    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 25 });
    expect(ring.props.accessibilityLabel).toBe('25% of $2,000');
    const badge = screen.getByTestId('status-badge-safetyNet', hidden);
    expect(badge.props.accessibilityLabel).toBe('Locked, no Decide answer spends it');
    expect(screen.getByText('Locked')).toBeTruthy();
  });

  it('fills once per session (sessionKey grow.safetyNet)', async () => {
    const first = await setup(<SafetyNetCard net={NET} money={money} />);
    expect(arcEmpty('grow-safety-net-ring')).toBeCloseTo(1, 5);
    await first.unmount();
    await setup(<SafetyNetCard net={NET} money={money} />);
    expect(arcEmpty('grow-safety-net-ring')).toBeCloseTo(0.75, 5);
  });

  it('no size yet: no ring; a full net gives no Success haptic (D-20)', async () => {
    const r = await setup(<SafetyNetCard net={{ ...NET, size: null }} money={money} />);
    expect(screen.queryByTestId('grow-safety-net-ring', hidden)).toBeNull();
    await r.unmount();
    await setup(<SafetyNetCard net={{ ...NET, saved: minorUnits(200_000) }} money={money} />);
    expect(mockMilestone).not.toHaveBeenCalled();
    expect(mockOtherHaptic).not.toHaveBeenCalled();
  });
});

describe('reached moment (06.2-20 Task 2, D-19, D-20)', () => {
  it('plays the goal-reached icon with the Reached badge and fires one Success haptic on mount', async () => {
    const r = await setup(<ReachedMoment />);
    expect(screen.getByTestId('goal-reached', hidden)).toBeTruthy();
    expect(screen.getByTestId('goal-reached-icon', hidden)).toBeTruthy();
    expect(screen.getByTestId('status-badge-reached', hidden)).toBeTruthy();
    expect(screen.getByText('Reached')).toBeTruthy();
    expect(screen.queryByTestId('goal-reached-tick', hidden)).toBeNull();
    expect(mockMilestone).toHaveBeenCalledTimes(1);
    await r.rerender(
      <ThemeProvider>
        <FontScaleProvider value={1}>
          <ReachedMoment />
        </FontScaleProvider>
      </ThemeProvider>,
    );
    expect(mockMilestone).toHaveBeenCalledTimes(1);
    expect(mockOtherHaptic).not.toHaveBeenCalled();
  });

  it('Reduce Motion: the icon shows its last frame (the still) and the haptic still fires once', async () => {
    mockReduced = true;
    await setup(<ReachedMoment />);
    expect(screen.getByTestId('goal-reached-icon-still', hidden)).toBeTruthy();
    expect(screen.queryByTestId('goal-reached-icon-lottie', hidden)).toBeNull();
    expect(mockMilestone).toHaveBeenCalledTimes(1);
  });
});
