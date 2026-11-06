// 05.4 BO-08 (D-10, D-11, D-13): rounded shadow-run results, written once per engine revision and fixed sample.
// Insert only. The table has no client select, so nothing is read back (no `.select()`), and a repeat
// (unique violation 23505) means this revision already reported, which counts as success.

import { toDbError } from './errors';
import type { DbClient } from './rows';

export interface ShadowRunRow {
  user_id: string;
  engine_revision: string;
  sample_id: string;
  code: string;
  variant: string | null;
  reasons: string[];
  figures: Record<string, number | string | null>;
}

const UNIQUE_VIOLATION = '23505';

export async function insertShadowRuns(client: DbClient, rows: readonly ShadowRunRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error, status } = await client.from('decide_shadow_runs').insert(rows as ShadowRunRow[]);
  if (error && error.code !== UNIQUE_VIOLATION) throw toDbError(error, status);
}
