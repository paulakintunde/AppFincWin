// 10.1-24 (SCN-03, SCN-05; D-12, D-13, D-20): the only place the scan review writes anything, and only on confirm.
// New line: one transaction (store as name, the receipt date or today, the total, its category or category parts with a
// 'Tax and tip' part) through the entry sheet's own add mutation, then the photos queued as one receipt for that id.
// Existing line: the line's total changes only when the user chose "Use the items total"; then the parts are set through the
// split save (version-checked; this device's own amount edit is chained by versionChain).
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAccounts } from '@/data/queries/accounts';
import { useAddTransaction, useEditTransaction } from '@/data/mutations/transactions';
import { newStepId } from '@/data/mutations/undoCapture';
import { fromParts } from '@/db/categoryParts';
import type { TransactionRow } from '@/db/rows';
import { minorUnits } from '@/engine/money';
import { monthOf } from '@/engine/time';
import { useT } from '@/i18n';
import { undoLabelText } from '@/i18n/undoLabel';
import { drainOutbox, enqueueReceipt } from '@/services/receipts/outbox';
import type { LocalReceiptFile, ReceiptMime } from '@/services/receipts/types';
import { markJustSaved } from '@/state/justSaved';
import { showToast } from '@/state/undoToast';
import { useSaveSplit } from '../split/useSaveSplit';
import { useRecordContext } from '../useRecordContext';
import { canConfirm, toPrivateSave, type ReviewDraft } from './scanModel';

export type ConfirmResult = { ok: true; lineId: string } | { ok: false; reason: string };

export interface ConfirmScanTarget {
  mode: 'new' | 'existing';
  line?: TransactionRow;
  householdId: string;
}

const EXT: Record<ReceiptMime, LocalReceiptFile['ext']> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** The picked files carry their size and extension (LocalReceiptFile); a bare { uri, mime } is completed from the mime. */
export function toLocalFile(img: { uri: string; mime: string } & Partial<Omit<LocalReceiptFile, 'uri' | 'mime'>>): LocalReceiptFile {
  const mime = (img.mime in EXT ? img.mime : 'image/jpeg') as ReceiptMime;
  return {
    uri: img.uri,
    mime,
    ext: img.ext ?? EXT[mime],
    bytes: img.bytes ?? 0,
    width: img.width ?? null,
    height: img.height ?? null,
  };
}

export function useConfirmScan(target: ConfirmScanTarget): { confirm(draft: ReviewDraft): Promise<ConfirmResult>; conflict: string | null } {
  const t = useT();
  const rc = useRecordContext();
  const { add } = useAddTransaction();
  const { edit } = useEditTransaction();
  const accountsQuery = useAccounts(target.householdId);
  const account = useMemo(() => (accountsQuery.data ?? []).find((a) => a.archived_at === null) ?? null, [accountsQuery.data]);
  const line = target.line;
  const saver = useSaveSplit({
    householdId: target.householdId,
    month: line ? monthOf(line.local_date) : '',
    id: line?.id ?? '',
    version: line?.version ?? 0,
  });
  // A refused parts save (someone else changed the line) ends the wait with the conflict line showing; nothing else is written.
  const waiting = useRef<((r: ConfirmResult) => void) | null>(null);
  useEffect(() => {
    if (saver.conflict && waiting.current) {
      waiting.current({ ok: false, reason: 'conflict' });
      waiting.current = null;
    }
  }, [saver.conflict]);

  const confirm = useCallback(
    async (draft: ReviewDraft): Promise<ConfirmResult> => {
      const gate = canConfirm(draft);
      if (!gate.ok) return { ok: false, reason: gate.reason };
      if (!rc.userId) return { ok: false, reason: 'notReady' };

      if (target.mode === 'new') {
        if (!account) return { ok: false, reason: 'noAccount' };
        // A new line has no category of its own yet: the 'Tax and tip' part (and a lone item without one) follows the largest item.
        const net = (i: ReviewDraft['items'][number]) => (i.price ?? 0) - i.discount;
        const largest = draft.items.reduce<ReviewDraft['items'][number] | null>((best, i) => (best === null || net(i) > net(best) ? i : best), null);
        const save = toPrivateSave(draft, -1, largest?.categoryId ?? null);
        const name = draft.store.value?.trim() || t('scan.review.defaultName');
        const localDate = draft.date.value ?? rc.today;
        const stepId = newStepId();
        const id = add({
          householdId: target.householdId,
          accountId: account.id,
          amount: minorUnits(-save.total),
          currency: account.currency,
          homeCurrency: rc.homeCurrency,
          userId: rc.userId,
          localDate,
          timeZone: rc.timeZone,
          name,
          categoryId: save.categoryId,
          categoryParts: save.parts ? fromParts(save.parts) : null,
          undo: { stepId, labelKey: 'added', labelParams: { name } },
        });
        markJustSaved([id]);
        showToast({ kind: 'ordinary', text: undoLabelText('added', { name }), stepId });
        if (draft.images.length > 0) {
          try {
            await enqueueReceipt({
              transactionId: id,
              kind: draft.images.length > 1 ? 'scan' : 'photo',
              files: draft.images.map((img) => toLocalFile(img)),
            });
            void drainOutbox().catch(() => undefined);
          } catch {
            // the line is saved; a receipt that could not be copied is dropped, as on the entry sheet
          }
        }
        return { ok: true, lineId: id };
      }

      if (!line) return { ok: false, reason: 'noLine' };
      const sign: 1 | -1 = line.original_amount < 0 ? -1 : 1;
      const save = toPrivateSave(draft, sign, line.category_id);
      const month = monthOf(line.local_date);
      // D-13: the line's total changes only on "Use the items total".
      if (draft.totalChoice === 'items' && save.total !== Math.abs(line.original_amount)) {
        edit({ id: line.id, householdId: target.householdId, month, expectedVersion: line.version, patch: { original_amount: sign * save.total } });
      }
      const hasParts = line.category_parts != null && line.category_parts.length >= 2;
      const done: ConfirmResult = { ok: true, lineId: line.id };
      if (!save.parts && !hasParts) {
        if (save.categoryId !== line.category_id) {
          edit({ id: line.id, householdId: target.householdId, month, expectedVersion: line.version, patch: { category_id: save.categoryId } });
        }
        return done;
      }
      return new Promise<ConfirmResult>((resolve) => {
        waiting.current = resolve;
        const onDone = () => {
          waiting.current = null;
          resolve(done);
        };
        if (save.parts) saver.save(save.parts, { onDone });
        else saver.remove(save.categoryId, { onDone });
      });
    },
    [account, add, edit, line, rc.homeCurrency, rc.timeZone, rc.today, rc.userId, saver, t, target.householdId, target.mode],
  );

  return { confirm, conflict: saver.conflict };
}
