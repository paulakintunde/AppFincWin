import { effectiveScale, scaleTextStyle } from '../fontScale';

describe('effectiveScale', () => {
  it('passes through under the cap', () => expect(effectiveScale(1.5, 'body')).toBe(1.5));
  it('caps body at 2', () => expect(effectiveScale(3.1, 'body')).toBe(2));
  it('caps capped at 1.3', () => expect(effectiveScale(3.1, 'capped')).toBe(1.3));
  it('keeps small capped scale', () => expect(effectiveScale(1.1, 'capped')).toBe(1.1));
  it('allows shrinking', () => expect(effectiveScale(0.85, 'body')).toBe(0.85));
  it.each([NaN, 0, -1, Infinity])('treats %p as 1', (v) => expect(effectiveScale(v, 'body')).toBe(1));
});

describe('scaleTextStyle', () => {
  it('multiplies all three props', () => {
    const r = scaleTextStyle({ fontSize: 26, lineHeight: 30.16, letterSpacing: -0.26 }, 2);
    expect(r.fontSize).toBeCloseTo(52);
    expect(r.lineHeight).toBeCloseTo(60.32);
    expect(r.letterSpacing).toBeCloseTo(-0.52);
  });
  it('leaves absent props absent', () => {
    expect(scaleTextStyle({ fontSize: 10 }, 2)).toEqual({ fontSize: 20 });
  });
  it('returns {} at scale 1', () => expect(scaleTextStyle({ fontSize: 10 }, 1)).toEqual({}));
});
