// Prefill for a cross-currency transfer's "Amount received": the sent amount converted at the
// latest stored rates. Pure and integer-minor-unit only (convertMinor, half-up). It returns ''
// whenever a figure cannot be computed, so a bad or missing rate leaves the field empty.
import { convertMinor, minorUnits } from '@/engine/money';
import { latestPerEur } from '@/data/queries/homeAmount';
import type { FxLatestRow } from '@/db/rows';

export function prefillAmountInText(args: {
  amountText: string;
  currency: string;
  toCurrency: string | null;
  rates: readonly FxLatestRow[];
  parse: (text: string, code: string) => { ok: true; value: number } | { ok: false };
  exponentFor: (code: string) => number;
  toInputText: (minor: number, code: string) => string;
}): string {
  const { amountText, currency, toCurrency, rates, parse, exponentFor, toInputText } = args;
  if (toCurrency === null || toCurrency === currency) return '';
  const parsed = parse(amountText, currency);
  if (!parsed.ok) return '';
  const fromPerEur = latestPerEur(rates, currency);
  const toPerEur = latestPerEur(rates, toCurrency);
  if (fromPerEur === null || toPerEur === null) return '';
  try {
    const minor = convertMinor(
      minorUnits(Math.abs(parsed.value)),
      fromPerEur,
      exponentFor(currency),
      toPerEur,
      exponentFor(toCurrency)
    );
    return toInputText(minor, toCurrency);
  } catch {
    return '';
  }
}
