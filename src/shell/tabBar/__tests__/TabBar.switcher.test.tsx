// 05.3-115 / UAT gap 33: two tab bars overlap (an extra (tabs) mounts, then is popped). The popped
// tab bar's clean-up must not take Back's tab switch away from the tab bar still on screen.
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { ThemeProvider } from '@/theme/ThemeProvider';
import {
  BackHistoryProvider,
  useBackHistory,
  type BackHistoryContextValue,
} from '@/shell/backHistory/BackHistoryProvider';
import { ShellLayoutProvider } from '@/shell/layout/ShellLayoutProvider';
import { TAB_ORDER } from '../tabs';
import { TabBar } from '../TabBar';

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));

const mockRouterNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRootNavigationState: () => ({
    index: 0,
    routes: [
      {
        name: '(app)',
        state: {
          index: 0,
          routes: [
            {
              name: '(tabs)',
              state: { index: 1, routes: ['home', 'activity', 'decide', 'grow', 'insights'].map((name) => ({ name })) },
            },
          ],
        },
      },
    ],
  }),
  usePathname: () => '/activity',
  router: {
    back: jest.fn(),
    canGoBack: () => true,
    navigate: (href: string) => mockRouterNavigate(href),
  },
}));

function makeProps() {
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  };
  const props = {
    state: { index: 1, routes: TAB_ORDER.map((name) => ({ key: `${name}-k`, name })) },
    descriptors: {},
    navigation,
    insets: { top: 0, bottom: 34, left: 0, right: 0 },
  };
  return { props: props as unknown as BottomTabBarProps, navigation };
}

const probe: { ctx: BackHistoryContextValue | null } = { ctx: null };
function Probe(): null {
  const value = useBackHistory();
  React.useEffect(() => {
    probe.ctx = value;
  }, [value]);
  return null;
}

function Harness({ showSecond, a, b }: { showSecond: boolean; a: BottomTabBarProps; b: BottomTabBarProps }) {
  const [client] = React.useState(() => new QueryClient());
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, bottom: 34, left: 0, right: 0 },
      }}
    >
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <BackHistoryProvider>
            <ShellLayoutProvider>
              <Probe />
              <TabBar {...a} />
              {showSecond ? <TabBar {...b} /> : null}
            </ShellLayoutProvider>
          </BackHistoryProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// Real providers and two full tab bars are slow to render on a loaded machine.
jest.setTimeout(30000);

describe('TabBar switcher with two tab bars', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRouterNavigate.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('after the newer tab bar unmounts, Back drives the tab bar still on screen', async () => {
    const first = makeProps();
    const second = makeProps();
    const r = await render(<Harness showSecond a={first.props} b={second.props} />);
    await r.rerender(<Harness showSecond={false} a={first.props} b={second.props} />);

    let ok = false;
    await act(async () => {
      ok = probe.ctx!.goBack();
    });
    expect(ok).toBe(true);
    expect(first.navigation.navigate).toHaveBeenCalledWith({ name: 'home', merge: true });
    expect(second.navigation.navigate).not.toHaveBeenCalled();
    expect(mockRouterNavigate).not.toHaveBeenCalled();
    await r.unmount();
  });

  it('while both are mounted, Back drives the newest tab bar', async () => {
    const first = makeProps();
    const second = makeProps();
    const r = await render(<Harness showSecond a={first.props} b={second.props} />);
    await act(async () => {
      probe.ctx!.goBack();
    });
    expect(second.navigation.navigate).toHaveBeenCalledWith({ name: 'home', merge: true });
    expect(first.navigation.navigate).not.toHaveBeenCalled();
    await r.unmount();
  });
});
