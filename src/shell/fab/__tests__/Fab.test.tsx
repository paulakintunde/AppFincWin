import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { hapticLight, hapticMedium } from '@/ui/haptics';
import { pushSheet } from '@/state/sheetStack';
import { renderWithShellProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { useShellLayout } from '@/shell/layout/ShellLayoutProvider';
import { Fab } from '../Fab';
import {
  FabProvider,
  useFab,
  useProvideDefaultFabAction,
  useProvideQuickAction,
  type FabContextValue,
} from '../FabProvider';

jest.mock('@/ui/haptics');
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn' }) }));
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(cb, [cb]);
  },
}));

const holder: { fab: FabContextValue | null; setToast: ((h: number) => void) | null } = {
  fab: null,
  setToast: null,
};

function Wire({
  onDefault,
  onExpense,
}: {
  onDefault: () => void;
  onExpense?: () => void;
}): null {
  useProvideDefaultFabAction(onDefault);
  useProvideQuickAction('addExpense', onExpense ?? null);
  const fab = useFab();
  const layout = useShellLayout();
  React.useEffect(() => {
    holder.fab = fab;
    holder.setToast = layout.reportToastHeight;
  });
  return null;
}

async function mount(onDefault = jest.fn(), onExpense?: () => void) {
  const view = await renderWithShellProviders(
    <FabProvider>
      <Wire onDefault={onDefault} onExpense={onExpense} />
      <Fab />
    </FabProvider>,
  );
  return { view, onDefault };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetShellStores();
});

describe('Fab', () => {
  it('renders nothing when hidden', async () => {
    await mount();
    await act(async () => pushSheet('s1'));
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is a labelled button with visible text', async () => {
    await mount();
    expect(screen.getByRole('button', { name: 'Add a transaction' })).toBeTruthy();
    expect(screen.getByText('Add')).toBeTruthy();
  });

  it('press fires a light haptic then the action', async () => {
    const { onDefault } = await mount();
    await fireEvent.press(screen.getByRole('button'));
    expect(hapticLight).toHaveBeenCalledTimes(1);
    expect(hapticMedium).not.toHaveBeenCalled();
    expect(onDefault).toHaveBeenCalledTimes(1);
  });

  it('long press with quick actions fires a medium haptic and opens the menu', async () => {
    await mount(jest.fn(), jest.fn());
    await fireEvent(screen.getByRole('button'), 'longPress');
    expect(hapticMedium).toHaveBeenCalledTimes(1);
    expect(holder.fab?.quickMenuOpen).toBe(true);
  });

  it('long press with no quick actions does nothing', async () => {
    await mount();
    await fireEvent(screen.getByRole('button'), 'longPress');
    expect(hapticMedium).not.toHaveBeenCalled();
    expect(holder.fab?.quickMenuOpen).toBe(false);
  });

  it('exposes quick actions as accessibility actions and runs them', async () => {
    const onExpense = jest.fn();
    await mount(jest.fn(), onExpense);
    const button = screen.getByRole('button');
    expect(button.props.accessibilityActions).toEqual([
      { name: 'addExpense', label: 'Add expense' },
    ]);
    await fireEvent(button, 'accessibilityAction', { nativeEvent: { actionName: 'addExpense' } });
    expect(onExpense).toHaveBeenCalledTimes(1);
  });

  it('is placed 16 from the trailing edge and 16 above the tab bar', async () => {
    await mount();
    const wrapper = screen.getByTestId('fab-wrapper');
    const style = StyleSheet.flatten(wrapper?.props.style);
    expect(style.right).toBe(16);
    expect(style.bottom).toBe(16);
  });

  it('lifts by the toast height plus 8 and settles back', async () => {
    jest.useFakeTimers();
    await mount();
    const wrapper = screen.getByTestId('fab-wrapper');
    await act(async () => jest.advanceTimersByTime(300));
    expect(getAnimatedStyle(wrapper!).transform).toEqual([{ translateY: 0 }]);
    await act(async () => holder.setToast?.(52));
    await act(async () => jest.advanceTimersByTime(300));
    expect(getAnimatedStyle(wrapper!).transform).toEqual([{ translateY: -60 }]);
    await act(async () => holder.setToast?.(0));
    await act(async () => jest.advanceTimersByTime(300));
    expect(getAnimatedStyle(wrapper!).transform).toEqual([{ translateY: 0 }]);
    jest.useRealTimers();
  });
});
