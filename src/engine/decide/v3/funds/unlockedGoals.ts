/**
 * 06 D-22 (code review P2-CR-01, P2-CR-02, P2-WR-01..04): an unlocked goal's saved money is spare money, counted exactly once,
 * through the account it sits in.
 *
 * - In a spending account (everyday or mixed), or linked to no account the inputs know: it stays in the spending balance (spendingOf
 *   does not fence it off), so it is counted there and nowhere else.
 * - In a dedicated or untouched account (never spending money): counted once here, as `outside`, up to what the account holds after
 *   its locked goals (money that is not there is never counted). It is never part of the safety net or its "money above the size".
 * - In an account with no stated use: not counted (the account is asked about first, D-54).
 *
 * `outsideKept` is the part of `outside` held in untouched savings accounts. keptSavings already counts the whole balance of those
 * accounts for low months and the runway, so those sums leave this part out.
 * Locked goals (locked true or absent) are untouched by this file. Pure; integer minor units.
 */
import { minorUnits, type MinorUnits } from '../../../money/types';
import type { V3Inputs } from '../types';

export interface UnlockedOutside {
  readonly outside: MinorUnits;
  readonly outsideKept: MinorUnits;
}

/** True for the accounts keptSavings counts (judge.ts): a savings account whose use is untouched, holding money. */
export function isKeptSavingsAccount(a: NonNullable<V3Inputs['accounts']>[number]): boolean {
  return a.kind === 'savings' && a.use !== null && a.use.kind === 'untouched' && a.balance > 0;
}

export function unlockedOutside(inputs: Pick<V3Inputs, 'accounts' | 'envelopes'>): UnlockedOutside {
  let outside = 0;
  let outsideKept = 0;
  for (const a of inputs.accounts ?? []) {
    if (a.use === null || (a.use.kind !== 'dedicated' && a.use.kind !== 'untouched')) continue;
    let unlocked = 0;
    let locked = 0;
    for (const e of inputs.envelopes) {
      if (e.accountId !== a.id || e.saved <= 0) continue;
      if (e.locked === false) unlocked += e.saved;
      else locked += e.saved;
    }
    const room = a.balance - locked > 0 ? a.balance - locked : 0;
    const counted = Math.min(unlocked, room);
    outside += counted;
    if (isKeptSavingsAccount(a)) outsideKept += counted;
  }
  return { outside: minorUnits(outside), outsideKept: minorUnits(outsideKept) };
}
