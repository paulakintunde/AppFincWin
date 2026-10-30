import type { V3Inputs, V3Month } from '@/engine/decide/v3';
import { helpOffered } from '../helpOffered';

const month = (full: boolean, m = '2026-09'): V3Month => ({ month: m as V3Month['month'], full, mark: null, lines: [] });
const inputs = (months: V3Month[], rough: V3Inputs['rough'] = null): V3Inputs => ({ months, rough }) as unknown as V3Inputs;

describe('helpOffered (D-17)', () => {
  it('is true with no months at all', () => expect(helpOffered(inputs([]))).toBe(true));
  it('is true when only partial months exist', () => expect(helpOffered(inputs([month(false)]))).toBe(true));
  it('is false with one full month', () => expect(helpOffered(inputs([month(false, '2026-10'), month(true)]))).toBe(false));
  it('stays true with rough figures set and no full month', () => {
    const rough = { income: 1, expenses: 1, saving: 0, debt: 0, invest: 0, asOf: '2026-10-01' } as unknown as V3Inputs['rough'];
    expect(helpOffered(inputs([], rough))).toBe(true);
  });
});
