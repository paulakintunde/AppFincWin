// 06.1-14 (UX-10, CMP-F15, T-06.1-14-03): the other ways to look at it, as equal chips in orderOptions order. No chip is larger,
// bolder or coloured as the better one; order is the only thing that differs.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { orderOptions, type FutureKind, type Purpose } from '@/engine/decide/v3';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export type OptionKey = 'later' | 'cheaper' | 'installments';

/** The engine orders FutureKinds; the installments route is the buy-now one, so it sits where buy_now sits. */
const KIND: Readonly<Record<OptionKey, FutureKind>> = { later: 'buy_later', cheaper: 'cheaper', installments: 'buy_now' };

export function optionOrder(present: readonly OptionKey[], purpose: Purpose | null, notWithinYear = false): readonly OptionKey[] {
  const kinds = orderOptions(present.map((k) => KIND[k]), purpose, notWithinYear);
  return kinds.map((kind) => (Object.keys(KIND) as OptionKey[]).find((k) => KIND[k] === kind) as OptionKey);
}

export interface OptionChipsProps {
  present: readonly OptionKey[];
  purpose: Purpose | null;
  onOption: (key: OptionKey) => void;
  /** 08.1-14 (D-06): no ready date within a year (engine order: the cheaper one first). Absent = false. */
  notWithinYear?: boolean;
  /** 08.1-14 (D-06): chips the action bar already offers (the cheaper one leads it), so none is offered twice. */
  hide?: readonly OptionKey[];
}

export function OptionChips({ present, purpose, onOption, notWithinYear = false, hide = [] }: OptionChipsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const ordered = optionOrder(present, purpose, notWithinYear).filter((k) => !hide.includes(k));
  if (ordered.length === 0) return null;
  return (
    <View testID="answer-options" accessibilityLabel={t('decide.screens.answer.frame.optionsA11y')} style={styles.row}>
      {ordered.map((key) => (
        <Pressable
          key={key}
          testID={`answer-option-${key}`}
          accessibilityRole="button"
          onPress={() => onOption(key)}
          style={[styles.chip, { backgroundColor: colors.fill1 }]}
        >
          <Text scale="capped" style={{ ...textRole(pairing, 'label'), color: colors.ink }}>
            {t(`decide.screens.answer.options.${key}`)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  chip: { minHeight: space.touchMin, paddingHorizontal: space.cardPad, borderRadius: 999, justifyContent: 'center' },
});
