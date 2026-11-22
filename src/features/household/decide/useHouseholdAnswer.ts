// 08.1-10: what the answer screen needs from the household in one hook: the scope line for the top bar and the resolver that turns a
// member key into the words other members see (D-32). The screen never reads a member name itself.
import { useCallback } from 'react';
import { useMemberLabel } from '../useMemberLabel';
import { useHouseholdScopeLabel } from './useHouseholdScopeLabel';

export interface HouseholdAnswer {
  /** "Just you" or "Household · {name}". */
  readonly scopeLabel: string;
  /** A member key as a name (a hidden name reads as its colour); '' for nobody. */
  readonly member: (key: string) => string;
}

export function useHouseholdAnswer(householdId: string | null | undefined, kind: 'personal' | 'household'): HouseholdAnswer {
  const scopeLabel = useHouseholdScopeLabel(kind === 'household' ? 'household' : 'me');
  const label = useMemberLabel(householdId);
  const member = useCallback((key: string): string => label(key), [label]);
  return { scopeLabel, member };
}
