// 06-17 (G06): one debt. What is owed, how much of the start is paid, the loan's own terms, what paying more would change, the next
// expected payment, and the two quiet actions: close the loan from a sale (D-16) and remove the debt. The figures are the engine's,
// read through useDebtsRead / buildDebtsModel; this file lays them out.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useAccounts } from '@/data/queries/accounts';
import { useRemoveDebt } from '@/data/mutations/debts';
import { dueDateOf } from '@/features/grow/connect/debtPoint';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { ProgressBar } from '@/features/grow/ui/ProgressBar';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { hapticLight } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { AddDebtSheet } from './AddDebtSheet';
import { aboutTens, paidPercent } from './debtLineModel';
import { useDebtFormat, useDebtRows } from './debtScreenData';
import { SaleSheet } from './SaleSheet';
import { buildDebtsModel, DEFAULT_EXTRA, useDebtsRead } from './useDebtsRead';

export interface DebtDetailScreenProps {
  id: string;
}

export function DebtDetailScreen({ id }: DebtDetailScreenProps) {
  const t = useT() as (key: string, options?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const read = useDebtsRead();
  const rows = useDebtRows(read.householdId);
  const fmt = useDebtFormat();
  const accounts = useAccounts(read.householdId ?? undefined).data ?? [];
  const { remove: removeDebt } = useRemoveDebt();
  const [editOpen, setEditOpen] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const row = rows.get(id);
  const line = read.model.debts.find((d) => d.id === id) ?? read.model.paidInFull.find((d) => d.id === id) ?? null;
  const more = useMemo(() => {
    if (row === undefined || line === null || line.point.paidInFull) return null;
    const focus = buildDebtsModel([row], read.today, { extra: DEFAULT_EXTRA }).focus;
    if (focus === null || focus.withExtra.outcome !== 'cleared' || focus.minimumOnly.outcome !== 'cleared') return null;
    const dueDay = line.point.dueDay;
    if (dueDay === null || focus.withExtra.months < 1 || focus.minimumOnly.totalInterest === null || focus.withExtra.totalInterest === null) return null;
    return {
      date: dueDateOf(read.today, dueDay, focus.withExtra.months - 1),
      saved: focus.minimumOnly.totalInterest - focus.withExtra.totalInterest,
    };
  }, [row, line, read.today]);

  const label = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line1 }];

  if (read.status === 'loading') {
    return (
      <DetailScreen title="">
        <View testID="grow-debt-loading" accessibilityLabel={t('grow.home.loading')} style={[styles.block, { height: 120, backgroundColor: colors.fill1 }]} />
      </DetailScreen>
    );
  }
  if (row === undefined || line === null) {
    return (
      <DetailScreen title="">
        <View testID="grow-debt-missing" style={[...card, styles.center]}>
          <Text accessibilityRole="header" style={{ ...body, textAlign: 'center' }}>{t('grow.debts.notFoundTitle')}</Text>
          <Text style={{ ...label, textAlign: 'center' }}>{t('grow.common.notFoundBody')}</Text>
          <Pill label={t('grow.common.back')} variant="secondary" onPress={() => router.back()} />
        </View>
      </DetailScreen>
    );
  }

  const cur = line.currency;
  const percent = paidPercent(line.startedBalance, line.point.balance);
  const rate = fmt.rate(row.apr ?? null);
  const accountName = row.account_id === null ? null : accounts.find((a) => a.id === row.account_id)?.name ?? null;
  const day = line.point.dueDay;
  const payment =
    day === null
      ? fmt.money(line.point.minimum, cur)
      : t('grow.debts.detail.paymentValue', {
          amount: fmt.money(line.point.minimum, cur),
          day: fmt.ordinal(day),
          mode: row.series_id !== null ? t('grow.debts.detail.automatic') : t('grow.debts.detail.manual'),
        });
  const nextDate = day !== null && line.point.balance > 0 && !line.point.paidInFull ? dueDateOf(read.today, day, 0) : null;

  const rowOf = (name: string, value: string) => (
    <View key={name} style={styles.fact}>
      <Text style={label}>{name}</Text>
      <Text style={[body, styles.factValue]}>{value}</Text>
    </View>
  );

  const remove = (): void => {
    if (read.userId === null) return;
    try {
      const stepId = removeDebt(row, read.userId);
      hapticLight();
      showToast({ kind: 'destructive', text: { key: 'grow.debts.detail.removedToast', params: { name: row.name } }, stepId });
    } catch {
      showToast({ kind: 'refusal', text: { key: 'grow.common.saveFailed' } });
    }
    setRemoveOpen(false);
    router.back();
  };

  return (
    <DetailScreen
      title={row.name}
      right={
        <Pressable
          testID="debt-edit"
          accessibilityRole="button"
          accessibilityLabel={t('grow.goals.detail.edit')}
          onPress={() => setEditOpen(true)}
          style={({ pressed }) => [styles.edit, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
        >
          <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('grow.goals.detail.edit')}</Text>
        </Pressable>
      }
    >
      <View testID="grow-debt-detail" style={styles.stack}>
        <View style={styles.hero}>
          <Text style={{ ...textRole(pairing, 'heading'), color: colors.ink, fontVariant: ['tabular-nums'] }}>
            {t('grow.debts.detail.owed', { amount: fmt.money(line.point.balance, cur) })}
          </Text>
          {percent === null || line.startedBalance === null ? null : (
            <>
              <Text style={label}>{t('grow.debts.detail.started', { amount: fmt.money(line.startedBalance, cur), percent })}</Text>
              <ProgressBar percent={percent} variant="thick" tone="ink" animate={false} accessibilityLabel={t('grow.debts.detail.started', { amount: fmt.money(line.startedBalance, cur), percent })} />
            </>
          )}
          {line.minimumEstimated ? <StateBadge tone="slate" shape="sQuestion" label={t('grow.debts.minimumEstimated')} /> : null}
        </View>

        <View style={card}>
          {line.point.paidInFull ? null : rate === null ? null : rowOf(t('grow.debts.detail.rate'), t('grow.debts.detail.rateValue', { rate }))}
          {line.point.paidInFull ? null : rowOf(t('grow.debts.detail.payment'), payment)}
          {accountName === null ? null : rowOf(t('grow.debts.detail.paidFrom'), accountName)}
          {line.point.payoffDate === null ? null : rowOf(t('grow.debts.detail.ends'), t('grow.debts.detail.endsValue', { date: fmt.monthYear(line.point.payoffDate) }))}
          {line.point.totalInterest === null
            ? null
            : rowOf(t('grow.debts.detail.interestLeft'), t('grow.debts.detail.interestLeftValue', { amount: fmt.money(aboutTens(line.point.totalInterest), cur) }))}
          {line.minimumEstimated ? <Text style={label}>{t('grow.debts.minimumEstimatedNote', { floor: fmt.money(2500, cur) })}</Text> : null}
        </View>

        {more === null ? null : (
          <View testID="debt-pay-more" style={card}>
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
              {t('grow.debts.detail.morePayTitle')}
            </Text>
            <Text style={body}>
              {t('grow.debts.detail.morePayBody', {
                extra: fmt.money(DEFAULT_EXTRA, cur),
                date: fmt.monthYear(more.date),
                saved: fmt.money(aboutTens(more.saved), cur),
              })}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('grow.debts.detail.changeInPlan')}</Text>
              <GrowGlyph name="chev" color={colors.accent} size={16} />
            </Pressable>
            {rate === null ? null : (
              <Pressable
                testID="debt-try-other"
                accessibilityRole="button"
                onPress={() => pushOnce(`/grow/calculators/debt/${id}` as Href)}
                style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
              >
                <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('grow.debts.detail.tryOther')}</Text>
                <GrowGlyph name="chev" color={colors.accent} size={16} />
              </Pressable>
            )}
          </View>
        )}

        {nextDate === null ? null : (
          <>
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
              {t('grow.debts.detail.payments')}
            </Text>
            <View testID="debt-payments" style={card}>
              <Text style={body}>{t('grow.goals.detail.historyExpected', { date: fmt.dayMonth(nextDate), amount: fmt.money(line.point.minimum, cur) })}</Text>
            </View>
          </>
        )}

        <View style={styles.actions}>
          {line.point.paidInFull ? null : (
            <Pressable testID="debt-sold" accessibilityRole="button" onPress={() => setSaleOpen(true)} style={styles.action}>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('grow.debts.detail.sold')}</Text>
            </Pressable>
          )}
          <Pressable testID="debt-remove" accessibilityRole="button" onPress={() => setRemoveOpen(true)} style={styles.action}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.danger }}>{t('grow.debts.detail.remove')}</Text>
          </Pressable>
        </View>
        <Text style={label}>{t('grow.debts.footer')}</Text>
      </View>

      {editOpen ? <AddDebtSheet visible debt={row} onClose={() => setEditOpen(false)} /> : null}
      {saleOpen ? <SaleSheet visible debt={row} onClose={() => setSaleOpen(false)} /> : null}
      <ConfirmSheet
        visible={removeOpen}
        title={t('grow.debts.detail.removeTitle', { name: row.name })}
        body={t('grow.debts.detail.removeBody')}
        cancelLabel={t('grow.debts.detail.removeKeep')}
        confirmLabel={t('grow.debts.detail.removeConfirm')}
        destructive
        onConfirm={remove}
        onCancel={() => setRemoveOpen(false)}
      />
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.groupGap },
  hero: { gap: space.gapSm },
  card: { borderWidth: 1, borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapSm },
  center: { alignItems: 'center' },
  block: { borderRadius: radii.card },
  fact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd, minHeight: space.touchMin },
  factValue: { flexShrink: 1, textAlign: 'right' },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, minHeight: space.touchMin },
  actions: { gap: space.gapSm },
  action: { minHeight: space.touchMin, justifyContent: 'center' },
  edit: { minHeight: space.touchMin, minWidth: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
