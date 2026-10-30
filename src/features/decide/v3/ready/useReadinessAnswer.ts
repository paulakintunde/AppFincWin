/**
 * 05.3-56 (D-24, D-28, D-29): the write side of the readiness questions. One chip is one write through an existing
 * undoable mutation, with a named toast:
 * - "It was paid" / "It arrived" marks the exact same-series pending line paid (D-29).
 * - "It didn't happen" / "No pay this month" skips that line only when it belongs to a series (B1). A line with no series
 *   gets a didnt_happen / no_pay waiver instead, never a skip.
 * - Every other answer is a waiver, saved to the owner-private decide_answers table (D-28). Nothing writes
 *   recurring_dismissals.
 * A line that is not in the cached snapshot opens Activity: this hook never guesses at a row it cannot see.
 */
import { router, type Href } from 'expo-router';
import type { ReadinessItem, ReadinessWaiver, ReadinessWaiverKind } from '@/engine/decide/v3';
import type { UndoLabelKey } from '@/engine/undo';
import type { TransactionRow } from '@/db/rows';
import { useMarkPaid, useSkipOccurrence } from '@/data/mutations/transactions';
import { useRemoveDecideAnswer, useSaveDecideAnswer } from '@/data/mutations/decideAnswers';
import { useDecideSnapshot } from '@/data/queries/decide';
import { useDecideAnswers } from '@/data/queries/decideAnswers';
import { waiverAnswerFor } from '@/features/decide/snapshot/v3/waiverKeys';
import { ENVELOPES_HREF } from '@/features/decide/v3/nav/hrefs';
import { useV3Format } from '@/features/decide/v3/shared/useV3Format';
import { useRecordContext } from '@/features/record/useRecordContext';
import { undoLabelText } from '@/i18n/undoLabel';
import { pushOnce } from '@/shell/navigation/pushOnce';
import { showToast } from '@/state/undoToast';

export type ReadinessAction =
  | { readonly kind: 'markPaid'; readonly lineId: string }
  | { readonly kind: 'skip'; readonly lineId: string }
  | { readonly kind: 'waive'; readonly waiver: ReadinessWaiver }
  | { readonly kind: 'open'; readonly target: 'activity' | 'envelopes' };

/** Told once whether the answer's write landed (true), or was refused, failed or could not be made (false). */
export type ReadinessSettled = (ok: boolean) => void;

export interface ReadinessAnswer {
  /** item is null for the month link. */
  answer(item: ReadinessItem | null, action: ReadinessAction, onSettled?: ReadinessSettled): void;
  /** "Ask again": removes the stored waiver, with Undo. Does nothing when no live row holds it. */
  clearWaiver(waiver: ReadinessWaiver, name?: string | null): void;
}

const WAIVER_LABEL: Readonly<Record<ReadinessWaiverKind, UndoLabelKey>> = {
  paid_by_other: 'paidByOther',
  always_other: 'alwaysPaidByOther',
  didnt_happen: 'didNotHappen',
  no_pay: 'noPayThisMonth',
  income_elsewhere: 'incomeElsewhere',
  nothing_to_add: 'nothingToAdd',
  month_complete: 'monthComplete',
  start_from: 'decideStartMonth',
};

/** A snapshot row as fetched: the query returns whole transaction rows, typed narrower by the snapshot builder. */
type CachedLine = Partial<Pick<TransactionRow, 'id' | 'household_id' | 'local_date' | 'version' | 'name' | 'status' | 'original_amount' | 'recurring_series_id'>>;

function toastFor(key: UndoLabelKey, name: string | null | undefined, stepId: string | null): void {
  showToast({ kind: 'ordinary', text: undoLabelText(key, name ? { name } : {}), stepId });
}

const openActivity = (): void => router.navigate('/activity' as Href);

export function useReadinessAnswer(): ReadinessAnswer {
  const rc = useRecordContext();
  const f = useV3Format();
  const { source } = useDecideSnapshot();
  const answers = useDecideAnswers(rc.userId ?? undefined, rc.householdId ?? undefined).data;
  const { markPaid } = useMarkPaid();
  const { skip } = useSkipOccurrence();
  const { save } = useSaveDecideAnswer(rc.userId ?? '', rc.householdId ?? '');
  const { remove } = useRemoveDecideAnswer(rc.userId ?? '', rc.householdId ?? '');

  const userId = rc.userId;
  const householdId = rc.householdId;
  const today = rc.today;

  /** The cached line of this household with this id, or null (T-05.3-56-01). */
  const lineOf = (lineId: string): Required<Pick<CachedLine, 'id' | 'household_id' | 'local_date' | 'version'>> & CachedLine | null => {
    const rows = [...(source?.rows ?? []), ...(source?.upcomingRows ?? [])] as readonly CachedLine[];
    const row = rows.find((r) => r.id === lineId);
    if (!row || row.household_id !== householdId || row.local_date === undefined || typeof row.version !== 'number') return null;
    return row as Required<Pick<CachedLine, 'id' | 'household_id' | 'local_date' | 'version'>> & CachedLine;
  };

  const waiverName = (waiver: ReadinessWaiver, item: ReadinessItem | null): string | null => {
    switch (waiver.kind) {
      case 'nothing_to_add':
      case 'month_complete':
      case 'start_from':
        return f.month(waiver.month);
      default:
        return item?.name ?? null;
    }
  };

  const waive = (waiver: ReadinessWaiver, item: ReadinessItem | null, onSettled?: ReadinessSettled): void => {
    const name = waiverName(waiver, item);
    const label = { key: WAIVER_LABEL[waiver.kind], name };
    let out: { id: string; stepId: string } | null;
    try {
      out = save({ kind: 'readiness_waiver', waiver, at: today }, label, onSettled);
    } catch {
      // A malformed id, date or month (waiverKeyOf throws RangeError): nothing was written.
      onSettled?.(false);
      return;
    }
    if (out === null) {
      // The live row already holds this answer: nothing written, nothing to undo.
      onSettled?.(true);
      return;
    }
    toastFor(label.key, name, out.stepId);
  };

  return {
    answer(item, action, onSettled) {
      if (!userId || !householdId) {
        onSettled?.(false);
        return;
      }
      if (action.kind === 'open') {
        if (action.target === 'envelopes') pushOnce(ENVELOPES_HREF);
        else openActivity();
        onSettled?.(true);
        return;
      }
      if (action.kind === 'waive') {
        waive(action.waiver, item, onSettled);
        return;
      }
      const row = lineOf(action.lineId);
      if (row === null) {
        openActivity();
        onSettled?.(true);
        return;
      }
      const name = row.name ?? item?.name ?? null;
      if (action.kind === 'skip' && !row.recurring_series_id) {
        // B1: only a series occurrence is skipped. Anything else is answered with a waiver.
        const seriesId = item?.seriesId ?? null;
        const date = item?.date ?? null;
        if (seriesId === null || date === null) {
          openActivity();
          onSettled?.(true);
          return;
        }
        const kind = item?.kind === 'pay' ? 'no_pay' : 'didnt_happen';
        waive({ kind, seriesId, date }, item, onSettled);
        return;
      }
      const answered = action.kind === 'markPaid' ? 'paid' : 'skipped';
      if (row.status === answered) {
        // The line already holds this answer: nothing to write.
        onSettled?.(true);
        return;
      }
      const target = {
        id: row.id,
        household_id: row.household_id,
        local_date: row.local_date,
        version: row.version,
        name: row.name ?? null,
        ...(row.status !== undefined ? { status: row.status } : {}),
        ...(row.original_amount !== undefined ? { original_amount: row.original_amount } : {}),
      };
      // Both enqueue a write every time; a null step id only means no Undo can be offered.
      const stepId = action.kind === 'markPaid' ? markPaid(target, userId, today) : skip(target, userId);
      toastFor(action.kind === 'markPaid' ? 'markedPaid' : 'skipped', name, stepId);
      onSettled?.(true);
    },

    clearWaiver(waiver, name) {
      if (!userId || !householdId) return;
      let row;
      try {
        row = waiverAnswerFor(answers ?? [], waiver);
      } catch {
        return;
      }
      if (row === null) return;
      const label = { key: 'readinessAnswerCleared' as const, name: name ?? null };
      const { stepId } = remove(row, label);
      toastFor(label.key, label.name, stepId);
    },
  };
}
