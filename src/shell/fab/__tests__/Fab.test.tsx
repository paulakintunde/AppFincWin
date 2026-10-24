import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import en from '@/i18n/locales/en';
import { useT } from '@/i18n';
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
  useRegisterFab,
  type FabContextValue,
} from '../FabProvider';

jest.mock('@/ui/haptics');
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn' }) }));
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(cb, [cb]);
  },
}));

const holder: { fab: FabContextValue | null; setToast: ((h: number) => void) | null; switchTo: ((s: string) => void) | null } = {
  fab: null,
  setToast: null,
  switchTo: null,
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

  function Switcher({ screens, onDefault }: { screens: Record<string, React.ReactNode>; onDefault: () => void }): React.JSX.Element {
    const [which, setWhich] = React.useState('first');
    React.useEffect(() => {
      holder.switchTo = setWhich;
    }, []);
    return (
      <FabProvider>
        <Wire onDefault={onDefault} />
        {screens[which]}
        <Fab />
      </FabProvider>
    );
  }

  it('D-98 a screen registering null hides the default FAB while it is shown', async () => {
    function NoFabScreen(): null {
      useRegisterFab(null);
      return null;
    }
    await renderWithShellProviders(<Switcher onDefault={jest.fn()} screens={{ first: <NoFabScreen />, second: null }} />);
    expect(screen.queryByRole('button')).toBeNull();
    await act(async () => holder.switchTo?.('second'));
    expect(screen.getByRole('button', { name: 'Add a transaction' })).toBeTruthy();
  });

  it('D-98 the FAB still shows on another tab root that registers one', async () => {
    function NoFabScreen(): null {
      useRegisterFab(null);
      return null;
    }
    function Other(): null {
      useRegisterFab(React.useMemo(() => ({ label: 'New thing', accessibilityLabel: 'Start a new thing', onPress: jest.fn() }), []));
      return null;
    }
    await renderWithShellProviders(<Switcher onDefault={jest.fn()} screens={{ first: <NoFabScreen />, second: <Other /> }} />);
    expect(screen.queryByRole('button')).toBeNull();
    await act(async () => holder.switchTo?.('second'));
    expect(screen.getByRole('button', { name: 'Start a new thing' })).toBeTruthy();
  });

  it('D-107 the FAB strings resolve and Decide home registers New check', async () => {
    expect(en.decide.fab).toEqual({ label: 'New check', a11y: 'Starts a new affordability check' });
    const onPress = jest.fn();
    function DecideLike(): null {
      const t = useT();
      useRegisterFab(
        React.useMemo(() => ({ label: t('decide.fab.label'), accessibilityLabel: t('decide.fab.a11y'), onPress }), [t])
      );
      return null;
    }
    function Other(): null {
      return null;
    }
    await renderWithShellProviders(<Switcher onDefault={jest.fn()} screens={{ first: <DecideLike />, second: <Other /> }} />);
    const button = screen.getByRole('button', { name: 'Starts a new affordability check' });
    expect(screen.getByText('New check')).toBeTruthy();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    // leaving Decide returns the default Add FAB
    await act(async () => holder.switchTo?.('second'));
    expect(screen.getByRole('button', { name: 'Add a transaction' })).toBeTruthy();
  });
});
