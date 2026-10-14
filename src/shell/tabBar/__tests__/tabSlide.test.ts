import { markBackStep, resetTabSlideForTests, takeSlideFor } from '../tabSlide';

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
});
