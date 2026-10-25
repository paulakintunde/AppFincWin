import { CONFIDENCE_STRONG_MIN_MONTHS, MIN_MONTHS_FOR_STEADINESS } from './constants';
import type { Confidence, ConfidenceInput, ConfidenceReason } from './types';

/**
 * How firm a read is (D-46), as a code and its reasons; copy is built elsewhere (D-21).
 *
 * Precedence: rough, then strong, then fair. "8 months and Volatile" meets both fair and rough, so rough is
 * evaluated first (04-RESEARCH addendum §E). Rough: a first read, under 3 full months, or Volatile income. Strong: 6 or
 * more full months and Steady income. Everything else is fair, with every reason that applies.
 * D-69: a read that uses a line converted at a provisional rate is never strong; 'provisional_rates' joins the reasons.
 */
export function confidenceOf(input: ConfidenceInput): Confidence {
  const { fullMonths, steadiness, firstRead } = input;
  const provisional = input.provisionalRates === true;
  if (!Number.isSafeInteger(fullMonths) || fullMonths < 0) {
    throw new RangeError(`confidenceOf: fullMonths ${fullMonths} must be a non-negative integer`);
  }
  if (firstRead) return { level: 'rough', reasons: ['first_read'] };
  const short = fullMonths < MIN_MONTHS_FOR_STEADINESS;
  if (steadiness !== null && (steadiness === 'insufficient') !== short) {
    throw new RangeError(`confidenceOf: steadiness ${steadiness} is inconsistent with ${fullMonths} full months`);
  }
  const rough: ConfidenceReason[] = [];
  if (short) rough.push('under_3_full_months');
  if (steadiness === 'volatile') rough.push('volatile_income');
  if (rough.length > 0) return { level: 'rough', reasons: provisional ? [...rough, 'provisional_rates'] : rough };
  if (fullMonths >= CONFIDENCE_STRONG_MIN_MONTHS && steadiness === 'steady' && !provisional) return { level: 'strong', reasons: [] };
  const fair: ConfidenceReason[] = [];
  if (fullMonths < CONFIDENCE_STRONG_MIN_MONTHS) fair.push('under_6_full_months');
  if (steadiness === 'variable') fair.push('variable_income');
  if (provisional) fair.push('provisional_rates');
  return { level: 'fair', reasons: fair };
}
