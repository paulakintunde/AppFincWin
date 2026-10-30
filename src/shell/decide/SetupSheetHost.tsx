// 05.2-32: registers the sheets the setup steps ask for (setupSheetHost). Lives outside features/decide because the
// editors it opens reach the transaction write path (depcruise fx-fetch-never-from-reads).
//
//  - Regular "Edit": opens the app's own entry sheet (TransactionSheet, the same editor Activity uses) on the payment's
//    row. A confirmed series opens on its next or latest occurrence, which offers "this one / this and future"; a found
//    payment that is not yet a series opens on its latest row, where Repeats makes it one.
//  - "+ Add a regular payment": opens a new expense in the entry sheet (Repeats is on the sheet). The quick-pick label
//    is passed as a name-only prefill (05.2-46); "Other" leaves the name empty.
//  - Account use "Set them": opens the account-use step on its own (edit-one-step) over the unspent step.
//  - Loans "Edit" and "Add a loan or card" (05.2-43): open the loan and card sheet (DebtSheet, mounted by SetupRoute) in edit
//    or add mode. The "editor unavailable" toast stays only for the regular-payment fallbacks.
import { useEffect, useRef } from 'react';
import type { Href } from 'expo-router';
import { monthRange } from '@/engine/time';
import { useEditSeriesFrom, useSetSeriesStatus } from '@/data/mutations/recurringSeries';
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
  // 05.3-34: the refine screen's series writes. Held in a ref so the registered actions always call the latest hooks.
  const edit = useEditSeriesFrom();
  const status = useSetSeriesStatus();
  const seriesWrites = useRef({ edit, status });
  useEffect(() => {
    seriesWrites.current = { edit, status };
  });
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
      addRegular: (_preset, name) => openEntry({ kind: 'new', direction: 'out', name }),
      editDebt: (debt) => openDebtSheet({ mode: 'edit', debt }),
      addDebt: (kind) => openDebtSheet({ mode: 'add', kind }),
      editAccountUse: () => pushOnce('/decide/setup?only=accountUse' as Href),
      updateSeriesAmount: ({ series, amount, labelKey, ownerId, from }) => {
        const sign = series.amount < 0 ? -1 : 1;
        return seriesWrites.current.edit.editFrom({
          id: series.id,
          householdId: series.household_id,
          expectedVersion: series.version,
          patch: { amount: sign * Math.abs(amount) },
          effectiveFrom: from,
          ownerId,
          name: series.name,
          labelKey,
        });
      },
      pauseSeries: ({ series, from, ownerId }) => {
        try {
          return seriesWrites.current.status.pause(series, from, ownerId);
        } catch {
          return null;
        }
      },
    };
    return registerSetupSheetActions(actions);
  }, [householdId, today]);
}
