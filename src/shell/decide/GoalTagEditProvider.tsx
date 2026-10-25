// 05-47 (D-34): supplies Record's undoable transaction edit to the Past decisions screens, which may not import it
// themselves (depcruise fx-fetch-never-from-reads). Mounted by app/(app)/decide/past.tsx.
import React, { type ReactNode } from 'react';
import { useEditTransaction } from '@/data/mutations/transactions';
import { GoalTagEditContext } from '@/features/decide/past/goalTagEdit';

export function GoalTagEditProvider({ children }: { children: ReactNode }) {
  const { edit } = useEditTransaction();
  return <GoalTagEditContext.Provider value={edit}>{children}</GoalTagEditContext.Provider>;
}
