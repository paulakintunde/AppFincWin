import { minorUnits } from '@/engine/money';
import type { Standing } from '@/engine/accounts';
import { accountStanding } from '@/engine/accounts';
import { standingText } from '../standingText';

const m = minorUnits;
const fmt = (minor: number): string => `$${(minor / 100).toFixed(2)}`;

describe('standingText', () => {
  it('returns null for null and plain', () => {
    expect(standingText(null, fmt)).toBeNull();
    expect(standingText({ kind: 'plain' }, fmt)).toBeNull();
  });

  it('in-credit is plain', () => {
    expect(standingText({ kind: 'in-credit', balance: m(5000) }, fmt)).toEqual({
      key: 'accounts.standing.inCredit',
      params: {},
      tone: 'plain',
    });
  });

  it('overdrawn-within carries amount and limit, plain tone', () => {
    const s: Standing = { kind: 'overdrawn-within', overdrawnBy: m(24000), limit: m(50000) };
    expect(standingText(s, fmt)).toEqual({
      key: 'accounts.standing.overdrawnWithin',
      params: { amount: '$240.00', limit: '$500.00' },
      tone: 'plain',
    });
  });

  it('overdrawn-beyond is warn with the beyond figure', () => {
    const s: Standing = { kind: 'overdrawn-beyond', overdrawnBy: m(64000), limit: m(50000), beyondBy: m(14000) };
    expect(standingText(s, fmt)).toEqual({
      key: 'accounts.standing.overdrawnBeyond',
      params: { beyond: '$140.00', limit: '$500.00' },
      tone: 'warn',
    });
  });

  it('overdrawn-no-limit, card-in-credit and loan lines are plain', () => {
    expect(standingText({ kind: 'overdrawn-no-limit', overdrawnBy: m(100) }, fmt)).toEqual({
      key: 'accounts.standing.overdrawnNoLimit',
      params: { amount: '$1.00' },
      tone: 'plain',
    });
    expect(standingText({ kind: 'card-in-credit', creditBy: m(250) }, fmt)).toEqual({
      key: 'accounts.standing.cardInCredit',
      params: { amount: '$2.50' },
      tone: 'plain',
    });
    expect(standingText({ kind: 'loan-owing', owed: m(900) }, fmt)).toEqual({
      key: 'accounts.standing.loanOwing',
      params: { amount: '$9.00' },
      tone: 'plain',
    });
    expect(standingText({ kind: 'loan-in-credit', creditBy: m(900) }, fmt)).toEqual({
      key: 'accounts.standing.loanInCredit',
      params: { amount: '$9.00' },
      tone: 'plain',
    });
  });

  it('owing-within: zero owed reads Nothing owing, with or without a limit', () => {
    expect(standingText({ kind: 'owing-within', owed: m(0), limit: m(100000) }, fmt)).toEqual({
      key: 'accounts.standing.nothingOwing',
      params: {},
      tone: 'plain',
    });
    expect(standingText({ kind: 'owing-within', owed: m(0), limit: null }, fmt)?.key).toBe('accounts.standing.nothingOwing');
  });

  it('owing-within with a limit and without', () => {
    expect(standingText({ kind: 'owing-within', owed: m(30000), limit: m(100000) }, fmt)).toEqual({
      key: 'accounts.standing.owingWithin',
      params: { amount: '$300.00', limit: '$1000.00' },
      tone: 'plain',
    });
    expect(standingText({ kind: 'owing-within', owed: m(30000), limit: null }, fmt)).toEqual({
      key: 'accounts.standing.owingNoLimit',
      params: { amount: '$300.00' },
      tone: 'plain',
    });
  });

  it('over-limit is warn', () => {
    expect(standingText({ kind: 'over-limit', owed: m(120000), limit: m(100000), overBy: m(20000) }, fmt)).toEqual({
      key: 'accounts.standing.overLimit',
      params: { over: '$200.00', limit: '$1000.00' },
      tone: 'warn',
    });
  });

  it('exactly at the limit is within; one minor unit over is warn (via the engine)', () => {
    const at = accountStanding({ kind: 'credit', balance: m(-100000), overdraftLimit: null, creditLimit: m(100000) });
    expect(standingText(at, fmt)?.tone).toBe('plain');
    const over = accountStanding({ kind: 'credit', balance: m(-100001), overdraftLimit: null, creditLimit: m(100000) });
    expect(standingText(over, fmt)).toEqual({
      key: 'accounts.standing.overLimit',
      params: { over: '$0.01', limit: '$1000.00' },
      tone: 'warn',
    });
    const atOd = accountStanding({ kind: 'checking', balance: m(-50000), overdraftLimit: m(50000), creditLimit: null });
    expect(standingText(atOd, fmt)?.tone).toBe('plain');
    const overOd = accountStanding({ kind: 'checking', balance: m(-50001), overdraftLimit: m(50000), creditLimit: null });
    expect(standingText(overOd, fmt)?.tone).toBe('warn');
  });
});
