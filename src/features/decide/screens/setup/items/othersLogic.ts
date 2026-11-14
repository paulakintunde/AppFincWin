// 06.1-25: the pure rules behind setup items 3 to 6 (Debts, Safety net, Your money rules, Records). No React, no I/O. Money stays in
// integer minor units.
import type { AccountUse, V3Account } from '@/engine/decide/v3';
import { loggedLately, type SetupFacts } from '../../logic/setupProgress';

/** A due day is a whole number 1..31 (the same bound Grow's writer checks). */
export function dueDayOfText(text: string): number | null {
  if (!/^\d{1,2}$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= 31 ? n : null;
}

export interface DueDayEdit {
  id: string;
  day: number;
}

/** The debts whose typed due day is a valid day that differs from the stored one. A blank field changes nothing. */
export function dueDayEdits(rows: readonly { id: string; due_day?: number | null }[], typed: Readonly<Record<string, string>>): DueDayEdit[] {
  const out: DueDayEdit[] = [];
  for (const row of rows) {
    const text = typed[row.id];
    if (text === undefined || text === '') continue;
    const day = dueDayOfText(text);
    if (day !== null && day !== (row.due_day ?? null)) out.push({ id: row.id, day });
  }
  return out;
}

/** True while some typed due day is not a day of the month. */
export function hasBadDueDay(typed: Readonly<Record<string, string>>): boolean {
  return Object.values(typed).some((text) => text !== '' && dueDayOfText(text) === null);
}

/**
 * How many rules are on. The shown rules count (the debt share, Grow's saving and investing, the user's own rules: rulesShown), and
 * so do the engine's lines when the inputs are ready (owner decision 2026-11-11: old limit lines count as rules for this item).
 * 06.1-79 (DS-8): `inputsOn` is rulesOnOf(inputs), the checklist's own count, so the page and the checklist never disagree.
 */
export function rulesOnCount(shownOn: number, inputsOn: number | null): number {
  return Math.max(shownOn, inputsOn ?? 0);
}

export interface RecordChecks {
  lastMonth: boolean;
  thisMonth: boolean;
  accounts: boolean;
  /** D-11: all three hold. */
  allDone: boolean;
}

/** D-11: the three Records checks, read from the same facts the checklist uses. */
export function recordChecks(facts: SetupFacts, today: string): RecordChecks {
  const lastMonth = facts.lastMonthComplete;
  const thisMonth = loggedLately(facts.newestEntryThisMonth, today);
  const accounts = facts.accountsAllHaveUse;
  return { lastMonth, thisMonth, accounts, allDone: lastMonth && thisMonth && accounts };
}

/** The `YYYY-MM` before `today`'s month. */
export function previousMonthOf(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** UX-23: the four plain account-use choices. */
export type UseChoice = 'everyday' | 'savings' | 'net' | 'notSpending';
export const USE_CHOICES: readonly UseChoice[] = ['everyday', 'savings', 'net', 'notSpending'];

/** The plain choice a stored use reads as. A mix reads as everyday (its money is still spendable); a kept-for-one-thing envelope as savings. */
export function choiceOfUse(use: AccountUse | null): UseChoice | null {
  if (use === null) return null;
  if (use.kind === 'everyday' || use.kind === 'mixed') return 'everyday';
  if (use.kind === 'untouched') return 'notSpending';
  return use.purpose.kind === 'emergency' ? 'net' : 'savings';
}

/**
 * The use a plain choice writes. "Savings or goals" names a goal (which one is kept for), so it returns null here and the caller
 * opens the account's own sheet to pick it.
 */
export function accountUseOfChoice(choice: UseChoice): AccountUse | null {
  if (choice === 'everyday') return { kind: 'everyday' };
  if (choice === 'notSpending') return { kind: 'untouched' };
  if (choice === 'net') return { kind: 'dedicated', purpose: { kind: 'emergency' } };
  return null;
}

/** Accounts the Records check asks about: the same ones the checklist counts (not cards, not savings accounts). */
export function askedAccounts(accounts: readonly V3Account[]): V3Account[] {
  return accounts.filter((a) => a.kind !== 'card' && a.kind !== 'savings');
}
