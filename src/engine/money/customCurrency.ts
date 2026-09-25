/**
 * Pure custom-currency input validation (MON-04, MON-13, D-07). A user declares a code, a
 * symbol, decimal places, and what one unit is worth in an ISO reference currency they pick.
 * Every problem with the input is collected and returned together (D-07's "reusing the
 * prototype's messages as error codes" -- the caller maps each CustomCurrencyError to its
 * own copy), rather than stopping at the first one, so a single round of user correction
 * fixes everything wrong at once.
 *
 * Stays pure per the engine/ boundary: only engine/money's own rate parser (parseRate/
 * formatRate) and amount parser (parseDecimalString) are used, no db/data/services/ui/react.
 */
import { parseDecimalString, type LocaleSeparators } from './parseAmount';
import { formatRate, parseRate, RATE_SCALE } from './rates';

export type CustomCurrencyError =
  | 'code-missing'
  | 'code-invalid'
  | 'code-exists'
  | 'symbol-invalid'
  | 'decimals-invalid'
  | 'reference-invalid'
  | 'value-invalid';

export interface CustomCurrencyInput {
  code: string;
  symbol: string;
  decimals: number;
  referenceCurrency: string;
  unitValueRaw: string;
  locale: string;
  /** WR-A11: the device region's own decimal/group marks, when known. */
  separators?: LocaleSeparators;
}

export interface ValidatedCustomCurrency {
  code: string;
  symbol: string;
  decimals: number;
  referenceCurrency: string;
  unitValue: string;
}

export type ValidateCustomCurrencyResult =
  | { ok: true; value: ValidatedCustomCurrency }
  | { ok: false; errors: CustomCurrencyError[] };

export interface ValidateCustomCurrencyContext {
  isoCodes: ReadonlySet<string>;
  existingCustomCodes: ReadonlySet<string>;
}

// A code is 2-4 upper-case letters/digits once trimmed and upper-cased (prototype: line
// 5770-5790). Shorter than 2 characters (including empty) is "missing" rather than
// "invalid" -- there is nothing to correct, only something to type.
const CODE_PATTERN = /^[A-Z0-9]{2,4}$/;
const MAX_SYMBOL_LENGTH = 4;

// RD-01: no static upper (or lower) bound on what one custom unit may be worth in its
// reference currency -- a legitimate investment can be worth 100M-1B+ reference units. The
// only invariant that must hold is that the *derived per-EUR rate* neither rounds to zero
// (a unit so valuable 10dp cannot represent its per-EUR rate) nor overflows numeric(24,10)
// (a unit so cheap against a high-per-EUR reference such as IDR or VND that the rate
// exceeds the column). That single check lives in customPerEur (engine/money/rates.ts) and
// its SQL mirror custom_per_eur()/guard_custom_currency_rate -- the rate guard is the one
// source of truth (IN-A02, WR-B07), not a static bound here that cannot see the reference
// currency's actual rate anyway.

export function validateCustomCurrency(
  input: CustomCurrencyInput,
  ctx: ValidateCustomCurrencyContext
): ValidateCustomCurrencyResult {
  const errors: CustomCurrencyError[] = [];

  const trimmedCode = input.code.trim();
  const code = trimmedCode.toUpperCase();
  if (trimmedCode.length < 2) {
    errors.push('code-missing');
  } else if (!CODE_PATTERN.test(code)) {
    errors.push('code-invalid');
  } else if (ctx.isoCodes.has(code) || ctx.existingCustomCodes.has(code)) {
    errors.push('code-exists');
  }

  const trimmedSymbol = input.symbol.trim();
  if (trimmedSymbol.length > MAX_SYMBOL_LENGTH) {
    errors.push('symbol-invalid');
  }
  // Falls back to the code itself when left blank (prototype default).
  const symbol = trimmedSymbol.length > 0 ? trimmedSymbol : code;

  if (!Number.isInteger(input.decimals) || input.decimals < 0 || input.decimals > 4) {
    errors.push('decimals-invalid');
  }

  const referenceCurrency = input.referenceCurrency.trim().toUpperCase();
  if (!ctx.isoCodes.has(referenceCurrency)) {
    errors.push('reference-invalid');
  }

  let unitValue = '';
  const parsedDecimal = parseDecimalString(input.unitValueRaw, {
    locale: input.locale,
    maxFractionDigits: RATE_SCALE,
    separators: input.separators,
  });
  if (!parsedDecimal.ok) {
    errors.push('value-invalid');
  } else {
    try {
      // Canonical 10-dp string, the same shape every other stored rate takes (D-16's SQL
      // mirror expects numeric(24,10)). parseRate rejects zero/negative values and anything
      // beyond numeric(24,10)'s 14 integer digits, which is exactly what "must be > 0"
      // (prototype) and the column's own precision mean here. RD-01: no other bound --
      // whether *this* value's derived per-EUR rate is usable depends on the reference
      // currency's own rate, which is only known at declare/revalue time (the
      // guard_custom_currency_rate trigger) or conversion time (customPerEur), not here.
      const scaled = parseRate(parsedDecimal.value);
      unitValue = formatRate(scaled);
    } catch {
      errors.push('value-invalid');
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { code, symbol, decimals: input.decimals, referenceCurrency, unitValue },
  };
}
