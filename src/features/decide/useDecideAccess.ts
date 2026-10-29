// 05.2 D-01/D-02: the one hook every 05.2 surface reads; fails closed.
import { useMemo } from 'react';

import { useProfile } from '@/features/you/useProfile';

import { decideEngine } from './availability';

export interface DecideAccess {
  readonly v3: boolean;
}

export function useDecideAccess(): DecideAccess {
  const { profile } = useProfile();
  const flag = profile?.decide_v3 === true;
  return useMemo(() => ({ v3: decideEngine({ decideV3: flag }) === 'v3' }), [flag]);
}
