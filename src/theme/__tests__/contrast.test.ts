import { ACCENTS } from '../accents';
import { colors, warnTint } from '../tokens';
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

/**
 * 05.3-44 (DSV-18, UI-SPEC "Answer tones"): every text/ground pair the v3 Decide screens use is at least 4.5:1, with each
 * shipped accent where the accent is the text or the ground.
 */
describe('v3 answer-tone pairs meet 4.5:1', () => {
  const fixedPairs: readonly [string, string, string][] = [
    ['inkMuted on canvas', colors.inkMuted, colors.canvas],
    ['inkMuted on surface', colors.inkMuted, colors.surface],
    ['inkMuted on fill1', colors.inkMuted, colors.fill1],
    ['inkMuted on fill2', colors.inkMuted, colors.fill2],
    ['inkMuted on fill6', colors.inkMuted, colors.fill6],
    ['inkMuted on accentTint1', colors.inkMuted, colors.accentTint1],
    ['ink on accentTint1', colors.ink, colors.accentTint1],
    ['ink on fill1', colors.ink, colors.fill1],
    ['ink on fill2', colors.ink, colors.fill2],
    ['ink on warnTint', colors.ink, warnTint],
    ['ink on dangerTint1', colors.ink, colors.dangerTint1],
    ['inkDim on accentTint1', colors.inkDim, colors.accentTint1],
    ['inkDim on fill1', colors.inkDim, colors.fill1],
    ['inkDim on fill2', colors.inkDim, colors.fill2],
    ['inkDim on warnTint', colors.inkDim, warnTint],
    ['inkDim on dangerTint1', colors.inkDim, colors.dangerTint1],
    ['warn1 on warnTint', colors.warn1, warnTint],
    ['warn1 on fill3', colors.warn1, colors.fill3],
    ['warn1 on surface', colors.warn1, colors.surface],
    ['danger on surface', colors.danger, colors.surface],
    ['danger on dangerTint1', colors.danger, colors.dangerTint1],
    ['inkSoft2 on ink', colors.inkSoft2, colors.ink],
    ['surface on ink', colors.surface, colors.ink],
  ];
  it.each(fixedPairs)('%s', (_name, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  const accentGrounds: readonly [string, string][] = [
    ['canvas', colors.canvas],
    ['surface', colors.surface],
    ['accentTint1', colors.accentTint1],
    ['fill1', colors.fill1],
  ];
  for (const [key, accent] of Object.entries(ACCENTS)) {
    for (const [ground, hex] of accentGrounds) {
      it(`${key} accent as text on ${ground}`, () => {
        expect(contrastRatio(accent, hex)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`surface text on a ${key} accent fill`, () => {
      expect(contrastRatio(colors.surface, accent)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('records why inkFaint is forbidden as text on light fills', () => {
    expect(contrastRatio(colors.inkFaint, colors.fill1)).toBeLessThan(4.5);
  });
});
