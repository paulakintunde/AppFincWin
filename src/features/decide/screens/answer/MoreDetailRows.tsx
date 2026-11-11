// 06.1-23 (UX-06, UX-07, N03): the "More detail" rows under an answer. Each row opens its own sheet or step; nothing is computed here.
// "Costs that stop when you buy" shows only when the check replaces something, "Give it more to go on" only when the engine names
// a next step or a missing figure, and money help only for a country that has a service listed.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';

export type DetailRow = 'running' | 'monthAfter' | 'fullCost' | 'stops' | 'everyDate' | 'monthByMonth' | 'worked' | 'giveMore' | 'help' | 'sideBySide';

export interface MoreDetailRowsProps {
  /** The running-costs value as written ("none counted · Add" or "$40.00 a month · Change"). */
  runningValue: string;
  showStops: boolean;
  /** How many ways to give it more to go on (0 hides the link). */
  giveMoreCount: number;
  showHelp: boolean;
  /** The cash-and-installments comparison; offered for a check with a price. */
  showSideBySide: boolean;
  onOpen: (row: DetailRow) => void;
}

export function MoreDetailRows({ runningValue, showStops, giveMoreCount, showHelp, showSideBySide, onOpen }: MoreDetailRowsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rows: { key: DetailRow; label: string; value?: string }[] = [
    { key: 'running', label: t('decide.screens.answer.runningRow'), value: runningValue },
    { key: 'fullCost', label: t('decide.screens.answer.fullCost') },
    { key: 'monthAfter', label: t('decide.screens.answer.monthAfter') },
    ...(showStops ? [{ key: 'stops' as const, label: t('decide.screens.answer.stops') }] : []),
    ...(showSideBySide ? [{ key: 'sideBySide' as const, label: t('decide.screens.answer.options.sideBySide') }] : []),
    { key: 'everyDate', label: t('decide.screens.answer.everyDate') },
    { key: 'monthByMonth', label: t('decide.screens.answer.monthByMonth') },
    { key: 'worked', label: t('decide.screens.answer.worked.title') },
    ...(giveMoreCount > 0 ? [{ key: 'giveMore' as const, label: t('decide.screens.answer.giveMore.link', { count: giveMoreCount }) }] : []),
    ...(showHelp ? [{ key: 'help' as const, label: t('decide.screens.answer.help.title') }] : []),
  ];
  return (
    <View testID="answer-more-detail" style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
        {t('decide.screens.answer.moreDetail')}
      </Text>
      {rows.map((row) => (
        <Pressable
          key={row.key}
          testID={`answer-detail-${row.key}`}
          accessibilityRole="button"
          accessibilityLabel={row.value === undefined ? row.label : `${row.label}. ${row.value}`}
          onPress={() => onOpen(row.key)}
          style={styles.row}
        >
          <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{row.label}</Text>
          {row.value !== undefined ? <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{row.value}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  row: { minHeight: space.touchMin, justifyContent: 'center', gap: space.gapSm },
});
