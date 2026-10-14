import { wipeDeviceData } from '@/services/storage/wipe';
import { clearBackStep, markBackStep, resetTabSlideForTests, takeSlideFor } from '../tabSlide';

describe('tabSlide', () => {
  beforeEach(() => resetTabSlideForTests());

  it('walks forward, back and forward again', () => {
    expect(takeSlideFor('home')).toBe('none');
    expect(takeSlideFor('activity')).toBe('fromRight');
    markBackStep();
    expect(takeSlideFor('home')).toBe('fromLeft');
    expect(takeSlideFor('activity')).toBe('fromRight');
  });

  it('same tab is none', () => {
    takeSlideFor('home');
    expect(takeSlideFor('home')).toBe('none');
  });

  it('a back step is reverse even when moving right in D-01 order', () => {
    takeSlideFor('home');
    markBackStep();
    expect(takeSlideFor('activity')).toBe('fromLeft');
  });

  it('clearBackStep drops a pending back step so the next slide is forward', () => {
    takeSlideFor('home');
    markBackStep();
    clearBackStep();
    expect(takeSlideFor('activity')).toBe('fromRight');
  });

  it('the tab-slide wipe handler resets last and the pending flag', async () => {
    takeSlideFor('home');
    markBackStep();
    await wipeDeviceData();
    expect(takeSlideFor('activity')).toBe('none');
    expect(takeSlideFor('home')).toBe('fromLeft');
  });
});
