import React from 'react';
import { BackHandler } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { BackHistoryContext, type BackHistoryContextValue } from '../BackHistoryProvider';
import { useAndroidBackHandler } from '../useAndroidBackHandler';

afterEach(() => {
  jest.restoreAllMocks();
});

function setup(goBack: () => boolean) {
  let listener: (() => boolean) | null = null;
  const remove = jest.fn();
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, handler) => {
    listener = handler as () => boolean;
    return { remove };
  });
  const value: BackHistoryContextValue = {
    history: [],
    current: null,
    canGoBack: false,
    goBack,
    registerTabSwitcher: jest.fn(),
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BackHistoryContext.Provider value={value}>{children}</BackHistoryContext.Provider>
  );
  return { wrapper, remove, fire: () => listener?.() };
}

describe('useAndroidBackHandler', () => {
  it('returns true when goBack navigates', async () => {
    const { wrapper, fire } = setup(jest.fn(() => true));
    await renderHook(() => useAndroidBackHandler(), { wrapper });
    expect(fire()).toBe(true);
  });

  it('returns false when goBack says the system should exit', async () => {
    const { wrapper, fire } = setup(jest.fn(() => false));
    await renderHook(() => useAndroidBackHandler(), { wrapper });
    expect(fire()).toBe(false);
  });

  it('removes the subscription on unmount', async () => {
    const { wrapper, remove } = setup(jest.fn(() => true));
    const { unmount } = await renderHook(() => useAndroidBackHandler(), { wrapper });
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
