// D-17: offline foreign-currency entries get a provisional home amount from the nearest
// rate already sitting in the local cache, so totals still add up before the server ever
// sees the write. Mirrors supabase/migrations/20260924000500_fx_stamping.sql's
// stamp_fx_rate()/per_eur_rate() rules closely enough that the client's guess and the
// server's eventual stamp rarely disagree by more than a rounding unit -- but the server
// stamp (D-16) is always the one that counts, so every non-same-currency result here is
// unconditionally rate_pending: true. All arithmetic goes through engine/money; a rate
// string is only ever handed to engine/money's own BigInt parser, never to a float-producing
// JS numeric conversion.
import {
  convertMinor,
  crossRate,
  customPerEur,
  EUR_PER_EUR,
  formatRate,
  minorUnits,
  parseRate,
  resolveExponent,
  type ScaledRate,
} from '@/engine/money';
import type { CustomCurrencyRow, FxLatestRow, RateSource, TransactionRow } from '@/db/rows';

export type ProvisionalStamp = Pick<
  TransactionRow,
  'home_amount' | 'rate' | 'orig_per_eur' | 'home_per_eur' | 'rate_date' | 'rate_source' | 'rate_pending'
>;

interface PerEurResult {
  readonly rate: ScaledRate;
  /**
   * IN-A01: EUR's own leg is dated the transaction's local_date, as per_eur_rate() does
   * server-side (`rate_date := p_on`); '' when no local date was given, which never wins.
   */
  readonly rateDate: string;
  readonly source: RateSource | null;
}

export const PENDING_UNRESOLVED_STAMP: ProvisionalStamp = {
  home_amount: null,
  rate: null,
  orig_per_eur: null,
  home_per_eur: null,
  rate_date: null,
  rate_source: null,
  rate_pending: true,
};

function findCustom(code: string, customs: readonly CustomCurrencyRow[]): CustomCurrencyRow | undefined {
  return customs.find((c) => c.code === code);
}

function findCachedRate(code: string, rates: readonly FxLatestRow[]): FxLatestRow | undefined {
  return rates.find((r) => r.quote === code);
}

/** The lesser (earlier) of two rate dates; an empty string (EUR's own leg) never wins. */
function earlierDate(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * Resolves "units of `code` per 1 EUR", recursing through a custom currency's declared
 * reference currency the same way per_eur_rate() does server-side (D-07). Returns null when
 * no cached rate covers `code` at all -- the caller falls back to the fully-pending stamp.
 */
function resolvePerEur(
  code: string,
  rates: readonly FxLatestRow[],
  customs: readonly CustomCurrencyRow[],
  onDate: string,
  seen: ReadonlySet<string> = new Set()
): PerEurResult | null {
  if (code === 'EUR') {
    return { rate: EUR_PER_EUR, rateDate: onDate, source: null };
  }
  if (seen.has(code)) return null; // guards a malformed reference cycle

  const custom = findCustom(code, customs);
  if (custom) {
    const ref = resolvePerEur(custom.reference_currency, rates, customs, onDate, new Set([...seen, code]));
    if (!ref) return null;
    return {
      rate: customPerEur(ref.rate, parseRate(custom.unit_value)),
      rateDate: earlierDate(ref.rateDate, custom.as_of),
      source: 'custom',
    };
  }

  const cached = findCachedRate(code, rates);
  if (!cached) return null;
  return { rate: parseRate(cached.rate), rateDate: cached.rate_date, source: cached.source };
}

/** Mirrors stamp_fx_rate()'s source precedence: open-er-api beats custom beats frankfurter-v2. */
function combineSource(origSource: RateSource | null, homeSource: RateSource | null): RateSource {
  if (origSource === 'open-er-api' || homeSource === 'open-er-api') return 'open-er-api';
  if (origSource === 'custom' || homeSource === 'custom') return 'custom';
  return 'frankfurter-v2';
}

/**
 * WR-A03: never throws. The stamp is a display-only estimate computed inside a write's
 * onMutate, and a throw there aborts the real write before it is ever sent (query-core runs
 * onMutate before the retryer starts). A malformed cached rate or unit_value, a rate that
 * rounds to zero, or a result beyond MAX_SAFE_INTEGER therefore degrades to the fully
 * pending stamp -- the server stamps the row properly once the write lands (D-16).
 */
export function provisionalStamp(
  input: { amount: number; currency: string; homeCurrency: string; localDate?: string },
  rates: readonly FxLatestRow[],
  customs: readonly CustomCurrencyRow[]
): ProvisionalStamp {
  try {
    return computeProvisionalStamp(input, rates, customs);
  } catch {
    return PENDING_UNRESOLVED_STAMP;
  }
}

function keepStamp(row: TransactionRow): ProvisionalStamp {
  const { home_amount, rate, orig_per_eur, home_per_eur, rate_date, rate_source, rate_pending } = row;
  return { home_amount, rate, orig_per_eur, home_per_eur, rate_date, rate_source, rate_pending };
}

/**
 * WR-A06: the optimistic stamp for an edit, mirroring what the server trigger will do rather
 * than re-rating everything at today's rate:
 * - D-05: the row's own `home_currency` is kept (the trigger pins it on update), never the
 *   user's current preference.
 * - D-04: an amount-only edit keeps the stored rate. `home_amount` is recomputed from the
 *   row's own `orig_per_eur`/`home_per_eur` (or copied for a same-currency row), and
 *   `rate`, `rate_date`, `rate_source` and `rate_pending` stay as they were.
 * - A date or currency change is a genuine re-rate: provisionalStamp against the cached rates.
 * - An edit touching none of amount/currency/date keeps the whole stamp.
 * Like provisionalStamp, it never throws.
 */
export function editStamp(
  row: TransactionRow,
  patch: { original_amount?: number; original_currency?: string; local_date?: string },
  rates: readonly FxLatestRow[],
  customs: readonly CustomCurrencyRow[]
): ProvisionalStamp {
  const amount = patch.original_amount ?? row.original_amount;
  const currency = patch.original_currency ?? row.original_currency;
  const localDate = patch.local_date ?? row.local_date;
  const reRates = currency !== row.original_currency || localDate !== row.local_date;

  if (reRates) return provisionalStamp({ amount, currency, homeCurrency: row.home_currency, localDate }, rates, customs);
  if (amount === row.original_amount) return keepStamp(row);

  if (row.rate_source === 'same-currency') return { ...keepStamp(row), home_amount: amount };
  if (row.orig_per_eur === null || row.home_per_eur === null) {
    // Never resolved yet (fully pending): nothing stored to reuse, so estimate from the cache.
    return provisionalStamp({ amount, currency, homeCurrency: row.home_currency, localDate }, rates, customs);
  }
  try {
    const homeAmount = convertMinor(
      minorUnits(amount),
      parseRate(row.orig_per_eur),
      resolveExponent(currency, findCustom(currency, customs)?.decimals),
      parseRate(row.home_per_eur),
      resolveExponent(row.home_currency, findCustom(row.home_currency, customs)?.decimals)
    );
    return { ...keepStamp(row), home_amount: homeAmount };
  } catch {
    return PENDING_UNRESOLVED_STAMP;
  }
}

function computeProvisionalStamp(
  input: { amount: number; currency: string; homeCurrency: string; localDate?: string },
  rates: readonly FxLatestRow[],
  customs: readonly CustomCurrencyRow[]
): ProvisionalStamp {
  const { amount, currency, homeCurrency, localDate } = input;

  if (currency === homeCurrency) {
    return {
      home_amount: amount,
      rate: formatRate(EUR_PER_EUR),
      orig_per_eur: null,
      home_per_eur: null,
      // IN-A01: the server dates a same-currency row with its own local_date.
      rate_date: localDate ?? null,
      rate_source: 'same-currency',
      rate_pending: false,
    };
  }

  const orig = resolvePerEur(currency, rates, customs, localDate ?? '');
  const home = resolvePerEur(homeCurrency, rates, customs, localDate ?? '');
  if (!orig || !home) return PENDING_UNRESOLVED_STAMP;

  const origExponent = resolveExponent(currency, findCustom(currency, customs)?.decimals);
  const homeExponent = resolveExponent(homeCurrency, findCustom(homeCurrency, customs)?.decimals);

  const homeAmount = convertMinor(minorUnits(amount), orig.rate, origExponent, home.rate, homeExponent);
  const rate = crossRate(orig.rate, home.rate);

  return {
    home_amount: homeAmount,
    rate: formatRate(rate),
    orig_per_eur: formatRate(orig.rate),
    home_per_eur: formatRate(home.rate),
    rate_date: earlierDate(orig.rateDate, home.rateDate),
    rate_source: combineSource(orig.source, home.source),
    // D-16/D-17: only the server's own stamp is authoritative -- every provisional
    // conversion this function produces stays rate_pending until that happens.
    rate_pending: true,
  };
}
