/**
 * 05.4-61 (D-177 a): the samples are never emergency purchases.
 */
import { shadowSamples } from '../samples';

describe('05.4-61 shadow samples: not emergencies', () => {
  it('every sample is a planned purchase with no envelope', () => {
    for (const s of shadowSamples('USD')) {
      expect(s.check.emergency).toBe(false);
      expect(s.check.envelopeId).toBeNull();
    }
  });
});
