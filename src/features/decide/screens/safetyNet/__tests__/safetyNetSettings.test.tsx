// 06.1-18 (D51, D52, N07, N07U, D-20, D-17): the safety-net settings screen. The confirm gates every unlock; locking is at once;
// "Unlock for answers" is an outline control; the padlock respects Reduce Motion; the warning haptic is for unlock only.
import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { wrap } from '@/test/stepProps';
import { LockGlyphAnimated } from '../../motion/LockGlyphAnimated';
import { SafetyNetSettings } from '../SafetyNetSettings';
import { setup } from '@/i18n/locales/decideScreens/setup';
import { setupOthers } from '@/i18n/locales/decideScreens/setupOthers';

jest.setTimeout(30000);

const mockMutate = jest.fn();
const mockWarning = jest.fn();
const mockWithTiming = jest.fn((to: number, _config?: unknown) => to);
let mockReduced = false;
let mockRows: unknown[] = [];

jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => ({ data: mockRows }) }));
jest.mock('@/features/grow/goals/useGoalsRead', () => ({
  useGoalsRead: () => ({ status: 'ready', model: { safetyNet: { size: 230000, saved: 130000 } }, refetch: jest.fn() }),
}));
jest.mock('@/features/decide/screens/past/data/usePastDecisions', () => ({ usePastContext: () => ({ userId: 'u1', householdId: 'h1' }) }));
jest.mock('@/features/grow/home/useGoalMoney', () => ({ useGoalMoney: () => ({ amount: (n: number) => `$${n / 100}` }) }));
jest.mock('@/ui/haptics', () => ({ hapticWarning: () => mockWarning(), hapticLight: jest.fn() }));
jest.mock('@/shell/navigation/pushOnce', () => ({ pushOnce: jest.fn() }));
jest.mock('@/shell/screen/DetailScreen', () => {
  const { Text, View } = require('react-native');
  return {
    DetailScreen: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <View>
        <Text testID="detail-title">{title}</Text>
        {children}
      </View>
    ),
  };
});
jest.mock('@/ui/Sheet', () => {
  const { View } = require('react-native');
  return {
    Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null),
    SheetScroll: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});
jest.mock('@/features/decide/screens/firstAnswer/FirstAnswerGate', () => ({ NetQuestionSheet: () => null }));
jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useReduceMotion: () => mockReduced,
}));
jest.mock('@/ui/ProgressBar', () => ({ ProgressBar: () => null }));
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { ...actual, withTiming: (to: number, config?: unknown) => mockWithTiming(to, config) };
});

const HIDDEN = { includeHiddenElements: true } as const;
const NET_PORT = { mutate: (a: unknown) => mockMutate(a) as string | null };
const ANSWER = jest.fn();
const ui = () => <SafetyNetSettings net={NET_PORT as never} answer={ANSWER as never} />;

const net = (over: Record<string, unknown> = {}) => ({ id: 'net', name: 'Safety net', household_id: 'h1', is_safety_net: true, deleted_at: null, version: 3, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  mockReduced = false;
  mockRows = [net()];
});

describe('SafetyNetSettings', () => {
  it('locked: shows the word, the amount, and an outline unlock control that is not the accent pill', async () => {
    await wrap(ui());
    expect(screen.getByTestId('net-word').props.children).toBe('Locked');
    expect(screen.getByLabelText('$1300 in it now')).toBeTruthy();
    const style = [screen.getByTestId('net-unlock-button').props.style].flat(2).reduce((a, s) => ({ ...a, ...(s ?? {}) }), {} as Record<string, unknown>);
    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.backgroundColor).toBeUndefined();
  });

  it('unlocking needs the confirm: nothing is written until Unlock', async () => {
    await wrap(ui());
    await fireEvent.press(screen.getByText('Unlock for answers'));
    expect(screen.getByText('Let answers use your safety net?')).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockWarning).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Unlock'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toMatchObject({ on: true, ownerId: 'u1' });
    expect(mockWarning).toHaveBeenCalledTimes(1);
  });

  it('Keep it locked writes nothing and makes no haptic', async () => {
    await wrap(ui());
    await fireEvent.press(screen.getByText('Unlock for answers'));
    await fireEvent.press(screen.getByText('Keep it locked'));
    expect(mockMutate).not.toHaveBeenCalled();
    expect(mockWarning).not.toHaveBeenCalled();
    expect(screen.queryByText('Let answers use your safety net?')).toBeNull();
  });

  it('the switch turned off also asks first', async () => {
    await wrap(ui());
    await fireEvent.press(screen.getByRole('switch'));
    expect(screen.getByText('Let answers use your safety net?')).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('unlocked: the switch locks at once with no confirm and no warning haptic', async () => {
    mockRows = [net({ decide_may_use: true })];
    await wrap(ui());
    expect(screen.getByTestId('net-word').props.children).toBe('Unlocked');
    await fireEvent.press(screen.getByRole('switch'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toMatchObject({ on: false });
    expect(screen.queryByText('Let answers use your safety net?')).toBeNull();
    expect(mockWarning).not.toHaveBeenCalled();
  });

  it('unlocked: Lock it again locks at once', async () => {
    mockRows = [net({ decide_may_use: true })];
    await wrap(ui());
    await fireEvent.press(screen.getByText('Lock it again'));
    expect(mockMutate.mock.calls[0][0]).toMatchObject({ on: false });
  });

  it('no flagged goal: the empty state offers an amount', async () => {
    mockRows = [];
    await wrap(ui());
    expect(screen.getByText('No safety net yet')).toBeTruthy();
    expect(screen.getByText('Set an amount')).toBeTruthy();
  });
});

describe('SafetyNetSettings layout (06.1-58 A-SN-1, DN-11)', () => {
  it('locked draws the CLOSED padlock; unlocked draws the OPEN one', async () => {
    await wrap(ui());
    expect(screen.getByTestId('net-lock-closed', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('net-lock-open', HIDDEN)).toBeNull();
    mockRows = [net({ decide_may_use: true })];
    await wrap(ui());
    expect(screen.getByTestId('net-lock-open', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('net-lock-closed', HIDDEN)).toBeNull();
  });

  it('the amount is said once, as the display figure, with a two-line legend', async () => {
    await wrap(ui());
    expect(screen.getAllByText(/\$1300/)).toHaveLength(1);
    expect(screen.getByTestId('net-legend-in')).toHaveTextContent('In it now');
    expect(screen.getByTestId('net-legend-goal')).toHaveTextContent('Goal $2300, set in Grow');
    expect(screen.queryByText(/in it ·/)).toBeNull();
  });

  it('the lock row carries its sub-line beside the switch, spoken as its hint', async () => {
    await wrap(ui());
    const sw = screen.getByRole('switch');
    expect(sw).toHaveTextContent(/Safety net locked/);
    expect(sw).toHaveTextContent(/Answers never spend it\./);
    expect(sw.props.accessibilityHint).toBe('Answers never spend it. Answers that would need it say Not yet.');
  });

  it('DN-11: the screen title is Safety net settings, not the setup item title', async () => {
    await wrap(ui());
    expect(screen.getByTestId('detail-title')).toHaveTextContent('Safety net settings');
    expect(setup.items.net).toBe('Safety net');
    expect(setupOthers.net.title).toBe('Safety net');
    mockRows = [];
    await wrap(ui());
    expect(screen.getAllByTestId('detail-title').every((n) => n.props.children === 'Safety net settings')).toBe(true);
  });
});

describe('LockGlyphAnimated', () => {
  it('the drawn shackle follows locked on every render, whatever the motion does', async () => {
    const view = await wrap(<LockGlyphAnimated testID="g" locked color="#000" />);
    expect(screen.getByTestId('g-closed', HIDDEN)).toBeTruthy();
    await view.rerender(<LockGlyphAnimated testID="g" locked={false} color="#000" />);
    expect(screen.getByTestId('g-open', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('g-closed', HIDDEN)).toBeNull();
  });

  it('first draw never animates', async () => {
    await wrap(<LockGlyphAnimated locked color="#000" />);
    expect(mockWithTiming).not.toHaveBeenCalled();
  });

  it('a change runs one 220 ms timing', async () => {
    const view = await wrap(<LockGlyphAnimated locked color="#000" />);
    await view.rerender(<LockGlyphAnimated locked={false} color="#000" />);
    expect(mockWithTiming).toHaveBeenCalledTimes(1);
    expect(mockWithTiming).toHaveBeenCalledWith(1, expect.objectContaining({ duration: 220 }));
  });

  it('Reduce Motion goes straight to the end state', async () => {
    mockReduced = true;
    const view = await wrap(<LockGlyphAnimated locked color="#000" />);
    await view.rerender(<LockGlyphAnimated locked={false} color="#000" />);
    expect(mockWithTiming).not.toHaveBeenCalled();
  });
});
