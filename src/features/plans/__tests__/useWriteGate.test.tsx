import React from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { PlanStatus } from '../types';
import { LockedSheetProvider, useWriteGate } from '../useWriteGate';

jest.setTimeout(30000);

jest.mock('@/ui/Sheet', () => {
  const { View } = require('react-native');
  return { Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null) };
});
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/ui/haptics', () => ({ hapticTap: jest.fn() }));

let mockPlan: { status: PlanStatus; writable: boolean; loading: boolean } = { status: 'active', writable: true, loading: false };
jest.mock('../usePlanState', () => ({ usePlanState: () => mockPlan }));

const fn = jest.fn();
function Button() {
  const gate = useWriteGate('addTransaction');
  return (
    <Pressable testID="b" onPress={() => gate.run(fn)}>
      <Text testID="state">{`${gate.gated}|${gate.variant}|${gate.a11ySuffix}`}</Text>
    </Pressable>
  );
}

async function setup() {
  return render(
    <ThemeProvider>
      <LockedSheetProvider>
        <Button />
      </LockedSheetProvider>
    </ThemeProvider>,
  );
}

describe('useWriteGate', () => {
  beforeEach(() => fn.mockClear());

  it('writable: not gated and run calls fn', async () => {
    mockPlan = { status: 'active', writable: true, loading: false };
    const { getByTestId, getByText } = await setup();
    expect(getByText('false|null|null')).toBeTruthy();
    await fireEvent.press(getByTestId('b'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('locked: gated, fn not called, sheet names the action', async () => {
    mockPlan = { status: 'locked', writable: false, loading: false };
    const { getByTestId, getByText } = await setup();
    expect(getByText('true|locked|needs a plan')).toBeTruthy();
    await fireEvent.press(getByTestId('b'));
    expect(fn).not.toHaveBeenCalled();
    expect(getByText('Adding a transaction needs a plan')).toBeTruthy();
  });

  it('sample: variant sample and the own-records sheet', async () => {
    mockPlan = { status: 'sample', writable: false, loading: false };
    const { getByTestId, getByText } = await setup();
    await fireEvent.press(getByTestId('b'));
    expect(fn).not.toHaveBeenCalled();
    expect(getByText('That needs your own records')).toBeTruthy();
    expect(getByText('Start 14-day free trial')).toBeTruthy();
  });

  it.each(['grace', 'tester'] as const)('%s writable: not gated', async (status) => {
    mockPlan = { status, writable: true, loading: false };
    const { getByTestId } = await setup();
    await fireEvent.press(getByTestId('b'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('loading: never gated on a guess', async () => {
    mockPlan = { status: 'sample', writable: false, loading: true };
    const { getByTestId } = await setup();
    await fireEvent.press(getByTestId('b'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
