---
phase: 03
slug: shell
status: open_threats
threats_total: 59
threats_closed: 56
threats_open: 3
asvs_level: 1
block_on: open
created: 2026-10-14
audited_ref: phase/03-shell @ 5fed42f
---

# Phase 03 — Shell: Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Method: every `mitigate` threat was checked against the code at the cited file:line. Plans, summaries and intent were not taken as evidence. Implementation files were not modified.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| npm registry to repo | One new package, expo-blur | Third-party code |
| OS back gesture / accessibility settings to app | Hardware back, predictive back, font scale | Input events, scale factor |
| Auth gate to signed-in routes | `app/_layout.tsx` Stack.Protected, consent redirect, first-account gate | Route access |
| Device storage to entry form | AsyncStorage entry draft (v2 form snapshot) read back into TransactionSheet | Untrusted strings and ids |
| Route params to screens | `/import?entry=`, `/accounts/[id]` | Untrusted strings |
| Cached query data to Home | Phase 2 hooks under RLS feed Home figures | Household financial rows |
| Pull gesture to Supabase | Refetch and replay of paused mutations over the existing client | Queued writes |
| Repo to public GitHub | Acceptance docs committed | Device test notes |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-03-01-01 | Tampering (supply chain) | expo-blur | mitigate | closed | package.json:26 `expo-blur ~57.0.3` (SDK line); package-lock.json:8063-8073 pins 57.0.3 with sha512 integrity, no `hasInstallScript`; package scripts are build/clean/lint/test only; no preinstall/postinstall/prepare in package.json |
| T-03-01-02 | Denial of Service | Android back | mitigate | closed | app.config.ts:32 `predictiveBackGestureEnabled: false` |
| T-03-01-03 | Tampering (engine purity) | eslint boundary | mitigate | closed | eslint.config.js:39 shell element, :56 engine disallows `shell`, :90/:97 `**/shell/**` and `@/shell/*` in no-restricted-imports; .dependency-cruiser.cjs:5-16 backstop |
| T-03-02-01 | Information Disclosure | history hrefs | accept | closed | Accepted risk log AR-01; history is React state in BackHistoryProvider.tsx:47, never persisted or logged |
| T-03-02-02 | Denial of Service | history growth | mitigate | closed | backHistoryReducer.ts:8 `MAX_HISTORY = 8`, :30 `.slice(-MAX_HISTORY)`; tested in backHistoryReducer.test.ts |
| T-03-03-01 | Elevation of Privilege | shouldHideFab | mitigate | closed | shouldHideFab.ts:23-30 requires `signedIn` and empty `hideReasons` (includes 'locked'); shouldHideFab.test.ts:10, :21 |
| T-03-03-02 | Elevation of Privilege | availableTabs | accept | closed | Accepted risk log AR-02 |
| T-03-04-01 | Repudiation (compliance) | shell/Home copy | mitigate | closed | src/shell/__tests__/shellCopy.test.ts:63-69 rejects `/advice|recommend|you should/i` over shell, sheet, refresh, home subtrees |
| T-03-05-01 | Denial of Service | text scaling | mitigate | closed | src/theme/fontScale.ts:12-15 non-finite/<=0 -> 1, clamp to 2 / 1.3 |
| T-03-05-02 | Tampering (engine purity) | eslint .tsx override | mitigate | closed | eslint.config.js: DSG-07 block matches `**/*.tsx` only and `ignores: ['src/engine/**', ...]`; engine `.ts` ban block unchanged |
| T-03-05-03 | Tampering (codemod) | migrate-text-imports.mjs | mitigate | closed | scripts/migrate-text-imports.mjs: regex touches only `import {...} from 'react-native'` lines; `Text as X` aliases pushed to `aliased` and left untouched |
| T-03-06-01 | Tampering (data loss) | Android back with sheet open | mitigate | closed | useAndroidBackHandler.ts:13 BackHandler only calls goBack (never a sheet); Sheet.tsx:268 `onRequestClose={() => requestDismiss('back')}`; Sheet.stack / Sheet.dismissal tests |
| T-03-06-02 | Information Disclosure | back hrefs, sheet ids | accept | closed | Accepted risk log AR-03; sheetStack.ts:56-62 wipe handler present |
| T-03-06-03 | Denial of Service | goBack loop | mitigate | closed | BackHistoryProvider.tsx:79 `for (i < MAX_HISTORY + 1)` |
| T-03-07-01 | Elevation of Privilege | FAB while signed out/locked | mitigate | closed | FabProvider.tsx:52, :102 `signedIn: status === 'signedIn'`; FAB tree mounted only under app/(app)/(tabs)/_layout.tsx |
| T-03-07-02 | Spoofing | stale screen FAB registration | mitigate | closed | FabProvider.tsx:166-175 useFocusEffect cleanup `setScreenFab(null)`. Residual: review IN-04 (cleanup can clear the next screen's config; latent, no callers yet) |
| T-03-08-01 | Elevation of Privilege | hidden tab reachable | accept | closed | Accepted risk log AR-04; app/(app)/(tabs)/ contains only home.tsx, activity.tsx |
| T-03-09-01 | Denial of Service | ghost Modal | mitigate | closed | Sheet.tsx:177 `if (!dismissibleRef.current) return`; :227 drag dismiss gated by `canDragDismiss`; :190-194 one-frame snap-back safety net |
| T-03-09-02 | Tampering (data loss) | dismiss paths | mitigate | closed | Sheet.tsx:176-183 single `requestDismiss`; used by drag :188, back :268/:292/:295, backdrop :283 |
| T-03-09-03 | Information Disclosure | app-switcher snapshot | accept | closed | Accepted risk log AR-05 (deferred to Phase 10, DSG-08) |
| T-03-10-01 | Information Disclosure | avatar initial | accept | closed | Accepted risk log AR-06 |
| T-03-10-02 | Repudiation | sync state hidden | mitigate | **open** | See Open Threats OT-01 |
| T-03-11-01 | Denial of Service | repeated pull | accept | closed | Accepted risk log AR-07; useShellRefresh.ts:49-58 shared in-flight promise |
| T-03-11-02 | Information Disclosure | focus announcement | accept | closed | Accepted risk log AR-08 |
| T-03-12-01 | Elevation of Privilege | unshipped quick actions | mitigate | closed | FabProvider.tsx:109-118 entries built from `availableQuickActions(registered ids)`; quickActions.ts filters to registered only |
| T-03-12-02 | Denial of Service | sibling Modal on iOS | mitigate | closed | FabQuickMenu.tsx:15-18 `closeQuickMenu(); requestAnimationFrame(run)` |
| T-03-13-01 | Elevation of Privilege | shell while signed out | mitigate | closed | app/_layout.tsx:80-84 `Stack.Protected guard={route === 'app'}`; app/(app)/_layout.tsx:39-41 consent Redirect preserved |
| T-03-13-02 | Tampering (regression) | first-account gate | mitigate | closed | app/(app)/(tabs)/_layout.tsx:23-28 gate + Redirect to /setup/account; shellNavigation.test.tsx:198-202 |
| T-03-13-03 | Elevation of Privilege | deep link /decide | mitigate | closed | No decide route file under app/; shellNavigation.test.tsx:131 |
| T-03-13-04 | Denial of Service | edge swipe pops tab root | mitigate | closed | swipeBackGesture.ts:28 NO_SWIPE_BACK includes '(tabs)'; app/(app)/_layout.tsx:55 `gestureEnabled: false`; swipeBackGesture.test.ts:22 |
| T-03-14-01 | Information Disclosure | acceptance doc | mitigate | closed | docs/acceptance/phase-03-shell.md: no email-address pattern and no personal names found |
| T-03-14-02 | Repudiation | unverified device behaviour | mitigate | closed | docs/acceptance/phase-03-shell.md: A1-A16 each carry `Result: PASS` or a recorded FAIL with closure (A7 -> D-40, A9 -> D-41/D-42); I1-I4 recorded as pending Apple enrolment |
| T-03-15-01 | Elevation of Privilege | FAB entry while signed out | mitigate | closed | ShellEntryHost mounted at app/(app)/(tabs)/_layout.tsx:52 (inside Stack.Protected); shouldHideFab signedIn |
| T-03-15-02 | Tampering | import deep link | accept | closed | Accepted risk log AR-09; app/(app)/import.tsx:8-10 `parseEntry`; ShellEntryHost.tsx:23 and QuickActions.tsx:92 pass literal 'you' |
| T-03-16-01 | Tampering (data loss) | edit-sheet dismissal | mitigate | closed | Sheet.tsx:178-181 dirty -> Discard prompt; :198-201 blocked drag asks; only DiscardPrompt onDiscard :344-347 closes. See extra finding EF-02 (CR-02): Repeats sheet Discard does not revert |
| T-03-16-02 | Denial of Service | prompt as sibling Modal | mitigate | closed | Sheet.tsx:340-349 DiscardPrompt rendered inside the sheet container (nested Modal) |
| T-03-17-01 | Tampering (wrong figure) | UNPAID / left | mitigate | closed | src/engine/activity/monthFigures.ts:42-46 excludes transfers/refunds by flag, :57-60/:66-69 unconverted counted not estimated, integer-only; jest.config.js:39-41 100% threshold on engine/activity |
| T-03-17-02 | Tampering (engine purity) | new engine module | mitigate | closed | monthFigures.ts:10 imports only `./status`; lint + depcruise as T-03-01-03 |
| T-03-18-01 | Denial of Service | malformed draft | mitigate | closed | src/engine/entryList/draft.ts:169-188 `parseEntryDraft` try/catch, returns empty on any bad shape; draft.test.ts |
| T-03-18-02 | Tampering | oversized strings | mitigate | closed | draft.ts:11-15 caps, :143-158 bounded checks on every form field. Residual: EF-01 (WR-04) |
| T-03-18-03 | Information Disclosure | draft survives sign-out | mitigate | closed | useEntryDraft.ts:15-17 key `fincwin:entry-draft:v1:{user}:{household}`; wipe.ts:88-94 prefix sweep |
| T-03-19-01 | Repudiation | Undo hidden under sheet | mitigate | closed | Sheet.tsx:353-357 top sheet hosts SheetOverlaySlot; UndoToastHost.tsx:58-59 placement/active |
| T-03-19-02 | Information Disclosure | toast text | accept | closed | Accepted risk log AR-10; undoToast.ts:134-141 wipe handler |
| T-03-19-03 | Denial of Service | two hosts dismissing | mitigate | closed | UndoToastHost.tsx:59 app host inactive while any sheet open; undoToast.ts:105-107 stale id ignored |
| T-03-20-01 | Denial of Service | repeated refresh | mitigate | closed | useShellRefresh.ts:49-58 `if (inFlight.current) return inFlight.current` |
| T-03-20-02 | Tampering | resumed writes | accept | closed | Accepted risk log AR-11; no src/data change in this phase's diff |
| T-03-20-03 | Information Disclosure | toast copy | accept | closed | Accepted risk log AR-12; useShellRefresh.ts:28 catalogue keys only |
| T-03-21-01 | Information Disclosure | month/entry mode after sign-out | mitigate | closed | activityFocus.ts:66-73 and entryHost.ts:42-48 wipe handlers |
| T-03-21-02 | Tampering (wrong unpaid list) | Unpaid filter + projections | mitigate | closed | filters.ts:98 `isUnpaidBill`, :113, :128 `filterProjections`; useActivityViewModel.ts:196; comingUp.ts:23; unpaidFocus.test.tsx:202. Residual: EF-05 (WR-07) |
| T-03-22-01 | Tampering (misleading figure) | This month card | mitigate | **open** | See Open Threats OT-02 |
| T-03-22-02 | Information Disclosure | new server calls | mitigate | closed | useHomeViewModel.ts:6-13 only Phase 2 query hooks; :107-117 same keys; only `import type` from @/db |
| T-03-22-03 | Repudiation (voice) | Home copy | accept | closed | Accepted risk log AR-13; shellCopy.test.ts covers `en.home` |
| T-03-23-01 | Tampering | Pay on projection | mitigate | closed | ComingUpCard.tsx:219-223 Pay rendered only `isRow && row`; projections open ProjectionDetailSheet |
| T-03-23-02 | Tampering | one-tap Mark paid | accept | closed | Accepted risk log AR-14 |
| T-03-23-03 | Tampering | import deep link | accept | closed | Accepted risk log AR-09 |
| T-03-23-04 | Information Disclosure | names/amounts on Home | accept | closed | Accepted risk log AR-15; no logging added in phase diff |
| T-03-24-01 | Tampering | restored draft ids | mitigate | closed | src/features/record/entry/draftForm.ts:34-43 account/toAccount/category/paymentType resolved against loaded sets; TransactionSheet.tsx:273-281. Residual: EF-01 (WR-04) |
| T-03-24-02 | Tampering (data loss) | entry sheet dismissal | mitigate | **open** | See Open Threats OT-03 |
| T-03-24-03 | Information Disclosure | financial text on device | mitigate | closed | Same key/prefix as T-03-18-03; useEntryDraft.ts has no supabase/analytics import (never synced) |

---

## Open Threats

### OT-01 — T-03-10-02: sync problems are not shown on every shell screen (BLOCKER)

Mitigation declared: "SyncProblemLine shows on every shell screen whenever writes are queued, failed or conflicting (D-15)".

Found:
- Home: present. `TabRootScreen.tsx:31-32` renders `<SyncProblemLine />` under the large header.
- **Activity: missing at rest.** `ActivityScreen.tsx:228-230` builds `listHeader` from `chrome.largeHeader` with no `SyncProblemLine`. `useTabRootChrome.tsx:122-126` `largeHeader` does not include it. The only copy is inside `CompactHeader.tsx:75`, which has opacity 0 and is hidden from touch and screen readers until the large title has scrolled away (`useTabRootChrome.tsx:94-102`, `CompactHeader.tsx:38-40`). So at scroll 0 an offline or failed-write state is invisible on Activity. That is exactly the "sync state hidden" condition.
- **Outer screens: missing.** `DetailScreen.tsx:30` contains the line, but no route uses `DetailScreen`. accounts, accounts/[id], categories, category-rules, history, import and setup render no sync line. `useSyncStatus`/`SyncStatusLine` consumers are only `YouScreen.tsx`, `SyncProblemLine.tsx` and `SyncStatusLine.tsx`.
- Device row A15 is recorded PASS. The code does not support that result for Activity at rest, so re-check it on the device.

Fix: render `<SyncProblemLine />` right after `{chrome.largeHeader}` in ActivityScreen's `listHeader`, or put it inside `useTabRootChrome`'s `largeHeader` and drop the duplicate in TabRootScreen. Then either adopt `DetailScreen` for the outer routes, or mount one `SyncProblemLine` in `app/(app)/_layout.tsx` for non-tab routes. Add a component test: Activity at scroll 0 with `{ isOnline: false }` shows the line.

### OT-02 — T-03-22-01: This month card shows a false headline figure (BLOCKER)

Mitigation declared: "All figures come from monthPosition; the component formats only".

Found:
- `ThisMonthCard.tsx:72` `const empty = totals.count === 0;` and `:107` `const figure = empty ? fmt(0) : leftText;`. The component substitutes its own figure for `position.left`. `MonthTotals.count` excludes projections. So a month with no recorded rows but with projected bills shows "£0 left after everything" in muted ink, while `position.left` is negative and UNPAID in the same card shows the bills (review CR-01, confirmed).
- `useHomeViewModel.ts:131` returns `isError`, but nothing in `src/features/home/*.tsx` reads it. A failed read with no cache is shown as a real empty month with £0 and nothing due (review WR-01, confirmed).

Fix: `const empty = totals.count === 0 && position.unpaidCount === 0 && position.unconvertedUnpaid === 0;`, and otherwise always render `position.left`. When `vm.isError`, render a "couldn't load" state in ThisMonthCard and ComingUpCard and hide the headline. Add tests: zero rows plus one projected bill gives a negative headline in danger colour, and the isError state shows no figures.

### OT-03 — T-03-24-02: accidental dismissal of a new entry still loses input (BLOCKER)

Mitigation declared: "New entries keep a draft on every accidental path (D-25)".

Found: the path exists (`TransactionSheet.tsx:289-292` `onAccidentalDismiss` -> `list.keepForm(toDraftForm(state))`), but the snapshot and the restore are lossy (review WR-03, confirmed):
- `DraftForm` (`draft.ts:21-38`) and `toDraftForm` (`draftForm.ts:13-32`) have no `repeats`. A new recurring entry loses its frequency and end on swipe-down, back or backdrop.
- `onRestoreForm` (`TransactionSheet.tsx:273-281`) does not set `origin` or `amountInManual`. The category-guess effect then overwrites a restored hand-picked category, and the transfer prefill overwrites the restored received amount.

Fix: add `repeats` to the v2 form snapshot and validate it in `parseForm` with the existing `parseRepeat`. In `onRestoreForm`, also call `setOrigin(form.categoryId ? 'picked' : 'empty')` and `setAmountInManual(form.amountInText !== '')`. Extend TransactionSheet.draft.test.tsx to cover each of the three fields.

---

## Accepted Risks Log

| ID | Threat | Rationale | Verified in code |
|----|--------|-----------|------------------|
| AR-01 | T-03-02-01 | Back history hrefs may contain record ids; in-memory only, reset on restart and on (app) unmount at sign-out | BackHistoryProvider.tsx:47 React state; no storage/log call |
| AR-02 | T-03-03-02 | Tab availability is a rollout flag, not access control (D-03); data stays behind RLS | availableTabs.ts |
| AR-03 | T-03-06-02 | Sheet ids/back hrefs in memory only | sheetStack.ts:56-62 wipe handler |
| AR-04 | T-03-08-01 | Unshipped tabs have no route file; hiding is rollout, not access control | app/(app)/(tabs)/ lists home, activity only |
| AR-05 | T-03-09-03 | App-switcher privacy snapshot (DSG-08) deferred to Phase 10 per 03-CONTEXT | Not implemented this phase, by design |
| AR-06 | T-03-10-01 | One letter of the user's own name shown to that user | AvatarButton.tsx; nothing logged |
| AR-07 | T-03-11-01 | Repeated pull bounded by shared in-flight promise and RefreshControl | useShellRefresh.ts:49-58 |
| AR-08 | T-03-11-02 | Only the screen title receives focus after refresh | useTabRootChrome.tsx onRefresh -> focus title ref |
| AR-09 | T-03-15-02, T-03-23-03 | Only literal entry 'you' passed; unknown entries mapped to 'you' (T-02-29-01) | app/(app)/import.tsx:8-10 |
| AR-10 | T-03-19-02 | Toast text shown only to the user, never logged | undoToast.ts:134-141 wipe handler |
| AR-11 | T-03-20-02 | resumePausedMutations replays the Phase 1 version-checked, RLS-guarded queue; no new write path | no src/data change in phase diff |
| AR-12 | T-03-20-03 | Fixed catalogue strings | useShellRefresh.ts:28 |
| AR-13 | T-03-22-03 | Declarative catalogue captions, voice test covers home | shellCopy.test.ts:63-69 |
| AR-14 | T-03-23-02 | Reuses useRowActions.pay with undo + toast | ComingUpCard.tsx:223 onPay -> vm.rowActions.pay |
| AR-15 | T-03-23-04 | Same data as Activity/Accounts, read through RLS, not logged | no console/Sentry/PostHog additions in phase diff |

---

## Unregistered Flags

None. None of the 24 summaries has a `## Threat Flags` section.

---

## Extra Findings (beyond the declared register)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| EF-01 | WARNING | WR-04 confirmed. The restored draft's `currency` and `toCurrency` are arbitrary strings (bounded at 12 and 64, the latter uses `DRAFT_ID_MAX`, IN-03). `fromDraftForm` spreads them unvalidated (`draftForm.ts:37-38`). `status: 'skipped'` is accepted (`draft.ts:142`), though the new-entry UI offers only paid/pending (`TransactionSheet.tsx:925-939`). Direction invariants that `withDirection` enforces (transfer: status paid, no category, refund/automatic false) are not re-applied on restore. `paymentTypes` is the union of out and in types, so an in-only type can be restored onto an expense. Server bound: `guard_transaction_currency` (supabase/migrations/20260924000400_transactions.sql:65-81) rejects unknown currency codes, so the worst case is a failed write or a known-but-wrong currency, not arbitrary data. The declared T-03-24-01 mitigation (ids) is present, so this is a residual gap, not an open threat. | In `fromDraftForm`, keep `currency` only if it equals the resolved account's currency or is in the picker's option set, and fall back to the account currency otherwise; do the same for `toCurrency`. Coerce `status === 'skipped'` to `'paid'`. Pass the restored state through `withDirection(state, form.direction, accountCurrency)` so the direction invariants hold. Check `paymentType` against `PAYMENT_TYPES[direction]`. Use `DRAFT_CURRENCY_MAX` for `toCurrency`. |
| EF-02 | WARNING (integrity) | CR-02 confirmed. `RepeatsField.tsx:120-123` applies the count to the parent `value` on every keystroke. Its Sheet's `onDismiss` (`:76`) only closes, so "Discard changes?" -> Discard keeps the new occurrence count, and Save writes a schedule the user was told was discarded. The T-03-16-01 dismissal gate works; the discard semantics at this call site do not. | Snapshot `value` on open and restore it on discard (add an `onDiscard` prop to Sheet distinct from `onDismiss`), or defer applying the count until the sheet closes normally. |
| EF-03 | INFO | WR-05: `Sheet.tsx:187` drag-dismiss `setTimeout` has no handle or unmount cleanup, and backdrop/back stay live for that window, so `onDismiss` can run twice (for example, `keepForm` writes twice). | Hold the timer in a ref, clear it on unmount, and guard with a `dismissingRef`. |
| EF-04 | INFO | WR-08: `app/(app)/import.tsx:18` `router.replace('/activity')` can create a second `(tabs)` instance. That doubles FabProvider/ShellEntryHost, which is a state-integrity issue, not data exposure. | Use `router.dismissTo(ACTIVITY_HREF)`, as YouScreen.tsx:97 does. |
| EF-05 | INFO | WR-07: `filters.ts:254-256` compares native minor units with home-currency bounds when `amountHome` is null, so unconverted JPY/KWD projections can be kept or dropped wrongly under an amount range in the Unpaid list. | When a range is active and `amountHome === null`, exclude the item or flag it as unconverted. Share one helper with `matchesAmountRange`. |
| EF-06 | INFO | Wipe coverage on sign-out: every new module store registers a wipe handler: `sheet-stack` (sheetStack.ts:56), `activity-focus` (activityFocus.ts:66), `entry-host` (entryHost.ts:42), `undo-toast` (undoToast.ts:134). BackHistory, FAB, quick-action and holds state are component state under `app/(app)` and unmount when Stack.Protected flips at sign-out. `tabSlide.ts:6-7` module state holds only a tab id and a boolean (no user data) and is not wiped, which is acceptable. `wipeDeviceData` is called from `signOut.ts:88`. In-app account deletion (purge) is not in this phase, so re-verify the same wipe at the Compliance phase. | None for this phase. |
| EF-07 | INFO | Route params: `/import` `entry` is allow-listed (`import.tsx:8-10`), and `accountId` only pre-selects (RLS list decides). `/accounts/[id]` resolves `id` against the RLS-loaded list (`AccountDetailScreen.tsx:46`). Both routes are unchanged this phase. `useAccountUsage(accountId)` receives the raw param, which is RLS-bound. No new route param was added. | None. |
| EF-08 | INFO | Persisted stored data: no `src/data` or `src/services` change in the phase diff. The only new untrusted stored payload is the v2 draft form (T-03-18-0x, EF-01). | None. |
| EF-09 | INFO | Logging/telemetry: the phase diff adds no `console.*`, Sentry `captureException`/`captureMessage`/`addBreadcrumb`, PostHog or `track(` calls in `src/` or `app/`. | None. |
| EF-10 | INFO | Secrets: `git diff origin/main...HEAD` grep for api key / secret / token / password / sk_live / private key matched only docs, the word `tokens` (design tokens), PasswordPromptSheet identifiers and a test literal `'secret'` typed into a field. No credential was committed. | None. |

---

## Audit Trail

| Date | Auditor | Ref | Result |
|------|---------|-----|--------|
| 2026-10-14 | gsd-security-auditor | phase/03-shell @ 5fed42f | 56/59 closed; 3 open (T-03-10-02, T-03-22-01, T-03-24-02); 2 warnings (EF-01 WR-04, EF-02 CR-02) |
