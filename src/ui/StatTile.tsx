/**
 * 06.2 D-24: the shared stat tile for figures (Grow, and Insights in Phase 7). A white card about 88 tall: a muted
 * label over a tabular figure, with an optional status under the figure. The tile is one accessible element that reads
 * "label, value[, status word]". It never clips: no fixed height, the figure wraps and the tile grows at 2.0x.
 *
 * StatTileRow sets exactly two tiles side by side; where side-by-side text stacks elsewhere (D-76 rule S,
 * useShouldStack: narrower than 360 or text larger than 1.3x) the tiles stack one per line instead.
 */
import React, { Children, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useShouldStack } from '@/ui/textFit';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { radii, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';

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

export function StatTileRow({ children, testID }: { children: ReactNode; testID?: string }) {
  const stacked = useShouldStack();
  const tiles = Children.toArray(children).slice(0, 2);
  return (
    <View testID={testID ?? 'stat-tile-row'} style={stacked ? styles.stack : styles.row}>
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
