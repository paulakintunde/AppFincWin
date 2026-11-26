// 10.1-24 (SCN-01, D-18; UI-SPEC 5a): the reading state. A calm pulsing scan tile (one slow 1.2 s fade between 0.6 and 1,
// stopped after 8 s), a page bar for multi-page scans, "Reading on your phone" with the privacy glyph, the slow line after 8 s,
// and "Stop reading" always visible. Reduce Motion: a still tile. Announces "Reading your receipt" once on mount.
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Glyph } from '@/ui/icons/Glyph';
import { IconTile } from '@/ui/icons/IconTile';
import { ProgressBar } from '@/ui/ProgressBar';
import { LINK_HIT_SLOP } from '@/ui/pressFeedback';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { useReduceMotion } from '@/theme/motion';
import { space, step } from '@/theme/layout';
import { textRole } from '@/theme/typography';

export const SLOW_AFTER_MS = 8000;
const PULSE_MS = 1200;

export interface ReadingViewProps {
  page: number;
  pageCount: number;
  onStop(): void;
}

export function ReadingView({ page, pageCount, onStop }: ReadingViewProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const reduced = useReduceMotion();
  const [slow, setSlow] = useState(false);
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(t('scan.reading.label'));
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
    // once per reading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reduced || slow) {
      opacity.stopAnimation();
      opacity.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: PULSE_MS / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: PULSE_MS / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, slow, opacity]);

  const scan = pageCount > 1;
  const pageText = t('scan.reading.page', { n: page, count: pageCount });

  return (
    <View style={styles.column} testID="scan-reading">
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
        {t('scan.reading.label')}
      </Text>
      <Animated.View style={{ opacity, alignSelf: 'center' }} testID="scan-reading-tile">
        <IconTile icon="scan" size={48} color={colors.ink} tint={colors.fill1} />
      </Animated.View>
      {scan ? (
        <View style={styles.pages}>
          <ProgressBar percent={(page / pageCount) * 100} accessibilityLabel={pageText} animate={!reduced} />
          <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{pageText}</Text>
        </View>
      ) : null}
      <View style={styles.privacy}>
        <Glyph name="privacy" size={16} color={colors.inkMuted} />
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, flexShrink: 1 }}>{t('scan.reading.onPhone')}</Text>
      </View>
      {slow ? (
        <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'body'), color: colors.ink }} testID="scan-reading-slow">
          {t('scan.reading.slow')}
        </Text>
      ) : null}
      <Pressable accessibilityRole="button" hitSlop={LINK_HIT_SLOP} onPress={onStop} style={styles.stop} testID="scan-reading-stop">
        <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('scan.review.stop')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: step.card, paddingVertical: step.card },
  pages: { gap: step.tight },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: step.hair },
  stop: { minHeight: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
