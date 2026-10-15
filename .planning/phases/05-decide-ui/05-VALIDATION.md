---
phase: 5
slug: decide-ui
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-15
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `05-RESEARCH.md` § Validation Architecture.
> Execution is blocked until Phase 4 (decide-engine) is executed and verified.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest ~29.7.0 + jest-expo ~57.0.5 + @testing-library/react-native ^14 + fast-check ^4.10; pgTAP via `supabase test db` (local only) |
| **Config file** | `jest.config.js` (per-folder coverage thresholds), `jest.setup.ts` |
| **Quick run command** | `npx jest src/features/decide src/data/mutations/__tests__ src/i18n --silent` |
| **Full suite command** | `npm run lint && npm run typecheck && npm run depcruise && npm run check:ignores && npm run test:coverage && npm run lint:migrations && npm run verify:migrations` (plus locally `npx supabase db reset --local && npx supabase test db`) |
| **Estimated runtime** | ~180 seconds (full), ~30 seconds (quick) |

---

## Sampling Rate

- **After every task commit:** quick run command for the touched folder + `npm run typecheck`
- **After every plan wave:** full suite command
- **Before `/gsd-verify-work`:** full suite + `supabase test db` green, plus Android device walkthrough (screenshots at 402×874, reminder fire and tap)
- **Max feedback latency:** 60 seconds

---

## Per-Requirement Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| DCU-01 | parse "car 14500"; cash verdict equals full-check verdict; Credit at 0% labelled "before any interest"; first-read fallback | unit + RNTL | `npx jest src/features/decide/__tests__/quickParse.test.ts src/features/decide/home` | ❌ W0 | ⬜ pending |
| DCU-02 | 5 steps navigate; jump rules (D-08); autosave queued | RNTL | `npx jest src/features/decide/check` | ❌ W0 | ⬜ pending |
| DCU-03 | open check recomputes against a changed snapshot; changed marker | unit + RNTL | `npx jest src/features/decide/home` | ❌ W0 | ⬜ pending |
| DCU-04 | abandon → soft delete + undo step; Undo restores | mutation + pgTAP | `npx jest src/data/mutations/__tests__`; `npx supabase test db` | ❌ W0 | ⬜ pending |
| DCU-05/06 | four rows; suppressed row shows "—" + reason for every SuppressionCode | RNTL + exhaustive map | `npx jest src/features/decide/check` | ❌ W0 | ⬜ pending |
| DCU-07 | Go ahead writes rows/series/debt in one undo step (loan series from `Plan.paymentSteps`; investment lump/transfer/monthly writes); estimate vs actual at 30/90 days | mutation + pgTAP + unit | `npx jest src/data/mutations/__tests__ src/features/decide/journal` | ❌ W0 | ⬜ pending |
| DCU-08 | past date refused; offsets +7d/+1m/+3m clamp to month end | unit + RNTL | `npx jest src/features/decide/__tests__/offsets.test.ts src/features/record/entry/pickers` | ❌ W0 / extend | ⬜ pending |
| DCU-09 | no "advice"/"recommend"/"you should" in any `decide.*` key | unit | `npx jest src/i18n` | ❌ W0 / ✅ | ⬜ pending |
| DCU-10 | setup order account → rough → first check → history; first read labelled; basis switches once a full month exists | RNTL + unit | `npx jest src/features/decide/onboarding src/features/record/setup` | ❌ W0 / extend | ⬜ pending |
| DCU-11 | demo fixture: sofa fits, car adjust with ≥2 warnings; SQL seed mirrors fixture | unit (engine-backed) + script | `npx jest src/features/decide/__tests__/demoScenario.test.ts` | ❌ W0 | ⬜ pending |
| ANL-06 | events typed, enums only, fire points | typecheck + unit | `npm run typecheck`; `npx jest src/services/analytics src/features/decide` | ❌ W0 | ⬜ pending |
| snapshot | full-month rule, paid-only, refunds, transfers excluded, series bills, FX-null exclusion, pending one-offs off cash ("a Go-ahead pending purchase lowers the next check's cash"), current 04-05 fields; computeCheck/computeQuick through `decide()`, `none` status and the cash-only skip path | unit (100% threshold) | `npx jest src/features/decide/snapshot` | ❌ W0 | ⬜ pending |
| D-10 | schedule/cancel/reconcile/tap routing with uuid validation | unit (mocked expo-notifications) | `npx jest src/features/decide/notifications` | ❌ W0 | ⬜ pending |
| RLS | new tables isolate users/households; grants; cascade on delete | pgTAP | `npx supabase test db` | ❌ W0 | ⬜ pending |
| D-24 (05-07, 05-12, 05-13, 05-21, 05-30, 05-41) | every open check stacks with the others (open, complete, home-currency, created_at order; drafts and foreign-currency checks counted); toggle off → []; "Fits on its own; not with your other {n} open check(s)" only when combinedDiffers; quick pill at ≥ 2 open checks; the changed marker can flip | unit + RNTL | `npx jest src/features/decide/snapshot/__tests__/stacking.test.ts src/features/decide/snapshot/__tests__/computeCheck.test.ts src/features/decide/check/__tests__/verdictDepth.test.tsx src/features/decide/quick` | ❌ | ⬜ pending |
| D-24 perf (05-12) | ten open checks, home-list chips (non-gating timing smoke, A14) | unit | `npx jest src/features/decide/__tests__/stackPerf.test.ts` | ❌ | ⬜ pending |
| D-25 (05-37, 05-41, 05-42, 05-49) | cushion months and reason (amended "isn’t known yet" wording under 3 full months); edge tag and margins; "default · {n} months" tag | unit + RNTL | `npx jest src/features/decide/copy src/features/decide/check src/features/decide/home` | ❌ | ⬜ pending |
| D-26 (05-35, 05-42) | chartGeometry paths, ticks, marker and scrub index at 100%; chart a11y label = text alternative; no animation; unavailable copy and link; D-59 fact (stacked wording) | unit (100%) + RNTL | `npx jest src/features/decide/charts src/features/decide/check/sections` | ❌ | ⬜ pending |
| D-27 (05-32, 05-38, 05-40, 05-48, 05-06) | decide_changes RLS, grants and undo; builder converts live changes and drops ended ones; the sheet stores YYYY-MM from the local date; Undo on remove | pgTAP + unit + RNTL | `npx supabase test db`; `npx jest src/db/__tests__/decideChanges.test.ts src/data/mutations/__tests__/decideChanges.test.tsx src/features/decide/home` | ❌ | ⬜ pending |
| D-28 (05-36, 05-37, 05-41) | confidence chip on every verdict; reasons sheet rows from engine codes plus one-offs and conversions | unit + RNTL | `npx jest src/features/decide/ui src/features/decide/copy src/features/decide/check` | ❌ | ⬜ pending |
| D-29 (05-32, 05-34, 05-50, 05-06, 05-41) | one_off column, view, grant and undo; key lists and optimistic rows; toggle hidden for transfer and series rows; clone never copies it; builder maps oneOff (never on series or transfer rows); basis row "{n} one-offs left out" | pgTAP + unit + RNTL | `npx supabase test db`; `npx jest src/db/__tests__/transactions.test.ts src/data/mutations src/features/record src/features/decide/snapshot` | ❌ | ⬜ pending |
| D-30 / D-32 / D-33 (05-07, 05-43, 05-44) | promo (deferredInterest false), variable, late fee, income change and prompt categories reach the engine only when typed (property: nothing pre-filled); stress lines; prompts with blank amounts; loss of value has no field | unit + fast-check + RNTL | `npx jest src/features/decide/snapshot/__tests__/checkInputs.test.ts src/features/decide/check/steps` | ❌ | ⬜ pending |
| D-31 (05-07, 05-35, 05-45) | one rate list per check (≤ 3; a legacy projectionReturnText is migrated); four views captioned "not a forecast"; no suggested rate | unit + RNTL | `npx jest src/features/decide/snapshot src/features/decide/check/steps/__tests__/investingInstead.test.tsx` | ❌ | ⬜ pending |
| D-34 (05-32, 05-04, 05-20, 05-19, 05-39, 05-46, 05-47) | the Wait RPC inserts one goal (no duplicate on replay); Remove soft-deletes it in the same undo step; the goal_id guard refuses foreign goals; saved-so-far computed ("Waiting for a rate" on a missing stamp); tag and untag with Undo | pgTAP + unit + RNTL | `npx supabase test db`; `npx jest src/features/decide/journal src/features/decide/past src/data/mutations` | ❌ | ⬜ pending |
| D-35 (05-04, 05-11, 05-20, 05-46) | cooling_off_at = server now() + 48 h only when sent, cleared by undo; two reminder kinds keyed ${kind}:${checkId}; reconcile schedules and cancels both; payload only { checkId, kind }; the observer rejects unknown kinds; toggle only for needs_spreading | pgTAP + unit (mocked) + RNTL | `npx supabase test db`; `npx jest src/features/decide/notifications src/features/decide/check` | ❌ | ⬜ pending |
| D-36 (05-04, 05-05, 05-39, 05-44) | split estimates and link roles stored; attached role by date; per-figure actuals null without a role; fewer than 3 decisions → no note; whole-percent half-up | pgTAP + unit | `npx supabase test db`; `npx jest src/features/decide/journal src/features/decide/check/__tests__/useEstimateBias.test.tsx` | ❌ | ⬜ pending |
| D-37 (05-33, 05-06, 05-07, 05-09, 05-13, 05-15, 05-49) | custom-aware latest conversion; displayRate bigint-only; a missing needed rate → unconverted everywhere (no engine call, no figure); past lines keep their stamps; depcruise keeps fxResolve unreachable | unit (100%) + RNTL + static | `npx jest src/data/queries/__tests__/fxConvert.test.ts src/features/decide/snapshot src/features/decide/quick src/features/decide/check`; `npm run depcruise` | ❌ | ⬜ pending |
| D-48 / investment monthly (05-04, 05-20, 05-06) | every promo payment run is a written payment link and counts once; an investment monthly series counts as investing | pgTAP + unit | `npx supabase test db`; `npx jest src/features/decide/snapshot src/data/mutations/__tests__/decideGoAhead.test.tsx` | ❌ | ⬜ pending |
| DCU-09 depth (05-31, 05-37) | depth keys pass the banned list incl. invest now / start investing / best rate / you will earn; "forecast" only as "not a forecast"; interpolated output checked | unit | `npx jest src/i18n src/features/decide/copy` | ❌ | ⬜ pending |
| DCU-11 depth (05-18) | 6 full steady months (Strong basis); sofa standalone fits with combine off; car combined adjust equals standalone; no basis code, edge flag, D-59 fact or worst-month difference | unit (engine-backed) | `npx jest src/features/decide/__tests__/demoScenario.test.ts` | ❌ | ⬜ pending |
| D-35 bought recalculation (05-52) | a bought check is recalculated with its own written rows, series, occurrences, debt and payment links removed (replaced series restored, paid writes added back to balances); the hook feeds 05-29's read-only step 3 and the cooling-off landing | unit (100%) + RNTL | `npx jest src/features/decide/snapshot/__tests__/withoutCheckWrites.test.ts src/features/decide/check/__tests__/useBoughtCheckComputation.test.tsx` | ❌ | ⬜ pending |
| Card debt service (05-06, 05-15, 05-20) | a stored card minimum pays the card balance once; a pay-in-full card adds no payment (meta.cardsWithoutMinimum); Assumptions names 'Card payments' only while a card owes a balance with no stored minimum; a card paid over months writes payment series, paid in full writes none | unit + RNTL | `npx jest src/features/decide/snapshot/__tests__/buildSnapshot.test.ts -t "card"`; `npx jest src/features/decide/check/sections/__tests__/tableSections.test.tsx -t "a card with no minimum is named in assumptions"`; `npx jest src/data/mutations/__tests__/decideGoAhead.test.tsx -t "card"` | ❌ | ⬜ pending |
| D-10 / D-35 reopen (05-21) | reconcile leaves out a decided check reopened by a live check, so its reminders never return | RNTL | `npx jest src/features/decide/home/__tests__/DecideHomeScreen.test.tsx -t "reconcile leaves out a reopened decision"` | ❌ | ⬜ pending |

Per-task IDs are filled from the PLAN files' `<verify>` blocks during execution.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `jest.config.js`: `./src/features/decide/snapshot/` at 100% coverage threshold
- [ ] `src/features/decide/__tests__/helpers/` fixture rows + demo fixture (single source for the SQL seed mirror)
- [ ] expo-notifications jest mock helper
- [ ] pgTAP files for the new Decide tables, the Go-ahead RPC and the extended `apply_patches`
- [ ] `scripts/` check that the demo seed SQL constants match the TS fixture (wired into CI)
- [ ] Part 2: `jest.config.js` 100% threshold for `./src/features/decide/charts/chartGeometry.ts` (05-35); `src/data/queries/fxConvert.ts` at 100% branches (05-33)
- [ ] Part 2: pgTAP 58_decide_depth_tables and 59_record_one_off_goal_tag (05-32); 55 and 56 extended for the depth allow-list, roles, cooling-off and the Wait goal (05-04)
- [ ] Part 2: the notifications mock returns a second scheduled id for the cooling-off kind (05-11)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Store screenshots 1–3 from the demo account at 402×874, verdict line above the fold | DCU-11 | Real device/emulator rendering | Sign in to the demo account, open the sofa and car checks, capture steps 3 and 4 |
| Wait-and-save reminder fires and the tap reopens the recomputed check | D-10 / DCU-07 | OS notification delivery | Schedule with a near date on an Android device, background the app, tap the notification |
| Cooling-off reminder about 48 h after commit, no amount or name, opens the check | D-35 | OS notification delivery | 05-26 Task 3 step 9 |
| Cash-path chart draws, scrubs, reads as one image under TalkBack, no animation with Remove animations | D-26 | Device rendering and accessibility | 05-26 Task 3 step 6 |
| Frames 1–3 with the depth surfaces: sofa combine off, Strong basis, no basis row or edge tag | DCU-11, D-24, D-28 | Real rendering | 05-26 Task 2 steps 3–4 |
| One-off toggle, goal tagging, changes coming up on device | D-29, D-34, D-27 | End to end on device | 05-26 Task 3 steps 10–12 |
| First verdict within ~60 s for a new user | DCU-10 | Timing on real onboarding | Fresh account, time welcome → first verdict |
| Haptics on verdict reveal and decision commit | UI-SPEC | Physical feedback | Device walkthrough |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (mapped to plans; not yet executed, so `wave_0_complete: false`)
- [x] No watch-mode flags
- [ ] Feedback latency < 60s (the quick run is ~30 s; the full suite is ~180 s and runs per wave, not per task; confirm on execution)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** planned 2026-10-15 (execution blocked on Phase 4)
