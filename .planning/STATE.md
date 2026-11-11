---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 6 UI-SPEC approved; next /gsd-plan-phase 6. 05.4 merged; 05.4-43 and 05.4-45 on main (D-182)
last_updated: "2026-11-11T20:10:18.502Z"
last_activity: 2026-11-11
progress:
  total_phases: 29
  completed_phases: 12
  total_plans: 639
  completed_plans: 613
  percent: 96
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-21)

**Core value:** The Decide tab must give a trustworthy answer — a verdict computed from the user's own logged months, not a survey.
**Current focus:** Phase 06 — grow

## Current Position

Phase: 06.1 (Decide screens from the prototype) — EXECUTING. Wave 1 done 2026-11-10 (01-07, 41, 42; 9/42) on branch feat/06.1-decide-screens in C:/dev/fincwin-ds, built on the plans branch (PR #99). Plan 08 (wave 2) is the D-30 gate: it waits for Grow 06-05, 06-06 and 06-10 on main. Wave 1 notes for later plans: purpose stays the engine's Purpose type (need = necessity, want = nice_to_have); sayResult deps need `today` and `names.figure`; old Decide paths are shims marked for removal by 06.1-36.
Phase: 06 (grow) — COMPLETE 2026-11-11, 37/37 plans. Code review: 73 findings fixed (06-REVIEW-FIX.md). VERIFICATION passed 10/10 (Create from Decide deferred by owner override). Owner device check approved; the goal/debt 'removed' flash fixed and owner-confirmed. Migrations through 20261110000200 in production. Full jest 991 suites / 40,030 tests pass. PR #101 on feat/06-grow (C:/dev/fincwin-g6). Follow-ups: GL-04 lock-or-leave prompt, Create from Decide button, 06-REVIEW-FIX.md items 2-5, owner observations after merge.
Phase: 05.3 (decide-screens-v3) — STOPPED 2026-11-01 (fix plan Theme N, BO-01). Branch phase/05.3-decide-screens-v3 is pushed and parked (518 commits ahead of main), never merged. Its engine and plumbing changes are harvested in 05.4 (BO-02, BO-03); the screens are not reused (BO-09).
Phase: 05.2 (decide-data-and-setup) — COMPLETE 2026-10-29, 75/75 plans. VERIFICATION passed; code review CR/WR fixed in 69-75. Owner signed off after the round-3 Pixel re-check and TalkBack pass (05.2-WALKTHROUGH-FINDINGS.md). Migrations through 20261028001400 in production. N-05 moved to 05.3 D-15. DECIDE_V3 and DECIDE_OPEN stay false. Merged to main as PR #86 (2026-10-29). in C:/dev/fincwin-p5.
Phase: 05.1 (decide-engine-v3) — COMPLETE 2026-10-27
Plan: 4 of 22
Phase 00 (foundation): 18/20 plans. 00-07 (Apple/Play org enrolment) waits on the D-U-N-S number (ETA 2026-10-13); 00-20 (Sign in with Apple, first iOS build) waits on Apple enrolment. Code review and security audit done; phase verification runs once 00-07 and 00-20 land.
Phase 01 (money-core): COMPLETE 2026-09-26 — 16/16 plans, 01-VERIFICATION.md 20/20 requirements, status human_needed (3 items in 01-HUMAN-UAT.md).
Phase 02 (record): COMPLETE 2026-10-09 — 50/50 plans (40 original + gap closure 02-41..02-50, on-demand FX live in production), 02-VERIFICATION.md status human_needed (2 items in 02-HUMAN-UAT.md: iOS file picker, home-currency switch).
Phase 02.1 (PDF statement import): COMPLETE 2026-10-11 — 17/17 plans (PR #60 main 22f8f57, walkthrough fixes PR #62 main ef8bbfa), production at 20261011000300 with read-pdf-statement and purge-statement-uploads deployed, preview APK d7f35c19; 02.1-VERIFICATION.md 5/5 criteria, IMP-01..IMP-05 satisfied, status human_needed (1 item in 02.1-HUMAN-UAT.md: iOS walkthrough; privacy paragraph published 2026-10-11). Phase 02.2 (record-polish): COMPLETE 2026-10-10 — 35/35 plans, 02.2-VERIFICATION.md 8/8 criteria and 20/20 requirements (ACT-06..ACT-18, REC-19..REC-25), status human_needed (1 item in 02.2-HUMAN-UAT.md: iOS walkthrough, blocked on Apple enrolment). Phase 02.3 (record follow-ups): planned 2026-10-12 — 20 plans in 5 waves, checker passed (1 revision); next /gsd-execute-phase 02.3. Phase 03 (shell): planned (16 plans); check against 02.2 before executing (see Blockers). Phase 04 (decide-engine): replanned 2026-10-15 against D-23..D-58 (engine depth expansion D-41..D-58 plus the user's consistency amendments to D-41/D-42/D-24-D-44) — 22 plans in 8 waves (04-01..04-04 unchanged, 04-05..04-13 amended, new 04-14..04-22), research addendum for D-58 thresholds and D-57 reference tables appended to 04-RESEARCH.md, plan checker passed (3 iterations, 0 blockers), decision coverage 35/35 plus D-41..D-58 verified by script; judgment calls in 04-REPLAN-NOTES.md ; user decisions D-59 (cash_dip only when the purchase lowers the 90-day low; cash_tight_before_payday fact) and D-60 (confirmed weekly/fortnightly pay smoothed for CV and income averages) folded in, re-check passed (3 iterations, 0 blockers); open for user review: D-60 partial-month reading and cash_path margin definition (04-REPLAN-NOTES); EXECUTED 2026-10-16 — 22/22 plans on branch phase/04-decide-engine; 04-VERIFICATION.md 6/6 success criteria, DEC-01..DEC-37 complete; code review 14 findings (4 high, 5 medium, 5 low) all fixed with regression tests (D-64 level payment rounds up); engine/decide and engine/payoff at 100% coverage; golden parity holds.
Phase 05 (decide-ui): planned 2026-10-15, revised 2026-10-16 for the planning-review decisions D-38..D-44, DCU-12..DCU-24 and the final Phase 4 API (D-61..D-63) — 53 plans in 10 waves, plan checker passed (3 iterations, final 0 blockers, 0 warnings); originally against 05-CONTEXT D-01..D-37 (incl. the depth expansion D-24..D-37 and the amended D-24) and the 22-plan Phase 4 `decide()` API; research with a depth addendum, pattern map, VALIDATION.md (nyquist_compliant); plan checker passed after the scope expansion (3 iterations, final 0 blockers; earlier 29-plan set had 2 iterations), decision coverage D-01..D-37 and DCU-01..DCU-11, ANL-06 verified; defaults and items for user review in 05-PLANNING-NOTES.md (OQ1/OQ3 debts table and full-month rule, OQ-A1 FX stamps, OQ-A2/A3/A9 UI-SPEC touch-ups, card minimum gap R4-W2, A19/A21). Execution unblocked once the Phase 4 PR merges; migrations ship via the human-gated `npm run supabase:db:push` in 05-25.
Walkthrough (2026-10-10): Phase 02.2 Android device walkthrough Parts A–D approved, with exceptions fixed by quick task 261010-i7u (calendar wrap/highlight/scroll, swipe labels, Android sheet keyboard, amber cap toast, archive confirm button, EUR home-currency rate check). Part E (sign-out/sign-in) is pending and needs an Expo restart. The sign-in account chooser was requested (ACC-14, Phase 02.3 with REC-26 and REC-27).
Status: Ready to execute
Last activity: 2026-11-11

## Performance Metrics

**Velocity:**

- Total plans completed: 95
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 3 | 38 | - | - |
| 03.1 | 15 | - | - |
| 04 | 22 | - | - |

**Recent Trend:**

- Last 5 plans: none yet
- Trend: -

*Updated after each plan completion*
| Phase 00 P10 | 30min | 2 tasks | 8 files |
| Phase 00 P11 | 35min | 3 tasks | 18 files |
| Phase 00 P12 | 15min | 2 tasks | 6 files |
| Phase 00 P09 | ~40min | 3 tasks | 8 files |
| Phase 00 P08 | 25min | 2 tasks | 2 files |
| Phase 00 P04 | 55min | 2 tasks | 1 files |
| Phase 00 P13 | 25min | 3 tasks | 6 files |
| Phase 01 P13 | 50min | 2 tasks | 12 files |
| Phase 00 P14 | 55min | 2 tasks | 4 files |
| Phase 00 P15 | 120min | 3 tasks | 12 files |
| Phase 00 P17 | ~2h | 3 tasks | 18 files |
| Phase 00-foundation P18 | ~2h | 3 tasks | 17 files |
| Phase 01 P15 | 90min | 2 tasks | 7 files |
| Phase 00 P19 | 90min | 3 tasks | 6 files |
| Phase 01 P16 | 3h | 3 tasks | 3 files |
| Phase 05 P17 | 25m | 2 tasks | 6 files |

## Accumulated Context

### Roadmap Evolution

- Phase 2.1 inserted after Phase 2: PDF statement import: text PDFs, generic parser with balance reconciliation, server worker and privacy decision (split from Record's import extension, 2026-09-25)
- Phase 2.2 inserted 2026-10-07: Record polish (prototype depth for Activity and Record, ACT-06..18, REC-19..25). Runs before 2.1 because it changes the import commit path (decided 2026-10-09).
- Phase 03.1 inserted after Phase 3: Activity header redesign (approved proposal 2026-10-15)
- Phase 05.1 inserted after Phase 5: Decide engine v3 (owner Decision Research, 2026-10-25)
- Phase 05.2 inserted after Phase 05.1: Decide data and setup
- Phase 05.3 inserted after Phase 05.2: Decide screens v3
- Phase 05.4 inserted after Phase 05.3: Decide safety patch (approved Decide fix plan, 2026-11-01; .planning/research/DECIDE-FIX-PLAN.md)
- Phase 05.5 inserted after Phase 05.4: One shared money model
- Phase 08.1 inserted after Phase 8: Decide rebuild on real data (full cost with tax and running costs; Variant C chosen 2026-11-01)
- Phase 08.2 inserted after Phase 08.1: Decide re-audit
- Phases 6 and 8 amended and Phase 7 moved after 08.2 by the same plan
- Phase 06.1 inserted after Phase 6: Decide screens from the prototype (owner 2026-11-06: plan now, build after Grow wave 1; clickable prototype is the design standard)

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [05.4 merge, 2026-11-06, D-182]: Owner 2026-11-06: merge 05.4 now; 43 and 45 run on main after the merge. 05.4-43 (raise the mutation score to 90% and lock it, prove pending/knownRed empty) and 05.4-45 (three consecutive green nightly runs) are a follow-up on main; after the merge Decide is turned on for all testers with the v3 engine (separate task).
- [Decide visibility, 2026-11-02]: Decide stays off for everyone, testers included, until the Variant C screens are built in 08.1 (fix plan BO-08). From 08.1 only named testers see it, behind the per-account switch and the BO-06 release check; the public gets it after 08.2. The closed beta (question 11) is retired. Until then the `profiles.decide_v3` flag is on only for accounts on the repo tester list (account IDs: the owner's accounts plus each tester the owner names; 05.4 D-29, D-30), and stays off until 08.1; shadow runs use the separate server-only `profiles.decide_shadow` flag (05.4-30, BO-08). 05.4 closes today's gap where a flagged account can open the 05.2 setup page and engine readout. Reading-test round 1 is about 5 people on Variant C (owner, 2026-11-02).
- [Decide design, 2026-11-01]: the owner chose Variant C ("Decide redesign: three variants" canvas, 40 screens) as the Decide design; Variants A and B are retired and the A+B blend is dropped. Reading-test round 1 runs on Variant C alone (about 5 people) to find what confuses people; findings are fixed, then the screens are frozen (QA-01). Grow stays out of the Decide reading test. Quick task 261101-jee.
- Roadmap: Supabase provisioning, Apple/Google auth and household-of-one RLS moved into Phase 0 (Foundation) rather than Household — every phase from Record onward is hard-blocked on an authenticated, RLS-protected Supabase connection since local-first was rejected
- Roadmap: Decide engine (Phase 4) has zero data-layer dependency by design and is flagged as parallel-eligible with Phases 1-3 (Money Core, Record, Shell)
- Roadmap: Design Fidelity requirements (DSG-01 to DSG-04) filed under Foundation as standards established day one; DSG-05 (no on-device-storage claims in copy) filed under Compliance & Release since it feeds the App Privacy questionnaire's accuracy
- Roadmap: Offline & Sync split across two phases — basic browse/edit/queue-indicator (SYN-01, SYN-02, SYN-06) in Money Core; hardening (idempotency, force-quit durability, bounded growth — SYN-03, SYN-04, SYN-05) in System
- [Phase ?]: 00-10: checkConnection falls back to the real Supabase client via a lazy dynamic import rather than a static default-parameter reference, so unit tests never trigger client.ts's eager getEnv() call
- [Phase 00]: 00-11: Space Grotesk and IBM Plex Sans font pairings map weight 800 to their heaviest available face (700), since neither ships an 800 weight
- [Phase 00]: 00-11: all four font pairings load at boot via one useFonts() call, so live switching has no async gap and no reload
- [Phase 00]: 00-11: ThemeProvider persists accent/pairing via a ready-gated effect rather than inside each setter, so cache hydration and cache writes can never race on cold boot
- [Phase 00]: 00-12: i18next 26 renamed initImmediate to initAsync; src/i18n/index.ts uses initAsync: false for synchronous catalogue init (verified against installed package types, not assumed from the plan text)
- [Phase 00]: 00-12: DRAFT_COPY_KEYS scoped to exactly consent.*/you.*/signOut.*/update.* per the plan's literal action list, not the wider auth.* set UI-SPEC's Copywriting Contract also frames as Claude-drafted
- [Phase 00]: 00-09: fx_rates.source check whitelists 'open-er-api' up front alongside 'frankfurter-v2' so Money Core's MON-12 fallback needs no constraint migration of its own
- [Phase 00]: 00-09: Task 3's production push/deploy/vault-write was executed by the orchestrator, not the plan executor, after the sandbox's Bash classifier blocked production-deploy commands for the executor agent; the user explicitly authorized the orchestrator to run it on their behalf, and reported results back verbatim
- [Phase 00]: 00-08: CI workflow proven green (run 35890330292) but branch protection deferred — GitHub Free plan on a private repo 403s the required-status-checks API; user accepted CI-advisory-only rather than upgrading to Pro or making the repo public
- [Phase 00]: 00-08: gitleaks pinned to v8.30.1 (verified latest v8 tag at execution time), not the plan's v8.28.0 placeholder; npm ci runs with --legacy-peer-deps in CI to match the locally installed dependency graph
- [Phase 00]: 00-04: expo run:android --device expects the AVD/device name, not the adb serial (--device Pixel_8_API_36, not emulator-5554); use adb -s <serial> emu avd name to look it up when multiple devices are attached
- [Phase 00]: 00-04: adb shell screencap/screenrecord return blank/black frames on this machine's WHPX-accelerated AVD regardless of capture method; use adb shell uiautomator dump (accessibility tree) plus logcat's ReactNativeJS Running main as the verification fallback
- [Phase 00-foundation]: 00-13: first POSTHOG_PERSONAL_API_KEY pasted was a phs_ project secret key, not a phx_ personal API key -- returned HTTP 401 from the PostHog EU projects endpoint until replaced with the correct phx_ key, which verified with HTTP 200
- [Phase 00-foundation]: 00-13: analytics service keeps its own independent enabled boolean in front of every PostHog capture() call, not relying solely on the SDK's own defaultOptIn/optOut state, so an SDK-level consent bug still cannot leak an event
- [Phase 01]: 01-13: a code shorter than 2 chars always classifies as code-missing, never code-invalid, to distinguish nothing-typed-yet from something-typed-wrong
- [Phase 01]: 01-13: profile money-preference writes (db/profile.ts, mutations/moneyPrefs.ts) are deliberately not version-conditional -- a settings row is a user's own, never contended, unlike a D-18 shared record
- [Phase 01]: 01-13: useAddCustomCurrency derives its validation context from useCurrencyOptions/the cached custom list only when the caller omits ctx, so Record's add-currency sheet can call add(input) with no boilerplate
- [Phase 02]: discuss follow-up (2026-09-25): "Tax" stays a seeded starter category as a plain label for money already paid. The Out of Scope item is clarified to mean tax calculation, flags and reports only
- [Phase 02]: discuss follow-up (2026-09-25): ENV-16 (production backups) moved from Phase 2 to Phase 10, method TBD, likely AWS
- [Phase 00-foundation]: 00-14: EXPO_PUBLIC_APP_ENV takes each EAS environment's own name (development/preview/production) rather than one shared value for development+preview
- [Phase 00-foundation]: 00-14: committed .npmrc (legacy-peer-deps=true) so EAS cloud npm ci resolves peer deps the same way CI (00-08) already does
- [Phase 00-foundation]: 00-14: Android keystore SHA-1 was extracted from the built APK via apksigner rather than eas credentials -p android, which is interactive-only and this sandbox has no controllable TTY
- [Phase 00-foundation]: 00-15: Google client-id verification uses the Web client ID as the primary audience with iOS/Android as additional accepted client IDs, matching google.ts's webClientId-as-serverClientId configuration
- [Phase 00-foundation]: 00-15: Supabase's external_google_additional_client_ids Management API field merges into external_google_client_id at write time and always reads back empty on GET -- verified live, not assumed; re-PATCH the full list on any client-ID change
- [Phase 00-foundation]: 00-17: Google's live sign-in button asset was redesigned since the brief (a masked gradient-blob G, not a flat four-colour one); the react-native-svg filter+mask reproduction passed Jest but rendered nothing on a real Android device, so GoogleMark uses Google's own official pre-rasterised PNG mark instead
- [Phase 00-foundation]: 00-17: app/index.tsx reads the root layout's already-resolved route via a RouteContext rather than re-running useMinVersionGate()/useAuth() itself, avoiding a duplicate version-gate network call and a possible blank-screen flash on cold boot
- [Phase 00-foundation]: 00-18: useConsent also exposes the underlying profile loading state and folds it into needsPrompt (!loading && consent === null), so the (app) layout never misreads a still-fetching profile as needing the D-17 prompt and briefly redirects an already-answered user back to /consent
- [Phase 00-foundation]: 00-18: signOut.ts resolves the real Supabase client via a lazy dynamic import (mirrors 00-10's connection.ts), never a static top-level import, so importing signOut.ts never requires Supabase env vars under Jest
- [Phase 00-foundation]: 00-18: AccentSwitcher/FontPairingSwitcher are driven by the live theme (theme.accent/theme.pairing), not the persisted profile row, so a press is visible in the same render tree before the Supabase write resolves (FND-06)
- [Phase 01]: 01-15: DevSyncProbe is stubbed in YouScreen.test.tsx via jest.mock; its own hook wiring (create-if-absent vs reuse-existing account, foreign-currency amount) is proven in a dedicated DevSyncProbe.test.tsx instead
- [Phase 01]: 01-15: app/_layout.tsx's setFailureReporter uses area: 'sync' directly -- ErrorArea already included 'sync' before this plan started (00-16 PR #19 rework), no substitution needed
- [Phase 00]: 00-19: Android acceptance ran on a physical Pixel 9 instead of the planned Pixel_8_API_36 emulator, which segfaulted twice on boot (GPU and swiftshader paths) on this machine's Intel Iris Xe graphics
- [Phase 00]: 00-19: the dependency register's 'Supabase dev project' row is marked deferred rather than deleted -- it was collapsed into the single production project by quick task 260922-tsn on 2026-09-22, and the register should record that history
- [Phase 00]: 00-19: website-audit.md verdict moves from REMEDIATE (9 items) to READY pending two items (D-U-N-S name match, an explicit 'registered in Canada' line) after live curl re-verification of both domains, not from the user's remediation report alone
- [Phase 02.2]: user decisions at plan time (2026-10-09): the recurring detector `detect.ts` is reused unchanged and the offer copy was reworded to match it; the add-month horizon is per household (`households.horizon_month`); refunds count under Money out as a reduction, never as income; category cap usage counts paid and pending lines; the home-currency change is one atomic `change_home_currency` RPC that also converts caps
- [Phase 02.2]: undoing "Add month" rewinds the horizon and `materialised_through` through a server-only path (`undo_log.allow_system_keys`, no client grant); sample data is seeded and cleared by server RPCs so no client can set `is_sample`; a server trigger refuses to soft-delete an account that still has lines or an active series
- [Phase 02.2]: execution ran in manually created per-plan git worktrees, because Claude Code's own worktree isolation refused the c:/C: drive-letter casing; production pushes and EAS builds ran in the main session (the auto-mode classifier blocks them for subagents). The FincWin SUPABASE_ACCESS_TOKEN lives only in C:/dev/fincwin/.env.local (the shell exports another account's token)
- [Phase 01]: 01-16: Task 3's device check ran on the same Pixel 9 session as 00-19 Task 2 (combined for one fresh dev-client rebuild); DSG-06 (locale formatting) is accepted on the existing Hermes unit-test suite rather than a visual check, since no shipped screen renders a formatted amount before Phase 2 (Record)

### Pending Todos

- **Decide test flag in production** — count the accounts with `profiles.decide_v3` on (not yet checked; the auto-mode classifier blocked a read-only production query on 2026-11-02). First step of BO-06 in 05.4.
- **Decide owner decisions** — fix plan section 11, question 10 is open (3, 4 and 5 were answered in 05.4-CONTEXT); question 12 (legal launch countries) is open; the Free vs Pro list is needed by APP-18 (05.5) as well as Phase 9; decide whether to insert the home-buying phase (FIN-30) and 06.1 into ROADMAP.
- **Phase 0 verification** — run the gsd-verifier for Phase 00 once 00-07 and 00-20 have SUMMARY files (triggered by the D-U-N-S number, ETA 2026-10-13, then Apple enrolment).
- **Phase 0 code review fixes** — `00-REVIEW.md`: 2 critical (CR-01 a malformed `min_supported_version` blanks the app for every user; CR-02 the device is only wiped on the sign-out button, not when a session ends another way) and 20 warnings. Run `/gsd-code-review-fix 0`.
- **Phase 0 security** — `00-SECURITY.md`: 2 open, neither high (T-00-01-03 no DMARC on fincwin.com; T-00-03-04 DB password shorter than declared). Add the DMARC record and rotate or accept, then re-run `/gsd-secure-phase 0`. Also: remove leftover `POSTHOG_CLI_*` vars from the EAS preview env and revoke that key; disable the unused Supabase email provider and fix `site_url` (still localhost); purge production test accounts before launch (AR-11 drift).
- **Public repo privacy** — a personal test Gmail address is committed in `docs/acceptance/phase-00-android.md` and `docs/acceptance/phase-01-money-core.md`; the repo is public.
- **Phase 2 human UAT** — 2 items in `02-HUMAN-UAT.md` (iOS statement file picker, pending Apple enrolment; home-currency switch FX fetch). The settings screen now exists (02.2-32, You → Money), so the home-currency item can be checked during the 02.2 walkthrough (criterion 8). A preview build would also need rebuilding (native fingerprint changed again with expo-haptics); the 02.2 walkthrough uses development build e07f9578.
- **Phase 2.1 close-out** — security verified (02.1-SECURITY.md, 99/99 closed); 1 item in `02.1-HUMAN-UAT.md` (iOS walkthrough, pending Apple enrolment; privacy paragraph published 2026-10-11). Review deferrals LO-04, LO-05, IN-02..IN-04 in `02.1-REVIEW.md`.
- **Phase 2.2 close-out** — after the walkthrough: plan 35 Task 3 (VALIDATION sign-off, `nyquist_compliant: true`), then `/gsd-verify-work 02.2` or the phase verifier, `/gsd-secure-phase 02.2` (security enforcement is on and there is no 02.2-SECURITY.md yet), and tick ACT-06..18 / REC-19..25 in REQUIREMENTS.md on verification evidence.
- **Phase 1 human UAT** — 3 items in `01-HUMAN-UAT.md` (region separators on device, RateAttribution mounted by Phase 2, FX hold/ISO list product review).

### Blockers/Concerns

- [Phase 02.1] *(Resolved 2026-10-11: phase complete.)* **Plans revised 2026-10-10 (resolved the post-02.2 staleness).** Migrations re-dated to 20261011000100/200/300, pgTAP 49/50, plans 04/05/09–12 rebased on post-02.2 code, fx-monitor references removed, IMP-05 planned (13–17; conversion_source is a stored generated column, no backfill; D-36 user-accepted limitation for kept mark-paid lines). Rollout plan 12 pushes from merged main with a before/after checksum and ends with the second-phone preview APK.

- [Phase 03] **Shell re-discussed 2026-10-13; re-plan before executing.** 03-CONTEXT.md is updated. Plans 03-01…03-16 predate it. Main changes:
  - **Sheet:** the app keeps its own `Sheet` and adds drag-to-dismiss, with no `@gorhom/bottom-sheet` migration (D-12). It goes through one shared interface, so a single sheet can adopt `@gorhom` later.
  - **Backdrop:** ink at 38% with a 0.18s fade, replacing the black `colors.scrim` (D-23/24).
  - **Dismissal:** the entry sheet keeps a draft on accidental dismissal, and other edited sheets ask "Discard changes?" (D-25…27).
  - **Layering:** sheets stack and close top-first, and toasts draw above sheets (D-16, D-28/29).
  - **Navigation:** details cover the tab bar, back always slides in reverse, and the Android SwipeBack is kept (D-05, D-07, D-22).
  - **Additions:** pull-to-refresh gets a completion toast (D-17), and Home content is new (D-30…32, HOME-01…04).

  Route: `/gsd-plan-phase 3` (targeted revision, following the "Plan impact" section in 03-CONTEXT.md). 03-UI-SPEC lines 112 and 222 also need the backdrop and dismissal changes.

- [Phase 10] ENV-16 moved from Phase 2 on 2026-09-25: production has **no backups** until then (method TBD, likely AWS, e.g. a daily dump to S3). Supabase Pro is no longer assumed, so a Free-plan production project also **pauses after a week with no activity**, taking the live app offline. That needs its own answer (upgrade, keep-alive, or accept) before real users arrive
- [Phase 0] EAS provisioning and credentials from Windows are unproven for this project — trigger the first iOS EAS Build on day one so provisioning surprises surface in week one, not week ten
- [Phase 8] The Realtime reconciliation state machine (no pending write / write still queued / own-write echo / genuine version conflict) is a synthesized design, not a documented Supabase recipe — needs a dedicated two-client offline-mid-edit spike before it is trusted
- [Phase 8] What happens when a household settlement's expiry window lapses unresolved is undefined in the prototype and needs an explicit product decision during this phase
- [Phase 9] Two blocking decisions are still open per PROJECT.md and must resolve before this phase starts: which of the ~50 features are Free vs. Pro, and whether the Coach ships as a real LLM (and on what terms, including a prescriptive-language post-filter)
- [Phase 11] Guideline 3.2.1(viii)'s live wording no longer carries the qualifier the brief assumed — re-verify positioning at this phase rather than treating it as settled; the brief also mis-cites the 36% APR / 60-day loan cap as 3.2.1(viii) when it is actually 3.2.2(ix)
- [PROJECT.md] Passkey implementation path (native WebAuthn + Edge Function vs. Clerk) remains unresolved and deferred out of v1 entirely per current scope — carried as "Out of Scope: Deferred to v1.1" in PROJECT.md, not a Phase 0 task
- ~~[Phase 0] 00-08: branch protection owner bypass~~ — resolved 2026-09-26: `enforce_admins: true`; FND-04/FND-05 marked complete
- ~~[Phase 0] 00-15: second Android Google OAuth client still needs creating~~ — resolved 2026-09-26: both Android clients exist and production Supabase accepts all four Google client IDs (docs/ops/auth-providers.md)

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260922-s7g | Supabase project-selection guardrails | 2026-09-22 | 1342926 | [260922-s7g-supabase-project-selection-guardrails](./quick/260922-s7g-supabase-project-selection-guardrails/) |
| 260922-sml | Correct Supabase details in accounts.md | 2026-09-22 | e591399 | [260922-sml-correct-supabase-details-in-accounts-md](./quick/260922-sml-correct-supabase-details-in-accounts-md/) |
| 260922-sz4 | Repoint Supabase guardrails to single prod project | 2026-09-22 | 99b4142 | [260922-sz4-repoint-supabase-guardrails-to-single-pr](./quick/260922-sz4-repoint-supabase-guardrails-to-single-pr/) |
| 260922-tsn | Collapse phase-00 plans to single prod Supabase project | 2026-09-22 | f90689b | [260922-tsn-collapse-phase-00-plans-to-single-prod-s](./quick/260922-tsn-collapse-phase-00-plans-to-single-prod-s/) |
| 260922-us3 | Align all docs to single prod Supabase project | 2026-09-22 | 07ef5f6 | [260922-us3-align-all-docs-to-single-prod-supabase-p](./quick/260922-us3-align-all-docs-to-single-prod-supabase-p/) |
| 260925-8bi | Replace placeholder app icons with FincWin F logo | 2026-09-25 | 3020470 | [260925-8bi-replace-placeholder-app-icons-with-fincw](./quick/260925-8bi-replace-placeholder-app-icons-with-fincw/) |
| 260926-0mn | Launch positioning into Phase 5, "A · Refine" navy icon, pricing advisory | 2026-09-26 | 414920d | [260926-0mn-launch-positioning-phase5-pricing-adviso](./quick/260926-0mn-launch-positioning-phase5-pricing-adviso/) |
| 261009-mvn | Phase 02.2 follow-ups: home-currency conflict message, More menu action mode, real failed-write entities, leftover worktree folders removed | 2026-10-09 | decaafd | [261009-mvn-phase-02-2-follow-ups-home-currency-conf](./quick/261009-mvn-phase-02-2-follow-ups-home-currency-conf/) |
| 261010-i7u | Phase 02.2 walkthrough fixes: 7-column calendar with activity tile and scroll, one-line swipe labels, Android sheet keyboard, amber cap toast, archive confirm button, EUR home-currency rate check; Phase 02.3 requirements recorded | 2026-10-10 | fd8e9cf | [261010-i7u-02-2-walkthrough-fixes-calendar-swipe-la](./quick/261010-i7u-02-2-walkthrough-fixes-calendar-swipe-la/) |
| 261010-kpe | Amount keypad returns after text fields (explicit active field); Android edge swipe-back on inner screens with slide animation; You → Activity no longer duplicates Activity | 2026-10-10 | 2a77a4d | [261010-kpe-amount-keypad-returns-after-text-fields-](./quick/261010-kpe-amount-keypad-returns-after-text-fields-/) |
| 261011-eio | Import treats a credit/overdraft limit of 0 as no limit (D-49): statement limit offer, profile/convert fallback, prior-limit undo; account sheet saves 0 as no limit | 2026-10-11 | 984300d | [261011-eio-credit-or-overdraft-limit-of-0-counts-as](./quick/261011-eio-credit-or-overdraft-limit-of-0-counts-as/) |
| 261013-izi | Phase 02.3 walkthrough: cross-currency transfer prefills Amount received from stored rates while untouched; dim scrim token behind every sheet, fixed while the sheet slides | 2026-10-13 | 9bf7b56 | [261013-izi-transfer-received-amount-prefill-and-she](./quick/261013-izi-transfer-received-amount-prefill-and-she/) |
| 261013-kf4 | Phase 02.3 walkthrough: Undo toast ("Removed · {name}") when removing an entry-list item; optional local onUndo on the undo toast | 2026-10-13 | 6918c34 | [261013-kf4-local-undo-toast-for-removing-an-entry-l](./quick/261013-kf4-local-undo-toast-for-removing-an-entry-l/) |
| 261013-l8i | EAS build profiles set the expo-updates check through eas.json env (APP_UPDATES_CHECK), not EAS_BUILD_PROFILE, so local and EAS fingerprints match; unblocks preview and production builds broken since 261009-uuw | 2026-10-13 | 51ac7b8 | [261013-l8i-eas-build-profiles-set-the-updates-check](./quick/261013-l8i-eas-build-profiles-set-the-updates-check/) |
| 261025-f46 | Decide "Coming soon" switch: DECIDE_OPEN=false hides today's Decide (tab shows "A better Decide is on its way"; New check, decide/* routes, rough/first-check onboarding and reminder taps off) until v3 | 2026-10-25 | fdb39ea | [261025-f46-decide-coming-soon-switch](./quick/261025-f46-decide-coming-soon-switch/) |
| 261101-fmv | Decide fix plan Theme M: root causes of the fix volume and four owner-approved safeguards (design freeze, right-answer table, cross-check calculator, mutation testing) in 05.4, 08.1 and 08.2 | 2026-11-01 | 1129e791 | [261101-fmv-decide-fix-plan-safeguards](./quick/261101-fmv-decide-fix-plan-safeguards/) |
| 261101-ir4 | Decide fix plan Theme N: build Decide once (05.3 stopped and parked, parts harvest and Variant C engine types in 05.4, six connection points in 05.5, Variant C screens built once in 08.1) | 2026-11-01 | 253737e3 | [261101-ir4-decide-build-once-path](./quick/261101-ir4-decide-build-once-path/) |
| 261101-jh5 | Decide fix plan Theme O: Variant C audit fix IDs, version 1 scope (decision record in v1, home buying its own phase after 08.2, mockup round 4 before reading-test round 1) | 2026-11-01 | c2c828a0 | [261101-jh5-decide-variant-c-scope-and-audit-ids](./quick/261101-jh5-decide-variant-c-scope-and-audit-ids/) |
| 261101-jee | Variant C chosen as the Decide design (A and B retired, blend dropped); reading-test round 1 on Variant C alone before the QA-01 freeze; Grow out of the Decide reading test | 2026-11-01 | 862f3ba6 | [261101-jee-record-variant-c-as-the-chosen-decide-de](./quick/261101-jee-record-variant-c-as-the-chosen-decide-de/) |
| 261101-mxs | Decide Stage 0: PR #90 rebased on #91; docs follow BO-08 (Decide off for everyone, testers included, until 08.1; closed beta retired; test-flag gap closed in 05.4); STATE, ROADMAP and REQUIREMENTS refreshed for Variant C; 05.4 handoff note copied to main | 2026-11-02 | 59de1a80 | [261101-mxs-decide-stage-0-housekeeping](./quick/261101-mxs-decide-stage-0-housekeeping/) |
| 261101-vmi | Engine test pins the unspent roll-forward clamp (unspent.ts:104); fixes the flaky 100% engine coverage gate that failed main and PR #90 | 2026-11-02 | 3416e419 | [261101-vmi-pin-unspent-clamp-coverage](./quick/261101-vmi-pin-unspent-clamp-coverage/) |
| 261106-bf2 | Switch Decide on for testers: DECIDE_OPEN and DECIDE_V3 true, v3 for every account (owner 2026-11-06) | 2026-11-06 | 8096e25a | [261106-bf2-switch-decide-on-for-testers-decide-open](./quick/261106-bf2-switch-decide-on-for-testers-decide-open/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none — first milestone)* | | | |

## Session Continuity

Last session: 2026-11-11T20:10:18.434Z
Stopped at: Phase 6 UI-SPEC approved; next /gsd-plan-phase 6. 05.4 merged; 05.4-43 and 05.4-45 on main (D-182)
Resume file: None
