---
phase: 00-foundation
plan: 19
subsystem: infra
tags: [android, supabase, posthog, sentry, gitleaks, dependency-register, acceptance]

requires:
  - phase: 00-foundation (00-07..00-18)
    provides: auth, theming, i18n, analytics, error tracking, EAS, welcome/consent/you screens
provides:
  - Phase 0's Android-side acceptance record against the production Supabase project
  - A consolidated dependency register reflecting every service's actual status as of 2026-09-26
  - A re-audited website-audit.md verdict (REMEDIATE -> READY pending two items)
affects: [00-20, 01-16, phase-1-money-core, phase-11-compliance]

tech-stack:
  added: []
  patterns:
    - "Acceptance docs consolidate a plan's live checks under docs/acceptance/, separate from SUMMARY.md"
    - "Docker-based secret scans against a git worktree run against a throwaway clone, since gitleaks cannot resolve a Windows-path worktree .git pointer through a bind mount"

key-files:
  created:
    - docs/acceptance/phase-00-android.md
  modified:
    - docs/dependency-register.md
    - docs/enrolment/website-audit.md

key-decisions:
  - "On-device acceptance ran on a physical Pixel 9 rather than the planned Pixel_8_API_36 emulator, which segfaulted twice on boot on this machine's Intel Iris Xe graphics (GPU and swiftshader paths both failed)"
  - "The stale 'Supabase dev project' register row is marked deferred rather than deleted, recording that quick task 260922-tsn collapsed it into the single production project on 2026-09-22"
  - "Website audit verdict moves from REMEDIATE (9 items) to READY pending two items (D-U-N-S name match, an explicit 'registered in Canada' line) after live re-verification, not from the user's report alone"

patterns-established:
  - "Re-audits of external, user-controlled surfaces (websites) are re-verified live via curl against the original criteria table, not accepted on report alone"

requirements-completed: [ACC-05, ACC-02, ENV-06, ENV-03, ENV-09, ENV-17, ANL-01, FND-07, DSG-03, FND-06]

duration: ~90min
completed: 2026-09-26
---

# Phase 0 Plan 19: Android Acceptance, Register Consolidation Summary

**Phase 0's Android half is proven end to end on a real Pixel 9 against the production Supabase project; the dependency register and website audit are both re-verified live and brought current, with two auto-fixed bugs (consent redirect loop, safe-area/status-bar contrast) found and closed along the way.**

## Performance

- **Duration:** ~90 min (register/audit re-verification, doc authoring, gate re-run)
- **Completed:** 2026-09-26T22:55:00Z
- **Tasks:** 3 (Task 1 auto, Task 2 checkpoint — already approved by the user before this session, Task 3 auto-blocking)
- **Files modified:** 4 (`docs/acceptance/phase-00-android.md` created; `docs/dependency-register.md`, `docs/enrolment/website-audit.md` modified; plus the shared `docs/acceptance/phase-01-money-core.md` touched under 01-16)

## Accomplishments

- Full automated suite re-run green on a fresh `npm ci` in a clean worktree: typecheck, lint, depcruise (engine purity), 73/73 Jest suites (1202 tests), `verify:gates`, `check:ignores`, 24/24 pgTAP files (339 tests) against the local Docker stack, and a Docker gitleaks scan of 320 commits with no leaks.
- Dependency register consolidated from all Phase 0 and Phase 1 SUMMARYs: six services move from `pending` to `provisioned` (Supabase prod, EAS, Google OAuth, Frankfurter, Resend FX-digest, app identifier), one stale row is corrected to `deferred` (Supabase dev project, actually collapsed weeks earlier), and a `gitleaks` row is added.
- `docs/enrolment/website-audit.md` re-audited live against the original 9-finding criteria table: all 6 fails and the "online delivery" partial are confirmed fixed by direct `curl` inspection of both domains' page bodies (not just headers); verdict updated from `REMEDIATE (9 items)` to `READY pending D-U-N-S name match + a "registered in Canada" line`.
- `docs/acceptance/phase-00-android.md` created recording the on-device checklist (steps 1-11) that the user already ran and approved on a Pixel 9, combined in the same session with 01-16 Task 3.

## Task Commits

1. **Task 1 + Task 2 record + Task 3 confirmation** - `f8013f6` (docs)

**Plan metadata:** captured in this SUMMARY's own commit (see final commit)

## Files Created/Modified

- `docs/acceptance/phase-00-android.md` - full checklist (steps 1-11), automated-suite results, register-consolidation notes, and both deviations
- `docs/dependency-register.md` - status refresh across ~14 rows, one new row (gitleaks), one corrected row (Supabase dev project)
- `docs/enrolment/website-audit.md` - "Re-audit — 2026-09-26" section added with a live-verified per-finding table and an updated verdict

## Decisions Made

- Substituted a physical Pixel 9 for the plan's `Pixel_8_API_36` emulator after two boot segfaults; documented as an environment note rather than a deviation requiring a fix, since the plan's actual intent (a working Android device against production) was met, and arguably exceeded (real hardware rather than an emulator).
- Marked the "Supabase dev project" register row `deferred` rather than silently deleting it, since the register's job is an accurate history of what happened (it existed as a plan, was collapsed by a quick task) not just current state.
- Re-verified the website audit live via `curl` rather than accepting the user's remediation report at face value, per this plan's own register-consolidation mandate and the standing "no invented results" rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Consent screen redirect loop ("Maximum update depth exceeded")**
- **Found during:** Task 2, step 3 (consent screen)
- **Issue:** Per-instance `useProfile` state in `(app)/_layout` and `ConsentScreen` raced each other after tapping "Share usage", causing a navigation loop.
- **Fix:** Shared one profile row across consumers via the TanStack Query cache.
- **Files modified:** `src/features/consent/useConsent.ts`, `src/features/consent/ConsentScreen.tsx`, `src/features/you/useProfile.ts`, plus tests.
- **Verification:** Re-ran on device — PASS. Regression test added (`useConsent.test.tsx`).
- **Committed in:** PR #28 (merged before this session; commits `2d32e4f`, `78ab7f2`, `e3a504c`, `bbe294b`).

**2. [Rule 1 - Bug] Safe-area insets and status-bar contrast (DSG-03)**
- **Found during:** Task 2, step 7 (safe areas)
- **Issue:** Scrolled content drew under the status bar; status-bar icons were light-on-light.
- **Fix:** Top-inset scroll band on `Screen`, dark status-bar style — JS-only.
- **Files modified:** `src/ui/Screen.tsx`, app-level status-bar config.
- **Verification:** Re-verified on the Pixel 9 — PASS.
- **Committed in:** PR #29 (`fix/status-bar-safe-area`, merged before this session).

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs), both found live on device and closed before Task 2 was approved.
**Impact on plan:** Both were necessary for this plan's own acceptance criteria (ANL-01, DSG-03) to pass. No scope creep.

## Issues Encountered

- `Pixel_8_API_36` AVD would not boot on this machine (Intel Iris Xe: GPU and `swiftshader` paths both segfaulted). Resolved by using a physical Pixel 9 for the entire on-device session instead. Environment limitation, not a product defect.
- Docker's bind mount could not resolve this git worktree's Windows-path `.git` pointer file when running the gitleaks scan directly against the worktree. Resolved by cloning the worktree to a self-contained repo in the session scratchpad, scanning that, then deleting it.

## User Setup Required

None — no external service configuration required in this plan. Apple Developer Program enrolment, Google Play Console registration and the D-U-N-S number remain externally blocked and are tracked in the register, not actionable here.

## Next Phase Readiness

- Phase 0's Android surface is fully accepted: auth, theming, consent/analytics, safe areas, version gating and sign-out all confirmed on a real device against production.
- **Phase 0 is not complete.** `00-20-PLAN.md` (iOS: Sign in with Apple config, first EAS iOS build on the iPhone XR) stays blocked on Apple Developer Program enrolment, itself blocked on the D-U-N-S number (requested 2026-09-15, ETA 2026-10-13).
- The dependency register and website audit are both current as of 2026-09-26 and ready to support the Apple enrolment submission once the D-U-N-S issues.

---
*Phase: 00-foundation*
*Completed: 2026-09-26*
