// 06-05 (BO-07 item 2): the goal connection point. Grow rows in, Decide envelopes out. PURE: engine types only.
import type { Envelope } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { clampSaved, goalSaved } from './goalSaved';
import type { GoalLineSource, GoalPoint, GoalSourceRow, ToHome } from './types';

/** Live goals (not done, not deleted, not the safety net) whose saved money converts. Absent locked = locked (safe default). */
export function goalPointsOf(rows: readonly GoalSourceRow[], lines: readonly GoalLineSource[], toHome: ToHome): GoalPoint[] {
  const points: GoalPoint[] = [];
  for (const row of rows) {
    if (row.deleted_at !== null || row.done_at !== null || row.is_safety_net === true) continue;
    const saved = goalSaved(row, lines, toHome);
    if (saved === null) continue;
    const target = row.target === null ? null : toHome(row.target, row.currency);
    const monthly = row.monthly_amount === null ? null : toHome(row.monthly_amount, row.currency);
    points.push({
      id: row.id,
      name: row.name,
      kind: row.kind,
      target: target === null ? null : minorUnits(target),
      saved: minorUnits(clampSaved(saved)),
      monthlyAmount: monthly === null ? null : minorUnits(monthly),
      readyBy: row.ready_by,
      locked: row.locked !== false,
      upFrontOnly: row.up_front_only === true,
      linkedCheckId: row.check_id,
      accountId: row.account_id ?? null,
      bucket: (row.bucket ?? null) !== null,
      done: false,
    });
  }
  return points;
}

/** Decide's envelopes. `locked` is always an explicit true or false, so the engine never has to guess. */
export function envelopesOf(points: readonly GoalPoint[]): Envelope[] {
  return points.map((p) => ({
    id: p.id,
    kind: p.kind,
    target: p.target,
    monthlyAmount: p.monthlyAmount,
    readyBy: p.readyBy,
    saved: p.saved,
    purposeId: null,
    accountId: p.accountId,
    bucket: p.bucket,
    name: p.name,
    locked: p.locked,
  }));
}
