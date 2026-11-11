/**
 * 06.1-22 (D-13, UX-09; the changed flag is changeSinceLooked's answer, computed in useOpenCheckRows): the Decide home "Open checks" card. Each row is 52+ high with the item name, a state badge (glyph plus
 * word, never colour alone), then price, date and what it leaves. A draft shows the notYet "Draft" badge; a check whose records
 * changed since it was last looked at says so. There is one add link, "+ Purchase" (D-13: no investment link). With no open check
 * the card renders nothing.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { verdictRowFor, type Code, type Variant } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { StateBadge, type StateBadgeShape } from '@/ui/StateBadge';
import { Text } from '@/ui/Text';
import { stateForVerdict } from '../logic/stateForVerdict';
import type { OpenCheckRowModel } from './homeCardsModel';

export interface OpenChecksCardProps {
  rows: readonly OpenCheckRowModel[];
  formatMoney: (minor: number) => string;
  formatMoneySpoken: (minor: number) => string;
  formatDate: (date: string) => string;
  /** 'YYYY-MM-DD': a row dated today reads "today". */
  today: string;
  onOpen: (id: string) => void;
  onAddPurchase: () => void;
}

/** The badge a row shows: its tone, glyph shape and word. A draft is notYet "Draft"; an unanswered row is a draft. */
export function useRowBadge(row: OpenCheckRowModel): { tone: ReturnType<typeof stateForVerdict>['tone']; shape: StateBadgeShape; word: string } {
  const t = useT();
  if (row.draft || row.code === null) {
    const { tone, glyph } = stateForVerdict('needs_input', null);
    return { tone, shape: glyph as StateBadgeShape, word: t('decide.screens.common.draft') };
  }
  const code = row.code as Code;
  const variant = row.variant as Variant | null;
  const { tone, glyph } = stateForVerdict(code, variant);
  return { tone, shape: glyph as StateBadgeShape, word: t(verdictRowFor(code, variant, row.once).chipKey as never) };
}

function Row({ row, last, props }: { row: OpenCheckRowModel; last: boolean; props: OpenChecksCardProps }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const badge = useRowBadge(row);
  const { formatMoney, formatMoneySpoken, formatDate, today } = props;
  const dateText = row.date === null || row.date === today ? t('decide.screens.sheetsHome.openChecks.today') : formatDate(row.date);
  const meta = [
    row.draft && row.payNotChosen ? t('decide.screens.sheetsHome.openChecks.payNotChosen') : row.price === null ? null : formatMoney(row.price),
    dateText,
    row.left === null || row.draft ? null : t('decide.screens.sheetsHome.openChecks.leaves', { left: formatMoney(row.left) }),
  ]
    .filter((x): x is string => x !== null)
    .join(' · ');
  const spoken = t('decide.screens.sheetsHome.openChecks.rowA11y', {
    item: row.name,
    state: badge.word,
    price: row.price === null ? '' : formatMoneySpoken(row.price),
    date: dateText,
    left: row.left === null ? '' : formatMoneySpoken(row.left),
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={row.changed ? `${spoken}. ${t('decide.screens.sheetsHome.openChecks.changedRow')}` : spoken}
      onPress={() => {
        hapticSelection();
        props.onOpen(row.id);
      }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.fill6 : 'transparent', borderBottomColor: colors.line1, borderBottomWidth: last ? 0 : 1 },
      ]}
    >
      <View style={styles.main}>
        <View style={styles.head}>
          <Text style={[styles.name, { ...textRole(pairing, 'body'), fontWeight: '500', color: colors.ink }]}>
            {row.name}
          </Text>
          <StateBadge tone={badge.tone} shape={badge.shape} label={badge.word} testID={`open-check-badge-${row.id}`} />
        </View>
        <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{meta}</Text>
        {row.changed ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{t('decide.screens.sheetsHome.openChecks.changedRow')}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function OpenChecksCard(props: OpenChecksCardProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  if (props.rows.length === 0) return null;
  return (
    <View testID="open-checks-card" style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
          {t('decide.screens.sheetsHome.openChecks.title')}
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('decide.screens.sheetsHome.openChecks.addPurchaseA11y')}
          onPress={() => {
            hapticSelection();
            props.onAddPurchase();
          }}
          style={styles.add}
        >
          <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.accent }}>{t('decide.screens.sheetsHome.openChecks.addPurchase')}</Text>
        </Pressable>
      </View>
      {props.rows.map((row, i) => (
        <Row key={row.id} row={row} last={i === props.rows.length - 1} props={props} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, paddingHorizontal: space.cardPad, paddingVertical: space.gapSm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm, minHeight: space.touchMin },
  add: { minHeight: space.touchMin, justifyContent: 'center', paddingHorizontal: space.gapSm },
  row: { minHeight: 52, justifyContent: 'center', paddingVertical: space.gapSm },
  main: { gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapSm },
  name: { flexShrink: 1 },
});
