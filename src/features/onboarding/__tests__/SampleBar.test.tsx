// 09-24 Task 2: the pinned Sample bar shows only in sample status, leads to the Plans screen in first-run mode (trigger
// 'sample_bar'), carries the screen-reader label, and its height lifts the FAB above it.
import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ShellLayoutProvider, useShellLayout } from '@/shell/layout/ShellLayoutProvider';
import type { PlanStatus } from '@/features/plans/types';
import { useFabOffsets } from '@/shell/fab/useShellPositions';
import { space } from '@/theme/layout';
import { SampleBar } from '../SampleBar';

jest.setTimeout(30000);

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn() }));
let mockPlan: { status: PlanStatus; loading: boolean } = { status: 'sample', loading: false };
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => mockPlan }));

const { hapticTap } = jest.requireMock('@/ui/haptics') as { hapticTap: jest.Mock };
const push = router.push as jest.Mock;
const FIRST_RUN = { pathname: '/plans', params: { mode: 'first_run', trigger: 'sample_bar' } };

function Heights() {
  const { sampleBarHeight } = useShellLayout();
  const fab = useFabOffsets();
  return (
    <>
      <Text testID="heights">{String(sampleBarHeight)}</Text>
      <Text testID="fab">{String(fab.bottom)}</Text>
    </>
  );
}

const setup = () =>
  render(
    <ThemeProvider>
      <ShellLayoutProvider>
        <SampleBar />
        <Heights />
      </ShellLayoutProvider>
    </ThemeProvider>,
  );

beforeEach(() => {
  mockPlan = { status: 'sample', loading: false };
  push.mockClear();
  hapticTap.mockClear();
});

describe('SampleBar', () => {
  it('shows Sample, Free for 14 days and the trial button with its label', async () => {
    const view = await setup();
    expect(view.getByText('Sample')).toBeTruthy();
    expect(view.getByText('Free for 14 days')).toBeTruthy();
    expect(view.getByText('Start 14-day free trial')).toBeTruthy();
    expect(view.getByLabelText('Sample figures. Start 14-day free trial.').props.accessibilityRole).toBe('button');
  });

  it("Start opens Plans in first-run mode with trigger 'sample_bar' and a tap haptic", async () => {
    const view = await setup();
    await fireEvent.press(view.getByLabelText('Sample figures. Start 14-day free trial.'));
    expect(push).toHaveBeenCalledWith(FIRST_RUN);
    expect(hapticTap).toHaveBeenCalledTimes(1);
  });

  it('Choose a different plan opens the same Plans screen, no haptic', async () => {
    const view = await setup();
    await fireEvent.press(view.getByText('Choose a different plan'));
    expect(push).toHaveBeenCalledWith(FIRST_RUN);
    expect(hapticTap).not.toHaveBeenCalled();
  });

  it.each<PlanStatus>(['trial', 'active', 'tester', 'grace', 'locked'])('renders nothing when status is %s', async (status) => {
    mockPlan = { status, loading: false };
    const view = await setup();
    expect(view.queryByTestId('sample-bar')).toBeNull();
  });

  it('renders nothing while the plan is loading', async () => {
    mockPlan = { status: 'sample', loading: true };
    const view = await setup();
    expect(view.queryByTestId('sample-bar')).toBeNull();
  });

  it('reports its height to the shell so content and the FAB clear it, and 0 once gone', async () => {
    const view = await setup();
    await act(() => {
      fireEvent(view.getByTestId('sample-bar'), 'layout', { nativeEvent: { layout: { height: 64 } } });
    });
    expect(view.getByTestId('heights').props.children).toBe('64');
    expect(view.getByTestId('fab').props.children).toBe(String(64 + space.fabInset));
    mockPlan = { status: 'trial', loading: false };
    await view.rerender(
      <ThemeProvider>
        <ShellLayoutProvider>
          <SampleBar />
          <Heights />
        </ShellLayoutProvider>
      </ThemeProvider>,
    );
    expect(view.getByTestId('heights').props.children).toBe('0');
  });
});
