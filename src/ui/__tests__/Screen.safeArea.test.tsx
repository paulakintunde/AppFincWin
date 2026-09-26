import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { colors } from '@/theme/tokens';
import { Screen } from '@/ui/Screen';

// DSG-03 (on-device acceptance, Pixel 9 / Android forced edge-to-edge): scrolled content must
// be clipped at the top safe-area edge, not drawn under the status bar. The top inset therefore
// has to sit OUTSIDE the scroll viewport (a fixed band), not only as initial content padding.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

async function renderScroll() {
  const { toJSON } = await render(
    <ThemeProvider>
      <Screen scroll>
        <Text>{'content'}</Text>
      </Screen>
    </ThemeProvider>
  );
  const tree = toJSON();
  return Array.isArray(tree) ? tree[0] : tree;
}

describe('Screen scroll: top safe-area applied to the scroll viewport', () => {
  it('insets the ScrollView viewport by insets.top via a fixed canvas-coloured band', async () => {
    const root = await renderScroll();
    const outer = StyleSheet.flatten(root?.props.style);

    // The wrapper, not the scroll content, owns the status-bar inset.
    expect(root?.type).not.toBe('RCTScrollView');
    expect(outer.paddingTop).toBe(47);
    expect(outer.backgroundColor).toBe(colors.canvas);
  });

  it('keeps only headerExtra (not insets.top) as scroll-content top padding, so resting layout is unchanged', async () => {
    const root = await renderScroll();
    const scrollHost = root?.children?.[0];
    expect(typeof scrollHost === 'object' && scrollHost?.type).toBe('RCTScrollView');
    const content = StyleSheet.flatten(
      typeof scrollHost === 'object' ? scrollHost?.props.contentContainerStyle : undefined
    );
    expect(content.paddingTop).toBe(21); // 47 + 21 = 68 total, same as before
    expect(content.paddingBottom).toBe(12);
  });
});
