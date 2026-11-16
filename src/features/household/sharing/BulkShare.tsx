// 08-19 (D-13): the Share action in Activity's bulk bar. It counts what can really be shared before it asks, shares through
// bulk_share_transactions, and reports the count the server gives back. Shown only in a household of 2 or more.
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pill } from '@/ui/Pill';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { hapticFailed, hapticTap } from '@/ui/haptics';
import { householdReasonKeyOrGeneric } from '@/ui/failedWriteLabels';
import { useT } from '@/i18n';
import { useAccounts } from '@/data/queries/accounts';
import { queryKeys } from '@/data/keys';
import { bulkShareTransactions } from '@/db/transactionSplits';
import type { TransactionRow } from '@/db/rows';
import { monthOf } from '@/engine/time';
import { supabase } from '@/services/supabase';
import { showToast } from '@/state/undoToast';
import { useHouseholdScope } from '../useHouseholdScope';

/** Lines the person logged themselves that can be shared: not already shared, not on a joint account, no debt or goal link. */
export function eligibleToShare(rows: readonly TransactionRow[], userId: string | null, jointAccountIds: ReadonlySet<string>): TransactionRow[] {
  return rows.filter(
    (r) =>
      r.created_by === userId &&
      r.is_shared !== true &&
      r.is_settlement !== true &&
      r.transfer_id === null &&
      r.original_amount < 0 &&
      !r.debt_id &&
      !r.goal_id &&
      !jointAccountIds.has(r.account_id),
  );
}

export function BulkShare({ rows, onShared }: { rows: readonly TransactionRow[]; onShared?: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const { householdId, userId, members, name } = useHouseholdScope();
  const accounts = useAccounts(householdId ?? undefined).data;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (members.length < 2 || householdId === null) return null;
  const joint = new Set((accounts ?? []).filter((a) => a.is_shared === true).map((a) => a.id));
  const eligible = eligibleToShare(rows, userId, joint);
  const skipped = rows.length - eligible.length;
  const count = eligible.length;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await bulkShareTransactions(supabase, eligible.map((r) => r.id));
      setOpen(false);
      if (!res.ok) {
        hapticFailed();
        showToast({ kind: 'info', text: { key: householdReasonKeyOrGeneric(res.reason) } });
        return;
      }
      const done = typeof res.shared_count === 'number' ? res.shared_count : count;
      hapticTap();
      showToast({ kind: 'ordinary', text: done === 1 ? { key: 'household.sharing.bulk.doneOne' } : { key: 'household.sharing.bulk.done', params: { count: done } } });
      for (const month of new Set(eligible.map((r) => monthOf(r.local_date)))) {
        void qc.invalidateQueries({ queryKey: queryKeys.transactionsMonth(householdId, month) });
      }
      void qc.invalidateQueries({ queryKey: queryKeys.householdBalances(householdId) });
      onShared?.();
    } catch {
      hapticFailed();
      setOpen(false);
      showToast({ kind: 'info', text: { key: 'household.reasons.generic' } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pill
        label={t('household.sharing.bulk.action')}
        variant="secondary"
        onPress={() => (count === 0 ? showToast({ kind: 'info', text: { key: 'household.sharing.bulk.none' } }) : setOpen(true))}
      />
      <ConfirmSheet
        visible={open}
        title={count === 1 ? t('household.sharing.bulk.titleOne') : t('household.sharing.bulk.title', { count })}
        body={`${t('household.sharing.bulk.body', { household: name })}${skipped > 0 ? ` ${t('household.sharing.bulk.skipped', { count: skipped })}` : ''}`}
        cancelLabel={t('record.sheet.cancel')}
        confirmLabel={count === 1 ? t('household.sharing.bulk.confirmOne') : t('household.sharing.bulk.confirm', { count })}
        onConfirm={() => void confirm()}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
