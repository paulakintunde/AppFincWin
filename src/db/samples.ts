// Sample-data RPCs (seed_sample_data, clear_sample_data, sample_data_exists), each with its
// response envelope validated (T-02.2-18-03).

import { DbError, toDbError } from './errors';
import type { DbClient } from './rows';

const BAD_RESPONSE = 'bad-response';

export interface SeedSampleResult {
  status: 'applied' | 'already-seeded';
  counts: Record<string, number>;
}

export interface ClearSampleResult {
  transactions: number;
  series: number;
  accounts: number;
  categories: number;
  kept: number;
}

function bad(context: string): DbError {
  return new DbError(`sample data RPC response: ${context}`, BAD_RESPONSE, null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function seedSampleData(client: DbClient, householdId: string, today: string): Promise<SeedSampleResult> {
  const { data, error, status } = await client.rpc('seed_sample_data', { p_household_id: householdId, p_today: today });

  if (error) throw toDbError(error, status);
  if (!isRecord(data) || (data.status !== 'applied' && data.status !== 'already-seeded')) {
    throw bad('unrecognised seed status');
  }
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key !== 'status' && typeof value === 'number') counts[key] = value;
  }
  return { status: data.status, counts };
}

export async function clearSampleData(client: DbClient, householdId: string): Promise<ClearSampleResult> {
  const { data, error, status } = await client.rpc('clear_sample_data', { p_household_id: householdId });

  if (error) throw toDbError(error, status);
  if (!isRecord(data) || data.status !== 'applied') throw bad('unrecognised clear status');
  const num = (key: string): number => {
    const v = data[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw bad(`malformed ${key}`);
    return v;
  };
  return {
    transactions: num('transactions'),
    series: num('series'),
    accounts: num('accounts'),
    categories: num('categories'),
    kept: num('kept'),
  };
}

export async function fetchSampleDataExists(client: DbClient, householdId: string): Promise<boolean> {
  const { data, error, status } = await client.rpc('sample_data_exists', { p_household_id: householdId });

  if (error) throw toDbError(error, status);
  if (typeof data !== 'boolean') throw bad('sample_data_exists is not a boolean');
  return data;
}
