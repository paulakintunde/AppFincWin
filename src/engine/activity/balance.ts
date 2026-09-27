/**
 * Account balance (REC-08, D-10, D-50). An account balance is its opening
 * balance plus paid rows in the account's own currency; paid rows in other
 * currencies are reported as separate subtotals rather than silently
 * converted. Transfer legs are already inside the server's paid-row sums
 * like any other paid row (D-50) -- this function has no special casing for
 * them.
 *
 * Sums arrive as text from a server RPC, so every arithmetic step uses BigInt
 * -- never a float-parsing helper, never a lossy float sum -- and an explicit
 * overflow flag replaces a silently wrong number the moment a value would
 * exceed a safe integer.
 */

export interface BalanceLeg {
  currency: string;
  paidSum: string; // server-summed paid rows in this currency, as bigint-safe text
}

export interface AccountBalance {
  balance: number | null;
  otherCurrencies: { currency: string; paidSum: number }[];
  overflow: boolean;
}

function toSafeNumber(n: bigint): number | null {
  if (n > BigInt(Number.MAX_SAFE_INTEGER) || n < BigInt(Number.MIN_SAFE_INTEGER)) {
    return null;
  }
  return Number(n);
}

export function accountBalance(input: {
  openingBalance: number;
  currency: string;
  legs: readonly BalanceLeg[];
}): AccountBalance {
  let ownSum = BigInt(input.openingBalance);
  const otherCurrencies: { currency: string; paidSum: number }[] = [];
  let overflow = false;

  for (const leg of input.legs) {
    const legSum = BigInt(leg.paidSum);
    if (leg.currency === input.currency) {
      ownSum += legSum;
    } else {
      const safe = toSafeNumber(legSum);
      if (safe === null) {
        overflow = true;
      } else {
        otherCurrencies.push({ currency: leg.currency, paidSum: safe });
      }
    }
  }

  const ownSafe = toSafeNumber(ownSum);
  if (ownSafe === null) {
    overflow = true;
  }

  return {
    balance: overflow ? null : ownSafe,
    otherCurrencies,
    overflow,
  };
}
