// 09-07 (D-13, D-19): re-read a subscriber from RevenueCat and hand the snapshot to plan_apply.
// Caller mode refreshes the signed-in caller (and the household payer); sweep mode refreshes every id the daily cron lists.
// Every effect is injected so this runs without a network. Logs carry counts and results only, never ids.
import type { PlanSnapshot } from '../_shared/revenuecat/subscriber.ts';

export interface RefreshDeps {
  fetchSnapshot(id: string): Promise<PlanSnapshot>;
  apply(id: string, s: PlanSnapshot, eventId: string): Promise<void>;
  householdPayer(callerId: string): Promise<string | null>;
  sweepTargets(): Promise<string[]>;
  now(): number;
  log(l: Record<string, unknown>): void;
}

export async function refreshForCaller(
  deps: RefreshDeps,
  callerId: string,
): Promise<{ ok: true } | { ok: false; error: 'upstream' }> {
  try {
    const ids = [callerId];
    const payer = await deps.householdPayer(callerId);
    if (payer && payer !== callerId) ids.push(payer);
    // Fetch everything first so a failed upstream read applies nothing.
    const snapshots: { id: string; s: PlanSnapshot }[] = [];
    for (const id of ids) snapshots.push({ id, s: await deps.fetchSnapshot(id) });
    for (const { id, s } of snapshots) await deps.apply(id, s, `refresh:${id}:${deps.now()}`);
    deps.log({ fn: 'plan-refresh', mode: 'caller', result: 'applied' });
    return { ok: true };
  } catch {
    deps.log({ fn: 'plan-refresh', mode: 'caller', result: 'error' });
    return { ok: false, error: 'upstream' };
  }
}

export async function sweep(deps: RefreshDeps): Promise<{ ok: true; applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;
  let ids: string[];
  try {
    ids = await deps.sweepTargets();
  } catch {
    deps.log({ fn: 'plan-refresh', mode: 'sweep', result: 'targets_error' });
    return { ok: true, applied: 0, failed: 1 };
  }
  for (const id of ids) {
    try {
      const snapshot = await deps.fetchSnapshot(id);
      await deps.apply(id, snapshot, `refresh:${id}:${deps.now()}`);
      applied++;
    } catch {
      failed++;
    }
  }
  deps.log({ fn: 'plan-refresh', mode: 'sweep', applied, failed });
  return { ok: true, applied, failed };
}
