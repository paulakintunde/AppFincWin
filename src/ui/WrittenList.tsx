/**
 * 05-70 (D-76, UI-SPEC R6): "What gets written" as stacked bullet rows. A 6px accent dot sits centred on the first text
 * line and the sentence wraps beside it; amounts stay inside their sentences. Shared by step 5 and the Go ahead confirm so
 * both lists wrap identically. No fixed heights and no line limits.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';

const BULLET = 6;
/** The 13.5px sentence at 1.5 line height; the dot centres on this first line. */
const LINE_HEIGHT = 20.25;

export interface WrittenListProps {
  lines: readonly string[];
}

export function WrittenList({ lines }: WrittenListProps): React.JSX.Element {
  const { colors, pairing } = useTheme();
  const role = textRole(pairing, 'label');
  const dotTop = (LINE_HEIGHT - BULLET) / 2;
  return (
    <View style={styles.list}>
      {lines.map((line, i) => (
        <View key={`${i}-${line}`} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: colors.accent, marginTop: dotTop }]} />
          <Text style={{ ...role, fontSize: fontSize.s13_5, lineHeight: LINE_HEIGHT, color: colors.inkDim, flex: 1 }}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.gapSm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.gapSm },
  dot: { width: BULLET, minHeight: BULLET, borderRadius: BULLET / 2 },
});
