import { layersFor, type Band, type Layer, type Purpose } from '@/engine/decide/v3';
import { layerVisibility, revealedLayers } from '../layerVisibility';

const necessity: Purpose = { kind: 'preset', value: 'necessity' };

describe('layerVisibility', () => {
  it('band 6 plan with necessity', () => {
    const v = layerVisibility({ layers: ['L0', 'L1p', 'L1e', 'L2', 'L3', 'L4', 'L5'], band: 6, payMode: 'plan', purpose: necessity });
    expect(v).toEqual({ purpose: true, emergencyFollowUp: true, value: true, plan: true, costs: true, major: false, veryLarge: false, staged: false, wholePlanLink: true, instead: 'open' });
  });
  it.each([
    [{ kind: 'preset', value: 'treat' }],
    [{ kind: 'custom', id: 'x' }],
    [null],
  ] as const)('no emergency follow-up for %p even with L1e', (purpose) => {
    expect(layerVisibility({ layers: ['L0', 'L1p', 'L1e'], band: 4, payMode: 'once', purpose: purpose as Purpose | null }).emergencyFollowUp).toBe(false);
  });
  it('for_work shows the follow-up; without L1e it is hidden', () => {
    const forWork: Purpose = { kind: 'preset', value: 'for_work' };
    expect(layerVisibility({ layers: ['L0', 'L1p', 'L1e'], band: 4, payMode: 'once', purpose: forWork }).emergencyFollowUp).toBe(true);
    expect(layerVisibility({ layers: ['L0', 'L1p'], band: 3, payMode: 'once', purpose: forWork }).emergencyFollowUp).toBe(false);
  });
  it('band 15 requires staged payments and shows major and very large', () => {
    const v = layerVisibility({ layers: layersFor(15, { periodic: false, hasExtras: false }), band: 15, payMode: 'once', purpose: null });
    expect(v).toMatchObject({ staged: true, major: true, veryLarge: true, wholePlanLink: false, instead: 'open' });
  });
  it('no band: basics only, instead none', () => {
    const v = layerVisibility({ layers: ['L0'], band: null, payMode: 'once', purpose: null });
    expect(v).toEqual({ purpose: false, emergencyFollowUp: false, value: false, plan: false, costs: false, major: false, veryLarge: false, staged: false, wholePlanLink: false, instead: 'none' });
  });
  it('a plan pay mode shows the plan card at any band', () => {
    expect(layerVisibility({ layers: ['L0'], band: 1, payMode: 'plan', purpose: null }).plan).toBe(true);
  });
  it('instead link follows the band for every band', () => {
    const want = (b: number): string => (b === 1 ? 'none' : b <= 4 ? 'link' : b === 5 ? 'prominent' : 'open');
    for (let b = 1; b <= 15; b += 1) {
      const band = b as Band;
      expect(layerVisibility({ layers: layersFor(band, { periodic: false, hasExtras: false }), band, payMode: 'once', purpose: null }).instead).toBe(want(b));
    }
  });
});

describe('revealedLayers', () => {
  it('names newly shown layers', () => {
    expect(revealedLayers(['L0'], ['L0', 'L1p', 'L1e'])).toEqual(['L1p', 'L1e']);
  });
  it('is empty when unchanged or layers vanish', () => {
    const x: readonly Layer[] = ['L0', 'L1p'];
    expect(revealedLayers(x, x)).toEqual([]);
    expect(revealedLayers(['L0', 'L1p'], ['L0'])).toEqual([]);
  });
});
