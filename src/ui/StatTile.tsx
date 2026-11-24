/**
 * 06.2 D-24: the shared stat tile for figures (Grow, and Insights in Phase 7). A white card about 88 tall: a muted
 * label over a tabular figure, with an optional status under the figure. The tile is one accessible element that reads
 * "label, value[, status word]". It never clips: no fixed height, the status wraps and the tile grows at 2.0x. The figure
 * stays on one line (a money amount never breaks mid-number) and shrinks a little to fit its tile.
 *
 * StatTileRow sets exactly two tiles side by side; where side-by-side text stacks elsewhere (D-76 rule S,
 * useShouldStack: narrower than 360 or text larger than 1.3x) the tiles stack one per line instead.
 * columns={3} (Insights In / Out / Left) sets the first two side by side and the third full width under them, as three
 * across leaves too little room for an amount; it stacks one per line where rule S stacks, or when the longest figure would
 * not fit half the row even at the minimum shrink (stacking beats shrinking below a readable size).
 */
import React, { Children, isValidElement, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/ui/Text';
import { useShouldStack } from '@/ui/textFit';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { radii, step } from '@/theme/layout';
import { effectiveScale } from '@/theme/fontScale';
import { useFontScale } from '@/theme/FontScaleProvider';
import { fontSize, textRole } from '@/theme/typography';

export interface StatTileProps {
  label: string;
  /** The figure, already formatted (money, count, percent). */
  value: string;
  /** Optional visual status under the value (a StatusBadge, a short line). Hidden from the screen reader. */
  status?: ReactNode;
  /** The status in words, added to the spoken label. */
  statusText?: string;
  testID?: string;
}

export function statTileLabel(label: string, value: string, statusText?: string): string {
  return statusText ? `${label}, ${value}, ${statusText}` : `${label}, ${value}`;
}

export function StatTile({ label, value, status, statusText, testID }: StatTileProps) {
  const { colors, pairing } = useTheme();
  return (
    <View
      testID={testID ?? 'stat-tile'}
      accessible
      accessibilityLabel={statTileLabel(label, value, statusText)}
      style={[styles.tile, shadows.edge, { backgroundColor: colors.surface }]}
    >
      <Text testID="stat-tile-label" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
        {label}
      </Text>
      <Text
        testID="stat-tile-value"
        scale="capped"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={VALUE_MIN_SCALE}
        style={{ ...textRole(pairing, 'heading'), color: colors.ink, fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
      {status !== undefined && status !== null ? (
        <View testID="stat-tile-status" style={styles.status} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {status}
        </View>
      ) : null}
    </View>
  );
}

/** D-76 rule N: the figure may shrink to this share of its size to stay on one line (the app's floor); past it the row stacks. */
export const VALUE_MIN_SCALE = 0.8;
/** A generous average advance for a tabular money glyph, in em, so the estimate errs toward stacking. */
const FIGURE_GLYPH_EM = 0.6;

function longestValue(tiles: ReactNode[]): number {
  let max = 0;
  for (const tile of tiles) {
    if (isValidElement<{ value?: unknown }>(tile) && typeof tile.props.value === 'string') max = Math.max(max, tile.props.value.length);
  }
  return max;
}

/**
 * True when a figure of `chars` characters would not fit a half-width tile even at the minimum shrink. `rowWidth` is the
 * row's own laid-out width (before the first layout, an estimate for a row inside a card at the screen edge).
 */
export function figureTooWideForHalf(chars: number, rowWidth: number, fontScale: number): boolean {
  const textWidth = (rowWidth - step.tight) / 2 - 2 * step.card;
  const glyph = fontSize.heading * effectiveScale(fontScale, 'capped') * FIGURE_GLYPH_EM * VALUE_MIN_SCALE;
  return chars * glyph > textWidth;
}

// 07-06: In / Out / Left strip (UI-SPEC): columns={3} holds three tiles; the default stays two.
export function StatTileRow({ children, testID, columns = 2 }: { children: ReactNode; testID?: string; columns?: 2 | 3 }) {
  const tiles = Children.toArray(children).slice(0, columns);
  const ruleS = useShouldStack();
  const { width } = useWindowDimensions();
  const fontScale = useFontScale();
  const [measured, setMeasured] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width);
  const rowWidth = measured ?? width - 2 * step.edge - 2 * step.card;
  const stacked = ruleS || (columns === 3 && figureTooWideForHalf(longestValue(tiles), rowWidth, fontScale));
  if (columns === 3 && !stacked) {
    // Two across, the third full width under them.
    return (
      <View testID={testID ?? 'stat-tile-row'} style={styles.stack} onLayout={onLayout}>
        <View testID="stat-tile-pair" style={styles.row}>
          {tiles.slice(0, 2).map((tile, i) => (
            <View key={i} testID="stat-tile-cell" style={styles.cell}>
              {tile}
            </View>
          ))}
        </View>
        {tiles.slice(2).map((tile, i) => (
          <View key={i + 2} testID="stat-tile-cell">
            {tile}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View testID={testID ?? 'stat-tile-row'} style={stacked ? styles.stack : styles.row} onLayout={columns === 3 ? onLayout : undefined}>
      {tiles.map((tile, i) => (
        <View key={i} testID="stat-tile-cell" style={stacked ? undefined : styles.cell}>
          {tile}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { minHeight: 88, borderRadius: radii.card, padding: step.card, justifyContent: 'center' },
  status: { marginTop: step.hair },
  row: { flexDirection: 'row', gap: step.tight },
  stack: { flexDirection: 'column', gap: step.tight },
  cell: { flex: 1, minWidth: 0 },
});
