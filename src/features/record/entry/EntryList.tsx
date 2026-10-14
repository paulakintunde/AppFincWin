// REC-30 list section of the entry sheet (D-14, D-15, D-28; UI-SPEC 5b): a summary header,
// then one dense row per item, newest first. Swipe left removes; screen readers get Edit and
// Remove from list. Tokens only; every amount arrives pre-formatted through the callbacks.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import type { ListItem, ListSummary } from '@/engine/entryList';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/layout';
import { textRole } from '@/theme/typography';
import { SwipeRow, type SwipeAction } from '@/ui/SwipeRow';

export interface EntryListProps {
  items: readonly ListItem[];
  summary: ListSummary;
  dropped: number;
  formatAmount: (minor: number, currency: string) => string;
  formatDate: (localDate: string) => string;
  accountName: (id: string) => string;
  categoryLabel: (id: string | null) => string;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}

export function EntryList({
  items,
  summary,
  dropped,
  formatAmount,
  formatDate,
  accountName,
  categoryLabel,
  onEdit,
  onRemove,
}: EntryListProps): React.JSX.Element | null {
  const t = useT();
  const { colors, pairing } = useTheme();
  if (items.length === 0 && dropped === 0) return null;

  const frequencyWord = (freq: string) => t(`record.recurring.frequency.${freq}` as 'record.recurring.frequency.monthly');

  const repeatLine = (item: ListItem): string | null => {
    const r = item.repeat;
    if (r.freq === 'never') return null;
    const frequency = frequencyWord(r.freq);
    if (r.end.kind === 'never') return t('record.sheet.list.repeats', { frequency });
    if (r.end.kind === 'date') {
      return t('record.sheet.list.repeatsUntil', { frequency, date: formatDate(r.end.date) });
    }
    return t('record.sheet.list.repeatsTimes', { frequency, count: r.end.count });
  };

  const summaryText =
    t('record.sheet.list.count', { count: summary.count }) +
    (summary.kind === 'single'
      ? t('record.sheet.list.total', { amount: formatAmount(summary.total, summary.currency) })
      : summary.kind === 'split'
        ? t('record.sheet.list.totalSplit', {
            out: formatAmount(summary.outTotal, summary.currency),
            in: formatAmount(summary.inTotal, summary.currency),
          })
        : '');

  const typeWord = (type: ListItem['type']) =>
    t(type === 'out' ? 'record.sheet.directionOut' : type === 'in' ? 'record.sheet.directionIn' : 'record.sheet.directionTransfer');

  return (
    <View style={styles.section}>
      {items.length > 0 ? (
        <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontSize: 13, fontWeight: '600', color: colors.ink }}>
          {summaryText}
        </Text>
      ) : null}
      {dropped > 0 ? (
        <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
          {t('record.sheet.list.dropped', { count: dropped })}
        </Text>
      ) : null}
      {items.map((item, index) => {
        const isTransfer = item.type === 'transfer';
        const name = isTransfer
          ? t('record.sheet.list.transferName', {
              from: accountName(item.accountId),
              to: accountName(item.toAccountId ?? ''),
            })
          : item.name;
        const date = formatDate(item.localDate);
        const sub = isTransfer
          ? t('record.sheet.list.itemSubTransfer', { date })
          : t('record.sheet.list.itemSub', {
              type: typeWord(item.type),
              category: item.categoryId === null ? t('record.sheet.uncategorised') : categoryLabel(item.categoryId),
              date,
            });
        const money = formatAmount(item.amountMinor, item.currency);
        const positive = item.type === 'in' || item.refund;
        const amountText = isTransfer ? `↔ ${money}` : positive ? `+${money}` : money;
        const amountColor = isTransfer ? colors.inkDim : positive ? colors.accent : colors.ink;
        const repeat = repeatLine(item);
        const label = repeat
          ? t('record.sheet.list.itemA11yRepeat', { type: typeWord(item.type), name, amount: amountText, date, repeat })
          : t('record.sheet.list.itemA11y', { type: typeWord(item.type), name, amount: amountText, date });
        const remove: SwipeAction = {
          word: t('record.sheet.list.swipeRemove'),
          a11yLabel: t('record.sheet.list.removeAction'),
          tone: 'danger',
          onCommit: () => onRemove(item.id),
        };
        return (
          <View
            key={item.id}
            style={index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line1 } : undefined}
          >
            <SwipeRow
              right={remove}
              onPress={() => onEdit(item.id)}
              accessibilityLabel={label}
              activateLabel={t('record.sheet.list.editAction')}
            >
              <View style={[styles.row, { backgroundColor: colors.surface }]}>
                <View style={styles.text}>
                  <Text numberOfLines={1} style={{ ...textRole(pairing, 'body'), color: colors.ink }}>
                    {name}
                  </Text>
                  <Text numberOfLines={1} style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                    {sub}
                  </Text>
                  {repeat ? (
                    <Text numberOfLines={1} style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
                      {repeat}
                    </Text>
                  ) : null}
                </View>
                <Text numberOfLines={1} style={{ ...textRole(pairing, 'body'), color: amountColor }}>
                  {amountText}
                </Text>
              </View>
            </SwipeRow>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.gapSm,
  },
  row: {
    minHeight: space.touchMin,
    paddingVertical: space.rowPadDense,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
  },
  text: {
    flex: 1,
  },
});
