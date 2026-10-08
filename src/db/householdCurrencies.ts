// 02-49: every currency a household already uses, so a home-currency change can ask for today's
// rates against all of them. Union of account currencies (archived included: their balances
// still convert), line currencies from the account_balances RPC (one row per account x original
// currency, no client-side table scan) and recurring-series currencies. Any failing read throws
// so the caller defers rather than fetching a partial set.
import { fetchAccounts } from './accounts';
import { fetchAccountBalances } from './recordReads';
import { fetchRecurringSeries } from './recurringSeries';
import type { DbClient } from './rows';

export async function fetchHouseholdCurrencies(client: DbClient, householdId: string): Promise<string[]> {
  const [accounts, balances, series] = await Promise.all([
    fetchAccounts(client, householdId),
    fetchAccountBalances(client, householdId),
    fetchRecurringSeries(client, householdId),
  ]);
  const codes = new Set<string>();
  for (const a of accounts) codes.add(a.currency);
  for (const b of balances) codes.add(b.currency);
  for (const s of series) codes.add(s.currency);
  return [...codes].sort();
}
