// 05.3-40: shared render wrapper for the layer card tests.
import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { CheckV2 } from '@/engine/decide/v3';
import { FontScaleProvider } from '@/theme/FontScaleProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

const METRICS = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 0, bottom: 0, left: 0, right: 0 } };

export function Wrap({ children, scale = 1 }: { children: React.ReactNode; scale?: number }): React.JSX.Element {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <FontScaleProvider value={scale}>{children}</FontScaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Holds the draft check in state so a card re-renders with each edit; `onCheck` reports the latest check to the test. */
export function Stateful({
  initial,
  onCheck,
  scale = 1,
  children,
}: {
  initial: CheckV2;
  onCheck?: (c: CheckV2) => void;
  scale?: number;
  children: (args: { check: CheckV2; edit(next: CheckV2): void }) => React.ReactNode;
}): React.JSX.Element {
  const [check, setCheck] = useState(initial);
  useEffect(() => {
    onCheck?.(check);
  }, [check, onCheck]);
  return <Wrap scale={scale}>{children({ check, edit: setCheck })}</Wrap>;
}
