/**
 * 05.4 D-61 unit tests: the safety net up to its set size is locked by default and left out of the answer. A purchase that only
 * the net could pay is Not yet, dated as if that money were not there, and says net_locked; unlocked keeps the D-35 / D-49 rules.
 */
import { minorUnits } from '../../../money/types';
import { evaluate } from '../evaluate';
import type { Result, V3Inputs } from '../types';
import { toEngineInputs } from './rightAnswers/fixture';
import { loadCases } from './rightAnswers/loader';

const mu = minorUnits;
const CASES = loadCases();
const fixtureOf = (id: string) => {
  const c = CASES.find((x) => x.id === id);
  if (c === undefined) throw new RangeError(id);
  return toEngineInputs(c.fixture);
};
const codes = (r: Result): string[] => r.facts.map((f) => f.code);
const NET_FACTS = ['net_used', 'net_left', 'net_refill', 'wait_keeps_net', 'need_net_line'];
const withNet = (i: V3Inputs, locked: boolean | undefined): V3Inputs => {
  const sn = i.safetyNet as NonNullable<V3Inputs['safetyNet']>;
  return { ...i, safetyNet: locked === undefined ? { protect: sn.protect, size: sn.size, saved: sn.saved } : { ...sn, locked } };
};

describe('the locked safety net (D-61)', () => {
  it('SN-15 with no locked field is locked: not_yet with net_locked, no Dips facts, dated as if the net were not there', () => {
    const { inputs, check } = fixtureOf('SN-15');
    const ev = evaluate(withNet(inputs, undefined), check);
    expect(ev.net).toMatchObject({ locked: true, usable: 0, floor: 100_000 });
    expect(ev.result.code).toBe('not_yet');
    expect(ev.result.facts).toContainEqual({ code: 'net_locked', values: { locked: 100_000 } });
    for (const f of NET_FACTS) expect(codes(ev.result)).not.toContain(f);
    // unspent 30,000 and nothing above the size: 20,000 more at 30,000 a month is December; the 1 Dec pay is that month (I13)
    expect(ev.result.readyBy).toEqual({ kind: 'date', date: '2026-12-01' });
    // locked: true says the same
    expect(evaluate(withNet(inputs, true), check).result).toEqual(ev.result);
  });

  it('the same inputs unlocked (locked: false) dip into the safety net, as before', () => {
    const { inputs, check } = fixtureOf('SN-15');
    const ev = evaluate(withNet(inputs, false), check);
    expect(ev.net).toMatchObject({ locked: false, usable: 100_000 });
    expect(ev.result.code).toBe('fits_uses_net');
    expect(codes(ev.result)).toContain('net_used');
    expect(codes(ev.result)).not.toContain('net_locked');
  });

  it('no safety-net record at all is locked while protection is on with a size above 0', () => {
    const { inputs, check } = fixtureOf('SN-15');
    const noRecord: V3Inputs = { ...inputs, safetyNet: null, emergency: { amount: mu(100_000), accountId: 'n1' } };
    const ev = evaluate(noRecord, check);
    expect(ev.net).toMatchObject({ protect: true, locked: true, usable: 0 });
    expect(ev.result.code).not.toBe('fits_uses_net');
  });

  it('protection off, or a size of 0, is never locked (D-06 unchanged): the money counts and says so', () => {
    const { inputs, check } = fixtureOf('SN-15');
    const off = evaluate({ ...inputs, safetyNet: { protect: false, size: mu(100_000), saved: mu(100_000), locked: true } }, check);
    expect(off.net).toMatchObject({ off: true, locked: false, usable: 100_000 });
    expect(off.result.code).toBe('fits_uses_net');
    expect(off.result.variant).toBe('protection_off');
    expect(codes(off.result)).not.toContain('net_locked');
    const zero = evaluate({ ...inputs, safetyNet: { protect: true, size: mu(0), saved: mu(100_000) } }, check);
    expect(zero.net).toMatchObject({ zeroIsOff: true, locked: false });
    expect(codes(zero.result)).not.toContain('net_locked');
  });

  it('money above the size is unchanged by the lock: SN-13 stays fits_unspent with net_above_size and emergency_untouched', () => {
    const { inputs, check } = fixtureOf('SN-13');
    const ev = evaluate(withNet(inputs, undefined), check);
    expect(ev.net).toMatchObject({ locked: true, aboveSize: 50_000 });
    expect(ev.result.code).toBe('fits_unspent');
    expect(codes(ev.result)).toEqual(expect.arrayContaining(['net_above_size', 'emergency_untouched']));
    expect(codes(ev.result)).not.toContain('net_used');
    expect(codes(ev.result)).not.toContain('net_locked');
  });

  it('net_locked needs a locked amount above 0: nothing saved says no net_locked', () => {
    const { inputs, check } = fixtureOf('SN-15');
    const empty = evaluate({ ...inputs, safetyNet: { protect: true, size: mu(100_000), saved: mu(0) } }, check);
    expect(empty.net).toMatchObject({ locked: true, floor: 0 });
    expect(empty.result.code).toBe('not_yet');
    expect(codes(empty.result)).not.toContain('net_locked');
  });
});
