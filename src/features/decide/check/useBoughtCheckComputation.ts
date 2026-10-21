// 05-52: the one place a bought check's computation is built (05-29 decided view and the cooling-off reopen, 05-11).
// Recomputed on every snapshot change (D-15), never stored. The check's own Go-ahead writes are removed first, so the
// purchase is not counted twice.
import { useMemo } from 'react';
import { localDateIn } from '@/engine/time';
import { useDecideLinks, useDecideSnapshot, useOtherChecks } from '@/data/queries/decide';
import { useRecordContext } from '@/features/record/useRecordContext';
import type { DecideCheckRow } from '@/db/decideChecks';
import type { WithPending } from '@/data/types';
import { buildDecideSnapshot } from '../snapshot/buildSnapshot';
import { inHomeCurrency, sourceFor } from '../snapshot/checkCurrency';
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
  const checkId = bought ? row.id : null;
  const decidedAt = bought ? row.decided_at : null;
  const stack = useOtherChecks(checkId);
  const ids = useMemo(() => (checkId === null ? NO_IDS : [checkId]), [checkId]);
  const links = useDecideLinks(bought ? (rc.userId ?? undefined) : undefined, bought ? (rc.householdId ?? undefined) : undefined, ids);

  const source = snapshot.source;
  const linkRows = links.data;
  const computation = useMemo(() => {
    if (!bought || checkId === null || source === null || linkRows === undefined) return null;
    const decidedOn = decidedAt === null ? rc.today : localDateIn(new Date(decidedAt), rc.timeZone);
    const replaced: ReplacedEnd = {
      // WR-B04: only the counted lines Go ahead actually ended (decideGoAhead skips the rest).
      seriesIds: inputs.replaces.filter((l) => l.counted).map((l) => l.seriesId).filter((id): id is string => id !== null),
      endedOn: inputs.needBy ?? decidedOn,
      // WR-C02: Go ahead ended them on the tap day, which an offline replay can leave before decided_at.
      ...(inputs.needBy === null && typeof row.created_at === 'string' ? { endedFrom: localDateIn(new Date(row.created_at), rc.timeZone) } : {}),
    };
    const built = buildDecideSnapshot(withoutCheckWrites(source, checkId, linkRows, replaced));
    // D-67: amounts typed in another currency are judged at the latest stored rate (or read unconverted without one).
    const view = inHomeCurrency(inputs, built, { isSample: row.is_sample });
    return computeCheck(sourceFor(built, view), view.inputs, stack.otherChecks);
  }, [bought, row, checkId, decidedAt, source, linkRows, inputs, stack, rc.today, rc.timeZone]);

  if (!bought) return IDLE;
  if (snapshot.status === 'error' || links.isError) return { status: 'error', computation: null };
  // WR-C02: while the Go ahead is still queued its rows are in the cache but no 'written' link exists yet, so they cannot
  // be taken out: the purchase would count twice. Nothing is shown until the write has landed.
  if ((row as WithPending<DecideCheckRow>).pending === true) return { status: 'loading', computation: null };
  if (computation === null) return { status: 'loading', computation: null };
  return { status: 'ready', computation };
}
