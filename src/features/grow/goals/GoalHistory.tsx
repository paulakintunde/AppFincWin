// 06-32 (D-32, GD1, GD2, N1, CRUD #5, #6): the history of one goal or of the safety net, shared by both detail screens.
// Each row reads date / source / amount. Paid rows open the record (Activity's detail sheet); the starting amount is plain
// text. Expected lines show one Expected badge, and only the waiting ones (dated today or before) plus the next one are
// listed. A waiting line has a one-tap Confirm (same confirm path as everywhere else, with Undo); tapping its text opens the
// confirm sheet instead. Pure history building lives in goalHistoryOf so it can be tested alone.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { TransactionRow } from '@/db/rows';
import { useT } from '@/i18n';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Text } from '@/ui/Text';

export interface HistoryItem {
  key: string;
  date: string;
  amount: number;
  kind: 'paid' | 'expected' | 'start';
  line: TransactionRow | null;
}

/**
 * Newest first, then the starting amount. Expected lines: every one dated on or before `today` (they wait for a confirm),
 * plus only the next one after today. Pure.
 */
export function goalHistoryOf(
  lines: readonly TransactionRow[] | undefined,
  goalId: string | null,
  openingSaved: number,
  createdOn: string,
  today: string
): HistoryItem[] {
  if (goalId === null) return [];
  const items: HistoryItem[] = [];
  let next: HistoryItem | null = null;
  for (const l of lines ?? []) {
    if (l.goal_id !== goalId || l.status === 'skipped' || l.deleted_at !== null) continue;
    const item: HistoryItem = {
      key: l.id,
      date: l.local_date,
      amount: l.transfer_id === null ? Math.abs(l.original_amount) : l.original_amount,
      kind: l.status === 'pending' ? 'expected' : 'paid',
      line: l,
    };
    if (item.kind === 'expected' && item.date > today) {
      if (next === null || item.date < next.date) next = item;
      continue;
    }
    items.push(item);
  }
  if (next !== null) items.push(next);
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (openingSaved > 0) items.push({ key: 'start', date: createdOn, amount: openingSaved, kind: 'start', line: null });
  return items;
}

export interface GoalHistoryCardProps {
  items: readonly HistoryItem[];
  today: string;
  testID: string;
  formatDate: (date: string) => string;
  amount: (minor: number) => string;
  /** The other leg of a transfer line, when loaded. */
  partnerOf: (line: TransactionRow) => TransactionRow | null;
  accountName: (id: string | null) => string | null;
  onOpenPaid: (line: TransactionRow) => void;
  /** One tap: writes at once (the caller shows the toast with Undo). */
  onConfirm: (item: HistoryItem) => void;
  /** Tapping an Expected row's text: the confirm sheet. */
  onOpenExpected: (item: HistoryItem) => void;
  onAddMoney: () => void;
  /** P4-WR-05: Expected lines whose Confirm was already sent; they show no Confirm button until the lines catch up. */
  sentIds?: ReadonlySet<string>;
}

export function GoalHistoryCard(p: GoalHistoryCardProps) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const card = [styles.card, { backgroundColor: colors.surface }, shadows.card];

  const sourceOf = (h: HistoryItem): string | undefined => {
    if (h.kind === 'start' || h.line === null) return t('grow.goals.detail.historyStartSub');
    const l = h.line;
    if (l.transfer_id === null) {
      const name = p.accountName(l.account_id);
      return name === null ? undefined : t('grow.goals.detail.historyFromSub', { account: name });
    }
    // The goal tag sits on the goal-side leg: money in reads From the other account, money out reads Back to it.
    const name = p.accountName(p.partnerOf(l)?.account_id ?? null);
    if (name === null) return undefined;
    return t(l.original_amount < 0 ? 'grow.goals.detail.historyToSub' : 'grow.goals.detail.historyFromSub', { account: name });
  };

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>
        {t('grow.goals.detail.history')}
      </Text>
      <View style={card} testID={p.testID}>
        {p.items.length === 0 ? (
          <View style={styles.center}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.ink, textAlign: 'center' }}>{t('grow.goals.detail.historyEmptyTitle')}</Text>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted, textAlign: 'center' }}>{t('grow.goals.detail.historyEmptyBody')}</Text>
            <Pill label={t('grow.goals.detail.historyEmptyAction')} variant="secondary" onPress={p.onAddMoney} />
          </View>
        ) : (
          p.items.map((h) => {
            const date = p.formatDate(h.date);
            const value = p.amount(h.amount);
            const source = sourceOf(h);
            if (h.kind === 'start') {
              return <Row key={h.key} label={date} sublabel={source} value={value} dense />;
            }
            if (h.kind === 'paid') {
              const line = h.line as TransactionRow;
              return (
                <Row
                  key={h.key}
                  label={date}
                  sublabel={source}
                  value={value}
                  dense
                  chevron
                  onPress={() => p.onOpenPaid(line)}
                  accessibilityLabel={t('grow.goals.detail.historyRowA11y', { date, amount: value, source: source ?? '' })}
                />
              );
            }
            const due = h.date <= p.today && !(h.line !== null && p.sentIds?.has(h.line.id) === true);
            return (
              <View key={h.key} style={styles.expected}>
                <Row
                  label={date}
                  sublabel={source}
                  value={value}
                  dense
                  chevron
                  onPress={() => p.onOpenExpected(h)}
                  accessibilityLabel={`${date}, ${value}${source ? `, ${source}` : ''}, ${t('grow.goals.detail.expected')}`}
                />
                <View style={styles.expectedFoot}>
                  <StateBadge tone="slate" shape="sClock" label={t('grow.goals.detail.expected')} />
                  {due ? (
                    <View style={styles.confirmCell}>
                      <Pill
                        label={t('grow.goals.detail.confirm')}
                        variant="secondary"
                        onPress={() => p.onConfirm(h)}
                        accessibilityLabel={t('grow.goals.detail.confirmA11y', { amount: value, date })}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.gapSm },
  card: { borderRadius: radii.card, padding: space.cardPad, gap: space.gapSm },
  center: { alignItems: 'center', gap: space.gapSm },
  expected: { gap: 2 },
  expectedFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd },
  confirmCell: { minWidth: 120 },
});
