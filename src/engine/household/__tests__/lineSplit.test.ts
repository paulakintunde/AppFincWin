import fc from 'fast-check';
import { minorUnits } from '../../money/types';
import { splitLine, type LineParticipant } from '../lineSplit';

const p = (key: string, included = true, weight = 0): LineParticipant => ({ key, included, weight });
const three = [p('a'), p('b'), p('c')];

describe('splitLine', () => {
  it('even split gives the extra unit to the first in join order', () => {
    expect(splitLine(minorUnits(1000), { kind: 'even' }, three, 0)).toEqual({
      ok: true,
      parts: [334, 333, 333],
    });
  });

  it('even split gives an excluded member 0', () => {
    const ps = [p('a'), p('b'), p('c', false)];
    expect(splitLine(minorUnits(1001), { kind: 'even' }, ps, 0)).toEqual({
      ok: true,
      parts: [501, 500, 0],
    });
  });

  it('weight split uses participant weights and keeps 0% at 0', () => {
    const ps = [p('a', true, 60), p('b', true, 40), p('c', true, 0)];
    expect(splitLine(minorUnits(1001), { kind: 'weight', weights: [60, 40, 0] }, ps, 0)).toEqual({
      ok: true,
      parts: [601, 400, 0],
    });
  });

  it('weight split ignores weights of excluded members', () => {
    const ps = [p('a', true, 50), p('b', true, 50), p('c', false, 50)];
    expect(splitLine(minorUnits(100), { kind: 'weight', weights: [50, 50, 50] }, ps, 0)).toEqual({
      ok: true,
      parts: [50, 50, 0],
    });
  });

  it('weight split with every included weight 0 fails', () => {
    const ps = [p('a', true, 0), p('b', true, 0), p('c', false, 100)];
    expect(splitLine(minorUnits(100), { kind: 'weight', weights: [0, 0, 100] }, ps, 0)).toEqual({
      ok: false,
      reason: 'split_weights_zero',
    });
  });

  it('amount split uses exact amounts', () => {
    const ps = [p('a'), p('b')];
    expect(
      splitLine(minorUnits(1001), { kind: 'amount', amounts: [minorUnits(700), minorUnits(301)] }, ps, 0),
    ).toEqual({ ok: true, parts: [700, 301] });
  });

  it('amount split that is short reports what is left to assign', () => {
    const ps = [p('a'), p('b')];
    expect(
      splitLine(minorUnits(1001), { kind: 'amount', amounts: [minorUnits(700), minorUnits(200)] }, ps, 0),
    ).toEqual({ ok: false, reason: 'amounts_not_total', leftToAssign: 101 });
  });

  it('amount split that is over reports a negative left to assign', () => {
    const ps = [p('a'), p('b')];
    expect(
      splitLine(minorUnits(-1000), { kind: 'amount', amounts: [minorUnits(700), minorUnits(400)] }, ps, 0),
    ).toEqual({ ok: false, reason: 'amounts_not_total', leftToAssign: -100 });
  });

  it('amount split treats an excluded member as 0', () => {
    const ps = [p('a'), p('b', false)];
    expect(
      splitLine(minorUnits(500), { kind: 'amount', amounts: [minorUnits(300), minorUnits(200)] }, ps, 0),
    ).toEqual({ ok: false, reason: 'amounts_not_total', leftToAssign: 200 });
  });

  it('amount split of a zero total is all zeros', () => {
    const ps = [p('a'), p('b')];
    expect(
      splitLine(minorUnits(0), { kind: 'amount', amounts: [minorUnits(0), minorUnits(0)] }, ps, 1),
    ).toEqual({ ok: true, parts: [0, 0] });
  });

  it('a zero total under even is all zeros', () => {
    expect(splitLine(minorUnits(0), { kind: 'even' }, three, 0)).toEqual({
      ok: true,
      parts: [0, 0, 0],
    });
  });

  it('mine gives the payer everything', () => {
    expect(splitLine(minorUnits(900), { kind: 'mine' }, three, 1)).toEqual({
      ok: true,
      parts: [0, 900, 0],
    });
  });

  it('even with no other included member fails', () => {
    const ps = [p('a'), p('b', false)];
    expect(splitLine(minorUnits(100), { kind: 'even' }, ps, 0)).toEqual({
      ok: false,
      reason: 'no_other_member',
    });
  });

  it('weight with no other included member fails', () => {
    const ps = [p('a', true, 100), p('b', false, 0)];
    expect(splitLine(minorUnits(100), { kind: 'weight', weights: [100, 0] }, ps, 0)).toEqual({
      ok: false,
      reason: 'no_other_member',
    });
  });

  it('refunds mirror signs', () => {
    expect(splitLine(minorUnits(-1000), { kind: 'even' }, three, 0)).toEqual({
      ok: true,
      parts: [-334, -333, -333],
    });
  });

  it('property: parts sum to total, share the sign, exclude the excluded, and are deterministic', () => {
    const arb = fc.record({
      total: fc.integer({ min: -1_000_000, max: 1_000_000 }),
      members: fc.array(
        fc.record({ included: fc.boolean(), weight: fc.integer({ min: 0, max: 100 }) }),
        { minLength: 2, maxLength: 6 },
      ),
      kind: fc.constantFrom('even', 'weight', 'mine'),
      payer: fc.nat(5),
    });
    fc.assert(
      fc.property(arb, ({ total, members, kind, payer }) => {
        const ps = members.map((m, i) => ({ key: `k${i}`, ...m }));
        const payerIndex = payer % ps.length;
        const rule =
          kind === 'weight'
            ? ({ kind: 'weight', weights: ps.map((x) => x.weight) } as const)
            : ({ kind } as const);
        const r1 = splitLine(minorUnits(total), rule, ps, payerIndex);
        const r2 = splitLine(minorUnits(total), rule, ps, payerIndex);
        expect(r1).toEqual(r2);
        if (!r1.ok) return;
        expect(r1.parts.reduce((s, v) => s + v, 0)).toBe(total);
        r1.parts.forEach((v, i) => {
          if (total >= 0) expect(v).toBeGreaterThanOrEqual(0);
          else expect(v).toBeLessThanOrEqual(0);
          if (kind !== 'mine' && !ps[i]!.included) expect(v).toBe(0);
        });
      }),
    );
  });

  it('property: valid amount splits return exactly the amounts', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 100_000 }), { minLength: 2, maxLength: 6 }), (amts) => {
        const ps = amts.map((_, i) => p(`k${i}`));
        const total = amts.reduce((s, v) => s + v, 0);
        const r = splitLine(
          minorUnits(total),
          { kind: 'amount', amounts: amts.map((a) => minorUnits(a)) },
          ps,
          0,
        );
        expect(r).toEqual({ ok: true, parts: amts });
      }),
    );
  });
});
