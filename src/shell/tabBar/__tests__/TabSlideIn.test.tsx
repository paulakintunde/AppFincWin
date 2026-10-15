import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { TabSlideIn } from '../TabSlideIn';
import { resetTabSlideForTests, takeSlideFor } from '../tabSlide';
import { useMotion } from '@/theme/motion';

jest.mock('@/theme/motion', () => ({
  ...jest.requireActual('@/theme/motion'),
  useMotion: jest.fn(),
}));

function fakeNav() {
  let cb: (() => void) | null = null;
  const unsubscribe = jest.fn();
  return {
    nav: {
      addListener: jest.fn((_t: 'focus', fn: () => void) => {
        cb = fn;
        return unsubscribe;
      }),
    },
    fire: () => cb?.(),
    unsubscribe,
  };
}

async function mount(tab: 'home' | 'activity', f: ReturnType<typeof fakeNav>) {
  return render(
    <TabSlideIn tab={tab} navigation={f.nav}>
      <View />
    </TabSlideIn>,
  );
}

const slideStyle = () => getAnimatedStyle(screen.getByTestId('tab-slide'));

describe('TabSlideIn', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetTabSlideForTests();
    (useMotion as jest.Mock).mockReturnValue({ reduced: false });
  });
  afterEach(() => jest.useRealTimers());

  it('slides in from the right and settles', async () => {
    takeSlideFor('home');
    const f = fakeNav();
    await mount('activity', f);
    await act(async () => f.fire());
    await act(async () => {
      jest.advanceTimersByTime(32);
    });
    const mid = slideStyle().transform as { translateX: number }[];
    expect(mid[0]!.translateX).toBeGreaterThan(0);
    expect(mid[0]!.translateX).toBeLessThanOrEqual(22);
    expect(slideStyle().opacity as number).toBeLessThan(1);
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(slideStyle().transform).toEqual([{ translateX: 0 }]);
    expect(slideStyle().opacity).toBe(1);
  });

  it('renders at rest for none', async () => {
    const f = fakeNav();
    await mount('home', f);
    await act(async () => f.fire());
    expect(slideStyle().transform).toEqual([{ translateX: 0 }]);
    expect(slideStyle().opacity).toBe(1);
  });

  it('never offsets under reduced motion', async () => {
    (useMotion as jest.Mock).mockReturnValue({ reduced: true });
    takeSlideFor('home');
    const f = fakeNav();
    await mount('activity', f);
    await act(async () => f.fire());
    expect(slideStyle().transform).toEqual([{ translateX: 0 }]);
    expect(slideStyle().opacity).toBe(1);
  });

  it('unsubscribes on unmount', async () => {
    const f = fakeNav();
    const r = await mount('home', f);
    await r.unmount();
    expect(f.unsubscribe).toHaveBeenCalled();
  });
});
