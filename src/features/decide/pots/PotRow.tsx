// 05-127 (D-101, R18.2): one pot row. Name (rule T: two lines, tail ellipsis, the full name in the a11y label) with the
// 44 x 44 ⋯ menu, the progress bar and caption (GoalProgress), and line 3 by state. A plain pot swipes left to Delete; a
// Wait pot belongs to its check, so its menu is Mark done / Reopen only and it has no swipe.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MoreGlyph } from '@/features/record/activity/header/HeaderGlyphs';
import { currencyCode, minorUnits } from '@/engine/money';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { Dropdown } from '@/ui/Dropdown';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { SwipeRow } from '@/ui/SwipeRow';
import { Text } from '@/ui/Text';
import { monthLabel } from '../home/ChangeSheet';
import { GoalProgress } from '../ui/GoalProgress';
import { lineThreeKey, type PotRowModel } from './potsModel';

type T = (key: string, params?: Record<string, string | number>) => string;

export interface PotRowProps {
  pot: PotRowModel;
  /** Done rows read dimmed. */
  dimmed?: boolean;
  /** The home currency, for the amounts of a converted pot. */
  home: string;
  formatDate: (localDate: string) => string;
  onOpen: () => void;
  onToggleDone: () => void;
  /** Absent for a Wait pot: no Delete in the menu and no swipe. */
  onDelete?: () => void;
}

const DELETE_KEY = 'delete';
const DONE_KEY = 'done';
const DOT = '●';

export function PotRow({ pot, dimmed = false, home, formatDate, onOpen, onToggleDone, onDelete }: PotRowProps) {
  const t = useT() as T;
  const { colors, pairing } = useTheme();
  const fmt = useMoneyFormatter(false);
  const { row } = pot;
  // Amounts here are in the home currency (converted); a rate-less row has none to show.
  const currency = currencyCode(home);
  const money = (n: number) => fmt.formatMoney({ amount: minorUnits(n), currency });
  const spoken = (n: number) => fmt.formatMoneyA11y({ amount: minorUnits(n), currency });
  const month = pot.month === null ? '' : monthLabel(fmt.locale, pot.month);
  const doneDate = pot.doneAt === null ? '' : formatDate(pot.doneAt.slice(0, 10));
  const isDone = row.done_at !== null;

  const key = lineThreeKey(pot);
  const lineThree = t(key, {
    amount: money(pot.monthly),
    month,
    date: key === 'decide.pots.doneLine' ? doneDate : row.ready_by === null ? '' : formatDate(row.ready_by),
    remaining: money(pot.remaining),
    currency: row.currency,
  });

  const savedText = pot.saved === null ? '' : spoken(pot.saved);
  const targetText = pot.target === null ? '' : spoken(pot.target);
  let a11y: string;
  if (pot.state === 'no_rate') a11y = t('decide.pots.rowA11yNoRate', { name: row.name, currency: row.currency });
  else if (pot.state === 'done') a11y = t('decide.pots.rowA11yDone', { name: row.name, saved: savedText, target: targetText, date: doneDate });
  else if (pot.state === 'reached') a11y = t('decide.pots.rowA11yReached', { name: row.name, saved: savedText, target: targetText });
  else if (pot.state === 'past_due') a11y = t('decide.pots.rowA11yPastDue', { name: row.name, saved: savedText, target: targetText, remaining: spoken(pot.remaining) });
  else if (pot.kind === 'wait') {
    a11y = t('decide.pots.rowA11yWait', { name: row.name, saved: savedText, target: targetText, monthly: spoken(pot.monthly), date: row.ready_by === null ? '' : formatDate(row.ready_by) });
  } else a11y = t('decide.pots.rowA11y', { name: row.name, saved: savedText, target: targetText, monthly: spoken(pot.monthly), month });

  const options = [
    { key: DONE_KEY, label: t(isDone ? 'decide.pots.menu.reopen' : 'decide.pots.menu.markDone') },
    ...(onDelete !== undefined ? [{ key: DELETE_KEY, label: t('decide.pots.menu.delete'), tone: 'danger' as const }] : []),
  ];

  const pastDue = pot.state === 'past_due';
  const meta = { ...textRole(pairing, 'label'), fontSize: fontSize.meta };

  return (
    <SwipeRow
      right={
        onDelete === undefined
          ? undefined
          : { word: t('decide.pots.menu.delete'), a11yLabel: t('decide.pots.menu.delete'), tone: 'danger', onCommit: onDelete }
      }
      disabled={onDelete === undefined}
      onPress={onOpen}
      accessibilityLabel={a11y}
    >
      <View style={styles.row}>
        <View style={styles.content}>
          <Text numberOfLines={2} ellipsizeMode="tail" style={{ ...textRole(pairing, 'body'), color: dimmed ? colors.inkMuted : colors.ink }}>
            {row.name}
          </Text>
          <GoalProgress saved={pot.saved} target={pot.target} whole={fmt} currency={currency} />
          <Text style={{ ...meta, color: pastDue ? colors.warn1 : colors.inkMuted }}>
            {pastDue ? `${DOT} ` : ''}
            {lineThree}
          </Text>
        </View>
        <Dropdown
          variant="glyph"
          glyph={<MoreGlyph color={colors.inkMuted} />}
          title={row.name}
          options={options}
          triggerA11yLabel={t('decide.pots.menu.moreFor', { name: row.name })}
          onSelect={(k) => {
            if (k === DELETE_KEY) onDelete?.();
            else onToggleDone();
          }}
        />
      </View>
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  content: { flex: 1, gap: 4, paddingVertical: space.rowPad, paddingLeft: 18, minHeight: space.touchMin },
});
