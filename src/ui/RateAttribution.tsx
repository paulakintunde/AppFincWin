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
import { useDeviceLocale } from '@/services/locale/deviceLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';

// T-01-14-01: hard-coded constant, never built from data.
const ATTRIBUTION_URL = 'https://www.exchangerate-api.com';

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

  const formattedDate = rateDate ? formatLocalDate(rateDate, locale) : '';
  const dateText = ratePending
    ? t('money.rate.pending')
    : rateSource === 'custom'
      ? t('money.rate.customAsOf', { date: formattedDate })
      : t('money.rate.asOf', { date: formattedDate });

  const showAttribution = !ratePending && rateSource === 'open-er-api';
  const attributionText = t('money.rate.attribution');

  const handlePress = () => {
    // WR-C06: openURL rejects when no handler exists (no browser, restricted
    // device or work profile). The attribution text stays on screen either
    // way, so there is nothing further to show; swallow it rather than
    // surfacing an unhandled rejection.
    Linking.openURL(ATTRIBUTION_URL).catch(() => undefined);
  };

  const labelStyle = {
    ...textRole(pairing, 'label'),
    fontSize: fontSize.meta,
    color: colors.inkMuted,
  };

  const accessibilityLabel = showAttribution ? `${dateText}. ${attributionText}` : dateText;

  return (
    <View style={styles.row} accessibilityLabel={accessibilityLabel}>
      <Text style={labelStyle}>{dateText}</Text>
      {showAttribution ? (
        <Pressable onPress={handlePress} accessibilityRole="link" accessibilityLabel={attributionText}>
          <Text style={[labelStyle, styles.attribution, { color: colors.inkFaint }]}>{attributionText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

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
