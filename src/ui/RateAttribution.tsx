/**
 * MON-07/MON-12: wherever a converted figure is shown, the rate's own publication date
 * (or 'Rate pending' while the server stamp is outstanding, D-17), plus the open.er-api
 * attribution (D-13) beside it when that fallback source supplied the rate. Renders
 * nothing for a same-currency figure, since there is no rate to attribute.
 */
import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatLocalDate } from '@/engine/money';
import type { RateSource } from '@/db/rows';
import { useT } from '@/i18n';
import { EXCHANGE_RATE_API_URL } from '@/i18n/mandatedCopy';
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';

export interface RateAttributionProps {
  rateDate: string | null;
  rateSource: RateSource | null;
  ratePending: boolean;
}

export function RateAttribution({ rateDate, rateSource, ratePending }: RateAttributionProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { locale } = useDeviceLocale();

  if (rateSource === 'same-currency') {
    return null;
  }

  // IN-C03: a stored row can't be stamped without both a date and a source (DB check
  // constraint), but optimistic and cached rows aren't bound by it. Without both, show
  // 'Rate pending' rather than 'Rate of ' with an empty date.
  const pending = ratePending || !rateDate || !rateSource;
  const dateText = pending
    ? t('money.rate.pending')
    : rateSource === 'custom'
      ? t('money.rate.customAsOf', { date: formatLocalDate(rateDate, locale) })
      : t('money.rate.asOf', { date: formatLocalDate(rateDate, locale) });

  const showAttribution = !pending && rateSource === 'open-er-api';
  const attributionText = t('money.rate.attribution');

  const handlePress = () => {
    // WR-C06: openURL rejects when no handler exists (no browser, restricted
    // device or work profile). The attribution text stays on screen either
    // way, so there is nothing further to show; swallow it rather than
    // surfacing an unhandled rejection.
    Linking.openURL(EXCHANGE_RATE_API_URL).catch(() => undefined);
  };

  const labelStyle = {
    ...textRole(pairing, 'label'),
    fontSize: fontSize.meta,
    color: colors.inkMuted,
  };

  // WR-C07: no label on the row. On iOS a label on a non-accessible View is
  // ignored, and on Android it becomes a focusable contentDescription that
  // makes TalkBack read the attribution twice. The date Text and the link
  // are each their own accessible element.
  return (
    <View style={styles.row}>
      <Text style={labelStyle}>{dateText}</Text>
      {showAttribution ? (
        <Pressable
          onPress={handlePress}
          accessibilityRole="link"
          accessibilityLabel={attributionText}
          hitSlop={LINK_HIT_SLOP}
        >
          <Text style={[labelStyle, styles.attribution, { color: colors.inkFaint }]}>{attributionText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// WR-C07: the link is one line of meta text (~13pt), far below the 44pt
// minimum. Extend the tap target vertically to at least space.touchMin and
// horizontally by the small gap, without changing the visual layout.
const LINK_VERTICAL_SLOP = Math.ceil((space.touchMin - fontSize.meta) / 2);
const LINK_HIT_SLOP = {
  top: LINK_VERTICAL_SLOP,
  bottom: LINK_VERTICAL_SLOP,
  left: space.gapSm,
  right: space.gapSm,
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attribution: {
    textDecorationLine: 'underline',
  },
});
