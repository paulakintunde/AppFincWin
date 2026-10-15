---
phase: 5
slug: decide-ui
status: draft
nyquist_compliant: false
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

Per-task IDs are filled from the PLAN files' `<verify>` blocks during execution.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `jest.config.js`: `./src/features/decide/snapshot/` at 100% coverage threshold
- [ ] `src/features/decide/__tests__/helpers/` fixture rows + demo fixture (single source for the SQL seed mirror)
- [ ] expo-notifications jest mock helper
- [ ] pgTAP files for the new Decide tables, the Go-ahead RPC and the extended `apply_patches`
- [ ] `scripts/` check that the demo seed SQL constants match the TS fixture (wired into CI)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Store screenshots 1–3 from the demo account at 402×874, verdict line above the fold | DCU-11 | Real device/emulator rendering | Sign in to the demo account, open the sofa and car checks, capture steps 3 and 4 |
| Wait-and-save reminder fires and the tap reopens the recomputed check | D-10 / DCU-07 | OS notification delivery | Schedule with a near date on an Android device, background the app, tap the notification |
| First verdict within ~60 s for a new user | DCU-10 | Timing on real onboarding | Fresh account, time welcome → first verdict |
| Haptics on verdict reveal and decision commit | UI-SPEC | Physical feedback | Device walkthrough |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
