import React from 'react';
import { act, render, renderHook } from '@testing-library/react-native';
import { ShellLayoutProvider, useShellLayout } from '../ShellLayoutProvider';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ShellLayoutProvider>{children}</ShellLayoutProvider>
);

describe('ShellLayoutProvider', () => {
  it('shares the tab bar height', async () => {
    const { result } = await renderHook(() => useShellLayout(), { wrapper });
    expect(result.current.tabBarHeight).toBe(0);
    await act(() => {
      result.current.setTabBarHeight(83);
    });
    expect(result.current.tabBarHeight).toBe(83);
  });

  it('shares the toast height and resets it on null', async () => {
    const { result } = await renderHook(() => useShellLayout(), { wrapper });
    await act(() => {
      result.current.reportToastHeight(52);
    });
    expect(result.current.toastHeight).toBe(52);
    await act(() => {
      result.current.reportToastHeight(null);
    });
    expect(result.current.toastHeight).toBe(0);
  });

  it('throws outside the provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    function Probe(): null {
      useShellLayout();
      return null;
    }
    await expect(render(<Probe />)).rejects.toThrow(
      'useShellLayout must be used within a ShellLayoutProvider',
    );
    jest.restoreAllMocks();
  });
});
