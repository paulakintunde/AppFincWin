// 05-47 (D-34): how the decision detail sheet writes goal_id on a transfer leg. features/decide may not reach the
// transaction mutations (depcruise fx-fetch-never-from-reads: they pull in the rate fetch door), so the edit is
// injected: the Past decisions route provides Record's useEditTransaction().edit, tests provide a spy. The default
// does nothing and reports that no undo step was recorded.
import { createContext, useContext } from 'react';
import type { PatchValue } from '@/engine/undo';

export interface GoalTagEditVars {
  id: string;
  householdId: string;
  month: string;
  expectedVersion: number;
  patch: { goal_id: string | null };
}

export interface GoalTagUndo {
  stepId: string;
  ownerId: string;
  labelKey: 'transferTagged' | 'transferUntagged';
  labelParams: { name: string };
  before: Readonly<Record<string, PatchValue>>;
}

/** Returns whether an undo step will be recorded (Record's useEditTransaction contract). */
export type GoalTagEdit = (vars: GoalTagEditVars, undo: GoalTagUndo) => boolean;

export const GoalTagEditContext = createContext<GoalTagEdit>(() => false);

export function useGoalTagEdit(): GoalTagEdit {
  return useContext(GoalTagEditContext);
}
