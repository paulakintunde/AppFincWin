// 06-17 (G06): one debt. What is owed, how much of the start is paid, the loan's own terms, what paying more would change, the
// payments, and the two quiet actions: close the loan from a sale (D-16) and remove the debt. The figures are the engine's, read
// through useDebtsRead and debtWhatIf; this file lays them out.
// 06-36 (D-30, D-32): "If you pay more" is the plan's reveal in small (+$25 / +$50 / +$100 / $1,000 once, each with its date and
// interest against the minimum). Payments list the next expected line and the last paid lines, each opening Activity's detail.
// "Change in the payoff plan" opens Grow on the Debts segment.
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useAccounts } from '@/data/queries/accounts';
import { useDebtPayments } from '@/data/queries/growDebts';
import { useRemoveDebt } from '@/data/mutations/debts';
import type { TransactionRow } from '@/db/rows';
import { currencyExponent } from '@/engine/money';
import { cardMinEstimateFloor } from '@/engine/payoff';
import { EXTRA_CHIP_UNITS } from '@/features/grow/calculators/record/DebtExtraCalculator';
import { dueDateOf } from '@/features/grow/connect/debtPoint';
import { useRecordLineDetail } from '@/features/grow/goals/useGoalRecordDetail';
import { GrowGlyph } from '@/features/grow/ui/GrowGlyph';
import { ProgressBar } from '@/features/grow/ui/ProgressBar';
import { StateBadge } from '@/features/grow/ui/StateBadge';
import { useT } from '@/i18n';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { showToast } from '@/state/undoToast';
import { PRESSED_OPACITY, radii, space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { shadows } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { Chip } from '@/ui/Chip';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { hapticLight } from '@/ui/haptics';
import { Pill } from '@/ui/Pill';
import { Row } from '@/ui/Row';
import { Text } from '@/ui/Text';
import { AddDebtSheet } from './AddDebtSheet';
import { aboutTens, paidPercent, soonerSpan } from './debtLineModel';
import { useDebtFormat, useDebtRows } from './debtScreenData';
import { SaleSheet } from './SaleSheet';
import { debtWhatIf, useDebtsRead } from './useDebtsRead';

export interface DebtDetailScreenProps {
  id: string;
}

/** A reveal chip: an extra a month, or one payment once, in the currency's major units (scaled to minor units on use). */
interface RevealChip {
  key: string;
  kind: 'extra' | 'once';
  units: number;
}

/** D-30: the detail reveal's chips, from the calculator's own list (without its "none" chip), plus 1,000 once. */
export const DETAIL_CHIPS: readonly RevealChip[] = [
  ...EXTRA_CHIP_UNITS.filter((u) => u > 0).map((u) => ({ key: `extra-${u}`, kind: 'extra' as const, units: u })),
  { key: 'once-1000', kind: 'once', units: 1000 },
];
const FIRST_CHIP = 'extra-50';

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
  const [chipKey, setChipKey] = useState(FIRST_CHIP);

  const row = rows.get(id);
  const line = read.model.debts.find((d) => d.id === id) ?? read.model.paidInFull.find((d) => d.id === id) ?? null;
  const payments = useDebtPayments(row, read.today).data;
  const paymentLines = useMemo(
    () => (payments === undefined ? [] : payments.next === null ? payments.paid : [payments.next, ...payments.paid]),
    [payments]
  );
  const record = useRecordLineDetail({ householdId: read.householdId, ownerId: read.userId, today: read.today, lines: paymentLines });

  // D-30: the open chip's what-if against minimum only, from the engine (debtWhatIf -> fixedPayoff). The card shows only when
  // the minimum alone clears the debt; otherwise there is no "sooner" or "less" to compare against.
  const reveal = useMemo(() => {
    if (line === null || line.point.paidInFull || line.point.balance <= 0) return null;
    const chip = DETAIL_CHIPS.find((c) => c.key === chipKey) ?? DETAIL_CHIPS[0]!;
    const minor = chip.units * 10 ** currencyExponent(line.currency);
    const r = debtWhatIf(line, read.today, chip.kind === 'extra' ? { extra: minor } : { lump: minor });
    if (r.minimumOnly.outcome !== 'cleared') return null;
    const s = r.scenario;
    if (s.outcome !== 'cleared' || s.payoffDate === null || s.totalInterest === null || s.soonerMonths === null || s.lessInterest === null) {
      return { chip, figures: null };
    }
    return { chip, figures: { date: s.payoffDate, interest: s.totalInterest, sooner: s.soonerMonths, less: s.lessInterest } };
  }, [line, chipKey, read.today]);

  const label = { ...textRole(pairing, 'label'), color: colors.inkMuted };
  const body = { ...textRole(pairing, 'body'), color: colors.ink };
  const link = { ...textRole(pairing, 'body'), color: colors.accent };
  const card = [styles.card, { backgroundColor: colors.surface, ...shadows.card }];

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
  const exp = currencyExponent(cur);
  // T2: the start line and bar only when the start is above what is owed now.
  const started = line.startedBalance !== null && line.startedBalance > line.point.balance ? line.startedBalance : null;
  const percent = started === null ? null : paidPercent(started, line.point.balance);
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
  const about = (minor: number) => fmt.money(aboutTens(minor, exp), cur);

  // T5: the fact rows sit tight with a hairline between them.
  const facts: { name: string; value: string }[] = [];
  if (!line.point.paidInFull && rate !== null) facts.push({ name: t('grow.debts.detail.rate'), value: t('grow.debts.detail.rateValue', { rate }) });
  if (!line.point.paidInFull) facts.push({ name: t('grow.debts.detail.payment'), value: payment });
  if (accountName !== null) facts.push({ name: t('grow.debts.detail.paidFrom'), value: accountName });
  // P3-WR-11: the same end date and interest as the Debts list (the saved plan when there is one), so the two never disagree.
  if (line.endDate !== null) {
    const endsKey = line.endsInPlan ? 'grow.debts.detail.endsPlanValue' : 'grow.debts.detail.endsValue';
    facts.push({ name: t('grow.debts.detail.ends'), value: t(endsKey, { date: fmt.monthYear(line.endDate) }) });
  }
  if (line.interestLeft !== null) {
    facts.push({ name: t('grow.debts.detail.interestLeft'), value: t('grow.debts.detail.interestLeftValue', { amount: about(line.interestLeft) }) });
  }

  const spanText = (months: number): string => {
    const span = soonerSpan(months);
    if (span.years === 0) return t('grow.debts.monthsPart', { count: span.months });
    if (span.months === 0) return t('grow.debts.yearsPart', { count: span.years });
    return t('grow.debts.spanYearsMonths', {
      years: t('grow.debts.yearsPart', { count: span.years }),
      months: t('grow.debts.monthsPart', { count: span.months }),
    });
  };
  const revealText = (() => {
    const f = reveal?.figures ?? null;
    if (f === null) return null;
    const date = fmt.monthYear(f.date);
    const sooner = f.sooner > 0 ? t('grow.debts.sooner', { span: spanText(f.sooner) }) : t('grow.debts.revealSame');
    const lessRounded = aboutTens(f.less, exp);
    const less = lessRounded > 0 ? t('grow.debts.revealLess', { amount: fmt.money(lessRounded, cur) }) : t('grow.debts.revealSame');
    const interest = about(f.interest);
    return {
      date: t('grow.debts.detail.whatIfDate', { date, sooner }),
      interest: t('grow.debts.detail.whatIfInterest', { interest, less }),
      a11y: t('grow.debts.revealA11y', { date, sooner, interest, less }),
    };
  })();
  const chipLabel = (c: RevealChip): string => {
    const amount = fmt.money(c.units * 10 ** exp, cur);
    return c.kind === 'extra' ? t('grow.debts.detail.chipExtra', { amount }) : t('grow.debts.detail.chipOnce', { amount });
  };

  // D-32: where each payment came from. A line of the extra series reads "Extra", a line tagged to the debt outside any series
  // (a one-off or a final payment) reads "One-off", the rest "From {account}".
  const paymentSub = (l: TransactionRow): string | undefined => {
    const account = record.accountName(l.account_id);
    if (account === null) return undefined;
    if (row.extra_series_id != null && l.recurring_series_id === row.extra_series_id) return t('grow.debts.detail.paymentExtraSub', { account });
    if (l.recurring_series_id === null && l.debt_id === row.id) return t('grow.debts.detail.paymentOneOffSub', { account });
    return t('grow.debts.detail.paymentPaidSub', { account });
  };
  const paymentAmount = (l: TransactionRow) => fmt.money(Math.abs(l.original_amount), l.original_currency);
  const nextLine = payments?.next ?? null;
  const paidLines = payments?.paid ?? [];
  // A manual debt (no payment series) with a due day still has a payment due; it shows as Expected with nothing to open.
  const fallbackNext = nextLine === null && nextDate !== null && row.series_id === null ? nextDate : null;
  const noPayments = nextLine === null && fallbackNext === null && paidLines.length === 0;
  const expectedLabel = t('grow.goals.detail.expected');

  const remove = (): void => {
    if (read.userId === null) return;
    setRemoveOpen(false);
    try {
      const stepId = removeDebt(row, read.userId);
      hapticLight();
      showToast({ kind: 'destructive', text: { key: 'grow.debts.detail.removedToast', params: { name: row.name } }, stepId });
    } catch {
      // P3-IN-03: refused, so the debt is still here; stay on it.
      showToast({ kind: 'refusal', text: { key: 'grow.common.notSaved' } });
      return;
    }
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
          <Text style={{ ...textRole(pairing, 'label'), color: colors.accent }}>{t('grow.goals.detail.edit')}</Text>
        </Pressable>
      }
    >
      <View testID="grow-debt-detail" style={styles.stack}>
        <View style={styles.hero}>
          <View
            testID="debt-owed"
            accessible
            accessibilityLabel={t('grow.debts.detail.owed', { amount: fmt.money(line.point.balance, cur) })}
            style={styles.figureRow}
          >
            <Text scale="capped" style={{ ...textRole(pairing, 'display'), color: colors.ink, fontVariant: ['tabular-nums'] }}>
              {fmt.money(line.point.balance, cur)}
            </Text>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.inkMuted }}>{t('grow.debts.detail.owedSuffix')}</Text>
          </View>
          {percent === null || started === null ? null : (
            <>
              <Text style={label}>{t('grow.debts.detail.started', { amount: fmt.money(started, cur), percent })}</Text>
              <ProgressBar
                percent={percent}
                variant="thick"
                tone="ink"
                animate={false}
                accessibilityLabel={t('grow.debts.detail.started', { amount: fmt.money(started, cur), percent })}
              />
            </>
          )}
          {line.minimumEstimated ? <StateBadge tone="slate" shape="sQuestion" label={t('grow.debts.minimumEstimated')} /> : null}
        </View>

        {facts.length === 0 && !line.minimumEstimated ? null : (
          <View testID="debt-facts" style={[...card, styles.factsCard]}>
            {facts.map((f, i) => (
              <View key={f.name} style={[styles.fact, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line1 } : null]}>
                <Text style={label}>{f.name}</Text>
                <Text style={[body, styles.factValue]}>{f.value}</Text>
              </View>
            ))}
            {line.minimumEstimated ? (
              <Text style={[label, styles.factNote]}>{t('grow.debts.minimumEstimatedNote', { floor: fmt.money(cardMinEstimateFloor(exp), cur) })}</Text>
            ) : null}
          </View>
        )}

        {reveal === null ? null : (
          <View testID="debt-pay-more" style={card}>
            <Text accessibilityRole="header" style={{ ...textRole(pairing, 'sheetTitle'), color: colors.ink }}>
              {t('grow.debts.detail.morePayTitle')}
            </Text>
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('grow.debts.detail.morePayTitle')}>
              {DETAIL_CHIPS.map((c) => (
                <Chip key={c.key} label={chipLabel(c)} selected={c.key === reveal.chip.key} onPress={() => setChipKey(c.key)} />
              ))}
            </View>
            {revealText === null ? null : (
              <View testID="debt-reveal" accessible accessibilityLabel={revealText.a11y} accessibilityLiveRegion="polite" style={styles.revealLines}>
                <Text style={body}>{revealText.date}</Text>
                <Text style={body}>{revealText.interest}</Text>
              </View>
            )}
            <Pressable
              testID="debt-change-plan"
              accessibilityRole="button"
              accessibilityLabel={t('grow.debts.detail.changeInPlan')}
              onPress={() => router.navigate('/(tabs)/grow?segment=debts' as Href)}
              style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
            >
              <Text style={link}>{t('grow.debts.detail.changeInPlan')}</Text>
              <GrowGlyph name="chev" color={colors.accent} size={16} />
            </Pressable>
            {rate === null ? null : (
              <Pressable
                testID="debt-try-other"
                accessibilityRole="button"
                accessibilityLabel={t('grow.debts.detail.tryOther')}
                onPress={() => pushOnce(`/grow/calculators/debt/${id}` as Href)}
                style={({ pressed }) => [styles.link, { opacity: pressed ? PRESSED_OPACITY : 1 }]}
              >
                <Text style={link}>{t('grow.debts.detail.tryOther')}</Text>
                <GrowGlyph name="chev" color={colors.accent} size={16} />
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontSize: fontSize.eyebrow, color: colors.inkMuted }}>
            {t('grow.debts.detail.payments')}
          </Text>
          <View testID="debt-payments" style={[...card, styles.paymentsCard]}>
            {noPayments ? <Text style={[label, styles.empty]}>{t('grow.debts.detail.paymentsEmpty')}</Text> : null}
            {nextLine !== null ? (
              <View testID="debt-payment-next" style={styles.expected}>
                <Row
                  label={fmt.dayMonth(nextLine.local_date)}
                  sublabel={paymentSub(nextLine)}
                  value={paymentAmount(nextLine)}
                  dense
                  chevron
                  onPress={() => record.open(nextLine)}
                  accessibilityLabel={`${fmt.dayMonth(nextLine.local_date)}, ${paymentAmount(nextLine)}, ${expectedLabel}`}
                />
                <StateBadge tone="slate" shape="sClock" label={expectedLabel} />
              </View>
            ) : fallbackNext !== null ? (
              <View testID="debt-payment-next" style={styles.expected}>
                <Row label={fmt.dayMonth(fallbackNext)} value={fmt.money(line.point.minimum, cur)} dense />
                <StateBadge tone="slate" shape="sClock" label={expectedLabel} />
              </View>
            ) : null}
            {paidLines.map((l) => {
              const date = fmt.dayMonth(l.local_date);
              const sub = paymentSub(l);
              const amount = paymentAmount(l);
              return (
                <Row
                  key={l.id}
                  label={date}
                  sublabel={sub}
                  value={amount}
                  dense
                  chevron
                  onPress={() => record.open(l)}
                  accessibilityLabel={t('grow.goals.detail.historyRowA11y', { date, amount, source: sub ?? '' })}
                />
              );
            })}
            <Row label={t('grow.debts.detail.seeAllInActivity')} chevron dense onPress={() => router.navigate({ pathname: '/activity', params: { debt: row.id } } as Href)} />
          </View>
        </View>

        <View style={styles.actions}>
          {line.point.paidInFull ? null : (
            <Pressable testID="debt-sold" accessibilityRole="button" accessibilityLabel={t('grow.debts.detail.sold')} onPress={() => setSaleOpen(true)} style={styles.action}>
              <Text style={{ ...textRole(pairing, 'body'), color: colors.accent }}>{t('grow.debts.detail.sold')}</Text>
            </Pressable>
          )}
          <Pressable testID="debt-remove" accessibilityRole="button" accessibilityLabel={t('grow.debts.detail.remove')} onPress={() => setRemoveOpen(true)} style={styles.action}>
            <Text style={{ ...textRole(pairing, 'body'), color: colors.danger }}>{t('grow.debts.detail.remove')}</Text>
          </Pressable>
        </View>
        <Text style={label}>{t('grow.debts.footer')}</Text>
      </View>

      {record.element}
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
  figureRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space.gapSm },
  card: { borderRadius: radii.card, padding: space.cardPadLg, gap: space.gapSm },
  factsCard: { gap: 0, paddingVertical: space.gapSm },
  factNote: { paddingVertical: space.gapSm },
  center: { alignItems: 'center' },
  block: { borderRadius: radii.card },
  fact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gapMd, minHeight: space.touchMin },
  factValue: { flexShrink: 1, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gapSm },
  revealLines: { gap: 2 },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.gapSm, minHeight: space.touchMin },
  section: { gap: space.gapSm },
  paymentsCard: { gap: 0, paddingVertical: space.gapSm },
  expected: { gap: 2, paddingBottom: space.gapSm },
  empty: { paddingVertical: space.gapSm },
  actions: { gap: space.gapSm },
  action: { minHeight: space.touchMin, justifyContent: 'center' },
  edit: { minHeight: space.touchMin, minWidth: space.touchMin, alignItems: 'center', justifyContent: 'center' },
});
