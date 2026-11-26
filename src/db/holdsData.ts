// 09-22 (D-34): four light "does any line like this exist" reads behind the Features screen's "Has your records, so it stays on".
// Each asks for one id (limit 1) from the active view, so the cost is the same for a household of ten lines or ten thousand.
// RLS decides what the caller can see; the household filter only keeps the index in play.
import { toDbError } from './errors';
import { ACTIVE_VIEW } from './transactions';
import type { DbClient } from './rows';

export interface HoldsFlags {
  /** Any live line that is one side of a transfer. */
  transfers: boolean;
  /** Any live line that came from an import batch, or a remembered import layout (the map's "import profile or imported line"). */
  importedLines: boolean;
  /** Any live shared line split by weight. */
  weightSplits: boolean;
  /** Any live shared line split by exact amounts. */
  amountSplits: boolean;
  /** Any receipt on a line (10.1-19). RLS scopes the rows to the caller's households. */
  receipts: boolean;
  /** Any live line split across categories. */
  splitLines: boolean;
  /** Any live shared line split by item. */
  itemSplits: boolean;
}

type Probe = 'transfers' | 'importedLines' | 'weightSplits' | 'amountSplits' | 'splitLines' | 'itemSplits';

async function anyLine(client: DbClient, householdId: string, probe: Probe): Promise<boolean> {
  const base = client.from(ACTIVE_VIEW).select('id').eq('household_id', householdId);
  let q;
  if (probe === 'transfers') q = base.not('transfer_id', 'is', null);
  else if (probe === 'importedLines') q = base.not('import_batch_id', 'is', null);
  else if (probe === 'splitLines') q = base.not('category_parts', 'is', null);
  else if (probe === 'itemSplits') q = base.eq('is_shared', true).not('item_split', 'is', null);
  else q = base.eq('is_shared', true).eq('split_rule', probe === 'weightSplits' ? 'weight' : 'amount');
  const { data, error, status } = await q.limit(1);
  if (error) throw toDbError(error, status);
  return ((data as unknown[] | null) ?? []).length > 0;
}

/** The caller's own remembered import layouts (RLS scopes the rows to them). */
async function anyImportProfile(client: DbClient): Promise<boolean> {
  const { data, error, status } = await client.from('import_profiles').select('id').limit(1);
  if (error) throw toDbError(error, status);
  return ((data as unknown[] | null) ?? []).length > 0;
}

/** Any receipt the caller can see (RLS scopes the rows). */
async function anyReceipt(client: DbClient): Promise<boolean> {
  const { data, error, status } = await client.from('transaction_receipts').select('id').limit(1);
  if (error) throw toDbError(error, status);
  return ((data as unknown[] | null) ?? []).length > 0;
}

export async function fetchHoldsFlags(client: DbClient, householdId: string): Promise<HoldsFlags> {
  const [transfers, importedLine, importProfile, weightSplits, amountSplits, receipts, splitLines, itemSplits] = await Promise.all([
    anyLine(client, householdId, 'transfers'),
    anyLine(client, householdId, 'importedLines'),
    anyImportProfile(client),
    anyLine(client, householdId, 'weightSplits'),
    anyLine(client, householdId, 'amountSplits'),
    anyReceipt(client),
    anyLine(client, householdId, 'splitLines'),
    anyLine(client, householdId, 'itemSplits'),
  ]);
  return { transfers, importedLines: importedLine || importProfile, weightSplits, amountSplits, receipts, splitLines, itemSplits };
}
