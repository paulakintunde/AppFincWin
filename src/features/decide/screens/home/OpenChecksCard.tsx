/**
 * 06.1-22 (D-13, UX-09; the changed flag is changeSinceLooked's answer, computed in useOpenCheckRows): the Decide home "Open checks" card. Each row is 52+ high with the item name, a state badge (glyph plus
 * word, never colour alone), then price, date and what it leaves. A draft shows the notYet "Draft" badge; a check whose records
 * changed since it was last looked at says so. There is one add link, "+ Purchase" (D-13: no investment link). With no open check
 * the card renders nothing.
 * 06.1-56 (A-HOME-7, DS-12): a draft shows its typed price too; each row carries its own date (the purchase date, else the day it
 * was made), short ("Nov 3"); the spoken label lists only the parts that have a value. The newest 5 show, then "See all" opens the
 * rest in place (there is no separate open-checks list).
 * 06.2-22 (D-23, board L08/L08b; D-13): each row is a plain 64 row led by the state icon as a 36 tile in that state's tint, then
 * the name, the badge word with the meta line, and the arrow. The state colour is only in the tile's shape and the badge; nothing
 * else on the row is tinted. A draft's tile is neutral with the pen in a square (the Draft icon, status map). The spoken label is
 * unchanged, and a press is still a tick (hapticSelection is hapticTick, D-20).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { verdictRowFor, type Code, type Variant } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { iconSize, radii, space, tile } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors, type StateTone } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { Glyph } from '@/ui/icons/Glyph';
import type { IconName } from '@/ui/icons/iconData';
import { IconTile } from '@/ui/icons/IconTile';
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

/**
 * 06.2-22 (D-23): the tile icon for each state. cond (half symbol in 06.1) takes the half-filled stateTight drawing and extra
 * (up symbol) takes stateUp: the closest L07/L08 set glyphs to the 06.1 badge shapes. Colour, badge word and spoken label still
 * tell cond from tight.
 */
export const OPEN_CHECK_TILE_ICON: Readonly<Record<StateTone, IconName>> = Object.freeze({
  fits: 'stateFits',
  tight: 'stateTight',
  short: 'stateShort',
  net: 'stateSafetyNet',
  notYet: 'stateDue',
  cond: 'stateTight',
  extra: 'stateUp',
});

/** The Draft icon (status map: L06 draws the pen in a square beside "Draft"). */
export const OPEN_CHECK_DRAFT_ICON: IconName = 'firstEntry';

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
  const isDraft = row.draft || row.code === null;
  const tileColors = isDraft ? { color: colors.inkDim, tint: colors.fill1 } : { color: stateColors[badge.tone].stroke, tint: stateColors[badge.tone].tint };
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
      <IconTile
        icon={isDraft ? OPEN_CHECK_DRAFT_ICON : OPEN_CHECK_TILE_ICON[badge.tone]}
        size={tile.row}
        color={tileColors.color}
        tint={tileColors.tint}
        testID={`open-check-tile-${row.id}`}
      />
      <View style={styles.main}>
        <Text style={[styles.name, { ...textRole(pairing, 'body'), fontWeight: '500', color: colors.ink }]}>
          {row.name}
        </Text>
        <View style={styles.metaLine}>
          <StateBadge tone={badge.tone} shape={badge.shape} label={badge.word} testID={`open-check-badge-${row.id}`} />
          <Text style={[styles.meta, { ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }]}>{meta}</Text>
        </View>
        {row.changed ? (
          <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.warn1 }}>{t('decide.screens.sheetsHome.openChecks.changedRow')}</Text>
        ) : null}
      </View>
      <Glyph name="arrowRight" size={iconSize.inline} color={colors.inkFaint} />
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
  // 06.2-22 (L08): a 64 row (two lines), tile, text and arrow 12 apart.
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: space.gapSm },
  main: { flex: 1, minWidth: 0, gap: 3 },
  metaLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 4 },
  meta: { flexShrink: 1 },
  name: { flexShrink: 1 },
});
