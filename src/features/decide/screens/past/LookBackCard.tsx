// 06.1-27 (UX-20): "Did it cost what you expected?" Expected, Your records show, Difference; Yes, count it / No. A comparison of records,
// not a score. The item name is the user's own text, so it wraps (rule T) rather than being cut.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { LabelValueRow } from '@/ui/LabelValueRow';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';

export interface LookBackCardProps {
  item: string;
  boughtOn: string;
  expected: string;
  actual: string;
  difference: string;
  differenceTone: 'ink' | 'danger' | 'accent';
  /** The unlinked same-day line, as an amount. Null: nothing to ask about, so no Yes / No. */
  extra: string | null;
  onYes: () => void;
  onNo: () => void;
}

export function LookBackCard({ item, boughtOn, expected, actual, difference, differenceTone, extra, onYes, onNo }: LookBackCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View testID="past-lookback" style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>
        {t('decide.screens.past.list.lookBack')}
      </Text>
      <Text style={{ ...textRole(pairing, 'bodyStrong'), color: colors.ink }}>
        {t('decide.screens.past.list.lookBackItem', { item, date: boughtOn })}
      </Text>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.past.list.costQ')}</Text>
      <LabelValueRow label={t('decide.screens.past.list.expected')} value={expected} />
      <LabelValueRow label={t('decide.screens.past.list.recordsShow')} value={actual} />
      <LabelValueRow label={t('decide.screens.past.list.difference')} value={difference} valueTone={differenceTone} />
      {extra !== null ? (
        <>
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.past.list.extraQ', { amount: extra })}</Text>
          <View style={styles.actions}>
            <Pill variant="primary" label={t('decide.screens.past.list.yes')} onPress={onYes} />
            <Pill variant="secondary" label={t('decide.screens.past.list.no')} onPress={onNo} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
});
