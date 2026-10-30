/**
 * 05.3-15 (D-16): a saved-plan or unfinished row on Decide home. The chip comes from the stored answer_v3, never from
 * verdict_at_decision; "changed since you saved" is true only when changeSinceLooked reports a change. A malformed stored
 * answer falls back to the live chip.
 */
import { changeSinceLooked, verdictRowFor } from '@/engine/decide/v3';
import type { Code, Evaluation, ReadyBy, SeenV3, Variant, YearMonth } from '@/engine/decide/v3';
import type { MinorUnits } from '@/engine/money';
import type { DecideCheckRow } from '@/db/decideChecks';

const CODES: readonly string[] = ['needs_input', 'not_yet', 'monthly_short', 'emergency_use', 'fits_unspent', 'fits_month'];
const VARIANTS: readonly string[] = ['payday', 'not_covered', 'low_month'];

/** Total guard: anything that is not a well-formed v3 seen state is treated as absent. */
function isSeenV3(x: unknown): x is SeenV3 {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as { v?: unknown; code?: unknown; variant?: unknown };
  if (o.v !== 3 || typeof o.code !== 'string' || !CODES.includes(o.code)) return false;
  return o.variant === null || (typeof o.variant === 'string' && VARIANTS.includes(o.variant));
}

function monthOf(r: ReadyBy | null | undefined): YearMonth | null {
  return r !== null && r !== undefined && r.kind === 'month' ? r.month : null;
}

export interface SavedPlanRow {
  readonly kind: 'saved' | 'unfinished';
  readonly item: string;
  readonly price: MinorUnits | null;
  readonly chipKey: string;
  readonly tone: 'fits' | 'caution' | 'short' | 'input';
  readonly coveredByMonth: YearMonth | null;
  readonly changed: boolean;
  readonly refundLine: boolean;
  readonly lineKey: string | null;
  readonly a11yKey: string;
}

export function savedPlanRow(args: { row: DecideCheckRow; live: Evaluation | undefined; refundBetter: boolean }): SavedPlanRow {
  const { row, live, refundBetter } = args;
  const stored: SeenV3 | null = isSeenV3(row.answer_v3) ? row.answer_v3 : null;
  const liveResult = live?.result;

  let code: Code;
  let variant: Variant | null;
  let readyBy: ReadyBy | null;
  if (stored !== null) {
    code = stored.code;
    variant = stored.variant;
    readyBy = stored.readyBy;
  } else if (liveResult !== undefined) {
    code = liveResult.code;
    variant = liveResult.variant;
    readyBy = liveResult.readyBy;
  } else {
    code = 'needs_input';
    variant = null;
    readyBy = null;
  }
  const chip = verdictRowFor(code, variant);

  const changed = stored !== null && liveResult !== undefined && changeSinceLooked(stored, liveResult).changed;
  const unfinished = row.status === 'open';

  return {
    kind: unfinished ? 'unfinished' : 'saved',
    item: row.name,
    price: live?.purchase?.whole ?? null,
    chipKey: chip.chipKey,
    tone: chip.tone,
    coveredByMonth: monthOf(readyBy),
    changed,
    refundLine: refundBetter,
    lineKey: unfinished ? 'decide.v3.ui.home.unfinishedLine' : null,
    a11yKey: unfinished
      ? 'decide.v3.ui.home.unfinishedRowA11y'
      : refundBetter
        ? 'decide.v3.ui.home.savedRowA11yRefund'
        : 'decide.v3.ui.home.savedRowA11y',
  };
}
