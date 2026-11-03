/**
 * I-D61 (05.4 D-61): while the safety net is locked (protection on, a size above 0), no answer dips into it, and unlocking it never
 * gives a stricter answer. Golden persons with a safety-net record (netInputsArb); a pair where either side asks is skipped.
 */
import * as fc from 'fast-check';
import { evaluate } from '../../evaluate';
import { fcRuns } from '../helpers/fcRuns';
import { checkArb, codeRank, netInputsArb, withSafetyNet } from './arbitraries';

describe('safety-net lock invariants', () => {
  it('I-D61 a locked net is never dipped into, and unlocking never gives a stricter answer', () => {
    fc.assert(
      fc.property(netInputsArb, checkArb, ({ base, n }, check) => {
        fc.pre(n.protect && (n.size === null || n.size > 0));
        const locked = evaluate(withSafetyNet(base, { ...n, locked: true }), check).result;
        const unlocked = evaluate(withSafetyNet(base, { ...n, locked: false }), check).result;
        expect(locked.code).not.toBe('fits_uses_net');
        expect(locked.facts.some((f) => f.code === 'net_used')).toBe(false);
        fc.pre(locked.code !== 'needs_input' && unlocked.code !== 'needs_input');
        expect(codeRank(unlocked.code)).toBeGreaterThanOrEqual(codeRank(locked.code));
      }),
      { numRuns: fcRuns(300), seed: 0x5461 }
    );
  });
});
