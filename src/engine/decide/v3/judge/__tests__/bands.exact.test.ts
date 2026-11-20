import type { Band } from '../../types';
import { BAND_LAYERS, layerOfAnswerKey, layersFor } from '../bands';

// 05.4-59: exact tables, written out literally so a mutated source line cannot follow them.
describe('05.4-59 exact layer tables', () => {
  const none = { periodic: false, hasExtras: false };
  it('BAND_LAYERS written out literally', () => {
    const l5 = ['L0', 'L1p', 'L1e', 'L2'];
    const l6 = ['L0', 'L1p', 'L1e', 'L2', 'L5'];
    const l8 = ['L0', 'L1p', 'L1e', 'L2', 'L3', 'L4', 'L5'];
    const l9 = [...l8, 'L6'];
    const l12 = [...l9, 'L7'];
    const expected: Record<Band, string[]> = {
      1: ['L0'], 2: ['L0'], 3: ['L0', 'L1p'], 4: ['L0', 'L1p', 'L1e'], 5: l5, 6: l6, 7: l6, 8: l8, 9: l9, 10: l9, 11: l9, 12: l12, 13: l12, 14: l12, 15: l12,
    };
    expect(BAND_LAYERS).toEqual(expected);
  });
  it('layersFor returns canonical order', () => {
    expect(layersFor(5, none)).toEqual(['L0', 'L1p', 'L1e', 'L2']);
    expect(layersFor(6, none)).toEqual(['L0', 'L1p', 'L1e', 'L2', 'L5']);
    expect(layersFor(15, none)).toEqual(['L0', 'L1p', 'L1e', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
    expect(layersFor(3, { periodic: true, hasExtras: true })).toEqual(['L0', 'L1p', 'L3', 'L4', 'L5']);
  });
  it('layerOfAnswerKey error names the key', () => {
    expect(() => layerOfAnswerKey('zzz')).toThrow('layerOfAnswerKey: "zzz" has no layer prefix');
    expect(() => layerOfAnswerKey('L9.x')).toThrow('layerOfAnswerKey: "L9.x" has no layer prefix');
  });
});
