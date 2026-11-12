// 06-14 (D-26): THE net-worth rule for Grow, and for the later Insights / Overview phase: import netWorthOf, do not write another
// sum. PURE: integer minor units in the home currency, in and out. The caller converts each figure first (and leaves out what
// it cannot convert); nothing here rounds.
//
//   net worth = account balances (a credit account's balance is negative)
//             + the value of every live holding
//             - every live, open debt that is not linked to an account
//
// Two rules keep a figure from counting twice:
//   - an investment account that has a live holding is left out of the balance sum, because its money is the holding's value;
//   - a debt linked to an account (a card or loan account) is already in that account's balance, so it is not taken off again.

export interface NetWorthAccount {
  id: string;
  kind: 'cash' | 'checking' | 'savings' | 'credit' | 'investment' | 'loan' | 'other';
  deleted_at?: string | null;
}

export interface NetWorthHolding {
  /** The account the holding sits in, or null. */
  account_id: string | null;
  /** Home-currency minor units. */
  value: number;
  deleted_at?: string | null;
}

export interface NetWorthDebt {
  /** The account the debt is tracked by, or null for a debt that has no account. */
  account_id: string | null;
  /** Home-currency minor units owed (positive). */
  balance: number;
  paid_off?: boolean;
  deleted_at?: string | null;
}

export interface NetWorthInput {
  accounts: readonly NetWorthAccount[];
  /** Account id -> balance in home-currency minor units (credit accounts negative). A missing account counts as 0. */
  balances: ReadonlyMap<string, number>;
  holdings: readonly NetWorthHolding[];
  debts: readonly NetWorthDebt[];
}

export function netWorthOf(input: NetWorthInput): number {
  const liveHoldings = input.holdings.filter((h) => !h.deleted_at);
  const accountsWithHolding = new Set<string>();
  for (const h of liveHoldings) {
    if (h.account_id !== null) accountsWithHolding.add(h.account_id);
  }

  let total = 0n;
  for (const a of input.accounts) {
    if (a.deleted_at) continue;
    if (a.kind === 'investment' && accountsWithHolding.has(a.id)) continue;
    total += BigInt(input.balances.get(a.id) ?? 0);
  }
  for (const h of liveHoldings) total += BigInt(h.value);
  for (const d of input.debts) {
    if (d.deleted_at || d.paid_off === true || d.account_id !== null) continue;
    total -= BigInt(d.balance);
  }
  const result = Number(total);
  if (!Number.isSafeInteger(result)) throw new RangeError('netWorthOf: result exceeds the safe integer range');
  return result;
}
