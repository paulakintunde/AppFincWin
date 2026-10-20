// 05-52: the one place a bought check's computation is built (05-29 decided view and the cooling-off reopen, 05-11).
// Recomputed on every snapshot change (D-15), never stored. The check's own Go-ahead writes are removed first, so the
// purchase is not counted twice.
import { useMemo } from 'react';
import { localDateIn } from '@/engine/time';
import { useDecideLinks, useDecideSnapshot, useOtherChecks } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import type { DecideCheckRow } from '@/db/decideChecks';
import { buildDecideSnapshot } from '../snapshot/buildSnapshot';
import { computeCheck } from '../snapshot/computeCheck';
import type { CheckComputation, CheckInputs } from '../snapshot/types';
import { withoutCheckWrites, type ReplacedEnd } from '../snapshot/withoutCheckWrites';

export interface BoughtCheckComputation {
  status: 'idle' | 'loading' | 'error' | 'ready';
  computation: CheckComputation | null;
}

const IDLE: BoughtCheckComputation = { status: 'idle', computation: null };
const NO_IDS: readonly string[] = [];

export function useBoughtCheckComputation(row: DecideCheckRow | null, inputs: CheckInputs | null): BoughtCheckComputation {
  const rc = useRecordContext();
  const bought = row !== null && inputs !== null && row.status === 'bought';
  const snapshot = useDecideSnapshot();
  const stack = useOtherChecks(bought ? row.id : null);
  const ids = useMemo(() => (bought ? [row.id] : NO_IDS), [bought, row?.id]);
  const links = useDecideLinks(bought ? (rc.userId ?? undefined) : undefined, bought ? (rc.householdId ?? undefined) : undefined, ids);

  const source = snapshot.source;
  const linkRows = links.data;
  const computation = useMemo(() => {
    if (!bought || source === null || linkRows === undefined) return null;
    const replaced: ReplacedEnd = {
      seriesIds: inputs.replaces.map((l) => l.seriesId).filter((id): id is string => id !== null),
      endedOn: inputs.needBy ?? localDateIn(new Date(row.decided_at ?? rc.today), rc.timeZone),
    };
    const built = buildDecideSnapshot(withoutCheckWrites(source, row.id, linkRows, replaced));
    return computeCheck(built, inputs, stack.otherChecks);
  }, [bought, source, linkRows, inputs, row, stack, rc.today, rc.timeZone]);

  if (!bought) return IDLE;
  if (snapshot.status === 'error' || links.isError) return { status: 'error', computation: null };
  if (computation === null) return { status: 'loading', computation: null };
  return { status: 'ready', computation };
}
