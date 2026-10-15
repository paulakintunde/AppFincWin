import React, { useEffect } from 'react';
import { act } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderWithShellProviders, resetShellStores } from '@/shell/__tests__/testUtils';
import { FabProvider, useFab, type FabContextValue } from '@/shell/fab/FabProvider';
import { closeEntry, openEntry, resetEntryHostForTests } from '../entryHost';
import { resetPushOnceForTests } from '@/shell/navigation/pushOnce';
import { ShellEntryHost } from '../ShellEntryHost';

jest.setTimeout(30000);

jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ status: 'signedIn' }) }));
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  router: { push: jest.fn() },
}));
const mockSheet = jest.fn();
jest.mock('../TransactionSheet', () => ({
  TransactionSheet: (props: unknown) => {
    mockSheet(props);
    return null;
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

type SheetProps = { visible: boolean; mode: { kind: string; direction?: string }; onClose: () => void };
function lastSheet(): SheetProps {
  return mockSheet.mock.calls.at(-1)![0] as SheetProps;
}

let setMounted: (v: boolean) => void = () => undefined;
function Host({ mounted: initial }: { mounted: boolean }): React.JSX.Element {
  const [mounted, set] = React.useState(initial);
  useEffect(() => {
    setMounted = set;
  }, [set]);
  return (
    <FabProvider>
      <Probe />
      {mounted ? <ShellEntryHost /> : null}
    </FabProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  resetShellStores();
  resetEntryHostForTests();
  resetPushOnceForTests();
  holder.current = null;
});

describe('ShellEntryHost', () => {
  it('registers Add as the FAB default and opens a new money-out entry', async () => {
    await renderWithShellProviders(<Host mounted />);
    expect(cur().config?.label).toBe('Add');
    expect(cur().config?.accessibilityLabel).toBe('Add a transaction');
    expect(lastSheet().visible).toBe(false);
    await act(async () => cur().config!.onPress());
    expect(lastSheet().visible).toBe(true);
    expect(lastSheet().mode).toEqual({ kind: 'new', direction: 'out' });
  });

  it('offers expense, income, transfer and import only (no New check)', async () => {
    await renderWithShellProviders(<Host mounted />);
    expect(cur().quickActions.map((a) => a.id)).toEqual(['addExpense', 'addIncome', 'transfer', 'importStatement']);
  });

  it.each([
    ['addExpense', 'out'],
    ['addIncome', 'in'],
    ['transfer', 'transfer'],
  ])('%s opens the sheet in %s mode', async (id, direction) => {
    await renderWithShellProviders(<Host mounted />);
    await act(async () => cur().quickActions.find((a) => a.id === id)!.run());
    expect(lastSheet().visible).toBe(true);
    expect(lastSheet().mode).toEqual({ kind: 'new', direction });
  });

  it('importStatement carries from=activity on Activity and pushes once on a double run', async () => {
    await renderWithShellProviders(<Host mounted />, {
      backHistory: { current: { area: 'tab', tab: 'activity', href: '/activity' } },
    });
    const run = cur().quickActions.find((a) => a.id === 'importStatement')!.run;
    await act(async () => {
      run();
      run();
    });
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/import', params: { entry: 'you', from: 'activity' } });
  });

  it('importStatement carries from=home while on Home', async () => {
    await renderWithShellProviders(<Host mounted />, {
      backHistory: { current: { area: 'tab', tab: 'home', href: '/home' } },
    });
    await act(async () => cur().quickActions.find((a) => a.id === 'importStatement')!.run());
    expect(router.push).toHaveBeenCalledWith({ pathname: '/import', params: { entry: 'you', from: 'home' } });
  });

  it('shows the same sheet when another surface (Home) calls openEntry', async () => {
    await renderWithShellProviders(<Host mounted />);
    await act(async () => openEntry({ kind: 'new', direction: 'in' }));
    expect(lastSheet().visible).toBe(true);
    expect(lastSheet().mode).toEqual({ kind: 'new', direction: 'in' });
  });

  it('hides the FAB while the sheet is open and releases it on close', async () => {
    await renderWithShellProviders(<Host mounted />);
    expect(cur().hidden).toBe(false);
    await act(async () => openEntry({ kind: 'new', direction: 'out' }));
    expect(cur().hidden).toBe(true);
    await act(async () => lastSheet().onClose());
    expect(lastSheet().visible).toBe(false);
    expect(cur().hidden).toBe(false);
    closeEntry();
  });

  it('unregisters the default action and quick actions on unmount', async () => {
    await renderWithShellProviders(<Host mounted />);
    expect(cur().config).not.toBeNull();
    await act(async () => setMounted(false));
    expect(cur().config).toBeNull();
    expect(cur().quickActions).toEqual([]);
  });
});
