import React, { useEffect } from 'react';
import { act, render } from '@testing-library/react-native';
import { pushSheet, removeSheet } from '@/state/sheetStack';
import {
  ShellTestProviders,
  renderWithShellProviders,
  resetShellStores,
} from '@/shell/__tests__/testUtils';
import {
  FabProvider,
  useFab,
  useHideFab,
  useProvideDefaultFabAction,
  useProvideQuickAction,
  useRegisterFab,
  type FabContextValue,
} from '../FabProvider';

let mockAuthStatus = 'signedIn';
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ status: mockAuthStatus }),
}));
jest.mock('expo-router', () => ({
  // Runs the focus callback on mount and its cleanup on unmount, like a focused screen.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    useEffect(cb, [cb]);
  },
}));

const holder: { current: FabContextValue | null } = { current: null };
function cur(): FabContextValue {
  if (!holder.current) throw new Error('probe not mounted');
  return holder.current;
}
function Probe(): null {
  const value = useFab();
  useEffect(() => {
    holder.current = value;
  });
  return null;
}

function Default({ fn }: { fn: (() => void) | null }): null {
  useProvideDefaultFabAction(fn);
  return null;
}
function Screen({ onPress }: { onPress: () => void }): null {
  useRegisterFab({
    label: 'New check',
    accessibilityLabel: 'Start a new affordability check',
    onPress,
  });
  return null;
}
function Hide({ reason, active }: { reason: 'bulkSelect' | 'stepFlow'; active: boolean }): null {
  useHideFab(reason, active);
  return null;
}
function Quick({ id, fn }: { id: 'addExpense' | 'importStatement'; fn: () => void }): null {
  useProvideQuickAction(id, fn);
  return null;
}

const outer = { area: 'outer' as const, depth: 1, href: '/x' };

beforeEach(() => {
  mockAuthStatus = 'signedIn';
  resetShellStores();
});

async function setup(
  children: React.ReactNode,
  backHistory?: Parameters<typeof renderWithShellProviders>[1],
): Promise<ReturnType<typeof render>> {
  return renderWithShellProviders(
    <FabProvider>
      <Probe />
      {children}
    </FabProvider>,
    backHistory,
  );
}

function tree(children: React.ReactNode): React.JSX.Element {
  return (
    <ShellTestProviders>
      <FabProvider>
        <Probe />
        {children}
      </FabProvider>
    </ShellTestProviders>
  );
}

describe('FabProvider', () => {
  it('has no config and is hidden when nothing is registered', async () => {
    await setup(null);
    expect(cur().config).toBeNull();
    expect(cur().hidden).toBe(true);
  });

  it('throws outside a provider', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Probe />)).rejects.toThrow('useFab must be used within a FabProvider');
    spy.mockRestore();
  });

  it('the default action gives Add / Add a transaction and shows the button', async () => {
    const fn = jest.fn();
    await setup(<Default fn={fn} />);
    expect(cur().config?.label).toBe('Add');
    expect(cur().config?.accessibilityLabel).toBe('Add a transaction');
    expect(cur().hidden).toBe(false);
    cur().config?.onPress();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a focused screen overrides the default and the default returns on blur', async () => {
    const def = jest.fn();
    const screen = jest.fn();
    const view = await setup(
      <>
        <Default fn={def} />
        <Screen onPress={screen} />
      </>,
    );
    expect(cur().config?.label).toBe('New check');
    expect(cur().config?.accessibilityLabel).toBe('Start a new affordability check');
    cur().config?.onPress();
    expect(screen).toHaveBeenCalledTimes(1);
    await view.rerender(tree(<Default fn={def} />));
    expect(cur().config?.label).toBe('Add');
  });

  it('a blurring screen clears only its own config, never the next one (L8)', async () => {
    function Other({ onPress }: { onPress: () => void }): null {
      useRegisterFab({ label: 'Other', accessibilityLabel: 'Other action', onPress });
      return null;
    }
    const def = jest.fn();
    const view = await setup(
      <>
        <Default fn={def} />
        <Screen onPress={jest.fn()} />
      </>,
    );
    expect(cur().config?.label).toBe('New check');
    // B gains focus while A's registration is still mounted; A's cleanup then runs after B's effect.
    await view.rerender(
      tree(
        <>
          <Default fn={def} />
          <Screen onPress={jest.fn()} />
          <Other onPress={jest.fn()} />
        </>,
      ),
    );
    expect(cur().config?.label).toBe('Other');
    await view.rerender(
      tree(
        <>
          <Default fn={def} />
          <Other onPress={jest.fn()} />
        </>,
      ),
    );
    expect(cur().config?.label).toBe('Other');
  });

  it('is hidden on outer screens', async () => {
    await setup(<Default fn={jest.fn()} />, { backHistory: { current: outer } });
    expect(cur().hidden).toBe(true);
  });

  it('is hidden while a sheet is open and returns after it closes', async () => {
    await setup(<Default fn={jest.fn()} />);
    expect(cur().hidden).toBe(false);
    await act(async () => pushSheet('s1'));
    expect(cur().hidden).toBe(true);
    await act(async () => removeSheet('s1'));
    expect(cur().hidden).toBe(false);
  });

  it('is hidden while a hide reason is held and returns on unmount or false', async () => {
    const view = await setup(
      <>
        <Default fn={jest.fn()} />
        <Hide reason="bulkSelect" active />
      </>,
    );
    expect(cur().hidden).toBe(true);
    const def = jest.fn();
    await view.rerender(
      tree(
        <>
          <Default fn={def} />
          <Hide reason="bulkSelect" active={false} />
        </>,
      ),
    );
    expect(cur().hidden).toBe(false);
  });

  it('keeps hidden until both holders of the same reason release', async () => {
    const def = jest.fn();
    const two = (a: boolean, b: boolean): React.JSX.Element =>
      tree(
        <>
          <Default fn={def} />
          <Hide reason="stepFlow" active={a} />
          <Hide reason="stepFlow" active={b} />
        </>,
      );
    const view = await render(two(true, true));
    expect(cur().hidden).toBe(true);
    await view.rerender(two(false, true));
    expect(cur().hidden).toBe(true);
    await view.rerender(two(false, false));
    expect(cur().hidden).toBe(false);
  });

  it('is hidden while signed out', async () => {
    mockAuthStatus = 'signedOut';
    await setup(<Default fn={jest.fn()} />);
    expect(cur().hidden).toBe(true);
  });

  it('orders quick actions by the D-11 order and names them', async () => {
    await setup(
      <>
        <Quick id="importStatement" fn={jest.fn()} />
        <Quick id="addExpense" fn={jest.fn()} />
      </>,
    );
    expect(cur().quickActions.map((a) => a.id)).toEqual(['addExpense', 'importStatement']);
    expect(cur().quickActions.map((a) => a.label)).toEqual(['Add expense', 'Import statement']);
  });

  it('runs a quick action handler', async () => {
    const fn = jest.fn();
    await setup(<Quick id="addExpense" fn={fn} />);
    cur().quickActions[0]?.run();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('toggles the quick menu', async () => {
    await setup(null);
    expect(cur().quickMenuOpen).toBe(false);
    await act(async () => cur().openQuickMenu());
    expect(cur().quickMenuOpen).toBe(true);
    await act(async () => cur().closeQuickMenu());
    expect(cur().quickMenuOpen).toBe(false);
  });
});
