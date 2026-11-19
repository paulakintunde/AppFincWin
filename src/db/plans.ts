// 09-10 (D-13): the household's plan, read from the server. plan_state() is the one source; refresh asks the server to
// re-read the store (plan-refresh, 09-07) and is best effort.
import { captureError } from '@/services/errors';
import type { PlanStateRow } from '@/features/plans/types';
import { toDbError } from './errors';
import type { DbClient } from './rows';

export async function fetchPlanState(client: DbClient): Promise<PlanStateRow> {
  const { data, error, status } = await client.rpc('plan_state');
  if (error) throw toDbError(error, status);
  return data as PlanStateRow;
}

export async function refreshPlan(client: DbClient): Promise<void> {
  try {
    const { error } = await client.functions.invoke('plan-refresh', { body: {} });
    if (error) captureError(error, { area: 'sync' });
  } catch (e) {
    captureError(e, { area: 'sync' });
  }
}
