// 05.2-32: registers the sheets the setup steps ask for (setupSheetHost). Lives outside features/decide because the
// editors it opens reach the transaction write path (depcruise fx-fetch-never-from-reads).
//
//  - Regular "Edit": opens the app's own entry sheet (TransactionSheet, the same editor Activity uses) on the payment's
//    row. A confirmed series opens on its next or latest occurrence, which offers "this one / this and future"; a found
//    payment that is not yet a series opens on its latest row, where Repeats makes it one.
//  - "+ Add a regular payment": opens a new expense in the entry sheet (Repeats is on the sheet). The quick-pick name is
//    not prefilled: the entry prefill needs an account and an amount the step does not have.
//  - Account use "Set them": opens the account-use step on its own (edit-one-step) over the unspent step.
//  - Loans "Edit" and "Add a loan or card" (05.2-43): open the loan and card sheet (DebtSheet, mounted by SetupRoute) in edit
//    or add mode. The "editor unavailable" toast stays only for the regular-payment fallbacks.
import { useEffect } from 'react';
import type { Href } from 'expo-router';
import { monthRange } from '@/engine/time';
import type { TransactionRow } from '@/db/rows';
import { fetchTransactionsInRange } from '@/db/transactions';
import { openEntry } from '@/features/record/entry/entryHost';
import { useRecordContext } from '@/features/record/useRecordContext';
import { openDebtSheet } from '@/features/decide/setup/debtSheetHost';
import { registerSetupSheetActions, type SetupSheetActions } from '@/features/decide/setup/steps/setupSheetHost';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { supabase } from '@/services/supabase';
import { showToast } from '@/state/undoToast';

const LOOKBACK_MONTHS = 6;
const LOOKAHEAD_MONTHS = 2;

function monthPlus(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + delta;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

const unavailable = (): void => {
  showToast({ kind: 'ordinary', text: { key: 'decide.setup.shell.editorUnavailable' } });
};

/** The row to open: for a series, the next pending occurrence (else the latest); for a found payment, its latest row. */
export function pickEditRow(rows: readonly TransactionRow[], target: { seriesId: string } | { rowIds: readonly string[] }, today: string): TransactionRow | null {
  if ('seriesId' in target) {
    const own = rows.filter((r) => r.recurring_series_id === target.seriesId && r.status !== 'skipped');
    const next = own.find((r) => r.local_date >= today && r.status === 'pending');
    return next ?? own[own.length - 1] ?? null;
  }
  const wanted = new Set(target.rowIds);
  const own = rows.filter((r) => wanted.has(r.id));
  return own[own.length - 1] ?? null;
}

export function useSetupSheetHost(): void {
  const rc = useRecordContext();
  const householdId = rc.householdId;
  const today = rc.today;
  useEffect(() => {
    const openRow = async (target: { seriesId: string } | { rowIds: readonly string[] }): Promise<void> => {
      if (householdId === null) return unavailable();
      const month = today.slice(0, 7);
      try {
        const rows = await fetchTransactionsInRange(supabase, householdId, {
          from: monthRange(monthPlus(month, -LOOKBACK_MONTHS)).start,
          toInclusive: monthRange(monthPlus(month, LOOKAHEAD_MONTHS)).endExclusive,
        });
        const row = pickEditRow(rows, target, today);
        if (row === null) return unavailable();
        openEntry({ kind: 'edit', row });
      } catch {
        unavailable();
      }
    };
    const actions: Partial<SetupSheetActions> = {
      editRegular: (target) => {
        void openRow('series' in target ? { seriesId: target.series.id } : { rowIds: target.candidate.rowIds });
      },
      addRegular: () => openEntry({ kind: 'new', direction: 'out' }),
      editDebt: (debt) => openDebtSheet({ mode: 'edit', debt }),
      addDebt: (kind) => openDebtSheet({ mode: 'add', kind }),
      editAccountUse: () => pushOnce('/decide/setup?only=accountUse' as Href),
    };
    return registerSetupSheetActions(actions);
  }, [householdId, today]);
}
