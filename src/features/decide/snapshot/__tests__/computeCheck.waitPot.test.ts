import { minorUnits } from '@/engine/money';
import { computeCheck } from '../computeCheck';
import { emptyCheckInputs } from '../checkInputs';
import type { CheckInputs, SnapshotResult } from '../types';
import { TODAY, loggedSource } from './helpers/snapshotFixtures';

const OWN = 'chk-own';
const OTHER = 'chk-other';

const wait = (id: string) => ({
  id,
  kind: 'wait' as const,
  target: minorUnits(600_000),
  monthlyAmount: minorUnits(50_000),
  readyBy: null,
  saved: minorUnits(0),
});
const plain = {
  id: 'plain',
  kind: 'pot' as const,
  target: minorUnits(240_000),
  monthlyAmount: null,
  readyBy: '2027-03-31',
  saved: minorUnits(0),
};

function sourceWith(pots: ReturnType<typeof wait>[] | (ReturnType<typeof wait> | typeof plain)[], potChecks: Record<string, string>): SnapshotResult {
  const base = loggedSource({ pots });
  if (base.kind !== 'logged') throw new Error('logged');
  return { ...base, pots: base.snapshot.pots, potChecks };
}

const inputs = (): CheckInputs => ({ ...emptyCheckInputs('buy', TODAY), name: 'Sofa', advertised: 150_000, method: 'cash' });

describe('D-101 a Waiting check and its own pot', () => {
  it('D-101 a reopened Waiting check does not count its own pot', () => {
    const src = sourceWith([wait('own-pot')], { 'own-pot': OWN });
    const never = computeCheck(loggedSource(), inputs());
    const reopened = computeCheck(src, inputs(), [], OWN);
    // the figure and the verdict equal those computed as if the Wait had never been created
    expect(reopened.context?.leftBefore).toBe(never.context?.leftBefore);
    expect(reopened.context?.setAside).toBe(never.context?.setAside);
    expect(reopened.verdict).toEqual(never.verdict);
    // without the id the pot is counted and the month leaves less
    const counted = computeCheck(src, inputs());
    expect(counted.context!.leftBefore).toBeLessThan(reopened.context!.leftBefore);
  });

  it("D-101 another check's Wait pot still lowers net free cash flow", () => {
    const src = sourceWith([wait('own-pot'), wait('other-pot'), plain], { 'own-pot': OWN, 'other-pot': OTHER });
    const onlyOthers = sourceWith([wait('other-pot'), plain], { 'other-pot': OTHER });
    const never = computeCheck(loggedSource(), inputs());
    const reopened = computeCheck(src, inputs(), [], OWN);
    const expected = computeCheck(onlyOthers, inputs());
    expect(reopened.context?.leftBefore).toBe(expected.context?.leftBefore);
    expect(reopened.context!.leftBefore).toBeLessThan(never.context!.leftBefore);
    // the unfiltered source counts all three pots
    expect(computeCheck(src, inputs()).context!.leftBefore).toBeLessThan(reopened.context!.leftBefore);
  });
});
