// 06.1-19 (D11): one kind tile in the 2-column radio grid. 112 minimum height; the dashed one adds an own kind.
// 06.1-57 (A-ST-5): the text sits at the top of every tile, so the names in a row share one baseline whatever the sub-line wraps to.
// No clamp: at 2.0x a name or sub-line wraps and the tile grows. No glyph slot (icons wait for the app-life phase).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { hapticSelection } from '@/ui/haptics';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export interface KindTileProps {
  title: string;
  sub: string;
  selected?: boolean;
  dashed?: boolean;
  onPress: () => void;
  testID?: string;
}

export function KindTile({ title, sub, selected = false, dashed = false, onPress, testID }: KindTileProps) {
  const { colors, pairing } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={dashed ? 'button' : 'radio'}
      accessibilityState={dashed ? undefined : { checked: selected }}
      accessibilityLabel={`${title}. ${sub}`}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={[
        styles.tile,
        {
          backgroundColor: selected ? colors.accentTint1 : colors.surface,
          borderColor: selected ? colors.accent : colors.line4,
          borderStyle: dashed ? 'dashed' : 'solid',
        },
      ]}
    >
      <View style={styles.text}>
        <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>{title}</Text>
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flexBasis: '47%', flexGrow: 1, minHeight: 112, borderRadius: radii.card, borderWidth: 1.5, padding: space.cardPad, justifyContent: 'flex-start' },
  text: { gap: 4 },
});
