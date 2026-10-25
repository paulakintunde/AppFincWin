/**
 * 05-117 (D-95, D-99; UI-SPEC R17.3 "Quiet rows"): the values the Decide home rows show. PURE: no React, no I/O.
 * - changedOpenCount mirrors the OpenChecksCard marker: a row is "changed since you looked" when its saved last-seen
 *   state differs from the state the live snapshot gives it now (each check judged with the other open checks);
 * - linesSetCount mirrors the LinesCard `stored` rule: a limit counts once the user set it, and money limits stamped in
 *   another currency read as blank.
 */
import type { DecideCheckRow, SeenState } from '@/db/decideChecks';
import type { DecideSettingsRow } from '@/db/decideSettings';
import { inHomeCurrency, sourceFor } from '../snapshot/checkCurrency';
import { parseCheckInputs } from '../snapshot/checkInputs';
import type { JudgeOn } from '../hints/decideHints';
import { computeChip } from '../snapshot/computeCheck';
import { selectOtherChecks } from '../snapshot/stacking';
import type { ChipComputation, SnapshotResult } from '../snapshot/types';

export function liveOpenChecks(checks: readonly DecideCheckRow[]): DecideCheckRow[] {
  return checks.filter((c) => c.status === 'open' && c.deleted_at === null);
}

/** The chip of one open check on `source`, judged with the other open checks. */
function chipOf(source: SnapshotResult, open: readonly DecideCheckRow[], row: DecideCheckRow, today: string): ChipComputation {
  const view = inHomeCurrency(parseCheckInputs(row.inputs, today), source, { isSample: row.is_sample });
  const others = selectOtherChecks({ checks: open, excludeId: row.id, source, today }).otherChecks;
  return computeChip(sourceFor(source, view), view.inputs, others, row.id);
}

export function changedOpenCount(source: SnapshotResult | null, checks: readonly DecideCheckRow[], today: string): number {
  if (source === null) return 0;
  const open = liveOpenChecks(checks);
  let changed = 0;
  for (const row of open) {
    if (row.last_seen_state === null) continue;
    const chip = chipOf(source, open, row, today);
    const seen: SeenState | null = chip.status === 'logged' || chip.status === 'first_read' ? chip.state : null;
    if (seen !== null && seen !== row.last_seen_state) changed += 1;
  }
  return changed;
}

/**
 * D-107: the same logged snapshot judged on another Judge-on choice, exactly as the builder would set it: the choice itself,
 * or Worst for 'month' when a current-month line has no stored rate (monthFallback). Other kinds have no basis to switch.
 */
export function withJudgeOn(source: SnapshotResult, judgeOn: JudgeOn): SnapshotResult {
  if (source.kind !== 'logged') return source;
  const fallback = judgeOn === 'month' && (source.monthUnconverted ?? null) !== null;
  return {
    ...source,
    judgeOn,
    monthFallback: fallback ? { currencies: source.monthUnconverted?.currencies ?? [] } : null,
    snapshot: { ...source.snapshot, basisOverride: fallback ? 'worst' : judgeOn },
  };
}

export interface RebaselinedSeen {
  id: string;
  state: SeenState;
}

/**
 * D-107 (user, 2026-10-24): switching Judge-on must not read as a data change. For each live open check whose state on the
 * basis being left (`before`) still equals its saved last-seen state, returns its state on the basis being entered (`after`)
 * when that differs. A check whose old-basis state already differs (a real data change) is left out, so it keeps showing as
 * changed; first-read, incomplete and unconverted checks have no logged state and are left out. PURE.
 */
export function rebaselineSeen(
  before: SnapshotResult | null,
  after: SnapshotResult | null,
  checks: readonly DecideCheckRow[],
  today: string
): RebaselinedSeen[] {
  if (before === null || after === null) return [];
  const open = liveOpenChecks(checks);
  const out: RebaselinedSeen[] = [];
  for (const row of open) {
    if (row.last_seen_state === null) continue;
    const was = chipOf(before, open, row, today);
    const now = chipOf(after, open, row, today);
    if (was.status !== 'logged' || now.status !== 'logged') continue;
    if (was.state === row.last_seen_state && now.state !== was.state) out.push({ id: row.id, state: now.state });
  }
  return out;
}

export function linesSetCount(settings: DecideSettingsRow | null, currency: string): number {
  if (settings === null) return 0;
  const foreign = settings.currency !== null && settings.currency !== currency;
  const flags = [
    !foreign && settings.reserve !== null,
    !foreign && settings.investing_floor !== null,
    !foreign && settings.saving_floor !== null,
    settings.dsr_line !== null,
    settings.housing_line !== null,
    settings.unsecured_multiple !== null,
  ];
  return flags.filter(Boolean).length;
}
