/**
 * 05-15 section 7, "Assumptions in play": what the figures lean on, in words. Always renders (the not-a-lender line is
 * always there); the money rows need a resolved verdict, the count rows come from the snapshot meta. A card owing a balance
 * with no minimum terms, a minimum counted without the card's rate, and a loan with no repeating payment are each named
 * (D-40, D-38 / DCU-24). The 'Card payments' row opens the card terms when the screen passes `onEditCardMinimum`.
 */
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ZERO_PERCENT } from '@/engine/decide';
import { useT } from '@/i18n';
import { Text } from '@/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESSED_OPACITY, space } from '@/theme/layout';
import { fontSize, textRole } from '@/theme/typography';
import { CollapsibleSection } from '../../ui/CollapsibleSection';
import { STEADINESS_LABEL } from '../../copy/codeMaps';
import { percentText } from '../../copy/percentText';
import { conversionBasisCopy } from '../../copy/depthVerdictCopy';
import type { CopyRef } from '../../copy/types';
import type { ConversionNote, SnapshotMeta, StackSelection } from '../../snapshot/types';
import { refText, type Translate } from '../refText';
import { TableRow, assessmentOf, moneyOf, type SectionProps } from './sectionUi';

export interface AssumptionsSectionProps extends SectionProps {
  /** source.meta, passed by the flow screen (05-30). */
  meta: SnapshotMeta;
  /** D-40: opens the card terms sheet; without it the 'Card payments' row is plain. */
  onEditCardMinimum?: () => void;
  /** 05-42: other open checks left out of the verdict (A16). */
  stack?: StackSelection;
  /** 05-42: one row per converted currency (D-37), from source.conversions. */
  conversions?: readonly ConversionNote[];
  /** 05-42: the basis row's facts, listed in full here (D-24, D-37); the card minimum item is skipped, the 'Card payments' row carries it. */
  basisItems?: readonly CopyRef[];
  formatDate?: (localDate: string) => string;
}

const CARD_MIN_KEY = 'decide.depth.cardMin.basis';

interface Row {
  key: string;
  label: string;
  value: string;
}

export function AssumptionsSection(props: AssumptionsSectionProps) {
  const { computation, whole, currency, expanded, onToggle, meta, onEditCardMinimum, stack, conversions = [], basisItems = [], formatDate = (d: string) => d } = props;
  const t = useT();
  const tr = t as Translate;
  const { colors, pairing } = useTheme();
  const a = assessmentOf(computation);
  const fmt = moneyOf(whole, currency);
  const rows: Row[] = [];
  if (a) {
    const m = a.context.money;
    rows.push({
      key: 'income',
      label: t('decide.section.asIncome'),
      value: t('decide.section.asIncomeValue', {
        count: m.fullMonthsUsed,
        steadiness: t(STEADINESS_LABEL[m.steadiness]),
        basis: t(m.basis === 'worst' ? 'decide.verdict.basisWorst' : 'decide.verdict.basisAverage'),
      }),
    });
    rows.push({ key: 'expenses', label: t('decide.section.asExpenses'), value: t('decide.section.asExpensesValue', { amount: fmt(m.spendingBasis) }) });
    rows.push({
      key: 'debt',
      label: t('decide.section.asDebt'),
      value: t('decide.section.asDebtValue', { count: meta.debtCount, amount: fmt(a.context.unsecuredDebt) }),
    });
    const rate = a.context.limits.projectionReturn;
    rows.push({
      key: 'return',
      label: t('decide.section.asReturn'),
      value: rate === ZERO_PERCENT ? t('decide.section.asReturnZero') : t('decide.section.asReturnValue', { rate: percentText(rate) }),
    });
    const running = computation.running;
    if (running && running.totalCosts > 0) {
      rows.push({
        key: 'running',
        label: t('decide.section.asRunning'),
        value: t('decide.section.asRunningValue', { counted: running.countedCosts, total: running.totalCosts, ended: running.countedReplaced }),
      });
    }
  }
  if (meta.unconvertedRows > 0) {
    rows.push({ key: 'unconverted', label: t('decide.section.asUnconverted'), value: t('decide.section.asUnconvertedValue', { count: meta.unconvertedRows }) });
  }
  if (meta.derivedDebts > 0) {
    rows.push({ key: 'derived', label: t('decide.section.asDerived'), value: t('decide.section.asDerivedValue', { count: meta.derivedDebts }) });
  }
  if (meta.cardsWithoutMinimum > 0) {
    rows.push({ key: 'cardMinimum', label: t('decide.section.asCardMinimum'), value: t('decide.section.asCardMinimumValue') });
  }
  if (meta.cardsMinimumWithoutRate > 0) {
    rows.push({ key: 'cardNoRate', label: t('decide.section.asCardNoRate'), value: t('decide.section.asCardNoRateValue') });
  }
  if (meta.loansWithoutPayment > 0) {
    rows.push({ key: 'loan', label: t('decide.section.asLoanPayment'), value: t('decide.section.asLoanPaymentValue', { count: meta.loansWithoutPayment }) });
  }
  // D-37, OQ-A1: one row per converted currency, and past lines keep the rate stamped when they were recorded.
  const conversionRows = conversionBasisCopy(conversions, formatDate);
  conversionRows.forEach((c, i) => {
    rows.push({ key: `conv-${i}`, label: t('decide.depth.currency.assumptionTitle'), value: refText(tr, c) });
  });
  if (conversions.length > 0) rows.push({ key: 'pastLines', label: t('decide.depth.currency.assumptionTitle'), value: t('decide.depth.currency.pastLines') });
  // A16: open checks left out of the combined position are counted, never silently dropped.
  if (stack && stack.leftOutIncomplete > 0) {
    rows.push({ key: 'leftIncomplete', label: t('decide.depth.combined.assumptionTitle'), value: t('decide.depth.combined.notCounted', { count: stack.leftOutIncomplete }) });
  }
  if (stack && stack.leftOutCurrency > 0) {
    rows.push({ key: 'leftCurrency', label: t('decide.depth.combined.assumptionTitle'), value: t('decide.depth.combined.notCountedCurrency', { count: stack.leftOutCurrency }) });
  }
  // D-24, D-37: the basis facts in full, so a truncated basis row loses nothing.
  basisItems
    .filter((i) => i.key !== CARD_MIN_KEY)
    .forEach((item, i) => rows.push({ key: `basis-${i}`, label: refText(tr, item), value: '' }));
  return (
    <CollapsibleSection
      title={t('decide.section.assumptionsTitle')}
      summary={t('decide.section.assumptionsSummary', { count: rows.length })}
      expanded={expanded}
      onToggle={onToggle}
    >
      {rows.map((r) =>
        r.key === 'cardMinimum' && onEditCardMinimum ? (
          <Pressable
            key={r.key}
            accessibilityRole="button"
            accessibilityLabel={`${r.label}. ${r.value}`}
            accessibilityHint={t('decide.section.asCardMinimumHint')}
            onPress={onEditCardMinimum}
            style={({ pressed }) => [styles.pressRow, { borderTopColor: colors.line2, opacity: pressed ? PRESSED_OPACITY : 1 }]}
          >
            <View style={styles.text}>
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.s13_5, color: colors.ink }}>{r.label}</Text>
              <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkMuted }}>{r.value}</Text>
            </View>
            <Text style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>›</Text>
          </Pressable>
        ) : (
          <TableRow key={r.key} label={r.label} sub={r.value || undefined} />
        ),
      )}
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.meta, color: colors.inkFaint, paddingTop: space.gapSm }}>
        {t('decide.flow.notLender')}
      </Text>
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  pressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gapMd,
    minHeight: space.touchMin,
    paddingVertical: space.gapSm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1 },
});
