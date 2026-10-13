// REC-30: state for the entry sheet's list. Owns the items, the per-type caps, the summary,
// the resume/discard answer for a stored draft (D-17) and the debounced device persistence.
// Nothing here is synced; the draft lives under the fincwin: prefix (see useEntryDraft).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addItem,
  canAdd as engineCanAdd,
  dropUnavailable,
  removeItem,
  summarise,
  takeItem,
  type ListItem,
  type ListItemType,
  type ListSummary,
} from '@/engine/entryList';
import { clearEntryDraft, loadEntryDraft, saveEntryDraft } from './useEntryDraft';

const SAVE_DEBOUNCE_MS = 250;

export interface EntryListState {
  items: ListItem[];
  summary: ListSummary;
  dropped: number;
  /** Number of stored items waiting for a Continue / Discard answer; 0 when none. */
  resumeCount: number;
  continueDraft(): void;
  discardDraft(): void;
  add(item: ListItem): boolean;
  remove(id: string): void;
  take(id: string): ListItem | null;
  clearAll(): void;
  canAdd(type: ListItemType): boolean;
}

export interface UseEntryListOptions {
  userId: string | null;
  householdId: string | null;
  /** False in edit mode: the hook never touches storage. */
  enabled: boolean;
  activeAccountIds: ReadonlySet<string>;
}

export function useEntryList(opts: UseEntryListOptions): EntryListState {
  const { userId, householdId, enabled, activeAccountIds } = opts;
  const active = enabled && userId !== null && householdId !== null;

  const [items, setItemsState] = useState<ListItem[]>([]);
  const [pending, setPending] = useState<ListItem[]>([]);
  const [dropped, setDropped] = useState(0);
  const [resolved, setResolved] = useState(false);

  const itemsRef = useRef<ListItem[]>([]);
  const dirtyRef = useRef(false);
  const idsRef = useRef(activeAccountIds);
  const targetRef = useRef({ active, userId, householdId, resolved });
  // Keep the latest values readable from callbacks and the unmount flush.
  useEffect(() => {
    idsRef.current = activeAccountIds;
    targetRef.current = { active, userId, householdId, resolved };
  });

  const setItems = useCallback((next: ListItem[]) => {
    itemsRef.current = next;
    dirtyRef.current = true;
    setItemsState(next);
  }, []);

  // Read any stored draft once per sheet open.
  useEffect(() => {
    if (!active || userId === null || householdId === null) return;
    let cancelled = false;
    void loadEntryDraft(userId, householdId).then((stored) => {
      if (cancelled) return;
      setPending(stored);
      setResolved(stored.length === 0);
    });
    return () => {
      cancelled = true;
    };
  }, [active, userId, householdId]);

  const flush = useCallback(() => {
    const t = targetRef.current;
    if (!dirtyRef.current || !t.active || !t.resolved || t.userId === null || t.householdId === null) return;
    dirtyRef.current = false;
    void saveEntryDraft(t.userId, t.householdId, itemsRef.current);
  }, []);

  // Debounced save on every change, never while a resume answer is pending.
  useEffect(() => {
    if (!active || !resolved || !dirtyRef.current) return;
    const timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [items, active, resolved, flush]);

  // Flush a pending save when the sheet closes.
  useEffect(() => flush, [flush]);

  const continueDraft = useCallback(() => {
    const kept = dropUnavailable(pending, idsRef.current);
    setDropped(kept.dropped);
    setPending([]);
    setResolved(true);
    setItems([...itemsRef.current, ...kept.items]);
  }, [pending, setItems]);

  const discardDraft = useCallback(() => {
    setPending([]);
    setResolved(true);
    if (userId !== null && householdId !== null) void clearEntryDraft(userId, householdId);
  }, [userId, householdId]);

  const add = useCallback(
    (item: ListItem): boolean => {
      const r = addItem(itemsRef.current, item);
      if (!r.ok) return false;
      setItems(r.items);
      return true;
    },
    [setItems],
  );

  const remove = useCallback((id: string) => setItems(removeItem(itemsRef.current, id)), [setItems]);

  const take = useCallback(
    (id: string): ListItem | null => {
      const r = takeItem(itemsRef.current, id);
      if (r === null) return null;
      setItems(r.rest);
      return r.item;
    },
    [setItems],
  );

  const clearAll = useCallback(() => {
    setPending([]);
    setDropped(0);
    setResolved(true);
    setItems([]);
    if (userId !== null && householdId !== null) void clearEntryDraft(userId, householdId);
  }, [setItems, userId, householdId]);

  const canAdd = useCallback((type: ListItemType) => engineCanAdd(items, type), [items]);
  const summary = useMemo(() => summarise(items), [items]);

  return {
    items,
    summary,
    dropped,
    resumeCount: pending.length,
    continueDraft,
    discardDraft,
    add,
    remove,
    take,
    clearAll,
    canAdd,
  };
}
