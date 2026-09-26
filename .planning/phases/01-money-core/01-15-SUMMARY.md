---
phase: 01-money-core
plan: 15
subsystem: app-wiring

tags: [expo-router, root-layout, tanstack-query, sync-status, you-screen, error-reporting]

# Dependency graph
requires:
  - phase: 01-money-core
    provides: "01-12: QueryProvider (src/data/QueryProvider.tsx); 01-09: setFailureReporter (src/data/sync/failedWrites.ts); 01-14: SyncStatusLine (src/ui/SyncStatusLine.tsx), credits.exchangeRateApi/EXCHANGE_RATE_API_URL"
  - phase: 00-foundation
    provides: "00-16: initErrorReporting/captureError (src/services/errors); 00-17: app/_layout.tsx provider tree (SafeAreaProvider > ThemeProvider > AuthProvider > Gate); 00-18: YouScreen (Appearance/Privacy/Connection/Account groups, SettingsGroup)"
provides:
  - "app/_layout.tsx: QueryProvider mounted inside ThemeProvider and around AuthProvider -- the whole signed-in app now restores the persisted TanStack Query cache and replays queued writes on launch (SYN-01, SYN-02)"
  - "app/_layout.tsx: setFailureReporter wired to captureError(area: 'sync') with a scrubbed write-failed:<entity>:<kind>:<code> message -- every permanently failed or conflicting write now reaches error tracking with no amounts/ids/notes (D-19)"
  - "YouScreen: live SyncStatusLine under ConnectionStatus (SYN-06, D-14), a permanent open.er-api credits link at the foot of the screen (D-13), and a __DEV__-only DevSyncProbe row that queues a real foreign-currency test write through the offline queue"
affects: [02-record (Record's Add/Edit screens now run inside a QueryProvider-wrapped app and can rely on the same write queue being live end-to-end), 08-household (Realtime reconciliation builds on the same mounted QueryProvider), 10-system (queue hardening builds on the same failure-reporting wiring)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "QueryProvider is mounted inside ThemeProvider and around AuthProvider, preserving 00-17's exact splash-gating/ReducedMotionConfig/error-reporting-init order -- only the provider nesting changed, not the boot sequence"
    - "setFailureReporter's callback stays a one-line pure translation (entity/kind/code -> Error message) with no payload fields, so 00-16's Sentry beforeSend scrubber is a second, independent layer rather than the only guard against leaking amounts"
    - "YouScreen.test.tsx mocks '@/data/sync/useSyncStatus' directly (matching 01-14's own test) and stubs out DevSyncProbe entirely via jest.mock -- DevSyncProbe's own hook wiring (useAuth/useHouseholdId/useMoneyPrefs/useAccounts/useAddAccount/useAddTransaction) is covered by its own dedicated test file instead, so the screen-level test never needs AuthProvider/QueryClientProvider scaffolding just to satisfy a dev-only row"
    - "DevSyncProbe looks up an existing 'Sync test' account by name before creating one, so repeated presses on a device never duplicate the probe account -- only ever add another queued transaction against it"

key-files:
  created:
    - src/features/you/components/DevSyncProbe.tsx
    - src/features/you/__tests__/DevSyncProbe.test.tsx
  modified:
    - app/_layout.tsx
    - src/features/you/YouScreen.tsx
    - src/features/you/__tests__/YouScreen.test.tsx
    - src/i18n/locales/en.ts
    - src/i18n/copyStatus.ts

key-decisions:
  - "The plan's own note on ErrorArea was already resolved before this plan started: 00-16's Sentry rework (PR #19) had already added 'sync' to the ErrorArea union verbatim, so app/_layout.tsx uses area: 'sync' directly with no substitution needed"
  - "DevSyncProbe is stubbed out (not exercised) in YouScreen.test.tsx via jest.mock, with its own hook-level behavior (create-if-absent vs. reuse-existing account, foreign-currency amount) proven in a dedicated DevSyncProbe.test.tsx instead -- keeps the two test files' concerns cleanly separated and avoids duplicating five hook mocks in a screen test that isn't about the probe"
  - "The credits link uses accessibilityRole='link' (matching RateAttribution.tsx's established pattern exactly) so YouScreen.test.tsx can locate it via getByRole('link') rather than a more brittle text-node press"

requirements-completed: [SYN-06, SYN-01, SYN-02]

# Metrics
duration: ~90min (including full context review of five prior plans' hook/interface contracts before editing)
completed: 2026-09-26
---

# Phase 1 Plan 15: Wire App Root and You Screen Summary

**`QueryProvider` and D-19 failed-write error reporting mounted in the real app root, plus a live sync status line, a permanent open.er-api credit, and a `__DEV__`-only offline-queue test probe on the You screen -- making SYN-01/SYN-02/SYN-06 real and observable on device.**

## Performance

- **Duration:** ~90 min (two `type="auto"` tasks, no checkpoints; most of the time was reading five upstream plans' exact hook/interface signatures before writing so nothing drifted from what 01-12/01-14 actually built)
- **Tasks:** 2/2 completed
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- **`app/_layout.tsx`:** `QueryProvider` now wraps `AuthProvider` inside `ThemeProvider` (`SafeAreaProvider > ThemeProvider > QueryProvider > AuthProvider > Gate`), so the encrypted TanStack Query cache restores and every paused mutation replays before the signed-in app is ever reachable. `setFailureReporter` is registered at module scope, right after `initErrorReporting()`, translating every permanently failed or conflicting write into `captureError(new Error('write-failed:<entity>:<kind>:<code>'), { area: 'sync' })` -- no amounts, ids or notes ever leave the device via this path (T-01-15-01).
- **`YouScreen.tsx`:** `SyncStatusLine` renders directly under `ConnectionStatus` inside the existing Connection `SettingsGroup` (D-14); a permanent `credits.exchangeRateApi` link renders at the foot of the screen as an `accessibilityRole="link"` `Pressable` opening `https://www.exchangerate-api.com` (D-13, mirrors `RateAttribution.tsx`'s established pattern exactly); a `__DEV__`-gated `DevSyncProbe` row sits in the Account section, never present in a release build.
- **`DevSyncProbe.tsx`:** reads `useAuth().user`, `useHouseholdId`, `useMoneyPrefs`, `useAccounts`; on press, reuses an existing `'Sync test'` cash account by name or creates one via `useAddAccount`, then queues a transaction via `useAddTransaction` in whichever of USD/EUR the current home currency is *not*, so the foreign-currency provisional-FX-stamp path is genuinely exercised, not just a same-currency write.
- **`en.ts`/`copyStatus.ts`:** new `dev.syncProbe.label` ('Queue a test entry (dev)') catalogue key, added to `DRAFT_COPY_KEYS`.
- **Tests:** `YouScreen.test.tsx` mocks `@/data/sync/useSyncStatus` (returning offline/3-queued) and asserts `'offline · 3 changes queued'` renders; asserts the credits link renders and pressing it calls `Linking.openURL('https://www.exchangerate-api.com')`; `DevSyncProbe` is stubbed via `jest.mock` so the screen test needs no `AuthProvider`/`QueryClientProvider` scaffolding. A new `DevSyncProbe.test.tsx` proves, with mocked hooks: (1) the label renders, (2) pressing it creates the probe account and queues a transaction when no probe account exists yet, (3) pressing it reuses an existing probe account and only queues the transaction when one already exists.
- Full `npx jest app src/features --runInBand`: 10 suites, 78 tests, all green (one transient 5s-timeout flake seen only under parallel-worker CPU contention on this machine, confirmed non-reproducing both in isolation and under `--runInBand`). `npm run lint` (0 errors, pre-existing unrelated warnings only), `npm run typecheck` (clean), `npm run depcruise` (0 violations, 148 modules) all pass.

## Task Commits

1. **Task 1: Precondition check, QueryProvider mount and failure reporting** -- `1ca272e` (feat)
2. **Task 2: Sync status line, credits and dev sync probe on the You screen** -- `dd79b2c` (feat)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `app/_layout.tsx` -- `QueryProvider` mounted; `setFailureReporter` wired to `captureError(area: 'sync')`
- `src/features/you/YouScreen.tsx` -- `SyncStatusLine`, credits link, `__DEV__`-gated `DevSyncProbe`
- `src/features/you/components/DevSyncProbe.tsx` -- new: dev-only offline-queue test probe
- `src/features/you/__tests__/YouScreen.test.tsx` -- sync-status mock, credits-link test, `DevSyncProbe` stub
- `src/features/you/__tests__/DevSyncProbe.test.tsx` -- new: 3 tests covering label render, create-if-absent, reuse-existing
- `src/i18n/locales/en.ts` -- `dev.syncProbe.label` key, header-comment provenance note
- `src/i18n/copyStatus.ts` -- `dev.syncProbe.label` added to `DRAFT_COPY_KEYS`

## Decisions Made

See `key-decisions` in the frontmatter. In brief: `ErrorArea` already included `'sync'` before this plan started (00-16's PR #19 rework), so no substitution or fallback value was needed; `DevSyncProbe` is stubbed (not exercised) in `YouScreen.test.tsx`, with its own hook-level behavior proven in a dedicated test file instead; the credits link matches `RateAttribution.tsx`'s `accessibilityRole="link"` pattern exactly for consistent, low-brittleness test targeting.

## Deviations from Plan

None. The plan's precondition (00-16/00-17/00-18 SUMMARYs present, `YouScreen.tsx`/`src/services/errors/index.ts` existing) was satisfied, and every interface named in the plan's `<interfaces>` block (`QueryProvider`, `setFailureReporter`, `captureError`, `SyncStatusLine`, `useHouseholdId`, `useMoneyPrefs`, `useAccounts`, `useAddAccount`, `useAddTransaction`, `minorUnits`) matched its actual exported signature exactly -- no code changes were needed in any upstream file, only in this plan's own declared `files_modified` scope.

## Issues Encountered

- One test (`YouScreen.test.tsx`'s first identity test) hit a Jest default 5000ms timeout twice when run as part of the full `app src/features` suite under Jest's default parallel-worker mode, but passed cleanly every time it ran alone or as part of a smaller batch, and passed together with the full suite under `--runInBand`. This is machine-load CPU contention across parallel Jest workers on this sandbox, not a defect in the test or the component; verification was re-run and confirmed green with `--runInBand` before proceeding.

## User Setup Required

None. No external service configuration required -- this plan only wires already-built, already-tested Phase 0/Phase 1 modules together in the app root and the You screen.

## Next Phase Readiness

- Record (Phase 2)'s screens now run inside an app whose root already mounts `QueryProvider` and reports failed writes -- no further app-root wiring is needed for Record's Add/Edit screens to call `useAddTransaction`/`useAddAccount` directly.
- `DevSyncProbe` gives a real, on-device way to exercise the offline queue/replay/sync-status flow before any Record UI ships a real write path -- useful for the device-verification step called out in SYN-02's must-have.
- No blockers for downstream plans.

---
*Phase: 01-money-core*
*Completed: 2026-09-26*

## Self-Check: PASSED

All 7 key files (2 created, 5 modified) confirmed present on disk. Both task commits (`1ca272e`, `dd79b2c`) confirmed present in `git log --oneline --all`.
