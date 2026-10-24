/**
 * 05-146: the check flow's loading treatment -- skeleton bars on the canvas (the app's skeleton pattern, as the quick card),
 * never a blank page. Shown while the check or its figures are on their way. Busy, with the existing "Loading your figures" label.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';

const BAR_TITLE = 28;
const BAR_CARD = 96;

/** `inFlow`: under the flow's own header, so no extra top room. */
export function CheckFlowLoading({ inFlow = false }: { inFlow?: boolean }) {
  const t = useT();
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={t('decide.home.card.loading')}
      accessibilityState={{ busy: true }}
      testID="check-flow-loading"
      style={[styles.fill, inFlow ? styles.inFlow : null, { backgroundColor: colors.canvas }]}
    >
      <View style={[styles.bar, { minHeight: BAR_TITLE, width: '55%', backgroundColor: colors.fill1 }]} />
      <View style={[styles.bar, { minHeight: BAR_CARD, backgroundColor: colors.fill1 }]} />
      <View style={[styles.bar, { minHeight: BAR_CARD, backgroundColor: colors.fill1 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, padding: space.screenH, paddingTop: space.groupGap * 3, gap: space.gapMd },
  inFlow: { paddingTop: space.gapMd },
  bar: { borderRadius: radii.card },
});
