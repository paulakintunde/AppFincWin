/**
 * 05.3-23 (UI-SPEC Home, Check card): the accent card "Thinking of buying something?" with the home's one primary,
 * a white button that opens a brand-new check. No quick field (owner, 2026-10-29).
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { openV3NewCheck } from '../nav/hrefs';

const BUTTON_MIN = 48;

export interface CheckCardProps {
  onCheck?: () => void;
}

export function CheckCard({ onCheck = openV3NewCheck }: CheckCardProps): React.JSX.Element {
  const t = useT() as unknown as (key: string) => string;
  const { colors, pairing } = useTheme();
  const K = 'decide.v3.ui.home.';
  return (
    <View style={[styles.card, { backgroundColor: colors.accent }]}>
      <Text scale="capped" accessibilityRole="header" style={{ ...textRole(pairing, 'heading'), color: colors.surface }}>
        {t(`${K}checkHeading`)}
      </Text>
      <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.body, color: colors.accentTint1 }}>{t(`${K}checkBody`)}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(`${K}checkCta`)}
        onPress={onCheck}
        style={({ pressed }) => [styles.button, { backgroundColor: colors.surface, opacity: pressed ? PRESSED_OPACITY : 1 }]}
      >
        <Text style={{ ...textRole(pairing, 'label'), color: colors.ink }}>{t(`${K}checkCta`)}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapMd },
  button: {
    minHeight: BUTTON_MIN,
    paddingHorizontal: space.cardPad,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
});
