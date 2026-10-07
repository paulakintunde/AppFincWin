// D-49: maps the engine's Standing discriminant to a copy key, its params and a tone. Pure
// and string-free: the sentence itself comes from the catalogue (DSG-06). Only the two
// exceeded tiers carry the 'warn' tone; nothing about standing is an error.
import type { Standing } from '@/engine/accounts';

export type StandingKey =
  | 'accounts.standing.inCredit'
  | 'accounts.standing.overdrawnWithin'
  | 'accounts.standing.overdrawnBeyond'
  | 'accounts.standing.overdrawnNoLimit'
  | 'accounts.standing.cardInCredit'
  | 'accounts.standing.owingWithin'
  | 'accounts.standing.owingNoLimit'
  | 'accounts.standing.nothingOwing'
  | 'accounts.standing.overLimit'
  | 'accounts.standing.loanOwing'
  | 'accounts.standing.loanInCredit';

export interface StandingLine {
  key: StandingKey;
  params: Record<string, string>;
  tone: 'plain' | 'warn';
}

export function standingText(s: Standing | null, fmt: (minor: number) => string): StandingLine | null {
  if (s === null) return null;
  switch (s.kind) {
    case 'in-credit':
      return { key: 'accounts.standing.inCredit', params: {}, tone: 'plain' };
    case 'overdrawn-within':
      return {
        key: 'accounts.standing.overdrawnWithin',
        params: { amount: fmt(s.overdrawnBy), limit: fmt(s.limit) },
        tone: 'plain',
      };
    case 'overdrawn-beyond':
      return {
        key: 'accounts.standing.overdrawnBeyond',
        params: { beyond: fmt(s.beyondBy), limit: fmt(s.limit) },
        tone: 'warn',
      };
    case 'overdrawn-no-limit':
      return { key: 'accounts.standing.overdrawnNoLimit', params: { amount: fmt(s.overdrawnBy) }, tone: 'plain' };
    case 'card-in-credit':
      return { key: 'accounts.standing.cardInCredit', params: { amount: fmt(s.creditBy) }, tone: 'plain' };
    case 'owing-within':
      if (s.owed === 0) return { key: 'accounts.standing.nothingOwing', params: {}, tone: 'plain' };
      if (s.limit === null) {
        return { key: 'accounts.standing.owingNoLimit', params: { amount: fmt(s.owed) }, tone: 'plain' };
      }
      return {
        key: 'accounts.standing.owingWithin',
        params: { amount: fmt(s.owed), limit: fmt(s.limit) },
        tone: 'plain',
      };
    case 'over-limit':
      return {
        key: 'accounts.standing.overLimit',
        params: { over: fmt(s.overBy), limit: fmt(s.limit) },
        tone: 'warn',
      };
    case 'loan-owing':
      return { key: 'accounts.standing.loanOwing', params: { amount: fmt(s.owed) }, tone: 'plain' };
    case 'loan-in-credit':
      return { key: 'accounts.standing.loanInCredit', params: { amount: fmt(s.creditBy) }, tone: 'plain' };
    case 'plain':
      return null;
  }
}
