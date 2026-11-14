// 06.1-71 (H-10, FQ10, CN-9): opened from Decide's "Records for <month>", Activity says which month and what Decide is missing
// there, so the user knows why they were sent here. Clear drops the route parameters. Same look as UnpaidBanner.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import type { DecideMonthBanner } from './monthFilter';

const CLEAR_HIT_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };

export interface DecideMonthBannerViewProps {
  banner: DecideMonthBanner;
  /** The month's name ("October"). */
  monthName: string;
  onClear: () => void;
}

export function DecideMonthBannerView({ banner, monthName, onClear }: DecideMonthBannerViewProps): React.JSX.Element {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View testID="activity-decide-banner" style={[styles.banner, { backgroundColor: colors.fill1 }]}>
      <Text style={[styles.text, { ...textRole(pairing, 'label'), color: colors.ink }]}>
        {t('activity.decideBanner.missing', { month: monthName, what: t(`activity.decideBanner.what.${banner.why}`) })}
      </Text>
      <Pressable
        testID="activity-decide-banner-clear"
        accessibilityRole="button"
        accessibilityLabel={t('activity.decideBanner.clearA11y', { month: monthName })}
        hitSlop={CLEAR_HIT_SLOP}
        onPress={onClear}
      >
        {({ pressed }) => (
          <Text style={{ ...textRole(pairing, 'label'), color: pressed ? colors.ink : colors.accent }}>
            {t('activity.decideBanner.clear')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    paddingVertical: space.gapSm,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.glyphTile,
    marginTop: space.gapSm,
  },
  text: { flex: 1 },
});
