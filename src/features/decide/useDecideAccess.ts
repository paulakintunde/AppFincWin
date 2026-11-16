// 05.2 D-01: the hook every Decide-aware surface reads. 05.5 APP-17: there is one Decide, so it is always on.
import { useMemo } from 'react';

export interface DecideAccess {
  readonly v3: boolean;
}

export function useDecideAccess(): DecideAccess {
  return useMemo(() => ({ v3: true }), []);
}
