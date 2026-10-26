import { array, assert, nat, property, string } from 'fast-check';
import { minorUnits } from '../../../../money/types';
import type { Envelope } from '../../types';
import { envelopesOf, ownEnvelope } from '../envelopes';

const env = (id: string, saved: number, over: Partial<Envelope> = {}): Envelope => ({
  id, kind: 'pot', target: null, monthlyAmount: null, readyBy: null, saved: minorUnits(saved), purposeId: null, ...over,
});

describe('envelopes', () => {
  it('sums saved and monthly across pot and wait kinds', () => {
    const r = envelopesOf([env('a', 100, { monthlyAmount: minorUnits(50) }), env('b', 200, { kind: 'wait', target: minorUnits(1000), monthlyAmount: minorUnits(70) })], '2026-10-26');
    expect(r).toEqual({ saved: 300, monthly: 120 });
    expect(envelopesOf([], '2026-10-26')).toEqual({ saved: 0, monthly: 0 });
  });
  it('v3 4.3 own envelope only', () => {
    expect(ownEnvelope([env('a', 100), env('b', 200)], 'b')).toBe(200);
    expect(ownEnvelope([env('a', 100)], null)).toBe(0);
    expect(ownEnvelope([env('a', 100)], 'zzz')).toBe(0);
    assert(property(array(string(), { maxLength: 6 }), nat(1000), string(), (ids, s, pick) => {
      const envs = ids.map((id, i) => env(id, s + i));
      const r = ownEnvelope(envs, pick);
      return r === 0 || envs.some((e) => e.id === pick && e.saved === r);
    }));
  });
});
