/**
 * D-46: running-balance reconciliation. Checks a converted statement's rows
 * against whatever balance evidence the file provides -- a running balance
 * printed on some or all rows, a stated opening/closing pair, or (for
 * available-credit files without a known limit) a per-row held-view delta
 * -- and reports what verifies, what can't be checked, and what genuinely
 * doesn't add up. An overdrawn or over-limit reading is an ordinary state
 * (D-49): nothing here inspects the sign of a balance or an amount to
 * decide anything, only whether two figures the file itself supplies agree.
 *
 * Orientation (file order vs. reversed) is chosen by counting which
 * direction verifies more links, never by sorting -- a stable sort of a
 * newest-first file would keep the reversed same-day order and break the
 * chain it is trying to detect (RESEARCH.md §A4).
 *
 * Amounts near the 1e13 ceiling accumulate past Number.MAX_SAFE_INTEGER
 * well before 5,000 rows are summed, so every sum in this file is BigInt.
 */

export type RowCheck = 'verified' | 'verified-as-group' | 'cannot-verify' | 'no-balance';
export type FileCheck = 'all-verified' | 'partial' | 'none-in-file' | 'ends-only-mismatch';

export interface ReconcileRow {
  amount: number | null;
  balance: number | null;
  localDate: string | null;
  availableDelta?: number | null;
}

export interface ReconcileResult {
  orientation: 'as-is' | 'reversed';
  rows: RowCheck[];
  file: FileCheck;
  verifiedLinks: number;
  failedLinks: number;
}

interface StatedEnds {
  opening: number | null;
  closing: number | null;
}

interface OrientationResult {
  rowStatus: RowCheck[];
  verifiedLinks: number;
  failedLinks: number;
}

/**
 * Builds a per-row "effective balance" for this orientation's row order: a
 * real `balance` value where the row carries one, otherwise a held-view
 * value rebuilt by accumulating `availableDelta` (an available-credit file
 * without a known limit never carries an absolute balance, only a
 * difference to the row immediately before it). Reconciliation only ever
 * compares differences between two such points, so the arbitrary starting
 * value a fresh delta run is seeded with never affects a result -- only an
 * unbroken run of deltas can bridge two positions.
 */
function effectiveBalances(rows: readonly ReconcileRow[]): (number | null)[] {
  const result: (number | null)[] = new Array(rows.length).fill(null);
  let cumulative: number | null = null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] as ReconcileRow;
    if (row.balance !== null) {
      result[i] = row.balance;
      cumulative = row.balance;
      continue;
    }
    const delta = row.availableDelta;
    if (delta === undefined || delta === null) {
      cumulative = null;
      continue;
    }
    cumulative = (cumulative ?? 0) + delta;
    result[i] = cumulative;
  }
  return result;
}

function segmentSumBigInt(rows: readonly ReconcileRow[], fromExclusive: number, toInclusive: number): bigint | null {
  let sum = 0n;
  for (let k = fromExclusive + 1; k <= toInclusive; k += 1) {
    const amount = rows[k]?.amount ?? null;
    if (amount === null) return null;
    sum += BigInt(amount);
  }
  return sum;
}

function sumAllAmountsBigInt(rows: readonly ReconcileRow[]): bigint | null {
  let sum = 0n;
  for (const row of rows) {
    if (row.amount === null) return null;
    sum += BigInt(row.amount);
  }
  return sum;
}

/**
 * One orientation's link-level pass: walks consecutive anchor positions
 * (rows with an effective balance), using the stated opening as a virtual
 * anchor immediately before row 0 when it is present. Every row strictly
 * after the previous anchor through the current one is marked by that
 * link's outcome; a row before the first usable anchor stays 'no-balance'.
 */
function runOrientation(rows: readonly ReconcileRow[], balances: readonly (number | null)[], stated: StatedEnds): OrientationResult {
  const rowStatus: RowCheck[] = new Array(rows.length).fill('no-balance');
  let verifiedLinks = 0;
  let failedLinks = 0;

  let prevPos = -1;
  let prevValue: number | null = stated.opening;
  let havePrev = stated.opening !== null;

  for (let curPos = 0; curPos < rows.length; curPos += 1) {
    const curValue = balances[curPos] ?? null;
    if (curValue === null) continue;

    if (havePrev) {
      const target = BigInt(curValue) - BigInt(prevValue as number);
      const sum = segmentSumBigInt(rows, prevPos, curPos);
      const ok = sum !== null && sum === target;
      const status: RowCheck = ok ? 'verified' : 'cannot-verify';
      for (let k = prevPos + 1; k <= curPos; k += 1) rowStatus[k] = status;
      if (ok) verifiedLinks += 1;
      else failedLinks += 1;
    }

    prevPos = curPos;
    prevValue = curValue;
    havePrev = true;
  }

  return { rowStatus, verifiedLinks, failedLinks };
}

/**
 * Same-day order jitter (RESEARCH.md §A4 step 4): a bank's running balance
 * sometimes reflects a different intra-day order than the file's own row
 * order. For every contiguous same-`localDate` block with at least one
 * failing link inside it, checking the block as a whole -- boundary value
 * before the block against the balance at its last row -- can still
 * verify it even though the individual links inside it don't.
 */
function applySameDayUpgrade(
  rows: readonly ReconcileRow[],
  balances: readonly (number | null)[],
  stated: StatedEnds,
  rowStatus: RowCheck[]
): void {
  const n = rows.length;
  let start = 0;
  while (start < n) {
    let end = start;
    const date = rows[start]?.localDate ?? null;
    if (date !== null) {
      while (end + 1 < n && (rows[end + 1]?.localDate ?? null) === date) end += 1;
    }

    if (end > start) {
      let hasFailing = false;
      for (let k = start; k <= end; k += 1) {
        if (rowStatus[k] === 'cannot-verify') hasFailing = true;
      }
      if (hasFailing) {
        const beforeValue = (start > 0 ? balances[start - 1] : stated.opening) ?? null;
        const afterValue = balances[end] ?? null;
        if (beforeValue !== null && afterValue !== null) {
          const sum = segmentSumBigInt(rows, start - 1, end);
          const target = BigInt(afterValue) - BigInt(beforeValue);
          if (sum !== null && sum === target) {
            for (let k = start; k <= end; k += 1) rowStatus[k] = 'verified-as-group';
          }
        }
      }
    }

    start = end + 1;
  }
}

function countNonDecreasingDatePairs(rows: readonly ReconcileRow[]): number {
  let count = 0;
  for (let i = 0; i + 1 < rows.length; i += 1) {
    const a = rows[i]?.localDate ?? null;
    const b = rows[i + 1]?.localDate ?? null;
    if (a !== null && b !== null && a <= b) count += 1;
  }
  return count;
}

export function reconcile(rows: readonly ReconcileRow[], stated: StatedEnds): ReconcileResult {
  const n = rows.length;
  if (n === 0) {
    return { orientation: 'as-is', rows: [], file: 'none-in-file', verifiedLinks: 0, failedLinks: 0 };
  }

  const reversedRows = [...rows].reverse();

  const forwardBalances = effectiveBalances(rows);
  const reversedBalances = effectiveBalances(reversedRows);

  const forward = runOrientation(rows, forwardBalances, stated);
  const reversed = runOrientation(reversedRows, reversedBalances, stated);

  let orientation: 'as-is' | 'reversed';
  if (forward.verifiedLinks > reversed.verifiedLinks) {
    orientation = 'as-is';
  } else if (reversed.verifiedLinks > forward.verifiedLinks) {
    orientation = 'reversed';
  } else {
    const forwardAsc = countNonDecreasingDatePairs(rows);
    const reversedAsc = countNonDecreasingDatePairs(reversedRows);
    orientation = reversedAsc > forwardAsc ? 'reversed' : 'as-is';
  }

  const chosenRows = orientation === 'as-is' ? rows : reversedRows;
  const chosenBalances = orientation === 'as-is' ? forwardBalances : reversedBalances;
  const chosen = orientation === 'as-is' ? forward : reversed;

  const rowStatus = [...chosen.rowStatus];
  applySameDayUpgrade(chosenRows, chosenBalances, stated, rowStatus);

  const hasRealAnchor = chosenBalances.some((v) => v !== null);

  let file: FileCheck;
  let finalRowStatus = rowStatus;
  let verifiedLinks = chosen.verifiedLinks;
  let failedLinks = chosen.failedLinks;

  if (!hasRealAnchor) {
    if (stated.opening !== null && stated.closing !== null) {
      const sum = sumAllAmountsBigInt(chosenRows);
      const matches = sum !== null && sum === BigInt(stated.closing) - BigInt(stated.opening);
      finalRowStatus = chosenRows.map(() => (matches ? 'verified' : 'cannot-verify'));
      file = matches ? 'all-verified' : 'ends-only-mismatch';
      verifiedLinks = matches ? 1 : 0;
      failedLinks = matches ? 0 : 1;
    } else {
      finalRowStatus = chosenRows.map(() => 'no-balance');
      file = 'none-in-file';
      verifiedLinks = 0;
      failedLinks = 0;
    }
  } else {
    const allGood = finalRowStatus.every((s) => s === 'verified' || s === 'verified-as-group');
    file = allGood ? 'all-verified' : 'partial';
  }

  const originalOrderStatus: RowCheck[] = new Array(n);
  if (orientation === 'as-is') {
    for (let i = 0; i < n; i += 1) originalOrderStatus[i] = finalRowStatus[i] as RowCheck;
  } else {
    for (let i = 0; i < n; i += 1) originalOrderStatus[n - 1 - i] = finalRowStatus[i] as RowCheck;
  }

  return { orientation, rows: originalOrderStatus, file, verifiedLinks, failedLinks };
}
