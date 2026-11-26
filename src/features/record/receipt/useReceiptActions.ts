// 10.1-21 (D-06, D-08, D-09, D-21): everything the Receipt sheet does. Add (camera, library, file, scan) goes through the capture
// services, then saves the file on the phone first (the outbox) and uploads when online. Removing a stored receipt is an online
// call; removing one still on the phone just drops it from the outbox. Nothing here logs file names, paths or links.
import { useCallback, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { removeAllReceipts, removeReceipt } from '@/db/receipts';
import { useReceipts } from '@/data/queries/receipts';
import { queryKeys } from '@/data/keys';
import { supabase } from '@/services/supabase';
import { RECEIPT_MAX_FILES_PER_LINE } from '@/services/receipts/limits';
import { drainOutbox, enqueueReceipt, removeFromOutbox, retryOutboxItem } from '@/services/receipts/outbox';
import { pickFile } from '@/services/receipts/pickFile';
import { pickPhoto } from '@/services/receipts/pickPhoto';
import { scanDocument } from '@/services/receipts/scanDocument';
import type { PickResult } from '@/services/receipts/types';
import { hapticTap } from '@/ui/haptics';
import { useT } from '@/i18n';
import { useReceiptOutbox } from './useReceiptOutbox';
import { receiptGroups, type ReceiptGroup } from './receiptGroups';

export type ReceiptAddSource = 'camera' | 'library' | 'file' | 'scan';
export type ReceiptActionError = 'tooManyFiles' | 'tooBig' | 'badType' | 'cameraOff' | 'photosOff' | 'failed';

export interface ReceiptActions {
  groups: ReceiptGroup[];
  add(source: ReceiptAddSource): Promise<void>;
  removeGroup(groupId: string): Promise<void>;
  removeAll(): Promise<void>;
  retry(groupId: string): Promise<void>;
  error: ReceiptActionError | null;
  busy: boolean;
  /** True while the receipts of the line are still being read from the server. */
  loading: boolean;
}

/** 10.1-23: shared with the entry sheet's capture choice. Null for a cancelled pick (nothing to say). */
export function errorFor(result: Extract<PickResult, { ok: false }>, source: ReceiptAddSource): ReceiptActionError | null {
  switch (result.reason) {
    case 'cancelled':
      return null;
    case 'too_big':
      return 'tooBig';
    case 'bad_type':
      return 'badType';
    case 'permission_denied':
      if (source === 'camera' || source === 'scan') return 'cameraOff';
      return source === 'library' ? 'photosOff' : 'failed';
    default:
      return 'failed';
  }
}

/** 10.1-23: runs one capture (camera, library, file or scan); the files it returns are cache copies the caller owns. */
export function pickReceipt(source: ReceiptAddSource): Promise<PickResult> {
  return source === 'file' ? pickFile() : source === 'scan' ? scanDocument() : pickPhoto(source);
}

export function useReceiptActions(householdId: string, transactionId: string): ReceiptActions {
  const qc = useQueryClient();
  const t = useT();
  const stored = useReceipts(householdId, transactionId);
  const outbox = useReceiptOutbox(transactionId);
  const [error, setError] = useState<ReceiptActionError | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => receiptGroups(stored.data ?? [], outbox), [stored.data, outbox]);
  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: queryKeys.receipts(householdId, transactionId) }),
    [qc, householdId, transactionId]
  );

  const add = useCallback(
    async (source: ReceiptAddSource) => {
      setError(null);
      // D-21: a scan of many pages counts as one receipt, so the limit is on groups.
      if (groups.length >= RECEIPT_MAX_FILES_PER_LINE) {
        setError('tooManyFiles');
        return;
      }
      setBusy(true);
      try {
        const picked = await pickReceipt(source);
        if (!picked.ok) {
          setError(errorFor(picked, source));
          return;
        }
        const queued = await enqueueReceipt({ transactionId, kind: picked.kind, files: picked.files });
        if (!queued.ok) {
          setError(queued.reason === 'too_big' ? 'tooBig' : 'failed');
          return;
        }
        hapticTap();
        if (!onlineManager.isOnline()) AccessibilityInfo.announceForAccessibility(t('receipt.offlineSaved'));
        // Online, the file goes straight away; the host drains again on reconnect when it cannot.
        void drainOutbox()
          .then(() => refresh())
          .catch(() => undefined);
      } catch {
        setError('failed');
      } finally {
        setBusy(false);
      }
    },
    [groups.length, transactionId, refresh, t]
  );

  const removeGroup = useCallback(
    async (groupId: string) => {
      setError(null);
      const group = groups.find((g) => g.groupId === groupId);
      if (group === undefined) return;
      try {
        if (group.state === 'stored') {
          const res = await removeReceipt(supabase, groupId);
          if (!res.ok) setError('failed');
          await refresh();
        } else {
          await removeFromOutbox(groupId);
        }
      } catch {
        setError('failed');
      }
    },
    [groups, refresh]
  );

  const removeAll = useCallback(async () => {
    setError(null);
    try {
      if (groups.some((g) => g.state === 'stored')) {
        const res = await removeAllReceipts(supabase, transactionId);
        if (!res.ok) setError('failed');
      }
      for (const g of groups) if (g.state !== 'stored') await removeFromOutbox(g.groupId);
      await refresh();
    } catch {
      setError('failed');
    }
  }, [groups, transactionId, refresh]);

  const retry = useCallback(async (groupId: string) => {
    setError(null);
    try {
      await retryOutboxItem(groupId);
      void drainOutbox().catch(() => undefined);
    } catch {
      setError('failed');
    }
  }, []);

  return { groups, add, removeGroup, removeAll, retry, error, busy, loading: stored.isLoading };
}
