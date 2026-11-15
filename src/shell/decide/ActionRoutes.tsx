/**
 * 06.1-26: the two route containers (in the shell: the decide feature may not import the write path that adds a bill). They load the check by id, run it through the v3 engine and hand the screens plain props.
 * Anything not ready (loading, not found, a home-kind check, no purchase) shows a calm back button instead of a half screen.
 * 06.1-63 (CN-7 / CF-7, CB-4, CN-12): while the checks or the engine load, the answer's loading line shows in the screen's frame; the
 * error card shows only on a real failure, and "This check isn't here" only when the checks loaded without this id. Every state has
 * the DetailScreen frame (title, Back, insets). "Back to Decide" goes to Decide home (dismissTo), not back to the answer.
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
import { AnswerLoadingBody } from '@/features/decide/screens/answer/AnswerLoading';
import { CheckNotFound } from '@/features/decide/screens/ui/CheckNotFound';
import { DetailScreen } from '@/shell/screen/DetailScreen';
import { BoughtScreen } from '@/features/decide/screens/actions/BoughtScreen';
import { SaveForItScreen } from '@/features/decide/screens/actions/SaveForItScreen';
import { useGoAheadV3 } from '@/data/mutations/decideGoAhead';
import { useAddRunningCostBill } from '@/data/mutations/runningCostBills';


type Frame = 'bought' | 'saveForIt';

/** The frame titles are the action bar's own words ("I bought it", "Save for it"). */
function frameTitle(t: ReturnType<typeof useT>, frame: Frame): string {
  return frame === 'bought' ? t('decide.screens.answerActions.bar.bought') : t('decide.screens.answerActions.bar.saveForIt');
}

function Away({ frame, onBack }: { frame: Frame; onBack: () => void }) {
  const t = useT();
  const { colors, pairing } = useTheme();
  return (
    <DetailScreen title={frameTitle(t, frame)}>
      <View testID="action-away" style={styles.away}>
        <Text style={{ ...textRole(pairing, 'body'), color: colors.ink }}>{t('decide.screens.common.error.message')}</Text>
        <Pill variant="secondary" label={t('decide.screens.common.backToDecide')} onPress={onBack} />
      </View>
    </DetailScreen>
  );
}

function Loading({ frame }: { frame: Frame }) {
  const t = useT();
  return (
    <DetailScreen title={frameTitle(t, frame)}>
      <AnswerLoadingBody />
    </DetailScreen>
  );
}

/** What the route shows before the screen: loading first, then not found, then a real failure. null once the screen can draw. */
type Gate = 'loading' | 'notFound' | 'away' | null;

function useActionData(id: string) {
  const rc = useRecordContext();
  const checks = useDecideChecks(rc.userId ?? undefined, rc.householdId ?? undefined);
  const row = useMemo(() => (checks.data ?? []).find((c) => c.id === id && c.deleted_at == null) ?? null, [checks.data, id]);
  const v3 = useMemo(() => (row === null ? null : readStoredCheck(row.inputs).check), [row]);
  const engine = useCheckEngine(v3, { checkId: id });
  const fmt = useMoneyFormatter(rc.showCents, rc.homeCurrency);
  const formatMoney = (minor: number): string => fmt.formatMoney({ amount: minorUnits(minor), currency: currencyCode(rc.homeCurrency) });
  const formatDate = (date: string): string => fmt.formatDate(date);
  // CN-7: a pending read is loading, never an error. checks.data stays undefined only while the first fetch is pending or failed.
  const checksLoading = checks.isLoading || (checks.data === undefined && !checks.isError);
  const gate: Gate = checksLoading
    ? 'loading'
    : checks.isError && checks.data === undefined
      ? 'away'
      : row === null
        ? 'notFound'
        : engine.status === 'loading'
          ? 'loading'
          : null;
  return { rc, row, v3, engine, gate, formatMoney, formatDate };
}

export function SaveForItRoute({ id }: { id: string }) {
  const router = useRouter();
  const { rc, row, v3, engine, gate, formatMoney, formatDate } = useActionData(id);
  const toDecide = (): void => router.dismissTo('/decide');
  if (gate === 'loading') return <Loading frame="saveForIt" />;
  if (gate === 'notFound') return <CheckNotFound />;
  if (gate === 'away' || row === null || v3 === null || engine.evaluation === null) return <Away frame="saveForIt" onBack={toDecide} />;
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
      onBackToDecide={toDecide}
      onBackToAnswer={() => router.back()}
    />
  );
}

export function BoughtRoute({ id }: { id: string }) {
  const router = useRouter();
  const { rc, row, v3, engine, gate, formatMoney, formatDate } = useActionData(id);
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
  const toDecide = (): void => router.dismissTo('/decide');
  if (gate === 'loading') return <Loading frame="bought" />;
  if (gate === 'notFound') return <CheckNotFound />;
  if (gate === 'away' || row === null || v3 === null || engine.evaluation === null || rc.userId === null || rc.householdId === null) return <Away frame="bought" onBack={toDecide} />;
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
      accountsLoading={accountsQuery.data === undefined && !accountsQuery.isError}
      formatMoney={formatMoney}
      formatDate={formatDate}
      onDone={toDecide}
    />
  );
}

const styles = StyleSheet.create({
  away: { paddingTop: space.groupGap, gap: space.groupGap },
});
