/** UI-SPEC Typography: a strip of captioned figures. Figures cap at 1.3x text size, fit one line
 * by scaling to 0.8 (rule N), and the strip stacks to one row per item under rule S (DCU-11). */
import React from 'react';
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { useShouldStack } from './textFit';

const FIGURE_MIN_FONT_SCALE = 0.8; // D-76 rule N
const FIGURE_MAX_SCALE = 1.3;
const CAPTION_GAP = 2; // UI-SPEC caption-to-figure gap

export interface FigureItem {
  caption: string;
  value: string;
  /** D-94: the value read by currency name; falls back to `value`. */
  a11yValue?: string;
  tone?: 'neutral' | 'positive' | 'negative';
  /** 'figure' (default) must read as one figure and stays on one line; 'words' wraps. */
  kind?: 'figure' | 'words';
  /** A control drawn after the caption (an info button). Used with `group`, since a cell is then not a focus stop. */
  captionAccessory?: React.ReactNode;
}

export interface FigureStripProps {
  items: FigureItem[];
  dark?: boolean;
  /** One focus stop for the whole strip (05-63 key figures); the cells are not separate stops. Accessories stay reachable. */
  group?: {
    label: string;
    actions?: { name: string; label: string }[];
    onAction?: (e: AccessibilityActionEvent) => void;
  };
}

export function FigureStrip({ items, dark = false, group }: FigureStripProps) {
  const { colors, pairing } = useTheme();
  const stacked = useShouldStack();
  const captionColor = dark ? colors.inkSoft1 : colors.inkMuted;
  const valueColor = (tone: FigureItem['tone']) => {
    // UI-SPEC Color: on the ink card positive reads accentTint1 and negative dangerTint2 (the sign and words carry the meaning).
    if (tone === 'positive') return dark ? colors.accentTint1 : colors.accent;
    if (tone === 'negative') return dark ? colors.dangerTint2 : colors.danger;
    return dark ? colors.surface : colors.ink;
  };
  return (
    <View
      style={stacked ? styles.stack : styles.row}
      {...(group
        ? { accessible: true, accessibilityLabel: group.label, accessibilityActions: group.actions, onAccessibilityAction: group.onAction }
        : {})}
    >
      {items.map((item, i) => (
        <View
          // IN-D02: captions can repeat, so the key carries the position too
          key={`${i}-${item.caption}`}
          {...(group ? {} : { accessible: true, accessibilityLabel: `${item.caption}, ${item.a11yValue ?? item.value}` })}
          style={stacked ? styles.stackItem : styles.cell}
        >
          <View style={styles.captionRow}>
            <Text
              scale="capped"
              style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: captionColor, textTransform: 'uppercase', flexShrink: 1 }}
            >
              {item.caption}
            </Text>
            {item.captionAccessory ?? null}
          </View>
          <Text
            scale="capped"
            maxFontSizeMultiplier={FIGURE_MAX_SCALE}
            accessibilityLabel={item.a11yValue}
            {...(item.kind === 'words'
              ? {}
              : { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: FIGURE_MIN_FONT_SCALE })}
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
  // D-86: columns align at the top, so a two-line caption never pushes its neighbour's figure out of line
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.gapMd },
  cell: { flex: 1, gap: CAPTION_GAP },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, flexShrink: 1 },
  stack: { gap: space.gapSm },
  stackItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.gapMd },
});
