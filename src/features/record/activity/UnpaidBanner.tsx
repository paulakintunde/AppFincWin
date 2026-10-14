// D-41 / G8: while the Unpaid filter is on, say so under the header, so the list does not look emptied.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';

const CLEAR_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

export function UnpaidBanner({ onClear }: { onClear: () => void }): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View testID="unpaid-banner" style={[styles.banner, { backgroundColor: colors.fill1 }]}>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
        {t('activity.unpaidBanner.text')}
        {' · '}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('activity.unpaidBanner.clearA11y')}
        hitSlop={CLEAR_HIT_SLOP}
        onPress={onClear}
      >
        {({ pressed }) => (
          <Text style={{ ...textRole(pairing, 'label'), color: pressed ? colors.ink : colors.accent }}>
            {t('activity.unpaidBanner.clear')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingVertical: space.gapSm,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.glyphTile,
    marginTop: space.gapSm,
  },
});
