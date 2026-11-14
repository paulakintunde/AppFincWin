// 06.1-52 (G-5, UX-13): the one "what is still needed" line. It sits directly under a disabled primary button and says why the
// button does not move on. A statement, never an order (2026-10-23 copy rule). Polite live region, so a screen reader hears the
// reason when it appears or changes.
import React from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export interface NeedLineProps {
  /** The reason; null draws nothing. */
  text: string | null;
  testID?: string;
  /** 06.1-81: lets a frame move screen-reader focus to the line (SetupItemFrame's blocked "Save and close"). */
  ref?: React.Ref<React.ComponentRef<typeof Text>>;
}

export function NeedLine({ text, testID = 'need-line', ref }: NeedLineProps) {
  const { colors, pairing } = useTheme();
  if (text === null || text === '') return null;
  return (
    <Text ref={ref} testID={testID} accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
      {text}
    </Text>
  );
}
