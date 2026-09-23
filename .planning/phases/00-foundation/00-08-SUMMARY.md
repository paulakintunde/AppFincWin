---
phase: 00-foundation
plan: 08
subsystem: infra
tags: [github-actions, ci, gitleaks, supabase, pgtap, branch-protection]

# Dependency graph
requires:
  - phase: 00-foundation (plan 05)
    provides: lint/typecheck/depcruise/test:coverage/verify:gates/check:ignores npm scripts, the engine-purity and coverage gates these CI jobs run
  - phase: 00-foundation (plan 06)
    provides: supabase/tests/database/*.test.sql pgTAP suite the rls job runs
provides:
  - .github/workflows/ci.yml with three jobs (checks, secret-scan, rls) running on every push to main and every pull request
  - .gitleaks.toml with default rules plus Supabase secret/access-token, service-role-JWT and PostHog personal-key rules, scanning full git history
  - A live, green CI run on GitHub (run 35890330292) covering every Phase 0 gate: lint, typecheck, dependency-cruiser, jest coverage, verify:gates self-test, check:ignores, the ENV-04 service-role grep, gitleaks, and supabase test db (pgTAP)
affects: [every-future-plan-that-adds-a-ci-job, 00-09 (fx-sync parser tests already picked up by jest testMatch), 00-13 (analytics tests already picked up)]

# Tech tracking
tech-stack:
  added:
    - "gitleaks v8.30.1 (pinned exact tag), run via the official ghcr.io/gitleaks/gitleaks Docker image, not gitleaks-action (which needs a paid licence on org-owned repos)"
  patterns:
    - "CI installs with npm ci --legacy-peer-deps, matching how node_modules was installed locally — a plain npm ci fails on this project's peer-dependency graph, confirmed by reproducing the failure in an isolated directory before deciding on the flag"

key-files:
  created:
    - .github/workflows/ci.yml
    - .gitleaks.toml
  modified:
    - .planning/REQUIREMENTS.md (ENV-02, FND-12 marked complete; FND-04/FND-05 left pending with a deviation note)
    - .planning/ROADMAP.md (00-08 checked off with a deviation note; progress table refreshed to 9/20)
    - .planning/STATE.md (new Blockers/Concerns entry for the branch-protection gap)
    - docs/dependency-register.md (new row: GitHub branch protection, pending/deferred)

key-decisions:
  - "npm ci --legacy-peer-deps instead of the plan's bare npm ci: reproduced the failure locally in an isolated copy of package.json/package-lock.json before adding the flag, confirming it's not a CI-environment quirk"
  - "gitleaks pinned to v8.30.1, not the plan's v8.28.0 placeholder: the plan explicitly instructs confirming the latest v8 tag before committing rather than trusting its own number; v8.30.1 was GitHub's latest release as of 2026-09-23 and its ghcr.io image was confirmed to pull and run with the git subcommand"
  - "Branch protection (Task 2, step 3) deferred as a user-accepted deviation: GitHub's classic branch-protection API 403s on private repos under the Free plan ('Upgrade to GitHub Pro or make this repository public'). User chose to stay on the Free plan and keep the repo private rather than upgrade or make it public, accepting CI as advisory-only until the account moves to Pro/Team. Recorded in docs/dependency-register.md and STATE.md, not silently absorbed"
  - "FND-04 and FND-05 left unchecked in REQUIREMENTS.md despite the underlying CI jobs being live and green, because both requirements' intent (per the plan's own must_haves) is a non-bypassable gate, and a merge to main currently cannot be blocked by a failing check. ENV-02 and FND-12 were marked complete because their literal requirement text ('CI fails...', 'CI runs tests proving...') doesn't carry the same non-bypassable qualifier and is fully satisfied by the now-live, proven CI jobs"

patterns-established:
  - "Pattern: before pinning a Docker-image-based CI tool to an exact tag, confirm the tag exists and pulls (docker manifest inspect / a real docker run), not just that it's referenced somewhere — the plan's own v8.28.0 placeholder would have silently worked (older tags stay published) but wouldn't have been the 'latest v8 tag' the plan asked for"
  - "Pattern: when a plan-mandated external action returns a definitive denial (a 403 tied to account/plan tier, not a transient error), stop and surface it with the exact API response and the concrete unblock path, rather than substituting an adjacent mechanism (e.g. GitHub rulesets carry the identical private-repo gate) — the deviation belongs in REQUIREMENTS.md, STATE.md and the dependency register, not absorbed silently"

requirements-completed: [ENV-02, FND-12]

# Metrics
duration: ~25min
completed: 2026-09-23
---

# Phase 00 Plan 08: GitHub Actions CI + Branch Protection Summary

**Three-job GitHub Actions CI workflow (checks, secret-scan, rls) wired to every Phase 0 gate and proven green on a real push to main; branch protection deferred as a user-accepted deviation because the private repo is on GitHub's Free plan.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-09-23
- **Tasks:** 2 (Task 1 auto, Task 2 checkpoint — resumed after user approval, hit a second blocker mid-task, resumed again after user's decision)
- **Files modified:** 2 created (`.github/workflows/ci.yml`, `.gitleaks.toml`), 4 planning/docs files updated

## Accomplishments
- `.github/workflows/ci.yml`: `checks` job (lint, typecheck, depcruise, check:ignores, test:coverage, verify:gates, ENV-04 service-role grep), `secret-scan` job (gitleaks v8.30.1 over full git history via the official Docker image, not the paid-licence-gated Action), `rls` job (`supabase db start` + `supabase test db`) — on every push to `main` and every pull request, with `permissions: contents: read` and a concurrency group that cancels superseded runs
- `.gitleaks.toml`: default ruleset plus four project-specific rules (Supabase secret key, Supabase service-role JWT, Supabase personal access token, PostHog personal API key)
- Pushed 71 commits (all of Phase 0's work to date, including this plan's own commit) to `origin/main` and confirmed CI run `35890330292` green across all three jobs in under 2 minutes total
- Attempted the plan's branch-protection API call exactly as written; it 403'd because `AppFincWin` is private on GitHub's Free plan. Documented the gap as a user-accepted deviation rather than upgrading the account or making the repo public

## Task Commits

1. **Task 1: Write the CI workflow and gitleaks config** — `aeaff09` (feat)
2. **Task 2: Approve the push, confirm CI is green, require the checks on main** — no new source commit (push of pre-existing commits + a GitHub API call). Branch protection itself did not land — see Deviations.

**Plan metadata:** this commit (docs: complete plan) — created alongside this SUMMARY

## Files Created/Modified
- `.github/workflows/ci.yml` — the three-job workflow described above
- `.gitleaks.toml` — default rules + 4 project-specific credential-pattern rules
- `.planning/REQUIREMENTS.md` — `ENV-02`, `FND-12` checked off; `FND-04`/`FND-05` left pending with an explanatory note pointing at this deviation
- `.planning/ROADMAP.md` — `00-08-PLAN.md` checked off with a deviation note; Phase 0 progress table refreshed to 9/20 via `roadmap.update-plan-progress`
- `.planning/STATE.md` — new Blockers/Concerns entry recording the branch-protection gap and its unblock path
- `docs/dependency-register.md` — new row: "GitHub branch protection", status pending/deferred, blocker "GitHub Free plan, private repo", unblock "GitHub Pro ($4/mo) then re-run the `gh api` protection call from 00-08"

## Decisions Made
- `npm ci --legacy-peer-deps` in the `checks` job — confirmed locally (in an isolated directory, not the working tree) that a bare `npm ci` fails on this project's peer-dependency graph before adding the flag
- gitleaks pinned to `v8.30.1`, the actual latest v8 tag as of 2026-09-23, superseding the plan's `v8.28.0` placeholder per the plan's own instruction to verify before committing
- Branch protection deferred at the user's explicit choice (Option 3 of three presented): stay on GitHub Free, keep the repo private, accept CI as advisory-only for now. `enforce_admins` question is moot until protection can be set at all
- `FND-04`/`FND-05` deliberately left unchecked in REQUIREMENTS.md per the user's explicit instruction, since their non-bypassable intent isn't met while branch protection is unavailable; `ENV-02`/`FND-12` marked complete since their requirement text is satisfied by the now-live, proven CI jobs independent of branch protection

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm ci` fails without `--legacy-peer-deps`**
- **Found during:** Task 1, pre-commit verification
- **Issue:** Reproduced in an isolated copy of `package.json`/`package-lock.json`: a bare `npm ci` errors out on peer-dependency conflicts in this project's dependency graph. The plan's workflow draft used plain `npm ci`
- **Fix:** Changed the `checks` job's install step to `npm ci --legacy-peer-deps`, matching how `node_modules` is installed locally per the executor's own setup instructions
- **Files modified:** `.github/workflows/ci.yml`
- **Verification:** Reproduced the bare-`npm ci` failure first (proving the fix was necessary, not precautionary), then ran every `checks`-job step locally against the real dependency graph installed with `--legacy-peer-deps` — all passed
- **Committed in:** `aeaff09`

**2. [Rule 1 - Bug/staleness] gitleaks image tag updated from the plan's placeholder**
- **Found during:** Task 1, per the plan's own explicit instruction to confirm the latest v8 tag before committing
- **Issue:** Plan draft referenced `v8.28.0`; GitHub's actual latest v8 release as of 2026-09-23 is `v8.30.1`
- **Fix:** Pinned `ghcr.io/gitleaks/gitleaks:v8.30.1`; confirmed the image pulls (`docker manifest inspect`) and that the `git <path>` subcommand syntax the workflow uses is correct for this version
- **Files modified:** `.github/workflows/ci.yml`
- **Verification:** `docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:v8.30.1 git /repo --config /repo/.gitleaks.toml --redact --no-banner --exit-code 1` → "no leaks found" across 83 commits, exit 0
- **Committed in:** `aeaff09`

### Escalated to User (Rule 4 — denial, not an architectural choice, but user decision required)

**3. Branch protection blocked by GitHub Free-plan private-repo restriction**
- **Found during:** Task 2, step 3 (the `gh api -X PUT .../branches/main/protection` call, run exactly as the plan specifies)
- **Issue:** `403: "Upgrade to GitHub Pro or make this repository public to enable this feature."` Confirmed not a stale-cache or auth artifact — a `GET` on the same endpoint returns the identical 403, and `gh repo view` confirms `isPrivate: true`. GitHub's classic branch-protection API (and its newer rulesets API, which was considered and rejected as a substitute — same plan-tier gate) is unavailable on private repos under the Free plan
- **Options presented to user:** (1) upgrade to GitHub Pro/Team, (2) make the repo public, (3) accept CI as advisory-only for now and revisit later
- **User's decision:** Option 3 — do not upgrade, do not change repo visibility, do not attempt rulesets as a substitute
- **Consequence:** FND-04/FND-05's "non-bypassable" intent (per this plan's own `must_haves`) is **not met**. CI runs and reports on every push/PR and would fail on a real violation (proven by `verify:gates` and the clean gitleaks scan), but a red check cannot currently block a merge to `main`
- **Files affected:** `.planning/REQUIREMENTS.md` (FND-04/FND-05 left pending, note added), `.planning/STATE.md` (new blocker entry), `docs/dependency-register.md` (new row)
- **Unblock path:** GitHub Pro ($4/mo) or Team, then re-run the exact `gh api -X PUT repos/paulakintunde/AppFincWin/branches/main/protection` call from 00-08-PLAN.md Task 2 verbatim

---

**Total deviations:** 3 (2 auto-fixed/Rule 3+1, 1 escalated/Rule 4, user-resolved)
**Impact on plan:** The CI mechanism itself is complete and verified working end to end on a real push (run `35890330292`, all three jobs green). Only the "required on main" enforcement layer is deferred, and it's deferred by explicit user choice with a documented, cheap unblock path — not a technical failure of this plan's work.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
**To close the FND-04/FND-05 gap:** upgrade the GitHub account (github.com/paulakintunde) to Pro or Team, then have Claude re-run the branch-protection `gh api` call from 00-08-PLAN.md Task 2. No other manual step remains — the CI workflow, gitleaks config and required npm scripts are all in place and proven.

## Next Phase Readiness
- Every push to `main` and every pull request now runs lint, typecheck, dependency-cruiser, jest coverage, the gate self-test, `check:ignores`, the ENV-04 service-role grep, a full-history gitleaks scan and the pgTAP RLS suite — confirmed via a real green run, not just workflow syntax
- `supabase/functions/fx-sync/parse.test.ts` (added by the in-flight 00-09 plan) and `supabase/tests/database/04_fx_rates.test.sql` are already picked up automatically by `test:coverage`'s jest `testMatch` and `supabase test db` respectively — no CI changes were needed for either, and none were made
- Any future plan adding a new CI-relevant script or test file needs no workflow edit as long as it matches existing `testMatch`/`supabase/tests/database/` conventions
- Outstanding: branch protection itself, tracked in `docs/dependency-register.md` and `STATE.md`'s Blockers/Concerns, unblocked by a GitHub plan upgrade whenever the user chooses

## Known Stubs
None.

## Self-Check: PASSED

Files verified present on disk: FOUND `.github/workflows/ci.yml`, `.gitleaks.toml`.
Commit `aeaff09` verified present in `git log --oneline`.
CI run `35890330292` verified via `gh run view` — all three jobs (`checks`, `secret-scan`, `rls`) `conclusion: success`.
Push verified via `git rev-list --left-right --count origin/main...main` → `0	0` after push (confirmed separately by the `cd906a8..aeaff09 main -> main` push output).

---
*Phase: 00-foundation*
*Completed: 2026-09-23*
