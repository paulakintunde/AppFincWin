// The 36 px tinted lead tile (fill1 base, accent wash, accent glyph). Shared by the Debts rows,
// the Calculators page, the Tools row and holding rows. Tokens only.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GrowGlyph, type GrowGlyphName } from '@/features/grow/ui/GrowGlyph';
import { radii } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { ACCENT_TINT_OPACITY } from '@/theme/tokens';

export type AccTileProps = {
  glyph: GrowGlyphName;
  /** Tile edge in px. Default 36. */
  size?: number;
};

export function AccTile({ glyph, size = 36 }: AccTileProps): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { width: size, height: size, backgroundColor: colors.fill1 }]}>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.glyphTile }]}
      />
      <GrowGlyph name={glyph} color={colors.accent} size={22} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radii.glyphTile, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
