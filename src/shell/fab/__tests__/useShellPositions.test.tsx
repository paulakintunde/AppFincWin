import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import {
  ShellTestProviders,
  resetShellStores,
  type ShellTestOptions,
} from '@/shell/__tests__/testUtils';
import { useShellLayout } from '@/shell/layout/ShellLayoutProvider';
import { FAB_CLEARANCE, useFabOffsets, useToastSlot } from '../useShellPositions';

beforeEach(() => resetShellStores());

function wrapper(options?: ShellTestOptions) {
  return function Wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
    return <ShellTestProviders options={options}>{children}</ShellTestProviders>;
  };
}

describe('FAB_CLEARANCE', () => {
  it('is the pill height plus twice its inset', () => {
    expect(FAB_CLEARANCE).toBe(82);
  });
});

describe('useFabOffsets', () => {
  it('sits 16 above the tab bar with no lift', async () => {
    const { result } = await renderHook(
      () => ({ o: useFabOffsets(), l: useShellLayout() }),
      { wrapper: wrapper() },
    );
    await act(async () => result.current.l.setTabBarHeight(83));
    expect(result.current.o).toEqual({ bottom: 99, lift: 0 });
  });

  it('lifts by the toast height plus 8', async () => {
    const { result } = await renderHook(
      () => ({ o: useFabOffsets(), l: useShellLayout() }),
      { wrapper: wrapper() },
    );
    await act(async () => {
      result.current.l.setTabBarHeight(83);
      result.current.l.reportToastHeight(52);
    });
    expect(result.current.o).toEqual({ bottom: 99, lift: 60 });
  });
});

describe('useToastSlot', () => {
  it('is tab bar height + 12 on a tab', async () => {
    const { result } = await renderHook(
      () => ({ s: useToastSlot(), l: useShellLayout() }),
      { wrapper: wrapper() },
    );
    await act(async () => result.current.l.setTabBarHeight(83));
    expect(result.current.s.bottom).toBe(95);
  });

  it('is bottom inset + 30 on an outer screen', async () => {
    const { result } = await renderHook(() => useToastSlot(), {
      wrapper: wrapper({ backHistory: { current: { area: 'outer', depth: 1, href: '/x' } } }),
    });
    expect(result.current.bottom).toBe(34 + 30);
  });

  it('is bottom inset + 30 when the location is unknown', async () => {
    const { result } = await renderHook(() => useToastSlot(), {
      wrapper: wrapper({ backHistory: { current: null } }),
    });
    expect(result.current.bottom).toBe(34 + 30);
  });

  it('forwards the reported height to the layout', async () => {
    const { result } = await renderHook(
      () => ({ s: useToastSlot(), l: useShellLayout() }),
      { wrapper: wrapper() },
    );
    await act(async () => result.current.s.reportHeight(40));
    expect(result.current.l.toastHeight).toBe(40);
  });
});
