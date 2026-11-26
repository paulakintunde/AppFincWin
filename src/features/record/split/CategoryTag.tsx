// 10.1-18 (SPL-04, D-05): the "N categories" pill that replaces the single category on a split line's Activity row.
// label role, inkMuted on fill1, with a 44 high hit area through slop. Pressable only when a handler is given.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export interface CategoryTagProps {
  count: number;
  onPress?: () => void;
}

const SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

export function CategoryTag({ count, onPress }: CategoryTagProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const label = t('split.tag', { count });
  const body = (
    <View style={[styles.tag, { backgroundColor: colors.fill1 }]}>
      <Glyph name="categories" size={16} color={colors.inkMuted} />
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, flexShrink: 1 }}>{label}</Text>
    </View>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} testID="category-tag">
        {body}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={SLOP} onPress={onPress} testID="category-tag">
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: step.hair,
    minHeight: 28,
    paddingHorizontal: step.row,
    borderRadius: radii.pill,
  },
});
