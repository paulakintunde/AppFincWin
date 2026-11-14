/**
 * 06.1-22 (D-13, UX-09; the changed flag is changeSinceLooked's answer, computed in useOpenCheckRows): the Decide home "Open checks" card. Each row is 52+ high with the item name, a state badge (glyph plus
 * word, never colour alone), then price, date and what it leaves. A draft shows the notYet "Draft" badge; a check whose records
 * changed since it was last looked at says so. There is one add link, "+ Purchase" (D-13: no investment link). With no open check
 * the card renders nothing.
 * 06.1-56 (A-HOME-7, DS-12): a draft shows its typed price too; each row carries its own date (the purchase date, else the day it
 * was made), short ("Nov 3"); the spoken label lists only the parts that have a value. The newest 5 show, then "See all" opens the
 * rest in place (there is no separate open-checks list).
 */
import React, { useState } from 'react';
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
  /** How many rows show before "See all"; default 5. */
  limit?: number;
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
  const own = row.date ?? row.createdOn ?? null;
  const dateText = own === null || own === today ? t('decide.screens.sheetsHome.openChecks.today') : formatDate(own);
  const leaves = row.left === null || row.draft ? null : row.left;
  const meta = [
    row.price === null ? null : formatMoney(row.price),
    row.draft && row.payNotChosen ? t('decide.screens.sheetsHome.openChecks.payNotChosen') : null,
    dateText,
    leaves === null ? null : t('decide.screens.sheetsHome.openChecks.leaves', { left: formatMoney(leaves) }),
  ]
    .filter((x): x is string => x !== null)
    .join(' · ');
  // 06.1-56 (DS-12): only the parts with a value, so the label never has an empty slot or ends in "leaves ".
  const spoken = [
    row.name,
    badge.word,
    row.price === null ? null : formatMoneySpoken(row.price),
    row.draft && row.payNotChosen ? t('decide.screens.sheetsHome.openChecks.payNotChosen') : null,
    dateText,
    leaves === null ? null : t('decide.screens.sheetsHome.openChecks.leaves', { left: formatMoneySpoken(leaves) }),
  ]
    .filter((x): x is string => x !== null && x.trim() !== '')
    .join(', ');
  return (
    <Pressable
      testID={`open-check-row-${row.id}`}
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
  const [all, setAll] = useState(false);
  if (props.rows.length === 0) return null;
  const limit = props.limit ?? 5;
  const shown = all ? props.rows : props.rows.slice(0, limit);
  const more = props.rows.length - shown.length;
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
      {shown.map((row, i) => (
        <Row key={row.id} row={row} last={i === shown.length - 1 && more === 0} props={props} />
      ))}
      {more > 0 ? (
        <Pressable
          testID="open-checks-see-all"
          accessibilityRole="button"
          accessibilityLabel={t('decide.screens.sheetsHome.openChecks.seeAllA11y')}
          onPress={() => {
            hapticSelection();
            setAll(true);
          }}
          style={styles.add}
        >
          <Text style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.accent }}>{t('decide.screens.sheetsHome.openChecks.seeAll', { total: props.rows.length })}</Text>
        </Pressable>
      ) : null}
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
