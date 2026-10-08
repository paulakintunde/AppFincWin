/**
 * D-13 / MON-12: the open.er-api fallback's terms require this exact attribution text and
 * link wherever its rates are shown. Verbatim third-party text -- never paraphrase, never
 * translate. The client's single source of truth: en.ts (money.rate.attribution and
 * credits.exchangeRateApi) and RateAttribution read these constants.
 *
 * The Deno fx-sync bundle cannot share a module with the React Native bundle, so it keeps
 * its own copy in supabase/functions/fx-sync/openErApi.ts. src/i18n/__tests__/
 * mandatedCopy.test.ts asserts the two stay identical.
 */
export const EXCHANGE_RATE_API_ATTRIBUTION = 'Rates By Exchange Rate API';

// T-01-14-01: hard-coded constant, never built from data.
export const EXCHANGE_RATE_API_URL = 'https://www.exchangerate-api.com';
