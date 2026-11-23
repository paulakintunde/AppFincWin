// 07-08: the visible one-line summary under a chart; it is also the chart's screen-reader summary.
import React from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export function ChartSummary({ text, testID = 'chart-summary' }: { text: string; testID?: string }) {
  const { colors, pairing } = useTheme();
  return (
    <Text testID={testID} style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
      {text}
    </Text>
  );
}
