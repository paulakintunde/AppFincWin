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
import { computeChip } from '../snapshot/computeCheck';
import { selectOtherChecks } from '../snapshot/stacking';
import type { SnapshotResult } from '../snapshot/types';

export function liveOpenChecks(checks: readonly DecideCheckRow[]): DecideCheckRow[] {
  return checks.filter((c) => c.status === 'open' && c.deleted_at === null);
}

export function changedOpenCount(source: SnapshotResult | null, checks: readonly DecideCheckRow[], today: string): number {
  if (source === null) return 0;
  const open = liveOpenChecks(checks);
  let changed = 0;
  for (const row of open) {
    if (row.last_seen_state === null) continue;
    const view = inHomeCurrency(parseCheckInputs(row.inputs, today), source, { isSample: row.is_sample });
    const others = selectOtherChecks({ checks: open, excludeId: row.id, source, today }).otherChecks;
    const chip = computeChip(sourceFor(source, view), view.inputs, others);
    const seen: SeenState | null = chip.status === 'logged' || chip.status === 'first_read' ? chip.state : null;
    if (seen !== null && seen !== row.last_seen_state) changed += 1;
  }
  return changed;
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
