/**
 * 05-126 (D-103, R18.4): the "This is for housing" switch on a loan, and the "Loans counted as housing" section of the
 * housing-line editor that lists one per live non-card debt. Phase 6's debt editor reuses DebtHousingSwitch. The name is
 * user text (rule T) and wraps (rule W): no line clamp. The switch sits under the name, so rule S needs no second layout.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useDebts } from '@/data/queries/decide';
import { useSetDebtHousing } from '@/data/mutations/debts';
import type { DebtRow } from '@/db/debts';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { fontSize, textRole } from '@/theme/typography';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';
import { Meta, type Money } from '../check/steps/stepUi';

export interface DebtHousingSwitchProps {
  debt: DebtRow;
  /** The record-context user id (DebtRow carries no created_by). */
  ownerId: string;
  whole: Money;
}

export function DebtHousingSwitch({ debt, ownerId, whole }: DebtHousingSwitchProps) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const { setHousing } = useSetDebtHousing();
  const onChange = (next: boolean) => {
    const stepId = setHousing(debt, next, ownerId);
    showToast({ kind: 'ordinary', text: undoLabelText('debtHousingChanged', {}), stepId });
  };
  return (
    <View testID={`debt-housing-${debt.id}`} style={styles.block}>
      <Text style={{ ...textRole(pairing, 'body'), fontSize: fontSize.body, color: colors.ink }}>{debt.name}</Text>
      <Meta tone="muted">{t('decide.housing.payment', { amount: whole(debt.minimum_payment) })}</Meta>
      <ToggleRow
        label={t('decide.housing.switchLabel')}
        accessibilityLabel={t('decide.housing.switchA11y', { name: debt.name })}
        accessibilityHint={t('decide.housing.switchHint')}
        value={debt.is_housing}
        onChange={onChange}
      />
    </View>
  );
}

/** The editor section: the live loans (cards are never housing), or the empty line. */
export function LoansCountedAsHousing({ whole, userId }: { whole: Money; userId: string | null }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  const rc = useRecordContext();
  const debts = useDebts(rc.householdId ?? undefined).data;
  const loans = (debts ?? []).filter((d) => d.deleted_at == null && d.kind !== 'card');
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={{ ...textRole(pairing, 'label'), fontWeight: '600', color: colors.ink }}>
        {t('decide.housing.heading')}
      </Text>
      {loans.length === 0 ? (
        <Meta tone="muted">{t('decide.housing.empty')}</Meta>
      ) : (
        <>
          <Meta tone="muted">{t('decide.housing.helper')}</Meta>
          {userId !== null ? loans.map((d) => <DebtHousingSwitch key={d.id} debt={d} ownerId={userId} whole={whole} />) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.gapSm, paddingTop: space.gapMd },
  block: { gap: 2 },
});
