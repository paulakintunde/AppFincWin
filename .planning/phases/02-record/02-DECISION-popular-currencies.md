# Decision: Popular currencies in the picker

**Date:** 2026-10-07. **Amends:** Phase 1 D-08 ("every currency, no curated shortlist").

## What

The currency picker (transaction entry and account sheet) shows, in order:

1. **Your currency**: the home currency, alone.
2. **Popular**, grouped by continent (max 4 each):
   - North America: USD, CAD, MXN
   - South America: BRL, ARS, COP, CLP
   - Europe: EUR, GBP, CHF, SEK
   - Asia: CNY, JPY, INR, KRW
   - Africa: NGN, ZAR, EGP, KES
   - Oceania: AUD, NZD
3. **All currencies**, A-Z: the full list including custom currencies, as before.

## Why

Most people pick from a small set. A short list up top saves scrolling ~170 rows. The list covers the currencies of the ten largest economies (USD, EUR, CNY, JPY, INR, GBP, CAD, BRL, AUD, KRW).

## Rules

- Only currencies already offered (live rate, or EUR) appear in Popular. Missing ones are dropped silently; nothing is invented. Continents with no offered currency are omitted.
- The home currency is not repeated in Popular.
- A-Z stays complete: Popular and Your currency entries also appear in A-Z. This keeps D-08's "everything is available" property and a predictable alphabetical list.
- The picker has no search today; if one is added it searches all currencies and shows matches without section headings.
- Headings and continent names live in the typed catalogue (`currencyPicker.*` in `src/i18n/locales/en.ts`). Headings use the header role; each row's label is `CODE · Name`.

## Where

`src/data/queries/popularCurrencies.ts` (list and pure grouping), `src/features/record/entry/pickers/CurrencyPicker.tsx`.
