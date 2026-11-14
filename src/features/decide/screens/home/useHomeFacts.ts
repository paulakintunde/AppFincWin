/**
 * 06.1-21 (D01): the read-only facts Decide home shows beside the check: how many past decisions have a look-back waiting, the safety
 * net state, regular saving and investing from Grow, the counts in the footer sentence, and whether the "setup done" note was already
 * seen on this device. Nothing here writes, and nothing is computed that the engine owns.
 */
import { useEffect, useMemo, useState } from 'react';
import type { V3Inputs, V3Series } from '@/engine/decide/v3';
import { loadSetupDoneSeen } from '@/features/decide/hints/decideHints';
import type { WorkedSources } from '../answer/info/HowWorkedOutSheet';
import { deltaFor, usePastDecisions } from '../past/data/usePastDecisions';
import { lookBackOf } from '../past/lookBack';

/** A monthly figure for a series: weekly amounts are spread over a 52-week year (the same rule as the setup reads). */
function monthlyMinor(s: V3Series): number {
  const every = Math.max(1, s.cadence.every);
  return s.cadence.unit === 'month' ? Math.round(Number(s.amount) / every) : Math.round((Number(s.amount) * 52) / 12 / every);
}

export interface RulesFacts {
  /** null = no safety net recorded yet. */
  netLocked: boolean | null;
  saving: number | null;
  investing: number | null;
}

/** Exported for tests. */
export function rulesFactsOf(inputs: V3Inputs | null): RulesFacts {
  if (inputs === null) return { netLocked: null, saving: null, investing: null };
  const sum = (role: V3Series['role']): number | null => {
    const live = inputs.series.filter((s) => s.role === role && s.status === 'live');
    return live.length === 0 ? null : live.reduce((total, s) => total + monthlyMinor(s), 0);
  };
  const net = inputs.safetyNet ?? null;
  return { netLocked: net === null ? null : net.locked !== false, saving: sum('saving'), investing: sum('investing') };
}

export interface FooterFacts {
  months: number;
  entries: number;
}

/** Exported for tests: full months of records and the spending entries in them. */
export function footerFactsOf(inputs: V3Inputs | null): FooterFacts {
  if (inputs === null) return { months: 0, entries: 0 };
  const full = inputs.months.filter((m) => m.full);
  return { months: full.length, entries: full.reduce((n, m) => n + m.lines.filter((l) => l.role === 'spending').length, 0) };
}

/**
 * 06.1-59 (G-10): the sources the "How this was worked out" sheet lists, read the same way the answer reads them, so Decide home's
 * footer row opens the same sheet with the same rows.
 */
export function workedSourcesOf(inputs: V3Inputs | null): WorkedSources {
  const firstMonth = inputs?.months[0]?.month ?? null;
  return {
    activityFrom: firstMonth === null ? null : `${firstMonth}-01`,
    activityTo: inputs === null ? null : (inputs.recordsAsOf ?? inputs.asOf),
    netSize: inputs?.safetyNet?.size ?? null,
    netLocked: inputs?.safetyNet?.locked ?? true,
    rulesCount: inputs?.limits.lines.length ?? 0,
  };
}

/** The count on the Past decisions pill: decisions with a look-back to read. */
export function usePastCount(): number {
  const model = usePastDecisions();
  return useMemo(() => model.decisions.filter((d) => lookBackOf(deltaFor(d, model.linesByCheck.get(d.id) ?? [], model.ctx)) !== null).length, [model]);
}

/** The device flag for the one-time "setup done" note. Until it has been read the note counts as seen, so it never flashes. */
export function useSetupDoneSeen(userId: string | null): boolean {
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    if (userId === null) return undefined;
    let live = true;
    loadSetupDoneSeen(userId).then(
      (v) => {
        if (live) setSeen(v);
      },
      () => {
        if (live) setSeen(true);
      },
    );
    return () => {
      live = false;
    };
  }, [userId]);
  return userId === null || seen === null ? true : seen;
}
