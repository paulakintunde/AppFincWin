import { array, assert as fcAssert, integer, property, record } from 'fast-check';
import { minorUnits as mu } from '../../../../money/types';
import { inputsOf, monthOf, v3Line } from '../../__tests__/helpers/fixtures';
import { personById, toV3Inputs } from '../../__tests__/golden/adapter';
import { buildMonthModel } from '../../month/model';
import type { Envelope, V3Account, V3Inputs } from '../../types';
import { buildFunds } from '../build';

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
const fundsOf = (over: Partial<V3Inputs>, envelopeId: string | null = null) => {
  const inputs = inputsOf(over);
  return buildFunds(inputs, buildMonthModel(inputs), envelopeId);
};

describe('buildFunds', () => {
  it('C15 Sam funds', () => {
    const inputs = toV3Inputs(personById('sam'));
    const f = buildFunds(inputs, buildMonthModel(inputs), null);
    expect(f.spending).toBe(407500);
    expect(f.suggested).toBe(240000);
    expect(f.emergency).toBe(900000);
    expect(f.unspent?.value).toBe(240000);
    expect(f.unspent?.rolled).toBe(false);
    expect(f.unspent?.stale).toBe(false);
    expect(f.unspent?.drifted).toBe(false);
  });

  it('I17 partition: suggested + bills due + Erest = the spending balance', () => {
    fcAssert(
      property(
        record({
          balance: integer({ min: 0, max: 50_000_000 }),
          emergency: integer({ min: -1, max: 10_000_000 }),
          saved: array(integer({ min: 0, max: 5_000_000 }), { maxLength: 3 }),
        }),
        ({ balance, emergency, saved }) => {
          const inputs = inputsOf({
            balance: mu(balance),
            emergency: emergency < 0 ? null : { amount: mu(emergency) },
            envelopes: saved.map((s, i) => env(`e${i}`, s)),
          });
          const month = buildMonthModel(inputs);
          const f = buildFunds(inputs, month, null);
          expect(f.suggested + month.billsDue + month.erest).toBe(f.spending);
        }
      ),
      { numRuns: 60 }
    );
  });

  it('unspent is null when the user has not confirmed a figure', () => {
    const inputs = inputsOf({ balance: mu(100000) });
    expect(buildFunds(inputs, buildMonthModel(inputs), null).unspent).toBeNull();
  });

  it('drift threshold comes from the per-currency thresholds', () => {
    const base = inputsOf({ balance: mu(1_000_000), unspent: { amount: mu(1_000_000 - 5_000), at: '2026-10-03' } });
    const tight = { ...base, thresholds: { ...base.thresholds, unspentDrift: mu(1000) } };
    const loose = { ...base, thresholds: { ...base.thresholds, unspentDrift: mu(500_000) } };
    // 10% of the suggested figure is huge here, so only the per-currency amount can flag drift
    const huge = (i: typeof base) => ({ ...i, balance: mu(1_000_000_000), unspent: { amount: mu(1_000_000_000 - 5_000), at: '2026-10-03' } });
    expect(buildFunds(huge(tight), buildMonthModel(huge(tight)), null).unspent?.drifted).toBe(true);
    expect(buildFunds(huge(loose), buildMonthModel(huge(loose)), null).unspent?.drifted).toBe(false);
  });

  it('ownEnvelope comes from the check envelopeId, never another envelope', () => {
    const envs: Envelope[] = [env('a', 7000), env('b', 3000)];
    const inputs = inputsOf({ balance: mu(100000), envelopes: envs });
    const month = buildMonthModel(inputs);
    expect(buildFunds(inputs, month, 'b').ownEnvelope).toBe(3000);
    expect(buildFunds(inputs, month, 'zzz').ownEnvelope).toBe(0);
    expect(buildFunds(inputs, month, null).ownEnvelope).toBe(0);
    expect(buildFunds(inputs, month, null).envelopesSaved).toBe(10000);
  });

  it('D-55 a mixed account keeps its put-aside out: 200,000 with a 50,000 envelope and 20,000 stated gives 130,000', () => {
    const f = fundsOf({
      accounts: [acct('m', 200_000, { kind: 'mixed', extraSetAside: mu(20_000) })],
      envelopes: [env('car', 50_000, 'm')],
    });
    expect(f.spending).toBe(130_000);
    expect(f.ringFenced).toBe(70_000);
    expect(f.envelopesAssumedInside).toBe(0);
  });

  it('D-55 a mixed account with no stated extra and a fund linked to it also puts the fund aside; it never goes below 0', () => {
    const linked = fundsOf({
      accounts: [acct('m', 500_000, { kind: 'mixed', extraSetAside: null })],
      emergency: { amount: mu(300_000), accountId: 'm' },
    });
    expect(linked.spending).toBe(200_000);
    expect(linked.fundUnlinked).toBe(false);
    const over = fundsOf({
      accounts: [acct('m', 100_000, { kind: 'mixed', extraSetAside: null })],
      envelopes: [env('x', 400_000, 'm')],
    });
    expect(over.spending).toBe(0);
  });

  it('D-54 only everyday and mixed money counts; untouched and unstated accounts do not, and unstated ones are listed', () => {
    const f = fundsOf({
      accounts: [
        acct('e', 300_000, { kind: 'everyday' }),
        acct('u', 1_000_000, { kind: 'untouched' }),
        acct('x', 80_000, null),
      ],
    });
    expect(f.spending).toBe(300_000);
    expect(f.unstatedAccounts).toEqual(['x']);
  });

  it('D-54 dedicated accounts are not spending money, and an envelope-dedicated account pays for its own purchase', () => {
    const inputs = inputsOf({
      accounts: [
        acct('e', 100_000, { kind: 'everyday' }),
        acct('f', 900_000, { kind: 'dedicated', purpose: { kind: 'emergency' } }),
        acct('c', 50_000, { kind: 'dedicated', purpose: { kind: 'envelope', envelopeId: 'car' } }),
      ],
      envelopes: [env('car', 50_000, 'c')],
      emergency: { amount: mu(900_000), accountId: 'f' },
    });
    const f = buildFunds(inputs, buildMonthModel(inputs), 'car');
    expect(f.spending).toBe(100_000);
    expect(f.ownEnvelope).toBe(50_000);
    expect(f.fundUnlinked).toBe(false);
  });

  it('D-54 envelope money inside an everyday account is put aside', () => {
    const f = fundsOf({ accounts: [acct('e', 100_000, { kind: 'everyday' })], envelopes: [env('a', 30_000, 'e')] });
    expect(f.spending).toBe(70_000);
  });

  it('D-54 envelope money linked to no account is subtracted and counted', () => {
    const f = fundsOf({
      accounts: [acct('e', 300_000, { kind: 'everyday' })],
      envelopes: [env('a', 40_000), env('b', 0, null), env('c', 10_000, 'gone')],
    });
    expect(f.spending).toBe(250_000);
    expect(f.envelopesAssumedInside).toBe(2);
    expect(f.ringFenced).toBe(50_000);
  });

  it('D-54 without accounts the balance is the spending balance, less unlinked envelopes', () => {
    const f = fundsOf({ balance: mu(100_000), envelopes: [env('a', 40_000)] });
    expect(f.spending).toBe(60_000);
    expect(f.envelopesAssumedInside).toBe(1);
    expect(f.unstatedAccounts).toEqual([]);
  });

  it('D-62 an unlinked fund is subtracted and flagged', () => {
    const f = fundsOf({
      accounts: [acct('e', 500_000, { kind: 'everyday' })],
      emergency: { amount: mu(300_000) },
    });
    expect(f.spending).toBe(200_000);
    expect(f.fundUnlinked).toBe(true);
    expect(f.ringFenced).toBe(300_000);
    const stray = fundsOf({
      accounts: [acct('e', 500_000, { kind: 'everyday' })],
      emergency: { amount: mu(300_000), accountId: 'nowhere' },
    });
    expect(stray.fundUnlinked).toBe(true);
  });

  it('D-62 a fund linked to a dedicated account is not in spending and is not flagged', () => {
    const f = fundsOf({
      accounts: [acct('e', 500_000, { kind: 'everyday' }), acct('f', 300_000, { kind: 'dedicated', purpose: { kind: 'emergency' } })],
      emergency: { amount: mu(300_000), accountId: 'f' },
    });
    expect(f.spending).toBe(500_000);
    expect(f.fundUnlinked).toBe(false);
  });

  it('D-62 without accounts input nothing is subtracted for the fund', () => {
    const f = fundsOf({ balance: mu(500_000), emergency: { amount: mu(300_000) } });
    expect(f.spending).toBe(500_000);
    expect(f.fundUnlinked).toBe(false);
  });

  it('D-43 a linked fund of 0 or 100,000,000 gives the same suggested figure and drift', () => {
    const at = (fund: number) =>
      fundsOf({
        accounts: [acct('e', 400_000, { kind: 'everyday' }), acct('f', fund, { kind: 'dedicated', purpose: { kind: 'emergency' } })],
        emergency: { amount: mu(fund), accountId: 'f' },
        unspent: { amount: mu(380_000), at: '2026-10-03' },
      });
    const a = at(0);
    const b = at(100_000_000);
    expect(b.suggested).toBe(a.suggested);
    expect(b.unspent?.drifted).toBe(a.unspent?.drifted);
    expect(b.emergency).toBe(100_000_000);
  });

  it('M-06 moving money to an untouched account after the anchor lowers the rolled figure and the spending balance alike', () => {
    const base = fundsOf({ accounts: [acct('e', 500_000, { kind: 'everyday' })] });
    const anchor = base.suggested;
    const moved = fundsOf({
      accounts: [acct('e', 400_000, { kind: 'everyday' }), acct('u', 100_000, { kind: 'untouched' })],
      unspent: { amount: anchor, at: '2026-10-01' },
      months: [monthOf('2026-10', [v3Line({ id: 'mv', date: '2026-10-02', amount: 100_000, role: 'saved_invested' })])],
    });
    expect(moved.unspent?.value).toBe(anchor - 100_000);
    expect(moved.suggested).toBe(anchor - 100_000);
    expect(moved.unspent?.drifted).toBe(false);
  });
});
