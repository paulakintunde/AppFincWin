// 07-07 (D-18, D-19, Pitfall 7): one Prepared per scope. Household is built from the RAW snapshot source, never
// useDecideV3().source (that one carries Decide's household layer). Mine is Decide's own prepared, already scoped upstream.
import { useMemo } from 'react';
import type { DbErrorKind } from '@/db/errors';
import type { Prepared } from '@/engine/decide/v3';
import type { SnapshotSource } from '@/features/decide/snapshot/sourceTypes';
import { preparedV3 } from '@/features/decide/snapshot/v3/computeV3';
import { useDecideSnapshot } from './decide';
import { useDecideV3 } from './decideV3';
import { householdSnapshotSource, type FigureScope } from './figureScope';

export function householdPreparedOf(source: SnapshotSource, currency: string): Prepared {
  return preparedV3(householdSnapshotSource(source, currency), null).prepared;
}

export interface InsightsPreparedState {
  status: 'loading' | 'error' | 'ready';
  prepared: Prepared | null;
  /** Always Just me's prepared (the score reads it, D-19). */
  minePrepared: Prepared | null;
  errorKind: DbErrorKind | null;
  retry(): void;
}

export function useInsightsPrepared(scope: FigureScope, householdCurrency: string): InsightsPreparedState {
  const mine = useDecideV3();
  const snapshot = useDecideSnapshot();
  const household = scope === 'household';
  const source = snapshot.source;
  const ready = household && snapshot.status === 'ready' && source !== null;
  const householdPrepared = useMemo(
    () => (ready && source !== null ? householdPreparedOf(source, householdCurrency) : null),
    [ready, source, householdCurrency]
  );
  const retry = (): void => {
    mine.refetch();
    if (household) snapshot.retry();
  };
  if (!household) {
    return { status: mine.status, prepared: mine.prepared, minePrepared: mine.prepared, errorKind: mine.errorKind, retry };
  }
  const status = snapshot.status === 'error' ? 'error' : snapshot.status === 'loading' || householdPrepared === null ? 'loading' : 'ready';
  return {
    status,
    prepared: householdPrepared,
    minePrepared: mine.prepared,
    errorKind: status === 'error' ? snapshot.errorKind ?? null : null,
    retry,
  };
}
