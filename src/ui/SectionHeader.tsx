/**
 * 06.2 D-24: the shared section header. 28 tall, the title on the left, a count or a "See all" link on the right.
 * D-06: never an icon on a section header. The title matches SettingsGroup's group-title look (label role, 700).
 * The See all link reaches a 44+ target through LINK_HIT_SLOP (space.touchMin + slop).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { LINK_HIT_SLOP, usePressFeedback } from '@/ui/pressFeedback';
import { Text } from '@/ui/Text';

export interface SectionHeaderProps {
  title: string;
  count?: number;
  /** The link word, from the calling screen's own copy ("See all"). */
  seeAllLabel?: string;
  onSeeAll?: () => void;
  testID?: string;
}

export function SectionHeader({ title, count, seeAllLabel, onSeeAll, testID }: SectionHeaderProps) {
  const { colors, pairing, fonts } = useTheme();
  const feedback = usePressFeedback('row');
  const label = textRole(pairing, 'label');
  const showLink = onSeeAll !== undefined && seeAllLabel !== undefined;
  return (
    <View testID={testID} style={styles.row}>
      <Text accessibilityRole="header" style={[label, styles.title, { fontFamily: fonts.body[700], color: colors.inkMuted }]}>
        {title}
      </Text>
      {showLink ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={seeAllLabel}
          onPress={onSeeAll}
          hitSlop={LINK_HIT_SLOP}
          android_ripple={feedback.android_ripple}
          style={({ pressed }) => [styles.link, feedback.pressedStyle(pressed)]}
        >
          <Text style={[label, { color: colors.accent }]}>{seeAllLabel}</Text>
        </Pressable>
      ) : count !== undefined ? (
        <Text style={[label, { color: colors.inkMuted }]}>{String(count)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    columnGap: space.gapSm,
    minHeight: 28,
  },
  title: {
    flexShrink: 1,
  },
  link: {
    minHeight: space.touchMin,
    justifyContent: 'center',
  },
});
