/**
 * UI-SPEC Design System: the category glyph tile -- an 11px-radius square, tinted with
 * the category's own swatch background, showing a first-letter mark in the swatch
 * colour. Purely decorative beside a category's own name label, so it is hidden from
 * the accessibility tree rather than double-announcing a bare letter.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { categorySwatch, type CategorySwatchKey } from '@/theme/tokens';

export interface CategoryGlyphProps {
  colorKey: CategorySwatchKey;
  letter: string;
}

const TILE_SIZE = 32;

export function CategoryGlyph({ colorKey, letter }: CategoryGlyphProps) {
  const { pairing } = useTheme();
  const swatch = categorySwatch[colorKey];

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.tile, { backgroundColor: swatch.tint, borderRadius: radii.glyphTile }]}
    >
      <Text style={{ ...textRole(pairing, 'label'), color: swatch.color }}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
