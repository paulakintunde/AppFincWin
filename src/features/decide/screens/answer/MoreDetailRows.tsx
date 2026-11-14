// 06.1-23 (UX-06, UX-07, N03): the "More detail" rows under an answer. Each row opens its own sheet or step; nothing is computed here.
// "Costs that stop when you buy" shows only when the check replaces something, "Give it more to go on" only when the engine names
// a next step or a missing figure, and money help only for a country that has a service listed.
// 06.1-67 (CS-7, DN-4): the two rows that leave the answer (Running costs, Cash and installments side by side) carry the Row
// chevron; rows that open a sheet do not. Every row has a fixed key and place: the rows that come and go with the engine's answer
// (Give it more to go on, money help) sit last, so none appears above a row already shown, and while the answer updates the rows
// take no tap (a tap during the change lands on nothing rather than on the row above).
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { Text } from '@/ui/Text';
import { usePressFeedback } from '@/ui/pressFeedback';

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
  /** The verdict is being worked out again (useCheckEngine.updating): the rows hold still and take no tap. Absent = false. */
  updating?: boolean;
  onOpen: (row: DetailRow) => void;
}

/** The rows that leave the answer for another screen; they show a chevron. */
export const LEAVING_ROWS: ReadonlySet<DetailRow> = new Set<DetailRow>(['running', 'sideBySide']);

export function MoreDetailRows({ runningValue, showStops, giveMoreCount, showHelp, showSideBySide, updating = false, onOpen }: MoreDetailRowsProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  // 06.1-62 (CB-5): each row shows a press at once.
  const press = usePressFeedback('row');
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
          accessibilityState={{ disabled: updating }}
          disabled={updating}
          onPress={() => onOpen(row.key)}
          android_ripple={press.android_ripple}
          style={({ pressed }) => [styles.row, press.pressedStyle(pressed)]}
        >
          <View style={styles.words}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{row.label}</Text>
            {row.value !== undefined ? <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{row.value}</Text> : null}
          </View>
          {LEAVING_ROWS.has(row.key) ? (
            <View testID={`answer-detail-${row.key}-chevron`}>
              <StateGlyph name="chev" color={colors.inkFaint} size={16} />
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  row: { minHeight: space.touchMin, flexDirection: 'row', alignItems: 'center', gap: space.gapSm },
  words: { flex: 1, justifyContent: 'center', gap: space.gapSm },
});
