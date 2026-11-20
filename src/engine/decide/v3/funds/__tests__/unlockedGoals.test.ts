import { minorUnits as mu } from '../../../../money/types';
import type { Envelope, V3Account } from '../../types';
import { isKeptSavingsAccount, unlockedOutside } from '../unlockedGoals';

const acct = (id: string, balance: number, use: V3Account['use'], kind: V3Account['kind'] = 'savings'): V3Account => ({ id, balance: mu(balance), use, kind });
const goal = (id: string, saved: number, accountId: string, locked?: boolean): Envelope => ({
  id,
  kind: 'pot',
  target: null,
  monthlyAmount: null,
  readyBy: null,
  saved: mu(saved),
  purposeId: null,
  accountId,
  ...(locked === undefined ? {} : { locked }),
});

describe('isKeptSavingsAccount', () => {
  it.each([
    ['a savings account, untouched, holding money', 'savings', { kind: 'untouched' as const }, 1, true],
    ['an empty one', 'savings', { kind: 'untouched' as const }, 0, false],
    ['an overdrawn one', 'savings', { kind: 'untouched' as const }, -1, false],
    ['a checking account', 'checking', { kind: 'untouched' as const }, 100, false],
    ['a savings account with no stated use', 'savings', null, 100, false],
    ['a savings account that is everyday', 'savings', { kind: 'everyday' as const }, 100, false],
  ] as const)('%s', (_n, kind, use, balance, expected) => {
    expect(isKeptSavingsAccount(acct('a', balance, use, kind))).toBe(expected);
  });
});

describe('unlockedOutside', () => {
  it('counts an unlocked goal in an untouched savings account, up to what the account holds after its locked goals', () => {
    const r = unlockedOutside({
      accounts: [acct('s', 100_000, { kind: 'untouched' })],
      envelopes: [goal('lock', 30_000, 's', true), goal('open', 90_000, 's', false)],
    });
    expect(r.outside).toBe(70_000);
    expect(r.outsideKept).toBe(70_000);
  });

  it('a dedicated account counts outside but not as kept savings', () => {
    const r = unlockedOutside({
      accounts: [acct('d', 100_000, { kind: 'dedicated', purpose: { kind: 'envelope', envelopeId: 'open' } }, 'other')],
      envelopes: [goal('open', 40_000, 'd', false)],
    });
    expect(r.outside).toBe(40_000);
    expect(r.outsideKept).toBe(0);
  });

  it('another account’s goals, zero and negative goals, and an absent locked flag (locked) are not counted as unlocked', () => {
    const r = unlockedOutside({
      accounts: [acct('s', 100_000, { kind: 'untouched' }), acct('t', 100_000, { kind: 'untouched' })],
      envelopes: [goal('a', 10_000, 's', false), goal('b', 25_000, 't', false), goal('neg', -4_000, 's', false), goal('zero', 0, 's', false), goal('flagless', 50_000, 's')],
    });
    // s: unlocked 10000, locked 50000 (absent flag), room 50000: counts 10000. t: unlocked 25000 within 100000.
    expect(r.outside).toBe(35_000);
  });

  it('a negative goal does not eat into the money the account has for the others', () => {
    const r = unlockedOutside({
      accounts: [acct('s', 100_000, { kind: 'untouched' })],
      envelopes: [goal('open', 20_000, 's', false), goal('neg', -5_000, 's', false), goal('lockneg', -5_000, 's', true)],
    });
    expect(r.outside).toBe(20_000);
  });

  it('an account with no room counts nothing, and accounts with other uses count nothing', () => {
    const r = unlockedOutside({
      accounts: [acct('s', 30_000, { kind: 'untouched' }), acct('x', 100_000, null), acct('e', 100_000, { kind: 'everyday' })],
      envelopes: [goal('lock', 30_000, 's', true), goal('open', 5_000, 's', false), goal('o2', 5_000, 'x', false), goal('o3', 5_000, 'e', false)],
    });
    expect(r.outside).toBe(0);
    expect(r.outsideKept).toBe(0);
  });
});
