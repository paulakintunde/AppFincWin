// 05.2-30 (DSU-15): the income tag chip in a money-in row's second line. Pure state first (what the row says about its
// income type), then the chip. The chip wraps rather than truncates and reaches the 44 touch minimum through hitSlop.
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { IncomePayerPromptRow } from '@/db/incomePayerPrompts';
import type { TransactionRow } from '@/db/rows';
import { payerKeyOf } from '@/data/mutations/incomeTagModel';
import { useT } from '@/i18n';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, space } from '@/theme/layout';
import { ACCENT_TINT_OPACITY, warnTint } from '@/theme/tokens';
import { fontSize, textRole } from '@/theme/typography';
import { hapticSelection } from '@/ui/haptics';
import { Text } from '@/ui/Text';

/** Stored income_kind values in the order the sheet lists them, with the keys of their names. */
export const INCOME_KINDS = [
  { kind: 'salary', key: 'activity.incomeTag.kindSalary' },
  { kind: 'commission', key: 'activity.incomeTag.kindCommission' },
  { kind: 'side_business', key: 'activity.incomeTag.kindSide' },
  { kind: 'dividends', key: 'activity.incomeTag.kindDividends' },
  { kind: 'interest', key: 'activity.incomeTag.kindInterest' },
  { kind: 'rent', key: 'activity.incomeTag.kindRent' },
  { kind: 'family', key: 'activity.incomeTag.kindFamily' },
  { kind: 'other', key: 'activity.incomeTag.kindOther' },
] as const;

export type IncomeKind = (typeof INCOME_KINDS)[number]['kind'];

export function kindNameKey(kind: string): string {
  return (INCOME_KINDS.find((k) => k.kind === kind) ?? INCOME_KINDS[INCOME_KINDS.length - 1]!).key;
}

export type IncomeChipState =
  | { state: 'tagged'; kind: string; countsAs: 'available' | 'kept'; regular: boolean }
  | { state: 'new' };

/** True for a plain money-in row: positive, not a transfer leg, not a refund (D-03: a refund is never income). */
export function isIncomeRow(row: Pick<TransactionRow, 'original_amount' | 'transfer_id' | 'is_refund' | 'refund_of'>): boolean {
  return row.original_amount > 0 && row.transfer_id === null && !row.is_refund && (row.refund_of ?? null) === null;
}

/**
 * What the chip says. A tag on the row wins; otherwise a payer rule covering the row's payer; otherwise the row is
 * a new kind of income the person has not answered for.
 */
export function incomeChipState(
  row: Pick<TransactionRow, 'income_kind' | 'counts_as' | 'name' | 'recurring_series_id'>,
  rules: ReadonlyMap<string, IncomePayerPromptRow>
): IncomeChipState {
  const regular = row.recurring_series_id != null;
  if (row.income_kind != null && row.counts_as != null) {
    return { state: 'tagged', kind: row.income_kind, countsAs: row.counts_as, regular };
  }
  const key = payerKeyOf(row.name);
  const rule = key === null ? undefined : rules.get(key);
  if (rule !== undefined) return { state: 'tagged', kind: rule.income_kind, countsAs: rule.counts_as, regular };
  return { state: 'new' };
}

/** payer_key -> live rule, built once per screen. */
export function rulesByPayer(rules: readonly IncomePayerPromptRow[]): ReadonlyMap<string, IncomePayerPromptRow> {
  const byKey = new Map<string, IncomePayerPromptRow>();
  for (const r of rules) if (r.deleted_at === null) byKey.set(r.payer_key, r);
  return byKey;
}

export interface IncomeTagChipProps {
  state: IncomeChipState;
  onPress: () => void;
}

export function IncomeTagChip({ state, onPress }: IncomeTagChipProps) {
  const t = useT();
  const { colors, pairing } = useTheme();

  let label: string;
  let a11y: string;
  let fill: string;
  let textColor: string;
  let tint = false;
  if (state.state === 'new') {
    label = t('activity.incomeTag.chipNew');
    a11y = t('activity.incomeTag.a11yUntagged');
    fill = warnTint;
    textColor = colors.warn1;
  } else {
    const kind = t(kindNameKey(state.kind));
    if (state.countsAs === 'available') {
      label = t(state.regular ? 'activity.incomeTag.chipCountsRegular' : 'activity.incomeTag.chipCounts', { kind });
      a11y = t('activity.incomeTag.a11yCounts', { kind });
      fill = colors.fill1;
      textColor = colors.accent;
      tint = true;
    } else {
      // Dividends kept in the investment are "reinvested"; everything else not counted is "kept".
      label = t(state.kind === 'dividends' ? 'activity.incomeTag.chipReinvested' : 'activity.incomeTag.chipKept', { kind });
      a11y = t('activity.incomeTag.a11yNotCounted', { kind });
      fill = colors.fill2;
      textColor = colors.inkDim;
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={HIT_SLOP}
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      style={[styles.chip, { backgroundColor: fill }]}
    >
      {tint ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, opacity: ACCENT_TINT_OPACITY, borderRadius: radii.pill }]}
        />
      ) : null}
      <Text style={{ ...textRole(pairing, 'label'), fontSize: fontSize.tabLabel, color: textColor }}>{label}</Text>
    </Pressable>
  );
}

// A one-line chip is about 24 high; 10 above and below reaches the 44 minimum.
const HIT_SLOP = { top: 10, bottom: 10, left: 4, right: 4 };

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    borderRadius: radii.pill,
    paddingHorizontal: space.gapSm,
    paddingVertical: 3,
    overflow: 'hidden',
  },
});
