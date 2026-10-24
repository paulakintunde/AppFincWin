/**
 * 05-146 (D-76 rule S, D-107): decides whether "The outcome on each basis" can sit as three side-by-side columns. PURE.
 *
 * A column is only used when the widest figure, the widest basis name and the widest state chip each fit it on ONE line at
 * the window width and text scale, so nothing breaks inside a number and a chip never wraps inside its pill. Otherwise the
 * rows stack, one per basis. The estimate uses average glyph widths (digits 0.58 em, letters 0.55 em), the same style as
 * heroOneLineMax in home/heroAmountText.ts, and rounds toward stacking.
 */
const CARD_INSET = 72; // screen padding + card padding, as heroOneLineMax
const ROW_GAP = 8; // space.gapSm between columns
const ROW_PAD = 12; // space.gapMd inside each row
const FIGURE_FONT = 15; // body role
const NAME_FONT = 12.5; // fontSize.meta
const CHIP_FONT = 11.5; // fontSize.eyebrow
const CHIP_PAD = 12; // space.gapMd each side of a chip
const DIGIT_EM = 0.58;
const LETTER_EM = 0.55;
const BODY_SCALE_CAP = 2;
const CHIP_SCALE_CAP = 1.3;

export interface BasisFitInput {
  width: number;
  fontScale: number;
  /** The visible figure of each row ("$219,776.24 free"). */
  figures: readonly string[];
  /** The visible basis names and state words. */
  names: readonly string[];
  chips: readonly string[];
}

const widest = (xs: readonly string[]): number => xs.reduce((m, s) => Math.max(m, s.length), 0);

/** True when the three columns cannot each hold their widest figure, name and chip on one line. */
export function basisRowsStack({ width, fontScale, figures, names, chips }: BasisFitInput): boolean {
  const column = (width - CARD_INSET - 2 * ROW_GAP) / 3 - 2 * ROW_PAD;
  const bodyScale = Math.min(Math.max(fontScale, 1), BODY_SCALE_CAP);
  const chipScale = Math.min(Math.max(fontScale, 1), CHIP_SCALE_CAP);
  const figureW = widest(figures) * FIGURE_FONT * bodyScale * DIGIT_EM;
  const nameW = widest(names) * NAME_FONT * bodyScale * LETTER_EM;
  const chipW = widest(chips) * CHIP_FONT * chipScale * LETTER_EM + 2 * CHIP_PAD;
  return Math.max(figureW, nameW) > column || chipW > column + 2 * ROW_PAD;
}
