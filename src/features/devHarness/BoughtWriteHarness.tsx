// 05.4-34 (BO-03, D-128, D-129; T-05.4-34-03): the Record-as-bought harness for the Maestro flow. Dev builds only (the caller
// checks boughtHarnessEnabled). There is no shipped Record-as-bought screen while Decide is off, so this creates an open check
// (record_decide_go refuses one that is missing, not yours or not open), waits until it saves, then records the fixed sample as
// bought through the harvested useRecordBought: a day-one row, a payment series, a running-cost series and a debt. The undo toast
// carries the step, so the flow can take it all back. Developer strings, never shipped; no amounts or names in logs.
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/data/keys';
import type { DecideCheckRow } from '@/db/decideChecks';
import { useAccounts } from '@/data/queries/accounts';
import { useCategoryLookup } from '@/data/queries/categories';
import { useCreateCheck } from '@/data/mutations/decideChecks';
import { useRecordBought, type BoughtContext } from '@/data/mutations/boughtWrite';
import { useRecordContext } from '@/features/record/useRecordContext';
import { undoLabelText } from '@/i18n/undoLabel';
import { showToast } from '@/state/undoToast';
import { Pill } from '@/ui/Pill';
import { Text } from '@/ui/Text';
import { space } from '@/theme/layout';
import { SAMPLE_NAME, samplePurchase } from './sampleBought';

const LABEL_TITLE = 'Record as bought (harness)';
const LABEL_BUTTON = 'Record the sample as bought';
const LABEL_SAVING = 'Saving the sample check';
const LABEL_DONE = 'Recorded as bought';
const LABEL_REFUSED = 'Not recorded: the sample could not be written';
const LABEL_NOT_READY = 'Not ready: no everyday account in the home currency, or no Debt category';

type Phase = 'idle' | 'saving' | 'done' | 'refused';

export const SAVE_WAIT_MS = 30_000;

function savedRow(qc: QueryClient, key: readonly unknown[], id: string): DecideCheckRow | null {
  const rows = qc.getQueryData<(DecideCheckRow & { pending?: boolean })[]>(key) ?? [];
  const row = rows.find((r) => r.id === id);
  return row === undefined || row.pending === true ? null : row;
}

/** Resolves with the check once it is in the checks list and saved (not pending), or null after `timeoutMs`. */
export function waitForSavedCheck(qc: QueryClient, key: readonly unknown[], id: string, timeoutMs = SAVE_WAIT_MS): Promise<DecideCheckRow | null> {
  return new Promise((resolve) => {
    const now = savedRow(qc, key, id);
    if (now !== null) {
      resolve(now);
      return;
    }
    const finish = (row: DecideCheckRow | null): void => {
      clearTimeout(timer);
      unsubscribe();
      resolve(row);
    };
    const unsubscribe = qc.getQueryCache().subscribe(() => {
      const row = savedRow(qc, key, id);
      if (row !== null) finish(row);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
  });
}

const CASH_KINDS = new Set(['checking', 'cash']);

export function BoughtWriteHarness() {
  const rc = useRecordContext();
  const userId = rc.userId ?? undefined;
  const householdId = rc.householdId ?? undefined;
  const accounts = useAccounts(householdId).data;
  const lookup = useCategoryLookup(userId);
  const qc = useQueryClient();
  const { create } = useCreateCheck();
  const bought = useRecordBought();
  const [phase, setPhase] = useState<Phase>('idle');

  const ctx = useMemo((): BoughtContext | null => {
    if (!rc.ready || rc.householdId === null) return null;
    const cash = (accounts ?? []).find(
      (a) => a.deleted_at === null && a.archived_at === null && CASH_KINDS.has(a.kind) && a.currency === rc.homeCurrency
    );
    const debtCategoryId = lookup.builtinIds.get('Debt') ?? null;
    if (cash === undefined || debtCategoryId === null) return null;
    return {
      householdId: rc.householdId,
      currency: rc.homeCurrency,
      timeZone: rc.timeZone,
      today: rc.today,
      cashAccountId: cash.id,
      debtCategoryId,
      runningCostCategoryId: lookup.builtinIds.get('Insurance') ?? null,
      name: SAMPLE_NAME,
    };
  }, [rc.ready, rc.householdId, rc.homeCurrency, rc.timeZone, rc.today, accounts, lookup.builtinIds]);

  // Create the check, wait until it is saved, then record the sample against it (all in the press handler, never an effect).
  const onPress = useCallback(async () => {
    if (ctx === null || rc.userId === null) return;
    const checkId = Crypto.randomUUID();
    setPhase('saving');
    create({ userId: rc.userId, id: checkId, householdId: ctx.householdId, kind: 'buy', name: SAMPLE_NAME, inputs: { harness: true }, furthestStep: 1 });
    const row = await waitForSavedCheck(qc, queryKeys.decideChecks(rc.userId, ctx.householdId), checkId);
    const { purchase, result } = samplePurchase(ctx.today, ctx.currency);
    const sent = row === null || purchase === null ? null : bought.record({ check: row, purchase, result, ctx });
    if (sent === null) {
      setPhase('refused');
      return;
    }
    showToast({ kind: 'ordinary', text: undoLabelText('decisionWritten', { name: SAMPLE_NAME }), stepId: sent.stepId });
    setPhase('done');
  }, [ctx, rc.userId, create, qc, bought]);

  return (
    <View style={styles.block}>
      <Text>{LABEL_TITLE}</Text>
      {ctx === null ? <Text testID="harness-bought-not-ready">{LABEL_NOT_READY}</Text> : null}
      <View testID="harness-record-bought">
        <Pill label={LABEL_BUTTON} variant="primary" disabled={ctx === null || phase === 'saving'} onPress={() => void onPress()} />
      </View>
      {phase === 'saving' ? <Text testID="harness-bought-saving">{LABEL_SAVING}</Text> : null}
      {phase === 'done' ? <Text testID="harness-bought-done">{LABEL_DONE}</Text> : null}
      {phase === 'refused' ? <Text testID="harness-bought-refused">{LABEL_REFUSED}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({ block: { gap: space.cardPad / 2, paddingVertical: space.cardPad } });
