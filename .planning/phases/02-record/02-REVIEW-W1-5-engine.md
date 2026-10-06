---
phase: 02-record
scope: "Waves 1-5, Area A: pure financial engine (src/engine)"
reviewed: 2026-09-28T00:00:00Z
depth: deep
status: fixed
fix_status: critical_and_warnings_fixed
fixed_at: 2026-10-06
files_reviewed: 40
files_reviewed_list:
  - src/engine/accounts/index.ts
  - src/engine/accounts/standing.ts
  - src/engine/activity/balance.ts
  - src/engine/activity/filters.ts
  - src/engine/activity/index.ts
  - src/engine/activity/status.ts
  - src/engine/activity/totals.ts
  - src/engine/categorize/builtins.ts
  - src/engine/categorize/guessCategory.ts
  - src/engine/categorize/index.ts
  - src/engine/csv/detectColumns.ts
  - src/engine/csv/index.ts
  - src/engine/csv/inferFormat.ts
  - src/engine/csv/mapRows.ts
  - src/engine/csv/tokenize.ts
  - src/engine/money/index.ts
  - src/engine/money/parseNotatedAmount.ts
  - src/engine/ofx/amount.ts
  - src/engine/ofx/date.ts
  - src/engine/ofx/index.ts
  - src/engine/ofx/parse.ts
  - src/engine/ofx/tokenize.ts
  - src/engine/ofx/tree.ts
  - src/engine/recurring/detect.ts
  - src/engine/recurring/index.ts
  - src/engine/recurring/payMatch.ts
  - src/engine/recurring/schedule.ts
  - src/engine/statement/convert.ts
  - src/engine/statement/decodeText.ts
  - src/engine/statement/duplicates.ts
  - src/engine/statement/index.ts
  - src/engine/statement/profile.ts
  - src/engine/statement/reconcile.ts
  - src/engine/statement/sniffFormat.ts
  - src/engine/statement/types.ts
  - src/engine/transfer/index.ts
  - src/engine/transfer/match.ts
  - src/engine/transfer/pair.ts
  - src/engine/undo/history.ts
  - src/engine/undo/inverse.ts
  - src/engine/undo/types.ts
findings:
  critical: 4
  warning: 12
  info: 12
  total: 28
---

# Phase 2 (Record), Waves 1-5: Engine Code Review (Area A)

**Reviewed:** 2026-09-28
**Depth:** deep (every non-test engine file changed in `6273bbc...HEAD`, the tests for each, and cross-module call chains into `engine/money`, `engine/time` and the one live consumer `src/data/queries/activity.ts`)
**Status:** issues_found

## Summary

The architecture boundary holds. No file under `src/engine/` imports from `db/`, `state/`, `services/`, `ui/`, React, Supabase or Expo. No money value goes through `parseFloat` or `Number()`. Every `Number(...)` call found parses a calendar digit string, and `balance.ts`/`reconcile.ts` use BigInt where sums can grow. The OFX and CSV scanners run in linear time, and I found no regex over file content that can backtrack catastrophically.

The problems are in the maths and heuristics. They are not in the plumbing.

- **Recurring projections are wrong for quarterly and yearly series.** A bill that falls in the month being viewed is silently missing, and this function is already wired into the Activity view.
- **Every `dd/mm/yy` file is read as `yy/mm/dd` with "certain" confidence.** A test pins this behaviour.
- **A card CSV that marks only credits with `CR`, which is the common UK layout, imports every purchase as money in.**
- **An OFX card statement that reports the owed balance as negative is converted to "in credit".** This is the case in the project's own `card-over-limit.ofx` fixture.

Each of these was confirmed by running the engine code against a scratch Jest probe outside the repo. No source file was modified.

Three tests pass while pinning incorrect behaviour: `inferFormat.test.ts:74`, `reconcile.test.ts:176` and `schedule.test.ts` ("never touches", about line 197). The recurring property test never starts its window after the anchor, so it cannot catch CR-01.

## Fix Status (2026-10-06)

Every Critical and Warning finding is fixed, each in its own commit, test first (several existing tests that pinned the wrong behaviour were corrected in the same commit). The Info items are left as they are: none is both trivial and clearly correct without a design call.

| ID | Status | Notes |
|----|--------|-------|
| E-CR-01 | fixed 21cffeb (tests cc157b4) | `startN` divides the month gap by `MONTHS_PER_OCCURRENCE`. Adds a brute-force property with an independently drawn window. **Mirror:** the plpgsql `materialise_series()` loops from n = 0 with no start-index jump, so it does not have this bug. The shared fixture covers only `occurrence_date` and the horizon, so it needs no new cases and the generated pgTAP file is unchanged. |
| E-CR-02 | fixed 61e02b5 | YMD needs a 4-digit leading year. A year is only ever 2 or 4 digits. A tie between readings is `ambiguous`, never resolved to YMD. Corrects `inferFormat.test.ts:74`. |
| E-CR-03 | fixed 7dc1ca7 | A structural label decides only when every non-zero row is marked. CR-only with bare rows gives money-spent, DR-only gives money-in, and any other mix falls through. This also covers unrecognised direction values. |
| E-CR-04 | fixed f25a3df | For an OFX card with both LEDGERBAL and AVAILBAL, both orientations are tried: issuer gives `owed`, holder gives `held`. A non-negative limit picks the orientation; neither or both makes the profile ambiguous, with every candidate offered. The D-53 amendment is recorded in 02-CONTEXT.md. CSV files, and OFX files without both figures, keep the D-53 default. |
| E-WR-01 | fixed f8b6ff3 | Cuts only at a `T` between digits. A spelled-out month made DMY and MDY identical readings, so identical readings now count as `certain`. |
| E-WR-02 | fixed dae4073 | Header matches are scored: exact header, then a phrase, then a single word, with the keyword rank breaking ties. A single word is ignored when the header carries a specific phrase for another role. Header-matched date and amount columns are content-checked. A generic single-word match gives `low` confidence. `booking date` is now ranked ahead of `value date`. |
| E-WR-03 | fixed 96e8dc7 | Zero padding is capped at 2 extra places, so `1.000` at exponent 0 is refused. OFX refuses a lone `,` followed by exactly 3 digits with a 1-3 digit integer part as `ambiguous-separator`, unless the exponent is 3. The `.` (spec) mark is exempt, so 3-decimal padding with `.` still reads. |
| E-WR-04 | fixed ff06562 | Deviation: instead of a closed set of aggregates, the fix uses a closed set of OFX **leaf** names. An empty known leaf is dropped together with its close tag. Unknown names keep the aggregate reading, so vendor aggregates and the existing generic-name tree tests are unaffected. |
| E-WR-05 | fixed d5a7a1b | A FITID match must also fall within `FITID_WINDOW_DAYS` (7). |
| E-WR-06 | fixed 6215dc9 | A `choose` reserves both offered legs. The property now asserts that no stored id appears in two suggestions. The commit-path guard against a leg that already has a `transfer_id` belongs in src/data and is left to that owner. |
| E-WR-07 | fixed 19e4010 | The delta machinery is removed. `ConvertedRow.availableSigned` carries the signed available figure, and profile reconciliation uses it as the running balance, with the unknown limit cancelling as an offset. `reconcile.test.ts:176` is corrected. |
| E-WR-08 | fixed 5645558 | The majority of matching rows decides, and an even split decides nothing. For row-sign and TRNTYPE evidence, a reconciliation that verifies only the other candidate wins. |
| E-WR-09 | fixed b89700e | `payment` is removed from `DIRECTION_IN` and is now neutral, so the profile decides. detectColumns still counts it as a direction-column word. |
| E-WR-10 | fixed ec0c351 | A duplicate `(entity, id)` throws `RangeError`. Partial deviation: the inverse is **not** reversed. With every row distinct the ops are independent, so order cannot change the restored state, and reversing it would break `src/data` importFinalize's pinned op order, which this agent does not own. |
| E-WR-11 | fixed 9bc7147 | `transferEditPatches` now returns `{ok, patches}` or `{ok:false, error}`. It enforces sign, distinct accounts, same-currency equality, a valid date, and one shared date (`date-mismatch`). There are no callers outside engine/ yet. |
| E-WR-12 | fixed ef48b65 | The stated closing is one more link from the last anchor, in reading order, to the end of the file. On a mismatch the trailing rows, or the last anchored row, become cannot-verify and the file is `partial`. |
| IN-01 … IN-12 | not fixed | Info. Each needs a design decision or a cross-module change, for example IN-09's shared `AccountKind` or IN-01's re-parse on currency. Left for triage. |

## Critical Issues

### CR-01: `occurrencesBetween` skips quarterly and yearly occurrences because `startN` is counted in months, not occurrences

**File:** `src/engine/recurring/schedule.ts:137-139` (consumed by `projectOccurrences`, line 186, and by `src/data/queries/activity.ts:144`)
**Issue:** For every month-based frequency, the start index is `monthsBetween(anchor, from) - 1`. For `monthly` that is a valid occurrence index. For `quarterly` (3 months per occurrence) and `yearly` (12), `n` counts occurrences, so the start index overshoots by a factor of 3 or 12. The loop begins far in the future, and every occurrence between the true index and the overshoot is dropped.
**Failing input (verified):**
- Quarterly, anchor `2026-01-15`, `projectOccurrences(s, '2026-07', null)` returns `[]`. It should return `['2026-07-15']`.
- Yearly, anchor `2025-03-10`, `projectOccurrences(s, '2026-03', null)` returns `[]`. It should return `['2026-03-10']`.
- Yearly, `occurrencesBetween(s, '2025-06-01', '2028-12-31')` returns only n=2 and n=3. It misses `2026-03-10` (n=1).

**Impact:** Quarterly and yearly bills (insurance, council tax, subscriptions) disappear from future months' "still to come" totals in Activity. They will also disappear from Decide's projections once Decide consumes this function.

**Test gap:** The property test at `schedule.test.ts:~253` always calls `occurrencesBetween(schedule, anchor, …)`, so `startN` is always 0. The "month the schedule never touches" test (about line 197) passes for the wrong reason: anchor Jan 2026 yearly with month 2026-06 gives startN=4, which jumps to 2030.
**Fix:**
```ts
const startN = isDayBasedFreq(schedule.freq)
  ? Math.max(0, Math.floor(daysBetween(schedule.anchorDate, fromInclusive) / STEP_DAYS[schedule.freq]))
  : Math.max(0, Math.floor(monthsBetween(schedule.anchorDate, fromInclusive) / MONTHS_PER_OCCURRENCE[schedule.freq]) - 1);
```
Add a property test that draws `from` independently of the anchor and compares the result with a brute-force scan from n=0.

### CR-02: Any `dd/mm/yy` file is inferred as YMD with `certain` confidence, so every date is wrong

**File:** `src/engine/csv/inferFormat.ts:131-135` and `:162`
**Issue:** `assembleFromParts` lets a two-digit first part act as a YMD year (`year < 100 → +2000`). The third part is then the day. In 2026, `yy = 26`, which is a valid day in every month. So every `dd/mm/yy` sample also parses as YMD, and `inferDateFormat` then settles the tie with `if (candidates.includes('YMD')) return certain YMD`.
**Failing input (verified):** `inferDateFormat(['25/03/26','14/04/26','01/05/26'])` returns `{ kind: 'certain', format: 'YMD' }`, and `parseCsvDate('25/03/26','YMD')` returns `2025-03-26` instead of `2026-03-25`. This applies to every UK or EU export with two-digit years for the whole of 2026-2031. The user is not asked, because the result is "certain".
**Test pins the bug:** `inferFormat.test.ts:74-78` asserts `'13/09/26'` gives certain YMD (2013-09-26).
**Fix:** YMD must require a 4-digit first part. Expand a two-digit year only in the trailing position (DMY/MDY). If both a 4-digit YMD reading and another reading survive, return `ambiguous` instead of preferring YMD.
```ts
if (format === 'YMD' && (parts[0] as string).length !== 4) return null;
```

### CR-03: Partial DR/CR or direction evidence forces `money-in` on every row, so unmarked card purchases become income

**File:** `src/engine/statement/profile.ts:257-260`, `src/engine/csv/mapRows.ts:311-313`, `src/engine/statement/convert.ts:58-64`
**Issue:** `mapRows` sets the `dr-cr-markers` label if **any** row carries a DR/CR marker. `inferProfile` then treats the label as structural and returns `decided: money-in` without checking anything else. Rows with no marker (`'none'`) are then converted through `positiveMeans = money-in`, so a positive bare number becomes money in. UK card CSVs very commonly show purchases unsigned and only payments or refunds with a `CR` suffix. The same happens with a `direction-column` when some rows' direction values aren't in the table (`mapRows.ts:181-183` falls through to a plain reading).
**Failing input (verified):** A credit account with rows `45.00`, `20.00`, `100.00 CR` gives `decided money-in, evidence [account-kind, dr-cr-markers]` and converted amounts `[+4500, +2000, +10000]`. Both purchases are stored as money into the card. With no balance column, nothing flags this.
**Fix:** Treat `dr-cr-markers` as decisive only when **every** non-zero row carries dr or cr. When only one kind of marker appears (CR-only or DR-only), unmarked rows mean the opposite kind: CR-only gives `positiveMeans: 'money-spent'`, DR-only gives `'money-in'`. In any mixed case, fall through to row-sign or reconciliation. Apply the same rule to `direction-column` for rows whose direction value was unrecognised.

### CR-04: An OFX credit-card statement with a negative LEDGERBAL (owed) is converted to "in credit", and the limit derivation fails

**File:** `src/engine/statement/profile.ts:44-52` (`balanceMeansFor`), `:90-96` (`deriveOfxCardLimit`); `src/engine/statement/convert.ts:80`
**Issue:** Under D-53 the balance meaning for `kind === 'credit'` is always `'owed'`, which treats a positive raw balance as owed. Many OFX/QFX card issuers report the owed balance as a **negative** `BALAMT`, from the holder's view. The repo's own fixture `card-over-limit.ofx` does this (`LEDGERBAL -1250.00`, `AVAILBAL -250.00`), and `parse.test.ts:182` describes it as "owed-side minus". `convertBalance` then returns `-(−1 × 125000) = +125000`, which reads as the card being £1,250 in credit. `deriveOfxCardLimit` computes `-1250 + -250 = -1500`, returns `null`, and so misses the real £1,000 limit.
**Failing input (verified):** `inferProfile(parseOfx(card-over-limit.ofx), {kind:'credit'})` followed by `convertDraft` gives `closing: 125000, available: 25000, statedLimit: null`. D-42's preview copy ("£1,250, which is over your £1,000 limit") would instead say "in credit". An OFX file has only a closing balance and no running balances, so reconciliation cannot catch this.
**Fix:** Do not fix `balanceMeans` blindly for OFX cards. When LEDGERBAL and AVAILBAL are both present, evaluate both readings: owed = ±ledger, and require `owed + available = limit ≥ 0`. Pick the reading that yields a non-negative limit. If neither does, or both do, return `ambiguous` so the user confirms (D-42). Add a `convertDraft` test on `card-over-limit.ofx` asserting closing −125000 and limit 100000. This amends D-53's premise for OFX, so the decision needs recording in CONTEXT.

## Warnings

### WR-01: Upper-case month names containing "T" (OCT, SEPT, AUGUST, OCTOBER, SEPTEMBER) fail to parse

**File:** `src/engine/csv/inferFormat.ts:79-80`
**Issue:** `s.indexOf('T')` is meant to drop an ISO time part, but it also truncates `01-OCT-2026` to `01-OC`. Verified: `parseCsvDate('01-OCT-2026','DMY')` returns `null`, and `inferDateFormat(['01-OCT-2026','15-SEP-2026'])` returns `none`. Many US and Indian bank exports use upper-case month abbreviations. Every October row gets `bad-date`, or the whole column is not detected.
**Fix:** Cut only at a `T` that has a digit on both sides: `/^(\d{4}-\d{2}-\d{2})T\d/`, or check `isDigit(s[tIdx-1]) && isDigit(s[tIdx+1])`.

### WR-02: Header role matching takes the first column that shares any word with a generic keyword, and still reports "high" confidence

**File:** `src/engine/csv/detectColumns.ts:44-58`, `:118-126`, `:148-162`, `:268-270`
**Issue:** Columns are scanned in index order, and any column containing a single keyword word matches. This gives wrong mappings with `confidence: 'high'`:
- `['Booking Date','Value Date','Details','Amount']` maps **amount → "Value Date"**, because 'value' is an amount keyword. Verified.
- Lloyds layout `Transaction Date, Transaction Type, …, Transaction Description, Debit Amount, Credit Amount, Balance` maps **description → "Transaction Type"** (the values are "DEB"/"DD"), because 'transaction' is a description keyword. Verified.
- 'Account Name' or 'Reference' placed before 'Description' wins in the same way.

**Fix:** Score matches: exact header equals keyword beats a multi-word phrase, which beats a single generic word. Exclude a column whose header also matches a more specific phrase for another role ("value date", "transaction type"). Content-check header-matched date and amount columns, as is already done for direction. Report `low` confidence when a generic single-word match was used.

### WR-03: The strip-excess-zeros rule silently divides by 10^k when the decimal mark is wrong (OFX `-1,000` gives 1.00; JPY `1.000` gives 1)

**File:** `src/engine/money/parseNotatedAmount.ts:262-280`, `src/engine/ofx/amount.ts:19-41`
**Issue:** `parseOfxAmount` treats a lone `,` as the decimal mark. `stripExcessZeros` then drops `"000"` down to the exponent. Verified: `parseOfxAmount('-1,000', 2)` returns `magnitude 100` (£1.00 instead of £1,000). `-1,250` becomes 1.25. Without the strip, `parseAmount` would have rejected the value as `too-many-decimals`. The rule turns a safe refusal into a silent 1000× error. The same happens in CSV for exponent 0: `parseNotatedAmount('1.000', {decimal:'.'}, 0)` returns 1.
**Fix:** In `parseOfxAmount`, reject a lone `,` or `.` that is followed by exactly three digits with an integer part of 1-3 digits as `ambiguous-separator`. In `stripExcessZeros`, strip only when `exponent > 0`, and cap the stripped excess (OFX pads to 4 dp at most).

### WR-04: An empty SGML element swallows its following siblings, so TRNAMT, FITID and NAME are lost

**File:** `src/engine/ofx/tree.ts:79-105` (the `open` branch)
**Issue:** An `open` not immediately followed by text is always treated as an aggregate and pushed on the stack. In OFX 1.x SGML, an empty element such as `<DTUSER>`, `<MEMO>` or `<NAME>` followed by a newline and the next tag becomes a parent of every later field until `</STMTTRN>`. Verified: `<DTUSER>` left empty before `<TRNAMT>-45.00` gives `magnitude null, externalId null, description ''` with `bad-amount, empty-description`. An empty `<NAME>` before `<FITID>` silently drops the FITID, which weakens duplicate detection with no issue flag.
**Fix:** Use the OFX spec's closed set of aggregate names (`STMTTRN`, `BANKTRANLIST`, `LEDGERBAL`, `PAYEE`, …). An element that is not a known aggregate and has no text is an empty leaf. It is not pushed.

### WR-05: The FITID duplicate pass ignores the date, so reused FITIDs untick real transactions

**File:** `src/engine/statement/duplicates.ts:138-148`
**Issue:** The match requires only `externalId === c.externalId && amount === c.amount`. D-54 says banks reuse and regenerate FITIDs. `fitidReliable` only detects conflicts inside one file. Some issuers restart FITID sequences per statement (`1`, `2`, …). A monthly subscription with the same amount and reused FITID `3` is then flagged as a duplicate of last month's row and **unticked by default**, so a real transaction is dropped unless the user notices.
**Fix:** Also require `daysBetween(e.localDate, c.localDate) <= CROSS_FORMAT_WINDOW_DAYS` (or a small FITID window) in the FITID pass.

### WR-06: A transfer "choose" suggestion reserves nothing, so the same stored leg can be offered to or linked with several imports

**File:** `src/engine/transfer/match.ts:289-298`
**Issue:** When the top two candidates tie, the import is resolved as `choose` without adding either option to `assignedExisting`. A later import can then get `pair` with the same leg, or the same `choose` pair. Verified: two identical −£100 imports against two identical +£100 card rows both return `choose [e1, e2]`. If the user picks `e1` for both, one stored row is linked into two transfers.
**Fix:** Reserve the `choose` options, or run a proper one-to-one assignment. At minimum, filter `choose` options against legs already assigned or offered, and have the commit path refuse a leg that already has `transfer_id`.

### WR-07: Available-credit reconciliation cannot fully verify: off-by-one seeding, and deltas are wrong in reversed orientation

**File:** `src/engine/statement/reconcile.ts:59-78`; `src/engine/statement/convert.ts:100-103`
**Issue:**
- Row 0's available figure is known, but row 0 gets no delta, so it is never an anchor. Row 1's seeded value `0 + d1` then has nothing before it, so rows 0 and 1 are always `no-balance` and the file is never `all-verified`. `reconcile.test.ts:176-192` pins this as expected.
- `availableDelta` is computed against the **file-order** previous row. After `reconcile` reverses the rows, each delta relates to the *next* row, so newest-first available-credit files never verify in either orientation. `decideByReconciliation` then compares link counts that mean nothing.

**Fix:** Drop the delta machinery. Pass the signed available value itself as the row's `balance` for reconciliation (`balance = sign × magnitude`). The unknown limit is a constant offset that cancels in every difference, and orientation handling then works unchanged.

### WR-08: One description match (SALARY, WAGES, INTEREST PAID, PAYMENT RECEIVED) decides the whole file's sign and overrides a contradicting balance check

**File:** `src/engine/statement/profile.ts:160-175`, `:262-265`
**Issue:** `decideFromRowSign` returns the sign of the **first** row whose description contains a pattern. An outgoing "SALARY – NANNY" or "OVERDRAFT INTEREST PAID" row therefore decides `positiveMeans` for the whole file. `decideByLabel` then returns `decided` even when running balances reconcile only under the other reading. The mismatch surfaces as row flags, but the profile is not offered as ambiguous.
**Fix:** Require a majority of matching rows. When `hasBalances` is true and reconciliation strictly prefers the other candidate (`all-verified` against not), let reconciliation win, or return `ambiguous`.

### WR-09: A CSV direction value of "payment" is hard-mapped to CR (money in) for every account family

**File:** `src/engine/csv/mapRows.ts:40-41`, `:164-180`; `src/engine/statement/convert.ts:58-59`
**Issue:** `DIRECTION_IN` includes `'payment'`, which comes from card exports where "Payment" means a payment *to* the card. On a current account, a `Type = Payment` row is money *out*. Forced markers bypass the profile (`convertAmount` makes `cr` positive regardless of profile), so unsigned amounts on such rows are stored as income. A signed negative amount is caught as `conflicting-markers`, but unsigned ones are not.
**Fix:** Make `'payment'` family-dependent (card means in, deposit means out), or neutral (fall through to the plain reading) and let the profile decide.

### WR-10: `planBulkPatch` inverse is not reversed and does not reject duplicate ids

**File:** `src/engine/undo/inverse.ts:101-130`
**Issue:** If an id appears twice in `items`, the forward op for the second item still expects `item.expectedVersion` (stale after the first op), and the inverse op expects `+1`. The inverse ops are also emitted in forward order, so undo restores the second item's `before` last. That is the intermediate state, not the original. Nothing in the function prevents a caller from merging two patches on one row this way.
**Fix:** Throw on a duplicate `(entity, id)`, or merge the items. Emit `inverse` in reverse order.

### WR-11: `transferEditPatches` enforces none of the pair invariants that `buildTransferLegs` enforces

**File:** `src/engine/transfer/pair.ts:83-106`
**Issue:** The edit path accepts an `after` state with a positive out-leg, a negative in-leg, both legs on one account, unequal same-currency amounts, or different dates on the two legs. D-51 says editing the pair's date edits both legs. The patches are computed per leg independently, so an edit to one leg's date or amount desynchronises the pair and silently breaks the zero-sum between the two balances.
**Fix:** Validate `after` with the same rules as `buildTransferLegs` (sign, distinct accounts, same-currency equality, valid date), keep one shared `localDate`, and return a typed error.

### WR-12: The stated closing balance is ignored whenever the file has running balances

**File:** `src/engine/statement/reconcile.ts:231-248`
**Issue:** When `hasRealAnchor` is true, `stated.closing` is never compared with anything. A CSV whose "Closing balance" summary line disagrees with the last running balance, for example because rows were truncated after it, still reports `all-verified`.
**Fix:** After the link pass, if `stated.closing !== null`, add a final link from the last anchor to the closing balance (reversed orientation: the first anchor), and fail the file on a mismatch.

## Info

### IN-01: A missing CURDEF is treated as an unknown currency, and exponent 2 is assumed

**File:** `src/engine/ofx/parse.ts:179-184`
**Issue:** `types.ts:74` and D-12 say that a null CURDEF means "use the target account's currency". Instead every row is flagged `unknown-currency` with currency `''`, and amounts are parsed at exponent 2. For a JPY or KWD account, re-assigning the currency later without re-parsing gives a 100× or 0.1× error. The current behaviour is tested (`parse.test.ts:460-489`), so this is a design gap.
**Fix:** Pass the target account's currency into `parseOfx`, or re-parse `rawAmount` once the currency is known.

### IN-02: Repeated signs are accepted, and trailing Unicode minus signs are not recognised

**File:** `src/engine/money/parseNotatedAmount.ts:176-195`
**Issue:** `--12.50` and `- -12.50` are accepted as `minus` (verified). A trailing `−` (U+2212) or `–` (en dash) is not recognised, although the leading forms are.
**Fix:** Reject a repeated sign marker as `invalid`, and make the trailing check use the same set as the leading one.

### IN-03: The CSV error line counts logical rows, and a leading space before a quote is an error

**File:** `src/engine/csv/tokenize.ts:101`, `:191`, `:167-174`
**Issue:** `rowStartLine` counts logical rows, but the header comment promises a physical line. It drifts after any quoted multi-line field. Separately, `a, "b"` (a space before the opening quote) is a hard `stray-quote` error, which rejects a common export format outright.

### IN-04: Two-digit years are always read as 20xx

**File:** `src/engine/csv/inferFormat.ts:134`
**Issue:** `99` becomes 2099, and the date is accepted as valid. Historic imports of pre-2000 data would be dated in the future. Consider a pivot rule, such as `yy > currentYY + 1` meaning 19yy, with the current year passed in.

### IN-05: `monthTotals` sums with `number`, while `balance.ts` uses BigInt for the same reason

**File:** `src/engine/activity/totals.ts:32-78`
**Issue:** 5,000 rows near `MAX_ABS_AMOUNT_MINOR` (1e13) exceed `MAX_SAFE_INTEGER`. This is unrealistic, but it contradicts the rationale stated in `balance.ts`.

### IN-06: The keyword categoriser matches substrings of short keywords and checks only the first occurrence

**File:** `src/engine/categorize/guessCategory.ts:154-170`, rules at `:39`, `:46`, `:72`
**Issue:** 'bus' matches inside "AMAZON BUSINESS" (Transport), 'tax' inside "TAXI" (Tax), and "CARD PAYMENT TO X" becomes Debt through 'card'. `indexOf` finds only the first occurrence, so a later whole-word hit is missed. The sign of the amount is ignored, so an outgoing "SALARY …" payment becomes Income. The guesses are editable, but they are wrong often.

### IN-07: `detectRecurring` anchors the series on the last row's clamped day

**File:** `src/engine/recurring/detect.ts:138`
**Issue:** A month-end bill whose most recent row is 28 Feb gives a series anchored on the 28th. Later occurrences never return to the 30th or 31st. Consider using the modal or maximum day-of-month across the group.

### IN-08: A UTF-16 file without a BOM is decoded as UTF-8 with interleaved NUL characters

**File:** `src/engine/statement/decodeText.ts:188-192`
**Issue:** ASCII text in UTF-16 without a BOM is valid UTF-8. The result is text with interleaved U+0000 characters, which then fails delimiter and format sniffing. A cheap check: if more than about 30% of the even or odd bytes are 0x00, decode as UTF-16LE or BE.

### IN-09: `AccountKind` is declared twice

**File:** `src/engine/accounts/standing.ts:15`, `src/engine/statement/types.ts:16`
**Issue:** Identical unions are declared in two places and will drift. Export one from a shared module.

### IN-10: The credit cell's raw text is lost when both debit and credit are filled

**File:** `src/engine/csv/mapRows.ts:124`
**Issue:** `rawAmount` keeps only the debit cell. The credit cell's original text is lost, which weakens D-45 provenance for rows with both columns filled.

### IN-11: The amount filter compares a foreign-currency amount against home-currency bounds

**File:** `src/engine/activity/filters.ts:80`
**Issue:** `Math.abs(row.amountHome ?? row.original_amount)`: when a row is unconverted, its foreign-currency minor units (for example ¥150000) are compared against home-currency bounds. Exclude unconverted rows from amount-range filtering, or flag them.

### IN-12: `accountBalance` parsing is fragile, and one overflow blanks the whole balance

**File:** `src/engine/activity/balance.ts:38-62`
**Issue:** This one is uncertain and depends on the RPC contract. `BigInt('')` and `BigInt('  ')` evaluate to `0n` without an error, while `BigInt('12.00')` or a `null` coerced to `'null'` throws. Separately, an overflow in an *other*-currency leg sets `overflow = true` and nulls the account's own balance, which is actually fine.
**Fix:** Validate `paidSum` against `/^-?\d+$/`, and track own-currency overflow separately.

---

_Reviewed: 2026-09-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
_Verification: CR-01, CR-02, CR-03, CR-04, WR-01, WR-02, WR-03, WR-04, WR-06, WR-07 and IN-02 were each confirmed by running the engine functions in a scratch Jest probe outside the repository. The other findings come from reading the code, and IN-12 is marked uncertain._
