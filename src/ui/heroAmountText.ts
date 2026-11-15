/**
 * 05-114 (D-97; UI-SPEC R17.7, R17.13 M2): prepares the hero amount for the card. PURE: no React, no I/O.
 *
 * An amount that fits at the hero's declared 0.75 minimum stays one line that scales down to fit. The limit comes from
 * the window width and text scale (heroOneLineMax), never below 10 characters ("$1,234,567" at 320 wide and 2.0x). A
 * longer amount drops the one-line rule and gets a zero-width space after each group separator, so it can break only at a
 * separator ("1,234," / "567"), never inside a digit group. The visible characters are unchanged; the spoken form comes
 * from formatMoneyA11y, never from this text.
 */

/** The floor of the one-line limit. "$1,234,567" is 10 characters and fits at 320 wide and 2.0x at 0.75. */
export const HERO_ONE_LINE_MAX = 10;

/** R17.7 measures: the hero's font, its 1.3x cap, the card's inner width (window − 72) and display digits at 0.58 em. */
const HERO_FONT = 42;
const HERO_SCALE_CAP = 1.3;
const CARD_INSET = 72;
const DIGIT_EM = 0.58;
const HERO_MIN_SCALE = 0.75;

/** How many characters fit on one line at the hero's minimum scale for this window and text scale. */
export function heroOneLineMax(windowWidth: number, fontScale: number): number {
  const font = HERO_FONT * Math.min(Math.max(fontScale, 1), HERO_SCALE_CAP);
  const fits = Math.floor((windowWidth - CARD_INSET) / (font * DIGIT_EM * HERO_MIN_SCALE));
  return Math.max(HERO_ONE_LINE_MAX, fits);
}

export const ZERO_WIDTH_SPACE = '​';

/**
 * A group separator sits between two digits and is followed by exactly three digits: comma, dot, no-break space, narrow
 * no-break space or a typographic apostrophe. The same character before one or two digits is a decimal mark and is left
 * whole ("1.234.567,89" breaks after the dots, never inside ",89").
 */
const GROUP_SEPARATOR = /(\d)([.,  ’'])(?=\d{3}(?!\d))/g;

export interface HeroAmountText {
  text: string;
  fitOneLine: boolean;
}

export function heroAmountText(formatted: string, oneLineMax: number = HERO_ONE_LINE_MAX): HeroAmountText {
  if (formatted.length <= oneLineMax) return { text: formatted, fitOneLine: true };
  const text = formatted.replace(GROUP_SEPARATOR, `$1$2${ZERO_WIDTH_SPACE}`);
  return { text, fitOneLine: false };
}
