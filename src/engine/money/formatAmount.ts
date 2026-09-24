/**
 * Locale-aware amount formatting (DSG-06, D-22, D-23). Every rule below
 * ports the prototype's money formatter (`FincWin United.dc.html` lines
 * 3606-3615), fixing its two bugs in the same pass: it hardcoded `en-US`
 * regardless of device locale, and it used a plain hyphen for negative
 * amounts instead of a true minus sign.
 *
 * D-25: this module takes locale and the Show cents preference as plain
 * parameters. It never reads `expo-localization`, a profile row or any
 * other device/user state itself -- the caller (a hook, a screen) does that
 * and passes the result in, keeping this file inside `engine/`'s pure,
 * I/O-free boundary.
 */
import { currencyExponent } from './currencyExponents';
import { minorUnits, type Money, type MinorUnits } from './types';

export interface FormatAmountOptions {
  locale: string;
  /** D-23: whole amounts drop their decimals unless this is on. */
  showCents: boolean;
  /** Overrides the ISO 4217 lookup -- required for a custom currency (MON-13). */
  exponent?: number;
  /** Set for a custom currency (D-07), whose code Intl does not recognize. */
  customSymbol?: string;
}

/**
 * Pure string-maths conversion of a `MinorUnits` integer to a plain decimal
 * string -- no division, so no floating-point rounding can enter the
 * display path either. toDecimalString(-12345, 2) -> '-123.45';
 * toDecimalString(5, 3) -> '0.005'; toDecimalString(1200, 0) -> '1200'.
 */
export function toDecimalString(amount: MinorUnits, exponent: number): string {
  const digits = Math.abs(amount).toString().padStart(exponent + 1, '0');
  const unsigned =
    exponent > 0
      ? `${digits.slice(0, digits.length - exponent)}.${digits.slice(digits.length - exponent)}`
      : digits;
  return amount < 0 ? `-${unsigned}` : unsigned;
}

/**
 * Formats a `Money` value for display, per D-23:
 *  - the currency's symbol, never its code, unless the symbol itself is
 *    ambiguous (`currencyDisplay: 'symbol'`, not `'narrowSymbol'`, is what
 *    makes Intl disambiguate CAD as "CA$" in en-US and USD as "US$" in en-CA)
 *  - a true minus sign (U+2212), never a hyphen, on outflows
 *  - decimals dropped on a whole amount unless `showCents` is on; a
 *    zero-exponent currency (JPY) never shows them, a three-exponent one
 *    (KWD) shows three whenever decimals show at all
 *
 * The decimal string built by `toDecimalString` is passed directly to
 * `Intl.NumberFormat.prototype.format` rather than a `number`. Where the
 * host engine implements the Intl.NumberFormat v3 string-input behavior
 * (verified in this project's Node/Jest environment), the string is treated
 * as an exact decimal with no float coercion at all. On a host that predates
 * v3, `format` coerces the string back to a `Number` -- purely for this
 * function's own display output, never fed back into a stored `Money`
 * value, so it cannot introduce drift into anything persisted (MON-01).
 */
export function formatAmount(money: Money, opts: FormatAmountOptions): string {
  const exponent = opts.exponent ?? currencyExponent(money.currency);
  const isWhole = money.amount % 10 ** exponent === 0;
  const fractionDigits = exponent > 0 && (opts.showCents || !isWhole) ? exponent : 0;

  if (opts.customSymbol !== undefined) {
    // Intl has no notion of a currency it doesn't recognize, so a custom
    // currency is formatted as a plain number and the symbol is prefixed by
    // hand -- the true minus (if any) goes in front of the whole result,
    // matching '−G2,500', not 'G−2,500'.
    const absDecimalString = toDecimalString(minorUnits(Math.abs(money.amount)), exponent);
    const plain = new Intl.NumberFormat(opts.locale, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(absDecimalString as unknown as number);
    const signed = `${opts.customSymbol}${plain}`;
    return money.amount < 0 ? `−${signed}` : signed;
  }

  const decimalString = toDecimalString(money.amount, exponent);
  return new Intl.NumberFormat(opts.locale, {
    style: 'currency',
    currency: money.currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
    .format(decimalString as unknown as number)
    .replace(/-/g, '−');
}
