import React from 'react';
import { act, render, renderHook } from '@testing-library/react-native';
import { BackHistoryProvider, useBackHistory } from '../BackHistoryProvider';
import * as tabSlide from '@/shell/tabBar/tabSlide';
import { TAB_ORDER } from '@/shell/tabBar/tabs';

type Fixture = { state: unknown; pathname: string };
let mockFixture: Fixture;

const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
const mockNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useRootNavigationState: () => mockFixture.state,
  usePathname: () => mockFixture.pathname,
  router: {
    back: () => mockBack(),
    canGoBack: () => mockCanGoBack(),
    navigate: (href: string) => mockNavigate(href),
  },
}));

function tabState(tab: string): Fixture {
  const i = TAB_ORDER.indexOf(tab as (typeof TAB_ORDER)[number]);
  return {
    pathname: '/' + tab,
    state: {
      index: 0,
      routes: [
        {
          name: '(app)',
          state: {
            index: 0,
            routes: [
              {
                name: '(tabs)',
                state: { index: i, routes: TAB_ORDER.map((name) => ({ name })) },
              },
            ],
          },
        },
      ],
    },
  };
}

function outerState(depth: number): Fixture {
  const routes: { name: string; state?: unknown }[] = [
    { name: '(tabs)', state: { index: 0, routes: TAB_ORDER.map((name) => ({ name })) } },
  ];
  for (let d = 1; d <= depth; d++) routes.push({ name: 'detail' + d });
  return {
    pathname: '/detail' + depth,
    state: { index: 0, routes: [{ name: '(app)', state: { index: depth, routes } }] },
  };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BackHistoryProvider>{children}</BackHistoryProvider>
);

async function setup(initial: Fixture) {
  mockFixture = initial;
  const hook = await renderHook(() => useBackHistory(), { wrapper });
  const go = async (next: Fixture) => {
    mockFixture = next;
    await hook.rerender({});
  };
  return { ...hook, go };
}

beforeEach(() => {
  mockBack.mockClear();
  mockNavigate.mockClear();
  mockCanGoBack.mockReturnValue(true);
});

describe('BackHistoryProvider', () => {
  it('sets current on first observation without adding history', async () => {
    const { result } = await setup(tabState('home'));
    expect(result.current.current).toMatchObject({ area: 'tab', tab: 'home' });
    expect(result.current.history).toHaveLength(0);
    expect(result.current.canGoBack).toBe(false);
  });

  it('records the previous tab on a switch', async () => {
    const { result, go } = await setup(tabState('home'));
    await go(tabState('activity'));
    expect(result.current.history).toHaveLength(1);
    expect(result.current.canGoBack).toBe(true);
  });

  it('caps history at 8 after 9 switches', async () => {
    const { result, go } = await setup(tabState('home'));
    const seq = ['activity', 'decide', 'grow', 'insights', 'home', 'activity', 'decide', 'grow', 'insights'];
    for (const t of seq) await go(tabState(t));
    expect(result.current.history).toHaveLength(8);
  });

  it('goBack switches via the registered switcher and the observed home empties history', async () => {
    const { result, go } = await setup(tabState('home'));
    await go(tabState('activity'));
    const switcher = jest.fn();
    await act(() => {
      result.current.registerTabSwitcher(switcher);
    });
    let ok = false;
    await act(async () => {
      ok = result.current.goBack();
    });
    expect(ok).toBe(true);
    expect(switcher).toHaveBeenCalledWith('home');
    await go(tabState('home'));
    expect(result.current.history).toHaveLength(0);
  });

  describe('L1 no-op back switch', () => {
    let rafSpy: jest.SpyInstance;
    let queue: (() => void)[];
    const flushFrames = async () => {
      await act(async () => {
        for (let i = 0; i < 4 && queue.length > 0; i++) {
          const run = queue.splice(0);
          run.forEach((cb) => cb());
        }
      });
    };
    beforeEach(() => {
      queue = [];
      rafSpy = jest.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => {
        queue.push(() => cb(0));
        return 0;
      });
    });
    afterEach(() => rafSpy.mockRestore());

    it('clears the pending flags when the switcher did not change the location', async () => {
      const clear = jest.spyOn(tabSlide, 'clearBackStep');
      const { result, go } = await setup(tabState('home'));
      await go(tabState('activity'));
      await act(() => {
        result.current.registerTabSwitcher(jest.fn());
      });
      await act(async () => {
        result.current.goBack();
      });
      await flushFrames();
      expect(clear).toHaveBeenCalledTimes(1);
      await go(tabState('decide'));
      expect(result.current.history).toHaveLength(2);
      clear.mockRestore();
    });

    it('does not clear when the location changed within the two frames', async () => {
      const clear = jest.spyOn(tabSlide, 'clearBackStep');
      const { result, go } = await setup(tabState('home'));
      await go(tabState('activity'));
      await act(() => {
        result.current.registerTabSwitcher(jest.fn());
      });
      await act(async () => {
        result.current.goBack();
      });
      await go(tabState('home'));
      await flushFrames();
      expect(clear).not.toHaveBeenCalled();
      expect(result.current.history).toHaveLength(0);
      clear.mockRestore();
    });
  });

  it('goBack on an outer location calls router.back once and the observed pop clears the entry', async () => {
    const { result, go } = await setup(tabState('home'));
    await go(outerState(1));
    expect(result.current.history).toHaveLength(1);
    let ok = false;
    await act(async () => {
      ok = result.current.goBack();
    });
    expect(ok).toBe(true);
    expect(mockBack).toHaveBeenCalledTimes(1);
    await go(tabState('home'));
    expect(result.current.history).toHaveLength(0);
  });

  it('pops the history on an observed outer -> tab change without goBack (SwipeBack)', async () => {
    const { result, go } = await setup(tabState('home'));
    await go(outerState(1));
    await go(tabState('home'));
    expect(result.current.history).toHaveLength(0);
  });

  it('returns false and navigates nowhere on Home with nothing left', async () => {
    const { result } = await setup(tabState('home'));
    let ok = true;
    await act(async () => {
      ok = result.current.goBack();
    });
    expect(ok).toBe(false);
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('goes Home from another tab with empty history', async () => {
    const { result } = await setup(tabState('activity'));
    const switcher = jest.fn();
    await act(() => {
      result.current.registerTabSwitcher(switcher);
    });
    let ok = false;
    await act(async () => {
      ok = result.current.goBack();
    });
    expect(ok).toBe(true);
    expect(switcher).toHaveBeenCalledWith('home');
  });

  it('falls back to router.navigate when no switcher is registered', async () => {
    const { result } = await setup(tabState('activity'));
    await act(async () => {
      result.current.goBack();
    });
    expect(mockNavigate).toHaveBeenCalledWith('/home');
  });

  it('returns false when the stack cannot go back', async () => {
    mockCanGoBack.mockReturnValue(false);
    const { result, go } = await setup(tabState('home'));
    await go(outerState(1));
    let ok = true;
    await act(async () => {
      ok = result.current.goBack();
    });
    expect(ok).toBe(false);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('throws outside the provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFixture = tabState('home');
    function Probe(): null {
      useBackHistory();
      return null;
    }
    await expect(render(<Probe />)).rejects.toThrow(
      'useBackHistory must be used within a BackHistoryProvider',
    );
    jest.restoreAllMocks();
  });
});
