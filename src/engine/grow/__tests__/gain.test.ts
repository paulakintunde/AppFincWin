import fc from 'fast-check';
import { gainPercentTenths, holdingGain, totalGain } from '../gain';
import { minorUnits } from '../../money/types';
import { holdings } from './fixtures/ledger';

const m = minorUnits;
const { retirement, index } = holdings;

describe('gain', () => {
  it('per holding', () => {
    expect(holdingGain(m(retirement.value), m(retirement.putIn))).toBe(65000);
    expect(holdingGain(m(index.value), m(index.putIn))).toBe(4000);
    expect(holdingGain(m(90000), m(100000))).toBe(-10000);
  });
  it('percent in tenths', () => {
    expect(gainPercentTenths(m(65000), m(580000))).toBe(112);
    expect(gainPercentTenths(m(-10000), m(100000))).toBe(-100);
    expect(gainPercentTenths(m(5), m(0))).toBeNull();
  });
  it('total over both', () => {
    expect(totalGain([retirement, index].map((h) => ({ value: m(h.value), putIn: m(h.putIn) })))).toEqual({
      value: 769000,
      putIn: 700000,
      gain: 69000,
    });
  });
  it('empty total', () => {
    expect(totalGain([])).toEqual({ value: 0, putIn: 0, gain: 0 });
  });
  it('total gain is the exact sum', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 1e7 }), fc.integer({ min: 0, max: 1e7 })), { maxLength: 8 }), (rows) => {
        const t = totalGain(rows.map(([value, putIn]) => ({ value: m(value), putIn: m(putIn) })));
        expect(t.gain).toBe(rows.reduce((s, [v, p]) => s + holdingGain(m(v), m(p)), 0));
      }),
    );
  });
});
