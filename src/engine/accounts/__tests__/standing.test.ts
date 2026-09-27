import fc from 'fast-check';
import { accountStanding, type AccountKind } from '../standing';
import { minorUnits } from '../../money/types';

describe('accountStanding: checking/savings', () => {
  it('balance 0 -> in-credit 0', () => {
    expect(
      accountStanding({ kind: 'checking', balance: minorUnits(0), overdraftLimit: null, creditLimit: null })
    ).toEqual({ kind: 'in-credit', balance: minorUnits(0) });
  });

  it('balance -24000 limit 50000 -> overdrawn-within 24000/50000', () => {
    expect(
      accountStanding({
        kind: 'checking',
        balance: minorUnits(-24000),
        overdraftLimit: minorUnits(50000),
        creditLimit: null,
      })
    ).toEqual({ kind: 'overdrawn-within', overdrawnBy: minorUnits(24000), limit: minorUnits(50000) });
  });

  it('balance -50000 limit 50000 -> overdrawn-within (exactly at limit)', () => {
    expect(
      accountStanding({
        kind: 'checking',
        balance: minorUnits(-50000),
        overdraftLimit: minorUnits(50000),
        creditLimit: null,
      })
    ).toEqual({ kind: 'overdrawn-within', overdrawnBy: minorUnits(50000), limit: minorUnits(50000) });
  });

  it('balance -50001 limit 50000 -> overdrawn-beyond beyondBy 1', () => {
    expect(
      accountStanding({
        kind: 'checking',
        balance: minorUnits(-50001),
        overdraftLimit: minorUnits(50000),
        creditLimit: null,
      })
    ).toEqual({
      kind: 'overdrawn-beyond',
      overdrawnBy: minorUnits(50001),
      limit: minorUnits(50000),
      beyondBy: minorUnits(1),
    });
  });

  it('balance -24000 limit null -> overdrawn-no-limit', () => {
    expect(
      accountStanding({ kind: 'checking', balance: minorUnits(-24000), overdraftLimit: null, creditLimit: null })
    ).toEqual({ kind: 'overdrawn-no-limit', overdrawnBy: minorUnits(24000) });
  });

  it('balance -24000 limit 0 -> overdrawn-no-limit (0 treated as no limit)', () => {
    expect(
      accountStanding({
        kind: 'checking',
        balance: minorUnits(-24000),
        overdraftLimit: minorUnits(0),
        creditLimit: null,
      })
    ).toEqual({ kind: 'overdrawn-no-limit', overdrawnBy: minorUnits(24000) });
  });

  it('savings behaves the same as checking', () => {
    expect(
      accountStanding({
        kind: 'savings',
        balance: minorUnits(-1000),
        overdraftLimit: minorUnits(2000),
        creditLimit: null,
      })
    ).toEqual({ kind: 'overdrawn-within', overdrawnBy: minorUnits(1000), limit: minorUnits(2000) });
  });
});

describe('accountStanding: credit', () => {
  it('balance -32000 limit 100000 -> owing-within 32000', () => {
    expect(
      accountStanding({
        kind: 'credit',
        balance: minorUnits(-32000),
        overdraftLimit: null,
        creditLimit: minorUnits(100000),
      })
    ).toEqual({ kind: 'owing-within', owed: minorUnits(32000), limit: minorUnits(100000) });
  });

  it('balance -112000 limit 100000 -> over-limit overBy 12000', () => {
    expect(
      accountStanding({
        kind: 'credit',
        balance: minorUnits(-112000),
        overdraftLimit: null,
        creditLimit: minorUnits(100000),
      })
    ).toEqual({
      kind: 'over-limit',
      owed: minorUnits(112000),
      limit: minorUnits(100000),
      overBy: minorUnits(12000),
    });
  });

  it('balance -100000 limit 100000 -> owing-within (exactly at limit)', () => {
    expect(
      accountStanding({
        kind: 'credit',
        balance: minorUnits(-100000),
        overdraftLimit: null,
        creditLimit: minorUnits(100000),
      })
    ).toEqual({ kind: 'owing-within', owed: minorUnits(100000), limit: minorUnits(100000) });
  });

  it('balance +1500 -> card-in-credit 1500', () => {
    expect(
      accountStanding({ kind: 'credit', balance: minorUnits(1500), overdraftLimit: null, creditLimit: minorUnits(100000) })
    ).toEqual({ kind: 'card-in-credit', creditBy: minorUnits(1500) });
  });

  it('balance 0 -> owing-within owed 0', () => {
    expect(
      accountStanding({ kind: 'credit', balance: minorUnits(0), overdraftLimit: null, creditLimit: minorUnits(100000) })
    ).toEqual({ kind: 'owing-within', owed: minorUnits(0), limit: minorUnits(100000) });
  });

  it('balance -32000 limit null -> owing-within limit null', () => {
    expect(
      accountStanding({ kind: 'credit', balance: minorUnits(-32000), overdraftLimit: null, creditLimit: null })
    ).toEqual({ kind: 'owing-within', owed: minorUnits(32000), limit: null });
  });

  it('a credit limit of 0 is treated as null', () => {
    expect(
      accountStanding({
        kind: 'credit',
        balance: minorUnits(-32000),
        overdraftLimit: null,
        creditLimit: minorUnits(0),
      })
    ).toEqual({ kind: 'owing-within', owed: minorUnits(32000), limit: null });
  });
});

describe('accountStanding: loan', () => {
  it('balance -450000 -> loan-owing 450000', () => {
    expect(
      accountStanding({ kind: 'loan', balance: minorUnits(-450000), overdraftLimit: null, creditLimit: null })
    ).toEqual({ kind: 'loan-owing', owed: minorUnits(450000) });
  });

  it('balance +100 -> loan-in-credit 100', () => {
    expect(
      accountStanding({ kind: 'loan', balance: minorUnits(100), overdraftLimit: null, creditLimit: null })
    ).toEqual({ kind: 'loan-in-credit', creditBy: minorUnits(100) });
  });

  it('balance 0 -> loan-owing 0', () => {
    expect(
      accountStanding({ kind: 'loan', balance: minorUnits(0), overdraftLimit: null, creditLimit: null })
    ).toEqual({ kind: 'loan-owing', owed: minorUnits(0) });
  });
});

describe('accountStanding: plain kinds', () => {
  it.each<AccountKind>(['cash', 'investment', 'other'])('%s -> plain', (kind) => {
    expect(accountStanding({ kind, balance: minorUnits(12345), overdraftLimit: null, creditLimit: null })).toEqual({
      kind: 'plain',
    });
  });
});

describe('accountStanding: property', () => {
  const kindArb = fc.constantFrom<AccountKind>('cash', 'checking', 'savings', 'credit', 'investment', 'loan', 'other');
  const limitArb = fc.option(fc.integer({ min: 0, max: 10_000_000_000_000 }), { nil: null });

  it('for any balance and limit: exactly one kind; never throws; the boundary identities hold', () => {
    fc.assert(
      fc.property(
        kindArb,
        fc.integer({ min: -10_000_000_000_000, max: 10_000_000_000_000 }),
        limitArb,
        limitArb,
        (kind, balance, overdraftLimit, creditLimit) => {
          const result = accountStanding({
            kind,
            balance: minorUnits(balance),
            overdraftLimit: overdraftLimit === null ? null : minorUnits(overdraftLimit),
            creditLimit: creditLimit === null ? null : minorUnits(creditLimit),
          });

          // Exactly one kind: `result.kind` is always a single string discriminant.
          expect(typeof result.kind).toBe('string');

          if (result.kind === 'overdrawn-beyond') {
            expect(result.beyondBy + result.limit).toBe(result.overdrawnBy);
          }
          if (result.kind === 'over-limit') {
            expect(result.overBy + result.limit).toBe(result.owed);
          }
        }
      )
    );
  });
});
