/**
 * 05.3-20 (D-13). PURE. The refund line shows only when counting refunds gives a strictly more favourable code than
 * leaving them out, and the stored answer is not already that good. The stored answer is read, never written.
 */
import { CODE_PRECEDENCE } from '@/engine/decide/v3';
import type { Result } from '@/engine/decide/v3';
import type { StoredSeenV3 } from '@/db/decideChecks';

export function refundHint(args: {
  stored: Pick<StoredSeenV3, 'code'> | null;
  live: Pick<Result, 'code'> | undefined;
  without: Pick<Result, 'code'> | undefined;
}): boolean {
  const { stored, live, without } = args;
  if (live === undefined || without === undefined) return false;
  const rank = (c: Result['code']): number => CODE_PRECEDENCE.indexOf(c);
  if (rank(live.code) <= rank(without.code)) return false;
  if (stored !== null && rank(stored.code) >= rank(live.code)) return false;
  return true;
}
