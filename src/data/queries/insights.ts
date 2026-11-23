// 07-07 (D-18, D-19, Pitfall 7): one Prepared per scope. Household is built from the RAW snapshot source, never
// useDecideV3().source (that one carries Decide's household layer). Mine is Decide's own prepared, already scoped upstream.
import { useMemo } from 'react';
import type { DbErrorKind } from '@/db/errors';
import type { Prepared } from '@/engine/decide/v3';
import type { SnapshotSource } from '@/features/decide/snapshot/sourceTypes';
import { preparedV3 } from '@/features/decide/snapshot/v3/computeV3';
import { insightsMonthSoFar } from '@/features/decide/snapshot/v3/buildInputs';
import type { V3SettingsSource } from '@/features/decide/snapshot/v3/types';
import { useDecideSnapshot } from './decide';
import { useDecideV3 } from './decideV3';
import { householdSnapshotSource, type FigureScope } from './figureScope';

export function householdPreparedOf(source: SnapshotSource, currency: string): Prepared {
  return preparedV3(householdSnapshotSource(source, currency), null).prepared;
}

/**
 * 07 D-35 (Insights only): before the first full month Decide's inputs hold no months, so Insights reads an Insights-only copy of the
 * prepared with this month so far laid in (the builder's own lines and series for the month). Decide's prepared object is never changed;
 * once a full month is logged, or with nothing recorded this month, the prepared comes back as it is.
 */
export function withMonthSoFar(prepared: Prepared, source: SnapshotSource, v3: V3SettingsSource | null): Prepared {
  if (prepared.inputs.months.some((m) => m.full)) return prepared;
  const soFar = insightsMonthSoFar(source, v3);
  if (soFar === null) return prepared;
  return { ...prepared, inputs: { ...prepared.inputs, months: [soFar.month], series: soFar.series } };
}

export interface InsightsPreparedState {
  status: 'loading' | 'error' | 'ready';
  prepared: Prepared | null;
  /** Always Just me's prepared (the score reads it, D-19). */
  minePrepared: Prepared | null;
  errorKind: DbErrorKind | null;
  retry(): void;
  /** 07 D-32: a fellow member's categories left on shared lines (display only). */
  partnerCategories?: SnapshotSource['partnerCategories'];
  /** 07 D-33: resolved category id to every stored id counted under it (Activity taps). */
  categorySourceIds?: SnapshotSource['categorySourceIds'];
}

export function useInsightsPrepared(scope: FigureScope, householdCurrency: string): InsightsPreparedState {
  const mine = useDecideV3();
  const snapshot = useDecideSnapshot();
  const household = scope === 'household';
  const source = snapshot.source;
  const ready = household && snapshot.status === 'ready' && source !== null;
  const householdPrepared = useMemo(() => {
    if (!ready || source === null) return null;
    const hhSource = householdSnapshotSource(source, householdCurrency);
    return withMonthSoFar(preparedV3(hhSource, null).prepared, hhSource, null);
  }, [ready, source, householdCurrency]);
  const minePrepared = mine.prepared;
  const mineSource = mine.source ?? null;
  const mineV3 = mine.v3 ?? null;
  const mineInsights = useMemo(
    () => (minePrepared === null || mineSource === null ? minePrepared : withMonthSoFar(minePrepared, mineSource, mineV3)),
    [minePrepared, mineSource, mineV3]
  );
  const retry = (): void => {
    mine.refetch();
    if (household) snapshot.retry();
  };
  const naming = { partnerCategories: source?.partnerCategories, categorySourceIds: source?.categorySourceIds };
  if (!household) {
    return { status: mine.status, prepared: mineInsights, minePrepared, errorKind: mine.errorKind, retry, ...naming };
  }
  const status = snapshot.status === 'error' ? 'error' : snapshot.status === 'loading' || householdPrepared === null ? 'loading' : 'ready';
  return {
    status,
    prepared: householdPrepared,
    minePrepared,
    errorKind: status === 'error' ? snapshot.errorKind ?? null : null,
    retry,
    ...naming,
  };
}
