// 06-16 (G04, GRW-03): the safety net's "Each month" amount, changed like any goal's. An amount, the switch "Record it each month
// for me to confirm" and the day. Save is one useSaveGoalPlan call with the net's version: the amount, plus the series payload when
// the switch is on (the existing record is handed back so it is updated, never stopped), or series null to stop a record. Nothing
// moves by itself: the record only makes an Expected line the user confirms.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useSaveGoalPlan } from '@/data/mutations/growGoals';
import { useAccounts } from '@/data/queries/accounts';
import { useCategoryLookup } from '@/data/queries/categories';
import type { GoalPlanSeries } from '@/db/goalPlan';
import type { RecurringSeriesRow } from '@/db/rows';
import type { SavingsGoalRow } from '@/db/savingsGoals';
import { useT } from '@/i18n';
import { usePastContext } from '@/features/decide/past/usePastDecisions';
import { useCalcFormat } from '@/features/grow/calculators/typed/CalcFields';
import { useDebtFormat } from '@/features/grow/debts/debtScreenData';
import { seriesPayload } from '@/features/grow/goals/GoalPlanEditSheet';
import { nextRecordDate, planFromMonthly } from '@/features/grow/goals/goalPlanModel';
import { useGoalMoney } from '@/features/grow/home/GoalsSegment';
import { Stepper } from '@/features/grow/ui/Stepper';
import { getDeviceTimeZone } from '@/services/locale/deviceLocale';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { hapticLight } from '@/ui/haptics';
import { MoneyInput } from '@/ui/MoneyInput';
import { Pill } from '@/ui/Pill';
import { Sheet, SheetScroll } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Text } from '@/ui/Text';
import { ToggleRow } from '@/ui/ToggleRow';

export interface NetMonthSheetProps {
  visible: boolean;
  net: SavingsGoalRow;
  /** The net's live monthly record, or null. */
  series: RecurringSeriesRow | null;
  /** Saved so far, home currency minor units (for the reach-date preview). */
  saved: number;
  onClose: () => void;
  onSaved: (stepId: string) => void;
}

export function NetMonthSheet(props: NetMonthSheetProps) {
  return props.visible ? <MonthForm {...props} /> : null;
}

function MonthForm({ net, series, saved, onClose, onSaved }: NetMonthSheetProps) {
  const t = useT() as (key: string, params?: Record<string, string | number>) => string;
  const { colors, pairing } = useTheme();
  const { userId, householdId, today } = usePastContext();
  const money = useGoalMoney();
  const calc = useCalcFormat();
  const fmt = useDebtFormat();
  const cats = useCategoryLookup(userId ?? undefined);
  const accountsQ = useAccounts(householdId ?? undefined);
  const { save } = useSaveGoalPlan();

  const existingDay = series === null ? 16 : Number(series.anchor_date.slice(8, 10));
  const [monthly, setMonthly] = useState<number | null>(net.monthly_amount);
  const [record, setRecord] = useState(series !== null);
  const [day, setDay] = useState(Math.min(28, Math.max(1, existingDay)));

  const accounts = useMemo(() => (accountsQ.data ?? []).filter((a) => a.archived_at === null && a.currency === net.currency), [accountsQ.data, net.currency]);
  const from = series === null ? (accounts.find((a) => a.id !== net.account_id) ?? accounts[0] ?? null) : null;
  const canRecord = series !== null || from !== null;

  const amount = monthly !== null && monthly > 0 ? monthly : null;
  let preview = '';
  if (amount !== null && net.target !== null) {
    const { reachesOn } = planFromMonthly({ saved, target: net.target, monthly: amount, today });
    if (reachesOn !== null) preview = t('grow.safetyNet.eachMonthSheet.preview', { amount: money.amount(amount), target: money.amount(net.target), date: calc.monthYear(reachesOn) });
  }
  const canSave = userId !== null && amount !== null;

  const onSave = () => {
    if (!canSave || amount === null || userId === null) return;
    let payload: GoalPlanSeries | null = null;
    if (record && canRecord) {
      if (series !== null) {
        payload = seriesPayload(series, amount);
        if (day !== existingDay) payload = { ...payload, anchor_date: nextRecordDate(today, day) };
      } else if (from !== null) {
        payload = {
          id: Crypto.randomUUID(),
          account_id: from.id,
          amount,
          anchor_date: nextRecordDate(today, day),
          time_zone: getDeviceTimeZone(),
          name: net.name,
          category_id: cats.transferCategoryId,
        };
      }
    }
    const { stepId } = save({ ownerId: userId, existing: net, fields: { monthly_amount: amount }, series: payload });
    hapticLight();
    onClose();
    onSaved(stepId);
  };

  const title = t('grow.safetyNet.eachMonthSheet.title');
  return (
    <Sheet visible onDismiss={onClose} accessibilityLabel={title}>
      <SheetHeader title={title} cancelLabel={t('grow.common.cancel')} onCancel={onClose} />
      <SheetScroll>
        <View style={styles.body}>
          <MoneyInput value={monthly} currency={net.currency} onChange={setMonthly} label={title} accessibilityLabel={title} large boxed zeroHint />
          <Text accessibilityLiveRegion="polite" style={{ ...textRole(pairing, 'label'), color: colors.inkMuted }}>
            {preview}
          </Text>
          {canRecord ? <ToggleRow label={t('grow.safetyNet.eachMonthSheet.record')} value={record} onChange={setRecord} /> : null}
          {record && canRecord ? (
            <Stepper
              value={day}
              step={1}
              min={1}
              max={28}
              onChange={setDay}
              valueText={fmt.ordinal(day)}
              accessibilityLabel={t('grow.debts.add.dueDay')}
              decrementLabel={t('grow.debts.less')}
              incrementLabel={t('grow.debts.more')}
            />
          ) : null}
          <Pill label={t('grow.safetyNet.eachMonthSheet.save')} variant="primary" disabled={!canSave} onPress={onSave} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space.groupGap, paddingBottom: space.groupGap },
});
