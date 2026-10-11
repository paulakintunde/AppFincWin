/**
 * D-23 / RESEARCH Pattern 2: place an amount that sits between the money-out
 * and money-in columns using the running balance. Signed balances are passed
 * in the statement's own terms (markerSign(balanceMarker) * balanceMagnitude);
 * whether the balance is held or owed is not known yet, so the direction of
 * each column is LEARNED from the statement's clearly placed rows, never assumed.
 * All comparisons use bigint so values near the 1e13 ceiling stay exact.
 */

/** +1 when the balance rose by exactly `magnitude`, -1 when it fell by exactly `magnitude`, else null. */
export function balanceStep(previous: number, current: number, magnitude: number): 1 | -1 | null {
  if (magnitude === 0) return null;
  const delta = BigInt(current) - BigInt(previous);
  const m = BigInt(magnitude);
  if (delta === m) return 1;
  if (delta === -m) return -1;
  return null;
}

/** The balance step a debit-column amount produces, when the clearly placed rows agree on one (>= 90%). */
export function learnDebitDirection(samples: readonly { column: 'debit' | 'credit'; step: 1 | -1 }[]): 1 | -1 | null {
  let up = 0;
  let down = 0;
  for (const s of samples) {
    const vote = s.column === 'debit' ? s.step : s.step === 1 ? -1 : 1;
    if (vote === 1) up += 1;
    else down += 1;
  }
  const total = up + down;
  if (total < 1) return null;
  const majority = up >= down ? up : down;
  if (majority * 10 < total * 9) return null;
  return up > down ? 1 : -1;
}

/** The single candidate whose magnitude equals the balance change, with the direction of that change. */
export function pickByDelta(previous: number, current: number, candidates: readonly number[]): { index: number; step: 1 | -1 } | null {
  const delta = BigInt(current) - BigInt(previous);
  if (delta === 0n) return null;
  const abs = delta < 0n ? -delta : delta;
  let found = -1;
  for (let i = 0; i < candidates.length; i += 1) {
    if (BigInt(candidates[i] as number) === abs) {
      if (found !== -1) return null;
      found = i;
    }
  }
  if (found === -1) return null;
  return { index: found, step: delta > 0n ? 1 : -1 };
}
