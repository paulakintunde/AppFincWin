/**
 * 06.2 D-07: the category tile. A thin wrapper over IconTile: the category's own icon in its swatch colour on the
 * swatch tint (36 in a row, 48 big), and the first letter only for a category with no icon drawn. Tiles keep their
 * category colour (D-13). Purely decorative beside the category's own name, so IconTile hides it from the
 * accessibility tree rather than double-announcing.
 */
import React from 'react';
import { categorySwatch, type CategorySwatchKey } from '@/theme/tokens';
import { IconTile, type IconTileSize } from '@/ui/icons/IconTile';
import type { IconName } from '@/ui/icons/iconData';

export interface CategoryGlyphProps {
  colorKey: CategorySwatchKey;
  letter: string;
  /** The category's icon (iconForCategory); null or absent shows the letter. */
  icon?: IconName | null;
  size?: IconTileSize;
  testID?: string;
}

export function CategoryGlyph({ colorKey, letter, icon = null, size, testID }: CategoryGlyphProps) {
  const swatch = categorySwatch[colorKey] ?? categorySwatch.slate;
  return <IconTile icon={icon} size={size} color={swatch.color} tint={swatch.tint} letter={letter} testID={testID} />;
}
