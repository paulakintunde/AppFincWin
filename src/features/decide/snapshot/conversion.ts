/**
 * 05-06 Task 3 (D-37): the builder's currency converter. Pure; stored rates only (never the FX fetch door, depcruise
 * fx-fetch-never-from-reads). Custom currencies resolve through their reference (05-33 convertLatest). A missing rate is
 * recorded, never guessed: the builder then reports the whole result as unconverted.
 *
 * D-69: a past line saved while its own rate was pending has no usable stamp. It is converted at the latest stored rate
 * for its currency (provisionalHomeAmount) and counted as provisional; the value is display and maths only, never
 * written anywhere. Once the sweep stamps the real rate, the next build reads the stamp instead.
 */
import { EUR_PER_EUR, resolveExponent } from '@/engine/money';
import { basisRateText, convertLatest, earlierDate, findCustom, resolvePerEur } from '@/data/queries/fxConvert';
import type { CustomCurrencyRow, FxLatestRow, TransactionRow } from '@/db/rows';
import type { ConversionNote, ProvisionalNote, UnconvertedNote } from './types';

/** D-69: a home amount for a line with no usable stamp. `rateDate` null = no rate was needed (zero, or already in home). */
export interface ProvisionalAmount {
  amount: number;
  rateDate: string | null;
  /** The currency of a line saved in its own currency before the home currency changed: converted at the latest rate, noted like D-37, never provisional. */
  latestFrom?: string;
}

/**
 * D-69: `row` in the home currency at the latest stored rate (custom currencies through their reference, 05-33), for a
 * line whose own stamp is missing or unusable. Null when no stored rate converts it: the line stays missing (D-37).
 * Stored rates only; never the FX fetch door. Callers try the stamp (homeAmountFor) first.
 */
export function provisionalHomeAmount(
  row: Pick<TransactionRow, 'original_amount' | 'original_currency'>,
  home: string,
  rates: readonly FxLatestRow[],
  customs: readonly CustomCurrencyRow[],
  today: string
): ProvisionalAmount | null {
  if (row.original_amount === 0 || row.original_currency === home) return { amount: row.original_amount, rateDate: null };
  const result = convertLatest(row.original_amount, row.original_currency, home, rates, customs, today);
  return result === null ? null : { amount: result.amount, rateDate: result.rateDate };
}

/** D-91: a conversion rounded to the minor unit (DOWN for a limit, UP for a set-aside), with the date of the older stored rate used. */
export interface FlooredConversion {
  amount: number;
  rateDate: string;
}

/**
 * Exact rational conversion of `amount` minor units (zero or positive) from `from` to `home` at the latest stored rates,
 * rounded once at the end: DOWN (`up` false, a limit is never rounded up, T-05-95-01) or UP (`up` true, a set-aside is
 * never rounded down, T-05-124-01). Same ratio as convertMinorExact, custom legs included; bigint only, no float. Stored
 * rates only (never the FX fetch door). Null on any missing rate, unusable exponent or a result beyond a safe integer;
 * never throws.
 */
function convertRounded(
  amount: number,
  from: string,
  home: string,
  rates: readonly FxLatestRow[],
  customs: readonly CustomCurrencyRow[],
  today: string,
  up: boolean
): FlooredConversion | null {
  if (from === home) return { amount, rateDate: today };
  try {
    const orig = resolvePerEur(from, rates, customs, today);
    const dest = resolvePerEur(home, rates, customs, today);
    if (!orig || !dest) return null;
    const fromExponent = resolveExponent(from, findCustom(from, customs)?.decimals);
    const toExponent = resolveExponent(home, findCustom(home, customs)?.decimals);
    const numerator =
      BigInt(amount) * (dest.custom?.referencePerEur ?? dest.rate) * 10n ** BigInt(toExponent) * (orig.custom?.unitValue ?? EUR_PER_EUR);
    const denominator =
      (orig.custom?.referencePerEur ?? orig.rate) * 10n ** BigInt(fromExponent) * (dest.custom?.unitValue ?? EUR_PER_EUR);
    const rounded = up ? (numerator + denominator - 1n) / denominator : numerator / denominator; // both positive: truncation is the floor
    if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return { amount: Number(rounded), rateDate: earlierDate(orig.rateDate, dest.rateDate) };
  } catch {
    return null;
  }
}

/** D-91 (T-05-95-01): the amount in `home`, FLOORED to the minor unit. */
export function convertFloored(
  amount: number,
  from: string,
  home: string,
  rates: readonly FxLatestRow[],
  customs: readonly CustomCurrencyRow[],
  today: string
): FlooredConversion | null {
  return convertRounded(amount, from, home, rates, customs, today, false);
}

/** D-101 (T-05-124-01): the amount in `home`, rounded UP to the minor unit, so a converted target never understates a set-aside. */
export function convertCeiled(
  amount: number,
  from: string,
  home: string,
  rates: readonly FxLatestRow[],
  customs: readonly CustomCurrencyRow[],
  today: string
): FlooredConversion | null {
  return convertRounded(amount, from, home, rates, customs, today, true);
}

export interface Converter {
  /** `amount` of `currency` in the home currency at the latest stored rate, or null when no rate converts it. Zero is always 0. */
  toHome(amount: number, currency: string): number | null;
  /** Record one needed amount in `currency` that could not be converted. */
  miss(currency: string): void;
  notes(): ConversionNote[];
  unconverted(): UnconvertedNote | null;
  /** D-69: record one line converted at a provisional rate dated `rateDate`; a line is counted once. */
  provisional(rowId: string, rateDate: string): void;
  /** D-69: how many lines used a provisional rate and the earliest such rate date, or null when none did. */
  provisionalNote(): ProvisionalNote | null;
}

export function makeConverter(args: {
  home: string;
  rates: readonly FxLatestRow[];
  customs: readonly CustomCurrencyRow[];
  today: string;
}): Converter {
  const noted = new Map<string, ConversionNote>();
  const missed = new Set<string>();
  let missCount = 0;
  const provisionalRows = new Set<string>();
  let provisionalDate = '';
  return {
    toHome(amount, currency) {
      // WR-B01: zero is zero in any currency; it needs no rate and adds no basis note.
      if (amount === 0) return 0;
      const result = convertLatest(amount, currency, args.home, args.rates, args.customs, args.today);
      if (result === null) return null;
      if (currency !== args.home && !noted.has(currency)) {
        noted.set(currency, {
          currency,
          rateText: basisRateText(result.fromPerEur, result.toPerEur),
          rateDate: result.rateDate,
        });
      }
      return result.amount;
    },
    miss(currency) {
      missed.add(currency);
      missCount += 1;
    },
    notes() {
      return [...noted.keys()].sort().map((code) => noted.get(code) as ConversionNote);
    },
    unconverted() {
      if (missCount === 0) return null;
      return { currencies: [...missed].sort(), rowCount: missCount };
    },
    provisional(rowId, rateDate) {
      if (provisionalRows.has(rowId)) return;
      provisionalRows.add(rowId);
      if (provisionalDate === '' || rateDate < provisionalDate) provisionalDate = rateDate;
    },
    provisionalNote() {
      if (provisionalRows.size === 0) return null;
      return { rowCount: provisionalRows.size, rateDate: provisionalDate };
    },
  };
}
