/**
 * Plan 05.2-22: the "We found ..." tile under the pay title. Plan 05.2-23 owns the shell-level PrefillNote with the
 * same look; this local tile keeps the income steps self-contained until the registry (05.2-32) can swap it. It only
 * informs: it never selects anything.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';

const GLYPH = 16;

export function PrefillTile({ text }: { text: string }) {
  const { colors, pairing } = useTheme();
  return (
    <View accessible accessibilityLabel={text} style={[styles.tile, { backgroundColor: colors.accentTint1 }]}>
      <Svg width={GLYPH} height={GLYPH} viewBox="0 0 16 16" accessibilityElementsHidden importantForAccessibility="no">
        <Path d="M3 8.5l3.2 3.2L13 4.8" stroke={colors.accent} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink, flex: 1, flexShrink: 1 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { flexDirection: 'row', alignItems: 'flex-start', gap: space.gapMd, padding: space.cardPad, borderRadius: radii.card },
});
