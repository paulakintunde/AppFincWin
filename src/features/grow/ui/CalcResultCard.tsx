// 06-21: calculator result card. A polite live region that announces the settled result once (600 ms, Phase 5 D-56).
// iOS announces through AccessibilityInfo, Android through accessibilityLiveRegion. No result -> "Fill in the numbers above".
import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { useSettledLabel } from '@/features/decide/check/useSettledLabel';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export const SETTLE_MS = 600;

export interface CalcResultCardProps {
  /** The formatted headline result, or null when the inputs give no result. */
  value: string | null;
  /** Small line above the headline ("Monthly payment"). */
  caption?: string;
  /** Spoken sentence for the settled result. Defaults to caption + value. */
  announcement?: string;
  /** Supporting rows (already formatted). */
  children?: React.ReactNode;
}

export function CalcResultCard({ value, caption, announcement, children }: CalcResultCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const empty = value === null;
  const fillIn = t('grow.calc.fillIn');
  const label = empty ? fillIn : (announcement ?? [caption, value].filter(Boolean).join(', '));
  const settled = useSettledLabel(label, empty ? 'empty' : 'result', SETTLE_MS);
  const last = useRef(settled);
  useEffect(() => {
    if (settled === last.current) return;
    last.current = settled;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(settled);
  }, [settled]);
  return (
    <View
      testID="calc-result-card"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={settled}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }]}
    >
      {caption ? (
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>{caption}</Text>
      ) : null}
      {empty ? (
        <Text testID="calc-result-empty" style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>
          {fillIn}
        </Text>
      ) : (
        <Text testID="calc-result-value" scale="capped" style={{ ...textRole(pairing, 'display'), color: colors.ink }}>
          {value}
        </Text>
      )}
      {!empty ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.card, padding: space.cardPad, gap: 6 },
});
