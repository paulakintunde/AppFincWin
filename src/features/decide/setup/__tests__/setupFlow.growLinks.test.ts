// 06-20 (ARC-16): the four setup steps whose forms moved to Grow link to a Grow home; every other step has no Grow route.
import { GROW_ROUTES, SETUP_STEP_KEYS, growRouteOf } from '../setupFlow';

describe('setup steps that open Grow', () => {
  it('maps loans, saving, emergency and envelopes', () => {
    expect(growRouteOf('loans')).toBe('/grow?segment=debts');
    expect(growRouteOf('saving')).toBe('/grow?segment=goals');
    expect(growRouteOf('emergency')).toBe('/grow/safety-net');
    expect(growRouteOf('envelopes')).toBe('/grow?segment=goals');
  });

  it('no other step has a Grow route', () => {
    const others = SETUP_STEP_KEYS.filter((k) => !(k in GROW_ROUTES));
    expect(others.length).toBe(SETUP_STEP_KEYS.length - 4);
    for (const k of others) expect(growRouteOf(k)).toBeNull();
  });
});
