import { array, assert as fcAssert, integer, property, record } from 'fast-check';
import { minorUnits as mu } from '../../../../money/types';
import { inputsOf } from '../../__tests__/helpers/fixtures';
import { personById, toV3Inputs } from '../../__tests__/golden/adapter';
import { buildMonthModel } from '../../month/model';
import type { Envelope, V3Account, V3Inputs } from '../../types';
import { buildFunds, unspentSum } from '../build';

const env = (id: string, saved: number, accountId?: string | null): Envelope => ({
  id,
  kind: 'pot',
  target: null,
  monthlyAmount: null,
  readyBy: null,
  saved: mu(saved),
  purposeId: null,
  ...(accountId === undefined ? {} : { accountId }),
});
const acct = (id: string, balance: number, use: V3Account['use']): V3Account => ({ id, balance: mu(balance), use });
const sumOf = (over: Partial<V3Inputs>) => {
  const inputs = inputsOf(over);
  const month = buildMonthModel(inputs);
  return { sum: unspentSum(inputs, month), funds: buildFunds(inputs, month, null) };
};
const netted = (s: ReturnType<typeof unspentSum>): number => s.gross - s.mixedSetAside - s.envelopes - s.emergency - s.bills - s.everyday;

describe('unspentSum (05.2-28)', () => {
  it('Sam: the lines net to the suggested figure the engine uses', () => {
    const inputs = toV3Inputs(personById('sam'));
    const month = buildMonthModel(inputs);
    const sum = unspentSum(inputs, month);
    const funds = buildFunds(inputs, month, null);
    expect(sum.suggested).toBe(funds.suggested);
    expect(netted(sum)).toBe(funds.suggested);
    expect(sum.total).toBe(funds.suggested);
  });

  it('uses the live fund amount on raw inputs (05.2-37)', () => {
    const { sum } = sumOf({ emergency: { amount: mu(900_000), accountId: 'm' }, accounts: [acct('m', 600_000, { kind: 'mixed', extraSetAside: null })] });
    expect(sum.emergency).toBe(600_000); // stated 900000 capped at the live balance
  });

  it('a mixed account names its envelopes, its fund and its extra set-aside separately', () => {
    const { sum, funds } = sumOf({
      accounts: [acct('m', 600_000, { kind: 'mixed', extraSetAside: mu(20_000) }), acct('e', 100_000, { kind: 'everyday' })],
      envelopes: [env('car', 50_000, 'm'), env('trip', 10_000, 'e')],
      emergency: { amount: mu(100_000), accountId: 'm' },
    });
    expect(sum.gross).toBe(700_000);
    expect(sum.envelopes).toBe(60_000);
    expect(sum.emergency).toBe(100_000);
    expect(sum.mixedSetAside).toBe(20_000);
    expect(sum.hasMixed).toBe(true);
    expect(netted(sum)).toBe(funds.suggested);
  });

  it('unlinked envelopes and an unlinked fund come off, and are counted', () => {
    const { sum, funds } = sumOf({
      accounts: [acct('e', 500_000, { kind: 'everyday' }), acct('x', 90_000, null)],
      envelopes: [env('a', 40_000), env('b', 10_000, 'gone')],
      emergency: { amount: mu(300_000) },
    });
    expect(sum.gross).toBe(500_000);
    expect(sum.envelopes).toBe(50_000);
    expect(sum.emergency).toBe(300_000);
    expect(sum.unplacedEnvelopes).toBe(2);
    expect(sum.unstatedAccounts).toBe(1);
    expect(sum.hasMixed).toBe(false);
    expect(netted(sum)).toBe(funds.suggested);
  });

  it('without accounts the balance is the gross figure', () => {
    const { sum, funds } = sumOf({ balance: mu(100_000), envelopes: [env('a', 40_000)] });
    expect(sum.gross).toBe(100_000);
    expect(sum.envelopes).toBe(40_000);
    expect(sum.hasMixed).toBe(false);
    expect(netted(sum)).toBe(funds.suggested);
  });

  it('deductions that overshoot give way envelopes first and never push the spending balance below zero', () => {
    const { sum, funds } = sumOf({
      accounts: [acct('e', 100_000, { kind: 'everyday' })],
      envelopes: [env('a', 400_000, 'e')],
    });
    expect(sum.envelopes).toBe(100_000);
    expect(netted(sum)).toBe(funds.suggested);
    const overdrawn = sumOf({ accounts: [acct('e', -5_000, { kind: 'everyday' })] });
    expect(overdrawn.sum.gross).toBe(0);
    expect(netted(overdrawn.sum)).toBe(overdrawn.funds.suggested);
  });

  it('held-back bridges take the total below the suggested figure; invalid and duplicate ones do not count', () => {
    const { sum } = sumOf({
      balance: mu(1_000_000),
      heldBridges: [
        { id: 'b1', amount: mu(30_000) },
        { id: 'b1', amount: mu(99_000) },
        { id: 'b2', amount: mu(-5) },
      ],
    });
    expect(sum.heldBack).toBe(30_000);
    expect(sum.total).toBe(sum.suggested - 30_000);
  });

  it('property: the lines always net to the suggested figure', () => {
    fcAssert(
      property(
        record({
          everyday: integer({ min: -50_000, max: 50_000_000 }),
          mixed: integer({ min: 0, max: 50_000_000 }),
          extra: integer({ min: 0, max: 5_000_000 }),
          fund: integer({ min: -1, max: 10_000_000 }),
          fundInMixed: integer({ min: 0, max: 1 }),
          saved: array(integer({ min: 0, max: 5_000_000 }), { maxLength: 3 }),
        }),
        ({ everyday, mixed, extra, fund, fundInMixed, saved }) => {
          const inputs = inputsOf({
            accounts: [acct('e', everyday, { kind: 'everyday' }), acct('m', mixed, { kind: 'mixed', extraSetAside: mu(extra) })],
            emergency: fund < 0 ? null : { amount: mu(fund), accountId: fundInMixed === 1 ? 'm' : null },
            envelopes: saved.map((s, i) => env(`v${i}`, s, i === 0 ? 'm' : i === 1 ? 'e' : null)),
          });
          const month = buildMonthModel(inputs);
          const sum = unspentSum(inputs, month);
          expect(netted(sum)).toBe(buildFunds(inputs, month, null).suggested);
          expect(sum.mixedSetAside).toBeGreaterThanOrEqual(0);
          expect(sum.envelopes).toBeGreaterThanOrEqual(0);
          expect(sum.emergency).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
