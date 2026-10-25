// 05-57 (D-77, R9, R7): the header's save status for one check, derived from the create and save mutations, the debounce
// and the online state. Nothing is stored here. Only the transitions into 'offline' and 'failed' are announced.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { onlineManager, useMutationState } from '@tanstack/react-query';
import { mutationKeys } from '@/data/keys';
import { getFailedWrites, subscribeFailedWrites } from '@/data/sync/failedWrites';
import { useT } from '@/i18n';

export type SaveStatus = 'saving' | 'offline' | 'saved' | 'failed' | null;

export interface SaveMutation {
  status: 'idle' | 'pending' | 'success' | 'error';
  isPaused: boolean;
  submittedAt: number;
}

export interface SaveStatusInput {
  rowExists: boolean;
  decided: boolean;
  pendingEdit: boolean;
  editedOffline: boolean;
  online: boolean;
  mutations: readonly SaveMutation[];
  /** A write for this check is parked in the failed-writes list. */
  parkedFailure: boolean;
}

/** The R9 table as one pure function. */
export function saveStatusOf(i: SaveStatusInput): SaveStatus {
  if (i.decided || (!i.rowExists && !i.pendingEdit)) return null;
  const newestSettled = i.mutations
    .filter((m) => m.status === 'success' || m.status === 'error')
    .reduce<SaveMutation | null>((a, m) => (a === null || m.submittedAt >= a.submittedAt ? m : a), null);
  if (newestSettled?.status === 'error' || i.parkedFailure) return 'failed';
  const pending = i.mutations.filter((m) => m.status === 'pending');
  if (pending.some((m) => m.isPaused) || (!i.online && i.editedOffline)) return 'offline';
  if (i.pendingEdit || pending.length > 0) return 'saving';
  return i.rowExists ? 'saved' : null;
}

const isSaveKey = (key: readonly unknown[] | undefined): boolean =>
  key !== undefined &&
  key.length === 2 &&
  key[0] === mutationKeys.createCheck[0] &&
  (key[1] === mutationKeys.createCheck[1] || key[1] === mutationKeys.saveCheckDraft[1]);

export function useCheckSaveStatus(args: {
  id: string;
  rowExists: boolean;
  decided: boolean;
  pendingEdit: boolean;
  editedOffline: boolean;
}): SaveStatus {
  const { id, rowExists, decided, pendingEdit, editedOffline } = args;
  const online = useSyncExternalStore(onlineManager.subscribe.bind(onlineManager), () => onlineManager.isOnline());
  const failedList = useSyncExternalStore(subscribeFailedWrites, getFailedWrites);
  const mutations = useMutationState<SaveMutation>({
    filters: {
      predicate: (m) => isSaveKey(m.options.mutationKey) && (m.state.variables as { id?: string } | undefined)?.id === id,
    },
    select: (m) => ({ status: m.state.status, isPaused: m.state.isPaused, submittedAt: m.state.submittedAt }),
  });
  const parkedFailure = failedList.some((e) => e.entity === 'decide_checks' && e.entityId === id);
  return saveStatusOf({ rowExists, decided, pendingEdit, editedOffline, online, mutations, parkedFailure });
}

/** Announces only a change into 'offline' or 'failed'; the visible status is not a live region (R7). */
export function useAnnounceSaveStatus(status: SaveStatus): void {
  const t = useT();
  const previous = useRef<SaveStatus>(null);
  useEffect(() => {
    if (previous.current === status) return;
    previous.current = status;
    if (status === 'offline') AccessibilityInfo.announceForAccessibility(t('decide.save.offlineA11y'));
    else if (status === 'failed') AccessibilityInfo.announceForAccessibility(t('decide.save.failedA11y'));
  }, [status, t]);
}
