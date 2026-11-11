/**
 * 06.1-26: the two route containers (in the shell: the decide feature may not import the write path that adds a bill). They load the check by id, run it through the v3 engine and hand the screens plain props.
 * Anything not ready (loading, not found, a home-kind check, no purchase) shows a calm back button instead of a half screen.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { readStoredCheck } from '@/engine/decide/v3';
import { currencyCode, minorUnits } from '@/engine/money';
import { useAccounts } from '@/data/queries/accounts';
import { useDecideChecks } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import { useT } from '@/i18n';
import { space } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';
import { textRole } from '@/theme/typography';
import { useMoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { useCheckEngine } from '@/features/decide/screens/engine/useCheckEngine';
import { BoughtScreen } from '@/features/decide/screens/actions/BoughtScreen';
import { SaveForItScreen } from '@/features/decide/screens/actions/SaveForItScreen';
import { useGoAheadV3 } from '@/data/mutations/decideGoAhead';
import { useAddRunningCostBill } from '@/data/mutations/runningCostBills';


function Away({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <View style={[styles.away, { backgroundColor: colors.canvas }]}>
      <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.common.error.message')}</Text>
      <Pill variant="secondary" label={t('decide.screens.common.backToDecide')} onPress={onBack} />
    </View>
  );
}

function useActionData(id: string) {
  const rc = useRecordContext();
  const checks = useDecideChecks(rc.userId ?? undefined, rc.householdId ?? undefined);
  const row = useMemo(() => (checks.data ?? []).find((c) => c.id === id && c.deleted_at == null) ?? null, [checks.data, id]);
  const v3 = useMemo(() => (row === null ? null : readStoredCheck(row.inputs).check), [row]);
  const engine = useCheckEngine(v3, { checkId: id });
  const fmt = useMoneyFormatter(rc.showCents, rc.homeCurrency);
  const formatMoney = (minor: number): string => fmt.formatMoney({ amount: minorUnits(minor), currency: currencyCode(rc.homeCurrency) });
  const formatDate = (date: string): string => fmt.formatDate(date);
  return { rc, row, v3, engine, formatMoney, formatDate };
}

export function SaveForItRoute({ id }: { id: string }) {
  const router = useRouter();
  const { rc, row, v3, engine, formatMoney, formatDate } = useActionData(id);
  const back = (): void => router.back();
  if (row === null || v3 === null || engine.evaluation === null) return <Away onBack={back} />;
  return (
    <SaveForItScreen
      check={row}
      v3={v3}
      evaluation={engine.evaluation}
      readyDate={engine.readyDate}
      currency={rc.homeCurrency}
      today={rc.today}
      itemName={row.name}
      formatMoney={formatMoney}
      formatDate={formatDate}
      onSeeInGrow={(goalId) => router.replace(`/grow/goal/${goalId}`)}
      onBackToDecide={back}
    />
  );
}

export function BoughtRoute({ id }: { id: string }) {
  const router = useRouter();
  const { rc, row, v3, engine, formatMoney, formatDate } = useActionData(id);
  const adder = useAddRunningCostBill();
  const go = useGoAheadV3();
  const accountsQuery = useAccounts(rc.householdId ?? undefined);
  const accounts = useMemo(
    () =>
      (accountsQuery.data ?? [])
        .filter((a) => a.deleted_at == null && a.archived_at == null && (a.kind === 'cash' || a.kind === 'checking') && a.currency === rc.homeCurrency)
        .map((a) => ({ id: a.id, name: a.name })),
    [accountsQuery.data, rc.homeCurrency]
  );
  const back = (): void => router.back();
  if (row === null || v3 === null || engine.evaluation === null || rc.userId === null || rc.householdId === null) return <Away onBack={back} />;
  return (
    <BoughtScreen
      addBill={adder.add}
      goAhead={go.goAhead}
      checkId={id}
      ownerId={rc.userId}
      householdId={rc.householdId}
      homeCurrency={rc.homeCurrency}
      currency={rc.homeCurrency}
      timeZone={rc.timeZone}
      today={rc.today}
      itemName={row.name}
      v3={v3}
      evaluation={engine.evaluation}
      accounts={accounts}
      formatMoney={formatMoney}
      formatDate={formatDate}
      onDone={back}
    />
  );
}

const styles = StyleSheet.create({
  away: { flex: 1, padding: space.screenH, gap: space.groupGap },
});
