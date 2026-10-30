// 05.2 D-01/D-02: the one hook every 05.2 surface reads; fails closed.
import { useMemo } from 'react';

import { useProfile } from '@/features/you/useProfile';

import { decideEngine } from './availability';

export interface DecideAccess {
  readonly v3: boolean;
  /** 05.3-37: the raw per-account flag (profiles.decide_v3). Never grants v3 by itself; v3 comes from decideEngine(). */
  readonly testAccount: boolean;
}

export function useDecideAccess(): DecideAccess {
  const { profile } = useProfile();
  const flag = profile?.decide_v3 === true;
  return useMemo(() => ({ v3: decideEngine({ decideV3: flag }) === 'v3', testAccount: flag }), [flag]);
}
