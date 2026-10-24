/**
 * 05-114 (D-97; UI-SPEC R17.7, R17.13 M2): prepares the hero amount for the card. PURE: no React, no I/O.
 *
 * Up to 10 characters the amount is one line that scales down to fit (the hero's declared 0.75 minimum). A longer amount
 * drops the one-line rule and gets a zero-width space after each group separator, so it can break only at a separator
 * ("1,234," / "567"), never inside a digit group. The visible characters are unchanged; the spoken form comes from
 * formatMoneyA11y, never from this text.
 */

/** The longest amount that stays on one line, scaled to fit. "$1,234,567" is 10 characters. */
export const HERO_ONE_LINE_MAX = 10;

export const ZERO_WIDTH_SPACE = '\u200B';

/**
 * A group separator sits between two digits and is followed by exactly three digits: comma, dot, no-break space, narrow
 * no-break space or a typographic apostrophe. The same character before one or two digits is a decimal mark and is left
 * whole ("1.234.567,89" breaks after the dots, never inside ",89").
 */
const GROUP_SEPARATOR = /(\d)([.,\u00A0\u202F\u2019'])(?=\d{3}(?!\d))/g;

export interface HeroAmountText {
  text: string;
  fitOneLine: boolean;
}

export function heroAmountText(formatted: string): HeroAmountText {
  if (formatted.length <= HERO_ONE_LINE_MAX) return { text: formatted, fitOneLine: true };
  const text = formatted.replace(GROUP_SEPARATOR, `$1$2${ZERO_WIDTH_SPACE}`);
  return { text, fitOneLine: false };
}
