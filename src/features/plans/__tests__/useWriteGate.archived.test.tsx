import React from 'react';
import { Pressable, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ArchivedMonthGateProvider } from '@/features/archive/archivedMonthGate';
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
const onRestore = jest.fn();
function Button() {
  const gate = useWriteGate('editRecord');
  return (
    <Pressable testID="b" onPress={() => gate.run(fn)}>
      <Text testID="state">{`${gate.gated}|${gate.variant}|${gate.a11ySuffix}`}</Text>
    </Pressable>
  );
}

async function setup(archived: boolean) {
  const button = <Button />;
  return render(
    <ThemeProvider>
      <LockedSheetProvider>
        {archived ? (
          <ArchivedMonthGateProvider month="2026-08" onRestore={onRestore}>
            {button}
          </ArchivedMonthGateProvider>
        ) : (
          button
        )}
      </LockedSheetProvider>
    </ThemeProvider>,
  );
}

describe('useWriteGate archived variant (D-14)', () => {
  beforeEach(() => {
    fn.mockClear();
    onRestore.mockClear();
    mockPlan = { status: 'active', writable: true, loading: false };
  });

  it('outside an archived month it behaves as before', async () => {
    const { getByTestId, getByText } = await setup(false);
    expect(getByText('false|null|null')).toBeTruthy();
    await fireEvent.press(getByTestId('b'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('inside an archived month: gated, fn not called, restore sheet opens', async () => {
    const { getByTestId, getByText, queryByText } = await setup(true);
    expect(getByText('true|archived|restore to change')).toBeTruthy();
    expect(queryByText('Restore to change this month')).toBeNull();
    await fireEvent.press(getByTestId('b'));
    expect(fn).not.toHaveBeenCalled();
    expect(getByText('Restore to change this month')).toBeTruthy();
    await fireEvent.press(getByText('Keep reading'));
    expect(queryByText('Restore to change this month')).toBeNull();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('Restore month calls onRestore', async () => {
    const { getByTestId, getByText } = await setup(true);
    await fireEvent.press(getByTestId('b'));
    await fireEvent.press(getByText('Restore month'));
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('the plan lock takes precedence', async () => {
    mockPlan = { status: 'locked', writable: false, loading: false };
    const { getByText } = await setup(true);
    expect(getByText('true|locked|needs a plan')).toBeTruthy();
  });
});
