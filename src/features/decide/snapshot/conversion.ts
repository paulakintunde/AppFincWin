/**
 * 05-06 Task 3 (D-37): the builder's currency converter. Pure; stored rates only (never the FX fetch door, depcruise
 * fx-fetch-never-from-reads). Custom currencies resolve through their reference (05-33 convertLatest). A missing rate is
 * recorded, never guessed: the builder then reports the whole result as unconverted.
 *
 * D-69: a past line saved while its own rate was pending has no usable stamp. It is converted at the latest stored rate
 * for its currency (provisionalHomeAmount) and counted as provisional; the value is display and maths only, never
 * written anywhere. Once the sweep stamps the real rate, the next build reads the stamp instead.
 */
import { basisRateText, convertLatest } from '@/data/queries/fxConvert';
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
