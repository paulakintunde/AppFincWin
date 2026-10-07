# 02-31 step 1: device walkthrough fixes (Pixel 9, production)

Three findings from the Phase 2 walkthrough. Each was test-first (failing `test(02-31)` commit, then `fix(02-31)`).

## 1. Wrong landing after consent (bug)

- **Finding:** a fresh account that accepted the analytics consent landed on You, so it never reached "Your first account" or "Bring your history".
- **Cause:** `ConsentScreen` still redirected to `/you` (Phase 0 behaviour). 02-30 made Activity the signed-in landing (`app/index.tsx`) but did not update consent.
- **Fix:** new `src/features/auth/appHome.ts` exports `APP_HOME_HREF` (`/activity`); both `app/index.tsx` and `ConsentScreen` use it, so there is one literal.
- **Tests:** `ConsentScreen.test.tsx` now asserts both Share and Not now (and the retry-after-failure path) redirect to `/activity` (previously asserted `/you`).

## 2. Home currency defaulted to USD regardless of device (gap, user decision 2026-10-07)

- **Cause:** `profiles.home_currency` is a database default `'USD'`; nothing set it from the device.
- **Fix:** `useDeviceHomeCurrencyDefault` (mounted as `DeviceHomeCurrencyDefault` in `app/(app)/_layout.tsx`) runs once per user per device after sign-in. Region resolves as explicit override (`profiles.region`) > device region > time zone country (`getDeviceRegion` in `deviceLocale.ts`, built on the existing `resolveRegion`; no IP). The region maps to a currency via the new pure `currencyForRegion` (`src/engine/money/regionCurrency.ts`, ~85 regions, eurozone as EUR). The currency is applied through the existing `useUpdateMoneyPrefs().setHomeCurrency` only if it is in the app's currency options (the server `is_known_currency` trigger is the backstop). No migration, no new native module.
- **"Never set" signal and limitation:** `profiles` has no flag or timestamp for "user chose a currency". The rule is therefore: the profile still holds the server default `USD`, AND the household has zero accounts (every transaction requires an account, so zero accounts implies zero transactions; archived accounts count as accounts), AND this check has not already run for this user on this device (AsyncStorage flag `fincwin:home-currency-default:<userId>`, set whether or not it applied). Consequences:
  - Existing users with accounts are never touched; an explicit non-USD choice is never overwritten.
  - A user who explicitly chose USD before creating any account is indistinguishable from the default. The check runs immediately after sign-in/consent, before they can reach the You screen, so this is only reachable by signing in on a second device with an account-less profile; there the device currency would be applied once. They can change it on You.
  - Regions with no table entry, or whose currency is not offered, keep USD.
  - If the currency list or accounts have not loaded (offline), the check waits and is not recorded, so it retries next launch.
- **Tests:** `regionCurrency.test.ts` (table, normalisation, unknown input), `deviceLocale.test.ts` (`getDeviceRegion` precedence), `useDeviceHomeCurrencyDefault.test.tsx` (CAD applied for en-CA, USD no-op, non-default untouched, accounts present untouched, once-only, unsupported currency, no region, and waiting states).

## 3. "Choose a statement file" disabled with no explanation (UX)

- **Fix:** while no account is selected, the import pick step shows `importCsv.pickAccountFirst` ("Choose or add an account first.") and the disabled button carries the same text as its `accessibilityHint` (`Pill` gained an optional `accessibilityHint` prop). Both disappear once an account is selected.
- **Tests:** two new cases in `ImportScreen.test.tsx`.
