// Selection state for Activity's bulk mode (ACT-05). Selection applies to whatever list is on
// screen (a month or a search result); ids that leave the visible list are dropped so a bulk
// action can never touch a row the user can no longer see.
import { useCallback, useEffect, useMemo, useState } from 'react';

export interface ActivitySelection {
  active: boolean;
  count: number;
  selectedIds: ReadonlySet<string>;
  enter: () => void;
  /** Leaves select mode and clears the selection. */
  exit: () => void;
  toggle: (id: string) => void;
  clear: () => void;
  selectAll: (ids: readonly string[]) => void;
  isSelected: (id: string) => boolean;
}

export function useActivitySelection(visibleIds: readonly string[]): ActivitySelection {
  const [active, setActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const visibleKey = visibleIds.join('\u0000');
  useEffect(() => {
    const visible = new Set(visibleKey === '' ? [] : visibleKey.split('\u0000'));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleKey]);

  const enter = useCallback(() => setActive(true), []);
  const clear = useCallback(() => setSelectedIds(new Set()), []);
  const exit = useCallback(() => {
    setActive(false);
    setSelectedIds(new Set());
  }, []);
  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback((ids: readonly string[]) => setSelectedIds(new Set(ids)), []);
  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  return useMemo(
    () => ({ active, count: selectedIds.size, selectedIds, enter, exit, toggle, clear, selectAll, isSelected }),
    [active, selectedIds, enter, exit, toggle, clear, selectAll, isSelected]
  );
}
