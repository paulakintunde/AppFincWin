/**
 * 05-44 (D-36, 04 D-56): how past estimates compared with what happened, for the gap notes on step 2.
 * Reads the user's bought decisions, their links and the linked lines, converts through toPastDecisions (everything in the home
 * currency, 04 D-62) and lets the engine's estimateBias say whether there is a figure (null below 3 usable decisions).
 * The result is computed in memory with useMemo; it is never stored in the query cache (bigint-safe, Pitfall 8).
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLinkedLines } from '@/db/decideLinks';
import { estimateBias, type EstimateBias } from '@/engine/decide';
import { currencyCode } from '@/engine/money';
import { useCustomCurrencies } from '@/data/queries/customCurrencies';
import { useDecideChecks, useDecideLinks } from '@/data/queries/decide';
import { useFxLatest } from '@/data/queries/fxLatest';
import { useRecordContext } from '@/features/record/useRecordContext';
import { supabase } from '@/services/supabase';
import { toPastDecisions } from '../journal/pastDecisions';

export interface EstimateBiasFigures {
  running: EstimateBias | null;
  payment: EstimateBias | null;
  dayOne: EstimateBias | null;
}

const NONE: EstimateBiasFigures = { running: null, payment: null, dayOne: null };
const MAX_TARGETS = 200; // fetchLinkedLines' filter bound

export function useEstimateBias(): EstimateBiasFigures {
  const rc = useRecordContext();
  const hh = rc.householdId;
  const userId = rc.userId ?? undefined;
  const hhId = hh ?? undefined;

  const checksQuery = useDecideChecks(userId, hhId);
  const customsQuery = useCustomCurrencies(userId);
  const fxQuery = useFxLatest();

  const checkRows = checksQuery.data;
  const bought = useMemo(
    () => (checkRows ?? []).filter((c) => c.status === 'bought' && c.deleted_at === null),
    [checkRows]
  );
  const checkIds = useMemo(() => bought.map((c) => c.id).sort(), [bought]);

  const linksQuery = useDecideLinks(userId, hhId, checkIds);
  const linkRows = linksQuery.data;
  const targets = useMemo(() => {
    const tx = new Set<string>();
    const series = new Set<string>();
    for (const l of linkRows ?? []) {
      if (l.deleted_at !== null) continue;
      if (l.entity === 'transactions') tx.add(l.target_id);
      else if (l.entity === 'recurring_series') series.add(l.target_id);
    }
    return {
      transactionIds: [...tx].sort().slice(0, MAX_TARGETS),
      seriesIds: [...series].sort().slice(0, MAX_TARGETS),
      // WR-C12: more lines than one fetch returns would give a gap from partial actuals; no note is shown instead.
      truncated: tx.size > MAX_TARGETS || series.size > MAX_TARGETS,
    };
  }, [linkRows]);

  const hasTargets = !targets.truncated && (targets.transactionIds.length > 0 || targets.seriesIds.length > 0);
  // Row-derived prefix (['transactions', hh, ...]) so a line edit refreshes it.
  const linesQuery = useQuery({
    queryKey: [
      'transactions',
      hh ?? '',
      'decide-linked',
      'bias',
      checkIds.join(','),
      targets.transactionIds.join(','),
      targets.seriesIds.join(','),
    ],
    queryFn: () => fetchLinkedLines(supabase, hh as string, { transactionIds: targets.transactionIds, seriesIds: targets.seriesIds }),
    enabled: Boolean(hh) && hasTargets,
  });

  const lineRows = linesQuery.data;
  const rates = fxQuery.data;
  const customs = customsQuery.data;
  const loaded =
    checkRows !== undefined &&
    linkRows !== undefined &&
    rates !== undefined &&
    customs !== undefined &&
    (!hasTargets || lineRows !== undefined);
  const home = rc.homeCurrency;
  const today = rc.today;

  return useMemo(() => {
    if (!rc.ready || !loaded || bought.length === 0 || targets.truncated) return NONE;
    try {
      const decisions = toPastDecisions({
        decisions: bought,
        links: linkRows ?? [],
        lines: lineRows ?? [],
        today,
        home,
        rates: rates ?? [],
        customs: customs ?? [],
      });
      const [dayOne, payment, running] = estimateBias(decisions, currencyCode(home));
      const pick = (b: EstimateBias | undefined): EstimateBias | null => (b !== undefined && b.biasBasisPoints !== null ? b : null);
      return { running: pick(running), payment: pick(payment), dayOne: pick(dayOne) };
    } catch {
      return NONE; // a gap note is never worth breaking step 2
    }
  }, [rc.ready, loaded, bought, linkRows, lineRows, today, home, rates, customs, targets.truncated]);
}
