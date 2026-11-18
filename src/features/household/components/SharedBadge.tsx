// "Shared": a 24-tall neutral pill drawn like StatusBadge (fill1 / inkDim): household icon 16, a hair gap, the word.
// Not a STATUS key, so it lives here. One accessible text: the word.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, step } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { householdIcons } from '../glyphs';

export function SharedBadge({ testID }: { testID?: string }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const word = t('household.sharing.badge');
  return (
    <View
      testID={testID ?? 'shared-badge'}
      accessible
      accessibilityRole="text"
      accessibilityLabel={word}
      style={[styles.badge, { backgroundColor: colors.fill1 }]}
    >
      <Glyph name={householdIcons.people} size={16} color={colors.inkDim} />
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, lineHeight: fontSize.meta * 1.4, color: colors.inkDim }}>
        {word}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: step.hair,
    minHeight: 24,
    paddingHorizontal: step.tight,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
});
