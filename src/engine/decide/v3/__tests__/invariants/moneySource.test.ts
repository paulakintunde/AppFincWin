/**
 * I-D56 (05.4 D-56): the split names the real source. It sums to the price paid on day one; extra savings never exceed the money
 * above the net's size; a plain fit never takes from the protected net; and on Dips into your safety net the 'emergency' segment
 * is the net_used figure. Golden persons, with and without a safety-net record (both sides of the lock).
 */
import * as fc from 'fast-check';
import { evaluate } from '../../evaluate';
import type { CheckV2, V3Inputs } from '../../types';
import { fcRuns } from '../helpers/fcRuns';
import { checkArb, inputsArb, netInputsArb, withSafetyNet } from './arbitraries';

const anyInputsArb: fc.Arbitrary<V3Inputs> = fc.oneof(inputsArb, netInputsArb.map(({ base, n }) => withSafetyNet(base, n)));

function holds(inputs: V3Inputs, check: CheckV2): void {
  const ev = evaluate(inputs, check);
  const r = ev.result;
  const net = ev.net!;
  const amount = (s: string): number => r.split.filter((x) => x.source === s).reduce((t, x) => t + x.amount, 0);
  if (r.split.length > 0) expect(r.split.reduce((t, x) => t + x.amount, 0)).toBe(ev.purchase!.dayOne);
  expect(amount('extra_savings')).toBeLessThanOrEqual(net.aboveSize);
  if (r.code === 'fits_month' || r.code === 'fits_unspent') expect(amount('emergency')).toBe(0);
  if (r.code === 'fits_uses_net') {
    const used = r.facts.find((f) => f.code === 'net_used')?.values['used'];
    expect(amount('emergency')).toBe(used);
  }
}

describe('money source invariants', () => {
  it('I-D56 the split sums to day one, names extra savings within the money above the size, and agrees with net_used', () => {
    fc.assert(
      fc.property(anyInputsArb, checkArb, (inputs, check) => holds(inputs, check)),
      { numRuns: fcRuns(300), seed: 0x5456 }
    );
  });
});
