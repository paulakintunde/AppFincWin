import { TAB_ORDER, HOME_TAB, isTabId } from '../tabs';
import { BACK_SLIDE, SLIDE_OFFSET, slideDirection, slideFor, slideStartX } from '../direction';

describe('tabs', () => {
  it('keeps the D-01 order with Decide in the centre slot', () => {
    expect(TAB_ORDER).toEqual(['home', 'activity', 'decide', 'grow', 'insights']);
    expect(HOME_TAB).toBe('home');
  });
  it('isTabId narrows known ids only', () => {
    expect(isTabId('decide')).toBe(true);
    expect(isTabId('you')).toBe(false);
  });
});

describe('slideDirection (research Pitfall 3: direction follows D-01 index, not visible position)', () => {
  for (let i = 0; i < TAB_ORDER.length; i++) {
    for (let j = 0; j < TAB_ORDER.length; j++) {
      const from = TAB_ORDER[i]!;
      const to = TAB_ORDER[j]!;
      const expected = j > i ? 'fromRight' : j < i ? 'fromLeft' : 'none';
      it(`${from} -> ${to} is ${expected}`, () => {
        expect(slideDirection(from, to)).toBe(expected);
      });
    }
  }
});

describe('slideFor (D-05: a back step always slides in reverse)', () => {
  for (const from of TAB_ORDER) {
    for (const to of TAB_ORDER) {
      it(`${from} -> ${to} back`, () => {
        expect(slideFor(from, to, true)).toBe(from === to ? 'none' : 'fromLeft');
      });
      it(`${from} -> ${to} forward matches slideDirection`, () => {
        expect(slideFor(from, to, false)).toBe(slideDirection(from, to));
      });
    }
  }
  it('BACK_SLIDE is fromLeft', () => {
    expect(BACK_SLIDE).toBe('fromLeft');
  });
});

describe('slideStartX', () => {
  it('maps directions to the 22px prototype offset', () => {
    expect(SLIDE_OFFSET).toBe(22);
    expect(slideStartX('fromRight')).toBe(22);
    expect(slideStartX('fromLeft')).toBe(-22);
    expect(slideStartX('none')).toBe(0);
  });
});
