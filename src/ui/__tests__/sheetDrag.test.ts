import {
  BACKDROP_OPACITY,
  SHEET_DISMISS_DELAY,
  SHEET_DISMISS_DISTANCE,
  clampDrag,
  sheetDragOutcome,
} from '../sheetDrag';

describe('sheetDrag', () => {
  it('exposes the prototype constants', () => {
    expect(BACKDROP_OPACITY).toBe(0.38);
    expect(SHEET_DISMISS_DISTANCE).toBe(92);
    expect(SHEET_DISMISS_DELAY).toBe(190);
  });
  it('dismisses strictly past 92px', () => {
    expect(sheetDragOutcome(93, 0)).toBe('dismiss');
    expect(sheetDragOutcome(92, 0)).toBe('snap');
    expect(sheetDragOutcome(91, 0)).toBe('snap');
  });
  it('dismisses on a fling of at least 24px at 1000px/s', () => {
    expect(sheetDragOutcome(30, 1200)).toBe('dismiss');
    expect(sheetDragOutcome(23, 5000)).toBe('snap');
    expect(sheetDragOutcome(60, 999)).toBe('snap');
  });
  it('clamps upward drags to 0', () => {
    expect(clampDrag(-5)).toBe(0);
    expect(clampDrag(40)).toBe(40);
  });
});
