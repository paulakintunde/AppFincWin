/**
 * Account standing (D-49): a pure, total function describing where an
 * account sits relative to its overdraft or credit limit. Overdrawn and
 * over-limit are ordinary states here, never errors -- the engine never
 * throws and never returns an error kind. Inputs are in the account's own
 * currency; `balance` is opening + paid rows (D-10), never the
 * home-currency figure. An overdraft limit of exactly 0 is treated the same
 * as no limit at all (D-49): "£140 beyond your £0 overdraft" reads badly,
 * and "No overdraft set" is the honest reading. Copy is assembled by the UI
 * (DSG-06) from the discriminant and numbers returned here -- this module
 * returns no strings.
 */
import { minorUnits, type MinorUnits } from '../money/types';

export type AccountKind = 'cash' | 'checking' | 'savings' | 'credit' | 'investment' | 'loan' | 'other';

export type Standing =
  | { kind: 'in-credit'; balance: MinorUnits }
  | { kind: 'overdrawn-within'; overdrawnBy: MinorUnits; limit: MinorUnits }
  | { kind: 'overdrawn-beyond'; overdrawnBy: MinorUnits; limit: MinorUnits; beyondBy: MinorUnits }
  | { kind: 'overdrawn-no-limit'; overdrawnBy: MinorUnits }
  | { kind: 'card-in-credit'; creditBy: MinorUnits }
  | { kind: 'owing-within'; owed: MinorUnits; limit: MinorUnits | null }
  | { kind: 'over-limit'; owed: MinorUnits; limit: MinorUnits; overBy: MinorUnits }
  | { kind: 'loan-owing'; owed: MinorUnits }
  | { kind: 'loan-in-credit'; creditBy: MinorUnits }
  | { kind: 'plain' };

export interface AccountStandingInput {
  kind: AccountKind;
  balance: MinorUnits;
  overdraftLimit: MinorUnits | null;
  creditLimit: MinorUnits | null;
}

// A limit of exactly 0 reads the same as "no limit set" (D-49).
function effectiveLimit(limit: MinorUnits | null): MinorUnits | null {
  return limit !== null && limit > 0 ? limit : null;
}

function depositStanding(balance: MinorUnits, overdraftLimit: MinorUnits | null): Standing {
  if (balance >= 0) {
    return { kind: 'in-credit', balance };
  }
  const overdrawnBy = minorUnits(Math.abs(balance));
  const limit = effectiveLimit(overdraftLimit);
  if (limit === null) {
    return { kind: 'overdrawn-no-limit', overdrawnBy };
  }
  if (overdrawnBy <= limit) {
    return { kind: 'overdrawn-within', overdrawnBy, limit };
  }
  return { kind: 'overdrawn-beyond', overdrawnBy, limit, beyondBy: minorUnits(overdrawnBy - limit) };
}

function cardStanding(balance: MinorUnits, creditLimit: MinorUnits | null): Standing {
  if (balance > 0) {
    return { kind: 'card-in-credit', creditBy: balance };
  }
  const owed = minorUnits(Math.abs(balance));
  const limit = effectiveLimit(creditLimit);
  if (limit === null) {
    return { kind: 'owing-within', owed, limit: null };
  }
  if (owed <= limit) {
    return { kind: 'owing-within', owed, limit };
  }
  return { kind: 'over-limit', owed, limit, overBy: minorUnits(owed - limit) };
}

function loanStanding(balance: MinorUnits): Standing {
  if (balance > 0) {
    return { kind: 'loan-in-credit', creditBy: balance };
  }
  return { kind: 'loan-owing', owed: minorUnits(Math.abs(balance)) };
}

export function accountStanding(a: AccountStandingInput): Standing {
  switch (a.kind) {
    case 'checking':
    case 'savings':
      return depositStanding(a.balance, a.overdraftLimit);
    case 'credit':
      return cardStanding(a.balance, a.creditLimit);
    case 'loan':
      return loanStanding(a.balance);
    case 'cash':
    case 'investment':
    case 'other':
      return { kind: 'plain' };
  }
}
