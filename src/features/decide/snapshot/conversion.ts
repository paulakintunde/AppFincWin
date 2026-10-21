/**
 * 05-06 Task 3 (D-37): the builder's currency converter. Pure; stored rates only (never the FX fetch door, depcruise
 * fx-fetch-never-from-reads). Custom currencies resolve through their reference (05-33 convertLatest). A missing rate is
 * recorded, never guessed: the builder then reports the whole result as unconverted.
 */
import { basisRateText, convertLatest } from '@/data/queries/fxConvert';
import type { CustomCurrencyRow, FxLatestRow } from '@/db/rows';
import type { ConversionNote, UnconvertedNote } from './types';

export interface Converter {
  /** `amount` of `currency` in the home currency at the latest stored rate, or null when no rate converts it. Zero is always 0. */
  toHome(amount: number, currency: string): number | null;
  /** Record one needed amount in `currency` that could not be converted. */
  miss(currency: string): void;
  notes(): ConversionNote[];
  unconverted(): UnconvertedNote | null;
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
  };
}
