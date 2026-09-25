---
phase: 01-money-core
plan: 14
subsystem: ui
tags: [i18n, react-native, fx-attribution, sync-status, jest, testing-library]

# Dependency graph
requires:
  - phase: 01-money-core
    provides: "01-03: engine/money's formatAmount/formatLocalDate; 01-09: useSyncStatus() SYN-06 hook; 01-10: RateSource type (src/db/rows.ts) and useDeviceLocale() (src/services/locale/deviceLocale.ts)"
provides:
  - "src/ui/money/useMoneyFormatter.ts: locale-bound formatMoney/formatDate hook (DSG-06, D-22, D-25) -- caller passes Show cents explicitly, no dependency on 01-13's useMoneyPrefs"
  - "src/ui/RateAttribution.tsx: reusable rate-date + open.er-api attribution component (MON-07, MON-12, D-13, D-17), returns null for a same-currency figure"
  - "src/ui/syncStatusLabel.ts: pure SyncStatus-to-copy mapping (offline/queued/synced-N-ago/never-synced)"
  - "src/ui/SyncStatusLine.tsx: the You-screen sync status line (SYN-06, D-14), 30s self-refresh"
  - "src/i18n/locales/en.ts money.*/sync.*/credits.* catalogue keys, with provenance recorded in the file's header comment"
affects: [01-15 (places SyncStatusLine on the You screen), 02-record (Record's screens adopt RateAttribution and useMoneyFormatter)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RateAttribution/SyncStatusLine read useTheme()/textRole(pairing, 'label') for styling and useT() for every string, matching Screen.tsx's existing token-only convention -- no new raw colour literals, verified by noRawColours.test.ts"
    - "syncStatusLabel.ts stays pure (no React, no I18n) so SyncStatusLine.tsx is the only place status is turned into rendered text -- mirrors 01-09's writeErrors.ts pattern of keeping classification logic dependency-free"
    - "SyncStatusLine re-renders every 30s via a setInterval(...).current-tick useState, cleared on unmount, so 'synced N minutes ago' advances without any external trigger"
    - "RateAttribution's attribution URL is a hard-coded module-level constant (T-01-14-01), never interpolated from any prop or catalogue value"

key-files:
  created:
    - src/ui/money/useMoneyFormatter.ts
    - src/ui/RateAttribution.tsx
    - src/ui/syncStatusLabel.ts
    - src/ui/SyncStatusLine.tsx
    - src/ui/__tests__/RateAttribution.test.tsx
    - src/ui/__tests__/syncStatusLabel.test.ts
    - src/ui/__tests__/SyncStatusLine.test.tsx
  modified:
    - src/i18n/locales/en.ts
    - src/i18n/copyStatus.ts

key-decisions:
  - "useMoneyFormatter has no dedicated test file, matching the plan's own files_modified list and behavior section (neither lists one) -- its two functions delegate directly to engine/money's already-100%-covered formatAmount/formatLocalDate, so it is a thin, low-risk binding layer"
  - "RateAttribution returns null whenever rateSource === 'same-currency', independent of ratePending, since a same-currency figure never has a rate to attribute regardless of pending state -- simpler and matches the plan's behavior bullet literally"
  - "SyncLabel's key/count shape (rather than a discriminated union) matches the plan's <interfaces> contract verbatim; syncStatusLabel's base keys (e.g. 'sync.offlineQueued') resolve through i18next's own plural-suffix stripping at the call site, the same pattern 00-12 already established for signOut.confirm.body"

requirements-completed: [MON-07, MON-12, SYN-06, DSG-06]

# Metrics
duration: ~95min (session interrupted once mid-execution; resumed from committed Task 1 state, includes ~10min npm ci in a from-scratch worktree)
completed: 2026-09-24
---

# Phase 1 Plan 14: Rate Attribution, Sync Status Line and Money Formatter Hook Summary

**Reusable `RateAttribution` (rate publication date / 'Rate pending' / open.er-api attribution) and `SyncStatusLine` (offline/queued/synced status, 30s self-refresh) components, plus a `useMoneyFormatter` hook binding `engine/money`'s formatter to the device locale, all token-styled and fully localised.**

## Performance

- **Duration:** ~95 min total (session was interrupted after Task 1's commit and resumed from that point; includes ~10 min `npm ci` in a from-scratch worktree with no `node_modules`)
- **Tasks:** 2/2 completed
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments
- `src/i18n/locales/en.ts`/`copyStatus.ts`: full `money.*` (rate, fxNote, homeCurrency, customCurrency, amountInput, settings), `sync.*` and `credits.*` catalogue namespaces, with the header comment recording which strings are ported verbatim from the prototype, which are Claude-drafted, and which (the open.er-api attribution) are third-party-mandated and excluded from `DRAFT_COPY_KEYS`
- `src/ui/money/useMoneyFormatter.ts`: `useMoneyFormatter(showCents)` returns memoised `formatMoney`/`formatDate` bound to `useDeviceLocale()`'s locale, plus the locale string itself -- never reads a preference itself (D-25)
- `src/ui/RateAttribution.tsx`: renders the rate's publication date (`Rate of {{date}}`), a custom-currency's own as-of date (`Your rate, set {{date}}`), or `Rate pending` while a server stamp is outstanding (D-17); renders the open.er-api attribution as a `Pressable` (`accessibilityRole="link"`) that opens the hard-coded `https://www.exchangerate-api.com` on press when `rateSource === 'open-er-api'`; returns `null` for a same-currency figure
- `src/ui/syncStatusLabel.ts`: pure `SyncStatus` + `now` -> `{ primary, failed, conflicts }` mapping, covering offline/offline-queued/queued/just-now/minutes/hours/days/never-synced
- `src/ui/SyncStatusLine.tsx`: renders the prototype's status line from live `useSyncStatus()` state, re-rendering every 30s so "minutes ago" advances, with failed/conflict lines in `colors.danger` only when non-zero
- 20 new component/unit tests (Task 2) plus the existing 270 `en` catalogue tests remain green; full verification run across `src/ui`, `src/i18n`, `src/theme` -- 304 tests, 8 suites, all passing
- `npm run lint` (0 errors, only pre-existing unrelated warnings), `npm run typecheck` (clean) and `npm run depcruise` (0 violations, 88 modules) all pass

## Task Commits

Each task was committed atomically; Task 2 is TDD with a genuine RED-then-GREEN pair (verified by moving the four implementation files out of the working tree, confirming a real "Cannot find module" failure, then restoring them):

1. **Task 1: Catalogue keys for money, sync and credits** - `a855226` (feat)
2. **Task 2: useMoneyFormatter, RateAttribution and SyncStatusLine** - `3eb1bd9` (test, RED) then `863afa5` (feat, GREEN)

**Plan metadata:** committed separately by the orchestrator after all worktree agents in this wave complete (per this plan's parallel-execution instructions).

## Files Created/Modified
- `src/i18n/locales/en.ts` - `money.*`, `sync.*`, `credits.*` namespaces; header comment extended with provenance notes
- `src/i18n/copyStatus.ts` - every Claude-drafted key from the new namespaces added to `DRAFT_COPY_KEYS`, excluding the two third-party-mandated attribution strings
- `src/ui/money/useMoneyFormatter.ts` - `useMoneyFormatter(showCents): { formatMoney, formatDate, locale }`
- `src/ui/RateAttribution.tsx` - `RateAttribution({ rateDate, rateSource, ratePending })`
- `src/ui/syncStatusLabel.ts` - `syncStatusLabel(status, now)`, `SyncLabel`/`SyncLabelKey` types
- `src/ui/SyncStatusLine.tsx` - `SyncStatusLine()`, 30s self-refresh
- `src/ui/__tests__/RateAttribution.test.tsx` - 5 tests: frankfurter-v2 date, open.er-api attribution press-through, custom-currency date, pending state, same-currency null render
- `src/ui/__tests__/syncStatusLabel.test.ts` - 9 tests: every behavior bullet in the plan (offline/queued permutations, all four "synced N ago" bands, never-synced, failed/conflicts pass-through)
- `src/ui/__tests__/SyncStatusLine.test.tsx` - 4 tests: offline-queued render, synced-just-now render, danger-coloured failed line, no failed/conflict lines when both zero

## Decisions Made
See `key-decisions` in frontmatter. All three are implementation-level clarifications consistent with the plan's own `<interfaces>` contract and behavior list -- no scope change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `en.ts`'s new header comment accidentally closed its own block comment early**
- **Found during:** Task 1, first verification run of `src/i18n` after adding the provenance note
- **Issue:** The comment referenced `sync.offlineQueued_*/syncedMinutes_*`; the character sequence `*/` inside that literal closed the enclosing `/** ... */` JSDoc block early, leaving the rest of the comment (and the following `const en = {` statement) to be parsed as executable code, producing a Babel `SyntaxError: Missing semicolon`.
- **Fix:** Reworded the sentence to `sync.offlineQueued_one/other and sync.syncedMinutes_one/other`, removing the `*/` adjacency entirely.
- **Files modified:** `src/i18n/locales/en.ts`
- **Verification:** `npx jest src/i18n` -- 270/270 tests pass
- **Committed in:** `a855226` (Task 1 commit; caught and fixed before the commit was made, no separate fix commit needed)

**2. [Rule 1 - Bug] `jest.spyOn(Linking, 'openURL').mockResolvedValue()` failed `tsc --noEmit` with no argument**
- **Found during:** Task 2, first `npm run typecheck` pass after GREEN
- **Issue:** `Linking.openURL`'s typed return value requires an explicit resolved value; calling `.mockResolvedValue()` with zero arguments failed with `TS2554: Expected 1 arguments, but got 0`.
- **Fix:** Changed to `.mockResolvedValue(true)`.
- **Files modified:** `src/ui/__tests__/RateAttribution.test.tsx`
- **Verification:** `npm run typecheck` clean (0 errors)
- **Committed in:** `863afa5` (Task 2 GREEN commit; caught and fixed before the commit was made)

---

**Total deviations:** 2 auto-fixed (both Rule 1, both caught and resolved before their respective task's commit -- no separate fix commits, no scope creep, no change to any deliverable's public API).
**Impact on plan:** Zero. Both are implementation-level syntax/type corrections surfaced by the plan's own verification commands.

## Issues Encountered

- **Session interruption mid-execution:** this plan's execution was interrupted after Task 1's commit (`a855226`) landed but before Task 2 began. On resume, `git status`/`git log` confirmed Task 1's commit was intact and the working tree held Task 2's already-written (but uncommitted) test and implementation files; execution continued from there rather than redoing Task 1. No work was lost or duplicated.
- **Known Windows worktree Jest bug (documented by prior plans, recurred here as expected):** `npx jest` reports "No tests found" when run from this worktree's dot-prefixed path. Worked around exactly as prior plans flagged: a disposable, never-committed `jest.worktree.config.js` spreading the real `jest.config.js` with `testMatch: ['**/*.test.ts?(x)']`, run via `npx jest -c jest.worktree.config.js ...`. The file was deleted before this agent finished; `git status --short` confirms it is gone and was never staged into any commit.
- No other issues. All acceptance criteria and the plan's `<verification>` block (`npx jest src/ui src/i18n src/theme`, `npm run lint`, `npm run typecheck`, `npm run depcruise`) passed cleanly.

## User Setup Required

None - no external service configuration required. This plan is pure TypeScript/React Native UI with no new dependencies and no Supabase/network calls (the attribution link is a hard-coded external URL opened via `Linking.openURL`, never invoked by tests or by app startup).

## Next Phase Readiness

- `src/ui/SyncStatusLine.tsx` is ready for plan 01-15 to place on the You screen; it needs no props and reads `useSyncStatus()` directly.
- `src/ui/RateAttribution.tsx` and `src/ui/money/useMoneyFormatter.ts` are ready for Record (Phase 2)'s screens to adopt for every converted figure, matching this plan's `<interfaces>` contract exactly (`RateAttributionProps`, `useMoneyFormatter(showCents)`).
- `money.amountInput.*` and `money.settings.*` catalogue keys are already in place for Record's amount-input field and settings screens to consume without a further catalogue change.
- No blockers for downstream plans in this wave (01-11, 01-12) or Record: this plan touched only its declared `files_modified` scope (`src/i18n/locales/en.ts`, `src/i18n/copyStatus.ts`, `src/ui/money/useMoneyFormatter.ts`, `src/ui/RateAttribution.tsx`, `src/ui/syncStatusLabel.ts`, `src/ui/SyncStatusLine.tsx`, and the three new test files), with no overlap with the other wave-4 plans' files.

---
*Phase: 01-money-core*
*Completed: 2026-09-24*

## Self-Check: PASSED

All 7 created source/test files plus this SUMMARY.md confirmed present on disk. Both modified files (`src/i18n/locales/en.ts`, `src/i18n/copyStatus.ts`) confirmed changed. All 3 task commit hashes (`a855226`, `3eb1bd9`, `863afa5`) confirmed present in `git log --oneline`. The disposable `jest.worktree.config.js` is confirmed deleted and was never staged (`git status --short` shows no trace of it in any commit); `.npmrc` remains untracked as required.
