import { space } from '@/theme/layout';
import { scrollTargetY } from '../scrollIntoView';

describe('scrollTargetY', () => {
  it('top: moves the target to gapMd under the sticky header even when its header is already visible', () => {
    expect(scrollTargetY({ y: 900, offset: 400, align: 'top' })).toBe(900 - space.gapMd);
  });

  it('top: stays put when already there, and never goes negative', () => {
    expect(scrollTargetY({ y: 900, offset: 900 - space.gapMd, align: 'top' })).toBeNull();
    expect(scrollTargetY({ y: 4, offset: 20, align: 'top' })).toBe(0);
  });

  it('ifAbove: only scrolls when the target lies above the viewport', () => {
    expect(scrollTargetY({ y: 100, offset: 400, align: 'ifAbove' })).toBe(100 - space.gapMd);
    expect(scrollTargetY({ y: 900, offset: 400, align: 'ifAbove' })).toBeNull();
  });
});
