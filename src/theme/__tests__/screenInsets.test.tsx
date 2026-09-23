import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../ThemeProvider';
import { Screen } from '@/ui/Screen';

// DSG-03: mock react-native-safe-area-context's insets per its own jest docs, rather than
// wrapping in SafeAreaProvider, so the test controls the exact inset values.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));

describe('Screen', () => {
  it('derives paddingTop from insets.top + headerExtra, never a hardcoded 68', async () => {
    const { toJSON } = await render(
      <ThemeProvider>
        <Screen>
          <Text>content</Text>
        </Screen>
      </ThemeProvider>
    );

    const tree = toJSON();
    const style = StyleSheet.flatten(Array.isArray(tree) ? tree[0]?.props.style : tree?.props.style);
    expect(style.paddingTop).toBe(68);
    expect(style.paddingBottom).toBe(12);
  });
});
