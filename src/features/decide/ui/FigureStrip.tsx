/** UI-SPEC Typography: a strip of captioned figures. Figures cap at 1.3x text size and the
 * strip stacks to one row per item above it (DCU-11 fold budgets, same rule as ThisMonthCard). */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { useFontScale } from '@/theme/FontScaleProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';

const FIGURE_STACK_ABOVE = 1.3;
const FIGURE_MAX_SCALE = 1.3;
const CAPTION_GAP = 2; // UI-SPEC caption-to-figure gap

export interface FigureItem {
  caption: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'negative';
}

export interface FigureStripProps {
  items: FigureItem[];
  dark?: boolean;
}

export function FigureStrip({ items, dark = false }: FigureStripProps) {
  const { colors, pairing } = useTheme();
  const fontScale = useFontScale();
  const stacked = fontScale > FIGURE_STACK_ABOVE;
  const captionColor = dark ? colors.inkSoft1 : colors.inkMuted;
  const valueColor = (tone: FigureItem['tone']) => {
    if (tone === 'positive') return colors.accent;
    if (tone === 'negative') return colors.danger;
    return dark ? colors.surface : colors.ink;
  };
  return (
    <View style={stacked ? styles.stack : styles.row}>
      {items.map((item) => (
        <View
          key={item.caption}
          accessible
          accessibilityLabel={`${item.caption}, ${item.value}`}
          style={stacked ? styles.stackItem : styles.cell}
        >
          <Text
            scale="capped"
            style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: captionColor, textTransform: 'uppercase' }}
          >
            {item.caption}
          </Text>
          <Text
            scale="capped"
            maxFontSizeMultiplier={FIGURE_MAX_SCALE}
            style={{ ...textRole(pairing, 'sheetTitle'), color: valueColor(item.tone) }}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.gapMd },
  cell: { flex: 1, gap: CAPTION_GAP },
  stack: { gap: space.gapSm },
  stackItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
