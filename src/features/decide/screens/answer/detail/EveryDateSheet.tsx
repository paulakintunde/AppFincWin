// 06.1-20 (D55, UX-38): "Every date, next 90 days". One row per line of the engine's cashTimeline (date, label, signed amount, balance
// after). The lowest point is marked with a glyph and the word "Lowest". A balance below zero reads "{{amount}} short" in the short
// colour (UX-30). If the lowest end-of-day balance falls on a day with no line, a lowest-point row is placed on that date.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { CashTimeline, TimelineRow } from '@/engine/decide/v3';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { stateColors } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { StateGlyph } from '@/ui/glyphs/StateGlyph';
import { Text } from '@/ui/Text';
import { Card, DetailShell, useDetailFormat } from './detailKit';

export interface EveryDateNames {
  series: (id: string) => string;
  debt: (id: string) => string;
}

export interface EveryDateSheetProps {
  /** cashTimeline(prepared, check) via useCheckEngine().timeline(). */
  timeline: CashTimeline;
  currency: string;
  accountName: string;
  names?: EveryDateNames;
  onClose: () => void;
}

interface Item {
  key: string;
  date: string;
  row: TimelineRow | null;
  balance: number;
  lowest: boolean;
}

/** The rows in order, with exactly one marked lowest (the last row on the lowest date, or a row of its own when that day has none). */
export function timelineItems(timeline: CashTimeline): Item[] {
  const { rows, lowest } = timeline;
  const items: Item[] = rows.map((row, i) => ({ key: `r${i}`, date: row.date, row, balance: row.balanceAfter, lowest: false }));
  let at = -1;
  items.forEach((it, i) => {
    if (it.date === lowest.date) at = i;
  });
  const exact = at >= 0 && (items[at] as Item).balance === lowest.balance;
  if (exact) {
    (items[at] as Item).lowest = true;
  } else {
    const entry: Item = { key: 'lowest', date: lowest.date, row: null, balance: lowest.balance, lowest: true };
    // After the last row on or before its date.
    let pos = items.length;
    for (let i = 0; i < items.length; i += 1) {
      if ((items[i] as Item).date > lowest.date) {
        pos = i;
        break;
      }
    }
    items.splice(pos, 0, entry);
  }
  return items;
}

export function EveryDateSheet({ timeline, currency, accountName, names, onClose }: EveryDateSheetProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const f = useDetailFormat(currency, true);
  const k = (key: string): string => String(t(`decide.screens.answerDetail.everyDate.${key}` as never));
  const shortBy = (n: number): string => String(t('decide.screens.answerDetail.monthByMonth.shortBy' as never, { amount: f.money(-n) } as never));
  const shortSpoken = (n: number): string => String(t('decide.screens.answerDetail.monthByMonth.shortBy' as never, { amount: f.spoken(-n) } as never));
  const balanceText = (n: number): string => (n < 0 ? shortBy(n) : f.money(n));
  const balanceSpoken = (n: number): string => (n < 0 ? shortSpoken(n) : f.spoken(n));

  const labelOf = (row: TimelineRow): string => {
    if (row.kind === 'purchase') return k('thisPurchase');
    const named = row.seriesId !== null ? names?.series(row.seriesId) : row.debtId !== null ? names?.debt(row.debtId) : undefined;
    if (named !== undefined && named !== '') return named;
    return k(`kind.${row.kind}`);
  };

  const items = timelineItems(timeline);
  return (
    <DetailShell title={k('title')} sub={String(t('decide.screens.answerDetail.everyDate.sub' as never, { account: accountName } as never))} footer={t('legal.decideAnswer.footer')} onClose={onClose}>
      <Card testID="everydate-rows">
        {items.map((it) => {
          const label = it.row === null ? k('lowest') : labelOf(it.row);
          const amount = it.row === null ? null : it.row.amount;
          const amountText = amount === null ? null : `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${f.money(Math.abs(amount))}`;
          const spoken = String(
            t('decide.screens.answerDetail.everyDate.a11yRow' as never, {
              date: f.date(it.date),
              label,
              amount: amount === null ? '' : `${amount < 0 ? '−' : ''}${f.spoken(Math.abs(amount))}`,
              balance: balanceSpoken(it.balance),
            } as never)
          );
          return (
            <View
              key={it.key}
              testID={it.lowest ? 'everydate-lowest' : `everydate-row-${it.key}`}
              accessible
              accessibilityLabel={it.lowest ? `${spoken}. ${k('a11yLowest')}` : spoken}
              style={[styles.row, { borderTopColor: colors.line2 }]}
            >
              <View style={styles.text}>
                <Text style={{ ...textRole(pairing, it.lowest ? 'bodyStrong' : 'body'), color: colors.ink }}>{label}</Text>
                <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{f.date(it.date)}</Text>
                {it.lowest ? (
                  <View style={styles.mark}>
                    <StateGlyph name="sDown" color={stateColors.notYet.color} size={16} />
                    <Text style={{ ...textRole(pairing, 'label'), color: stateColors.notYet.color }}>{k('lowestMark')}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.figures}>
                {amountText !== null ? (
                  <Text scale="capped" style={{ ...textRole(pairing, 'bodyStrong'), color: (amount ?? 0) > 0 ? colors.accent : colors.ink, fontVariant: ['tabular-nums'] }}>
                    {amountText}
                  </Text>
                ) : null}
                <Text
                  scale="capped"
                  style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: it.balance < 0 ? stateColors.short.color : colors.inkMuted, fontVariant: ['tabular-nums'] }}
                >
                  {balanceText(it.balance)}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>
      <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>{k('spendingNote')}</Text>
    </DetailShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gapMd, minHeight: space.touchMin, paddingVertical: space.gapSm, borderTopWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, flexShrink: 1, gap: 2 },
  figures: { alignItems: 'flex-end', gap: 2 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
