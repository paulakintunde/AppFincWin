// 09-07 (D-29, Owner Answer 8): free access for testers and the owner is a RevenueCat promotional entitlement with an
// end time, then a plan_apply re-read. Never a feature flag. Every effect is injected; logs carry counts only, never ids.

// 2100-01-01T00:00:00Z: the owner's grant has no practical end.
export const OWNER_END_TIME_MS = 4102444800000;

export interface GrantDeps {
  listTesterUsers(includePrelaunch: boolean): Promise<string[]>;
  currentPromoEnd(id: string): Promise<number | null>;
  recordGrant(id: string, endMs: number): Promise<void>;
  postPromotional(id: string, endMs: number): Promise<void>;
  refresh(id: string): Promise<void>;
  setTesterUntil(endMs: number): Promise<void>;
  markOwner(id: string): Promise<void>;
  log(l: Record<string, unknown>): void;
}

export interface TesterResult {
  ok: true;
  granted: number;
  skipped: number;
  failed: number;
}

async function grantOne(deps: GrantDeps, id: string, endMs: number): Promise<'granted' | 'skipped'> {
  // Re-run safety: a promo that already ends at this time is left alone (RevenueCat treats a request within 2 hours of an active promo's expiry as a duplicate).
  if ((await deps.currentPromoEnd(id)) === endMs) return 'skipped';
  await deps.recordGrant(id, endMs);
  await deps.postPromotional(id, endMs);
  await deps.refresh(id);
  return 'granted';
}

export async function grantTesters(
  deps: GrantDeps,
  opts: { endTimeMs: number; includePrelaunch?: boolean },
): Promise<TesterResult> {
  const users = [...new Set(await deps.listTesterUsers(opts.includePrelaunch === true))];
  let granted = 0;
  let skipped = 0;
  let failed = 0;
  for (const id of users) {
    try {
      if ((await grantOne(deps, id, opts.endTimeMs)) === 'granted') granted++;
      else skipped++;
    } catch {
      failed++;
    }
  }
  try {
    await deps.setTesterUntil(opts.endTimeMs);
  } catch {
    failed++;
  }
  deps.log({ fn: 'plan-grant', mode: 'testers', granted, skipped, failed });
  return { ok: true, granted, skipped, failed };
}

export async function grantOwner(
  deps: GrantDeps,
  opts: { userId: string },
): Promise<{ ok: true } | { ok: false; error: 'upstream' }> {
  try {
    await grantOne(deps, opts.userId, OWNER_END_TIME_MS);
    await deps.markOwner(opts.userId);
    deps.log({ fn: 'plan-grant', mode: 'owner', result: 'granted' });
    return { ok: true };
  } catch {
    deps.log({ fn: 'plan-grant', mode: 'owner', result: 'error' });
    return { ok: false, error: 'upstream' };
  }
}
