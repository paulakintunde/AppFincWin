// D-08: the currency picker's data source is every currency fx-sync stores from
// Frankfurter v2, plus the user's custom currencies (custom currencies are 01-13's
// concern). This file reads only the shared ISO-currency cache.

import { toDbError } from './errors';
import type { CurrencyRow, DbClient } from './rows';

const CURRENCY_COLUMNS = 'code, iso_numeric, name, symbol, start_date, end_date';

/** Currencies with no `end_date` are the currently-active set (D-08). */
export async function fetchCurrencies(client: DbClient): Promise<CurrencyRow[]> {
  const { data, error, status } = await client
    .from('currencies')
    .select(CURRENCY_COLUMNS)
    .is('end_date', null)
    .order('code', { ascending: true });

  if (error) throw toDbError(error, status);
  return (data as CurrencyRow[] | null) ?? [];
}
