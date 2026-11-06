/**
 * Test-only readings of a Confidence (05.4 FIN-25 / ENG-10). The engine has no level and no score; these exist so the
 * "thin data is never surer" properties and the pre-05.4 golden fixtures can still be stated.
 */
import type { Confidence, ConfidenceReason } from '../../types';

/** An order on what an answer rests on: quick estimates < fewer months < more months; at equal months a reason < clean. */
export function restsOn(c: Confidence): number {
  const b = c.basis;
  if (b.kind === 'quick_estimates') return 0;
  if (b.kind === 'partial') return b.used * 10;
  return b.months * 10 + (b.kind === 'records' ? 2 : 1);
}

/** The reasons that made a pre-05.4 answer 'rough'; any other reason made it 'fair'; none made it 'firm'. */
const ROUGH_REASONS: readonly ConfidenceReason[] = ['few_months', 'quick_estimates', 'unspent_drifted', 'pay_missed', 'user_said_cover'];

export type GoldenLevel = 'rough' | 'fair' | 'firm';

/** The golden fixtures' old three-word expectation, read from the reasons (exactly the old rule). */
export function goldenLevel(c: Confidence): GoldenLevel {
  const codes = c.reasons.map((r) => r.code);
  if (codes.some((x) => ROUGH_REASONS.includes(x))) return 'rough';
  return codes.length > 0 ? 'fair' : 'firm';
}

export const codesOf = (c: Confidence): readonly ConfidenceReason[] => c.reasons.map((r) => r.code);

/** A month model's confidence with nothing lowering it: 3 months of records, no reasons. */
export const CLEAN_CONFIDENCE: Confidence = { reasons: [], basis: { kind: 'records', months: 3, upTo: '2026-10-03' }, nextStep: null };
