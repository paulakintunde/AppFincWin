/**
 * 06.2 D-05 / D-07 / D-10: the icon tile. 36 (row, icon 20) or 48 (big, icon 24), corner 11, tinted background, the
 * icon in its colour. With no icon it shows the first-letter fallback (a category whose icon is not drawn), and with
 * neither an empty tile. Decorative beside a word (D-06), so hidden from screen readers.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { iconSize, radii, tile } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { Glyph } from './Glyph';
import type { IconName } from './iconData';

export type IconTileSize = 36 | 48;

export interface IconTileProps {
  icon: IconName | null;
  size?: IconTileSize;
  color: string;
  tint: string;
  letter?: string;
  testID?: string;
}

export function IconTile({ icon, size = tile.row, color, tint, letter, testID }: IconTileProps): React.JSX.Element {
  const { pairing } = useTheme();
  const glyphSize = size === tile.big ? iconSize.big : iconSize.row;
  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants" // Android
      accessibilityElementsHidden // iOS
      style={[styles.tile, { width: size, height: size, backgroundColor: tint }]}
    >
      {icon !== null ? (
        <Glyph name={icon} size={glyphSize} color={color} />
      ) : letter !== undefined && letter !== '' ? (
        <Text style={{ ...textRole(pairing, 'label'), color }}>{letter}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radii.glyphTile,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
