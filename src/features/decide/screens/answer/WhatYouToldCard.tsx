// 06.1-23 (D21 / D21b): "What you told Decide", shown when the check came through the stepper. Kind, Price and how you pay, and
// Running costs; each row reopens its step. A step the person skipped keeps its pre-filled values, marked "pre-filled, not checked",
// and the answer says once that it uses quick estimates. Pure view: props in, taps out.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CAVEAT_KEYS } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { StateBadge } from '@/ui/StateBadge';
import { Text } from '@/ui/Text';

export type ToldStep = 1 | 2 | 3;

export interface WhatYouToldCardProps {
  /** The kind as written, or null when none was picked. */
  kindLabel: string | null;
  /** "{{amount}} up front, cash" or "{{monthly}} a month on a plan", already written. */
  priceLine: string;
  /** "{{monthly}} a month" or "none counted", already written. */
  runningLine: string;
  /** The steps the person went past without opening (L0.skipped_steps). */
  skipped: readonly ToldStep[];
  onEdit: (step: ToldStep) => void;
}

export function WhatYouToldCard({ kindLabel, priceLine, runningLine, skipped, onEdit }: WhatYouToldCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rows: { step: ToldStep; label: string; value: string }[] = [
    { step: 1, label: t('decide.screens.answer.told.kind'), value: kindLabel ?? '' },
    { step: 2, label: t('decide.screens.answer.told.priceAndPay'), value: priceLine },
    { step: 3, label: t('decide.screens.answer.told.running'), value: runningLine },
  ];
  return (
    <View testID="answer-told" accessibilityLabel={t('decide.screens.answer.told.title')} style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
        {t('decide.screens.answer.told.title')}
      </Text>
      {rows.map((row) => (
        <Pressable
          key={row.step}
          testID={`answer-told-${row.step}`}
          accessibilityRole="button"
          accessibilityLabel={`${row.label}. ${row.value}`}
          onPress={() => onEdit(row.step)}
          style={styles.row}
        >
          <View style={styles.text}>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>{row.label}</Text>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{row.value}</Text>
          </View>
          {skipped.includes(row.step) ? <StateBadge tone="notYet" shape="sClock" label={t('decide.screens.common.prefilled')} testID={`answer-told-prefilled-${row.step}`} /> : null}
        </Pressable>
      ))}
      {skipped.length > 0 ? (
        <Text testID="answer-told-quick" style={{ ...textRole(pairing, 'label'), color: colors.inkDim }}>
          {t(CAVEAT_KEYS.quick_estimates as never)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  row: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd, flexWrap: 'wrap' },
  text: { flexShrink: 1 },
});
