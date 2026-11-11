/** 06.1-40: the providers-wrapped render helper, moved out of the old Decide check tests so surviving suites do not import a doomed folder. */
import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { FontScaleProvider } from '@/theme/FontScaleProvider';

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, bottom: 34, left: 0, right: 0 } };

function providersAt(scale: number) {
  return function Providers({ children }: { children: React.ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider>
          <FontScaleProvider value={scale}>{children}</FontScaleProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    );
  };
}

/** Renders inside the providers as a `wrapper`, so `rerender(ui)` keeps them mounted. */
export function wrap(ui: React.ReactElement, scale = 1) {
  return render(ui, { wrapper: providersAt(scale) });
}
