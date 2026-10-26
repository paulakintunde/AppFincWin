import { array, assert as fcAssert, integer, property, record } from 'fast-check';
import { minorUnits as mu } from '../../../../money/types';
import { inputsOf } from '../../__tests__/helpers/fixtures';
import { personById, toV3Inputs } from '../../__tests__/golden/adapter';
import { buildMonthModel } from '../../month/model';
import type { Envelope } from '../../types';
import { buildFunds } from '../build';

describe('buildFunds', () => {
  it('C15 Sam funds', () => {
    const inputs = toV3Inputs(personById('sam'));
    const f = buildFunds(inputs, buildMonthModel(inputs), null);
    expect(f.balance).toBe(1307500);
    expect(f.suggested).toBe(240000);
    expect(f.emergency).toBe(900000);
    expect(f.unspent?.value).toBe(240000);
    expect(f.unspent?.rolled).toBe(false);
    expect(f.unspent?.stale).toBe(false);
    expect(f.unspent?.drifted).toBe(false);
  });

  it('I17 partition: suggested + envelopes + emergency + bills due + Erest = balance', () => {
    const env = (id: string, saved: number): Envelope => ({
      id,
      kind: 'pot',
      target: null,
      monthlyAmount: null,
      readyBy: null,
      saved: mu(saved),
      purposeId: null,
    });
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
          expect(f.suggested + f.envelopesSaved + (f.emergency ?? 0) + month.billsDue + month.erest).toBe(f.balance);
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
    const envs: Envelope[] = [
      { id: 'a', kind: 'pot', target: null, monthlyAmount: null, readyBy: null, saved: mu(7000), purposeId: null },
      { id: 'b', kind: 'pot', target: null, monthlyAmount: null, readyBy: null, saved: mu(3000), purposeId: null },
    ];
    const inputs = inputsOf({ balance: mu(100000), envelopes: envs });
    const month = buildMonthModel(inputs);
    expect(buildFunds(inputs, month, 'b').ownEnvelope).toBe(3000);
    expect(buildFunds(inputs, month, 'zzz').ownEnvelope).toBe(0);
    expect(buildFunds(inputs, month, null).ownEnvelope).toBe(0);
    expect(buildFunds(inputs, month, null).envelopesSaved).toBe(10000);
  });
});
