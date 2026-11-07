// 06-05 (BO-07 item 3): the safety-net connection point. The migrated safety-net goal in, Decide's net and fund out. PURE.
import type { EmergencyFund, SafetyNet } from '@/engine/decide/v3';
import { minorUnits } from '@/engine/money';
import { goalSaved } from './goalSaved';
import type { GoalLineSource, GoalSourceRow, SafetyNetPoint, ToHome } from './types';

/**
 * The live safety-net goal as a point, or null when there is none. CR-03: a goal stored in another currency than home is not
 * read as home money (size null = the starter, saved 0, no linked account), as the interim settings columns were not.
 */
export function safetyNetPointOf(rows: readonly GoalSourceRow[], lines: readonly GoalLineSource[], toHome: ToHome, home: string): SafetyNetPoint | null {
  const row = rows.find((r) => r.is_safety_net === true && r.deleted_at === null);
  if (row === undefined) return null;
  const base = { goalId: row.id, protect: row.protect !== false, locked: true as const, confirmedAt: row.net_confirmed_at ?? null };
  if (row.currency !== home) return { ...base, size: null, saved: minorUnits(0), accountId: null };
  const size = row.target === null ? null : toHome(row.target, row.currency);
  return {
    ...base,
    size: size === null ? null : minorUnits(size),
    saved: minorUnits(goalSaved(row, lines, toHome) ?? 0),
    accountId: row.account_id ?? null,
  };
}

/**
 * Decide's inputs. Size null stays null (the starter, never 0). Nothing saved and no account = no emergency fund (an empty fund
 * linked to nothing says nothing).
 */
export function safetyNetInputsOf(p: SafetyNetPoint | null): { safetyNet: SafetyNet | null; emergency: EmergencyFund | null } {
  if (p === null) return { safetyNet: null, emergency: null };
  return {
    safetyNet: { protect: p.protect, size: p.size, saved: p.saved, locked: true },
    emergency: p.saved === 0 && p.accountId === null ? null : { amount: p.saved, accountId: p.accountId },
  };
}
