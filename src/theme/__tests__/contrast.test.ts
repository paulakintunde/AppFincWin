import { ACCENTS } from '../accents';
import { colors } from '../tokens';
import { contrastRatio } from '../contrast';

describe('contrastRatio (WCAG 2.x relative luminance)', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#767161', '#767161')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio(colors.ink, colors.canvas)).toBeCloseTo(contrastRatio(colors.canvas, colors.ink), 10);
  });

  it('rejects anything that is not a 6-digit hex colour', () => {
    expect(() => contrastRatio('rgba(0,0,0,.5)', '#FFFFFF')).toThrow(RangeError);
  });

  it('documents the failing pair this fix replaces: inkFaint on fill1 is below AA', () => {
    expect(contrastRatio(colors.inkFaint, colors.fill1)).toBeLessThan(4.5);
    expect(contrastRatio(colors.inkMuted, colors.fill1)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('status colours meet WCAG AA (4.5:1) text contrast (02-polish item 5)', () => {
  const grounds = { surface: colors.surface, canvas: colors.canvas, fill1: colors.fill1 } as const;

  for (const [ground, hex] of Object.entries(grounds)) {
    it(`danger text on ${ground}`, () => {
      expect(contrastRatio(colors.danger, hex)).toBeGreaterThanOrEqual(4.5);
    });
    for (const [key, accent] of Object.entries(ACCENTS)) {
      it(`${key} accent text on ${ground}`, () => {
        expect(contrastRatio(accent, hex)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
