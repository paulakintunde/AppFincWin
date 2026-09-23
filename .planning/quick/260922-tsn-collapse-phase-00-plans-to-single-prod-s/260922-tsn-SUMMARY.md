---
phase: quick-260922-tsn
plan: 01
subsystem: planning/phase-00-foundation
tags: [supabase, planning-docs, single-project-collapse]
dependency-graph:
  requires: []
  provides: [phase-00-plans-target-single-production-project]
  affects:
    - .planning/phases/00-foundation/00-03-PLAN.md
    - .planning/phases/00-foundation/00-05-PLAN.md
    - .planning/phases/00-foundation/00-06-PLAN.md
    - .planning/phases/00-foundation/00-09-PLAN.md
    - .planning/phases/00-foundation/00-15-PLAN.md
    - .planning/phases/00-foundation/00-19-PLAN.md
    - .planning/phases/00-foundation/00-20-PLAN.md
    - .planning/ROADMAP.md
tech-stack:
  added: []
  patterns: ["one Supabase project = production; supabase:preflight guards every push instead of a separate dev/prod split"]
key-files:
  created: []
  modified:
    - .planning/phases/00-foundation/00-03-PLAN.md
    - .planning/phases/00-foundation/00-05-PLAN.md
    - .planning/phases/00-foundation/00-06-PLAN.md
    - .planning/phases/00-foundation/00-09-PLAN.md
    - .planning/phases/00-foundation/00-15-PLAN.md
    - .planning/phases/00-foundation/00-19-PLAN.md
    - .planning/phases/00-foundation/00-20-PLAN.md
    - .planning/ROADMAP.md
decisions:
  - "00-03 restructured from 'create fincwin-dev + fincwin-prod' to 'adopt and link the existing Fincwin United project (cohmcbdfgqmiwykztrdg, us-west-2)' — no project is created by Phase 0 plans anymore."
  - "00-19 Task 3 changes meaning, not just wording: since 00-06 and 00-09 already migrate/deploy to the one production project, 00-19 now verifies that state (schema + fx-sync) instead of gating a second, separately-approved production push. The 'prod: yes/no' checkpoint question is removed."
  - "Fixed two pre-existing region-capitalisation/truncation defects in the user's uncommitted 00-03 edits (missing 'us-west-' digit, 'US west'/'US WEST' → 'US West') as part of the same restructure, per the plan's own instructions."
  - "Extended the collapse to two spots the plan's line-by-line diff didn't explicitly call out but were unmistakably in scope: 00-19's Task 2 name (still said 'approval of the production push' after the approval step was removed) and 00-20's Task 1 step 3 (Apple Services ID domains/return URLs still listed both <DEV_REF> and <PROD_REF>) — both are Rule-1 consistency fixes within the same files already being restructured, not new scope."
requirements-completed: []
metrics:
  duration: "~30 minutes"
  completed: 2026-09-22
---

# Quick 260922-tsn: Collapse Phase 0 plans to a single production Supabase project Summary

Rewrote seven Phase 0 plan files and ROADMAP.md so every step that referenced a
`SUPABASE_DEV_*` variable, `fincwin-dev`/`fincwin-prod`, or a separate approved
"prod push" now plainly targets the one Supabase project that exists —
`Fincwin United` (`cohmcbdfgqmiwykztrdg`, `us-west-2`) — instead of silently
resolving those dead variables to empty strings.

## What changed, file by file

**00-03-PLAN.md** — full restructure (not find-and-replace) from "create two
Free projects" to "adopt and link the one that exists". Task 1's human steps
now ask the user to *confirm* the org/project are visible rather than create
them; Task 2 drops the two-password-generation and two-`projects create`
calls in favour of a `projects list` existence check and a single link to
`$SUPABASE_PROD_PROJECT_REF`; the `docs/decisions/supabase-environments.md`
content the plan writes drops the `dev` row and rewords the ENV-17 rule to
"every push is a production push." Also fixed, as instructed: `us-west-`
missing its trailing `2`, and three "US west"/"US WEST" → "US West"
capitalisation defects introduced by the user's own uncommitted region
replace.

**00-05-PLAN.md** — `.env.example` template: dropped the dead
`SUPABASE_DEV_PROJECT_REF`, `SUPABASE_DEV_DB_PASSWORD` and
`SUPABASE_PROD_DB_PASSWORD` lines, kept the single `SUPABASE_PROD_PROJECT_REF`
line with an accurate comment, left `SUPABASE_DB_PASSWORD` (the name
`supabase db push` actually reads) untouched.

**00-06-PLAN.md** — Task 3 ("push migrations") now states plainly that the
push targets production, prefixes the push with `npm run supabase:preflight`,
and replaces "prod is pushed only in 00-19 after explicit approval" with "this
is the project's only database … 00-19 verifies the result rather than
repeating the push."

**00-09-PLAN.md** — same pattern for the fx-sync Edge Function deploy: all
`$SUPABASE_DEV_PROJECT_REF` uses become `$SUPABASE_PROD_PROJECT_REF`, the
schema push is prefixed with the preflight guard, and "prod deployment is done
by 00-19" becomes "this deploy is the production deploy; 00-19 verifies it."

**00-15-PLAN.md** — Google OAuth client + Supabase provider config now
targets one redirect URI and one `PATCH .../config/auth` call against
`$SUPABASE_PROD_PROJECT_REF`, instead of looping "for each of dev and prod."

**00-19-PLAN.md** — the plan whose *meaning* changes most. Task 2's
on-device checklist no longer asks "prod: yes/no" (step 11 now just confirms
the register's already-migrated production row); its acceptance criteria and
resume-signal dropped the prod-approval branch; its name no longer promises
"approval of the production push" now that there is nothing left to approve
(a Rule-1 fix beyond the plan's literal line list, since the two are directly
coupled). Task 3 was rewritten from "push migrations and deploy fx-sync to
production" into "confirm production's schema and fx-sync" — three
verification steps (confirm link target, confirm `migration list --linked`
shows all four, confirm fx-sync answers `ok:true`) replace the old four-step
push-and-relink-to-dev sequence. The threat register's T-00-19-02 row, which
described a "shared FX secret across environments," was rewritten to describe
the single `FX_SYNC_SECRET` instead, since the shared-across-environments
threat no longer exists with one environment.

**00-20-PLAN.md** — Apple Sign-In provider config collapses the same way:
one Services ID domain/return URL instead of dev+prod pairs (this specific
line wasn't named in the plan's line-by-line diff, but leaving it as
dev+prod would have directly contradicted the very next line's edit to the
same task, so it was fixed as part of the same restructure), one `PATCH`
call against `$SUPABASE_PROD_PROJECT_REF`, and the register note changed from
"regenerate and PATCH both projects" to "regenerate and PATCH the production
project."

**ROADMAP.md** — success criterion 8 dropped "Development and production run
on separate Supabase projects…" in favour of "The Supabase project runs in a
deliberately chosen region…"; the 00-03 plan-list line dropped "dev + prod
projects in us-east-1" in favour of "production project in us-west-2."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 00-19 Task 2 name still promised an "approval of the
production push" after the approval step was removed**
- **Found during:** Task 3 (00-19 rewrite)
- **Issue:** The plan's line-by-line instructions rewrote step 11 and the
  acceptance/resume-signal lines to drop the "prod: yes/no" question, but did
  not name the task's own `<name>` line, which still read "…and approval of
  the production push" — now stale and misleading to a future executor.
- **Fix:** Renamed to "Task 2: On-device acceptance on the Android emulator."
- **Files modified:** `.planning/phases/00-foundation/00-19-PLAN.md`
- **Committed in:** `f90689b`

**2. [Rule 1 - Bug] 00-20 Task 1 step 3 still listed dev+prod Apple Services
ID domains/return URLs**
- **Found during:** Task 3 (00-20 rewrite)
- **Issue:** The plan explicitly rewrote the `user_setup.dashboard_config`
  task one line above this step to describe a single Services ID/return URL,
  but step 3 in the body — the step that actually creates that Services
  ID — still said `Domains: <DEV_REF>.supabase.co, <PROD_REF>.supabase.co`
  and listed two return URLs. Left as-is, the file would contradict itself
  two lines apart.
- **Fix:** Collapsed to the single production domain and return URL,
  matching the sentence immediately above it.
- **Files modified:** `.planning/phases/00-foundation/00-20-PLAN.md`
- **Committed in:** `f90689b`

---

**Total deviations:** 2 auto-fixed (both Rule 1, both internal consistency
fixes inside files already being restructured for this exact reason).
**Impact on plan:** No scope creep — both fixes correct a file to agree with
its own adjacent, plan-mandated edit.

## Issues Encountered

None.

## Verification

All plan-level gates passed, run exactly as specified:

1. Task 1 gate (00-03 only): no `SUPABASE_DEV_*`/`fincwin-dev`/`fincwin-prod`/
   `us-east-1`, no `project_id = "fincwin"`, contains `cohmcbdfgqmiwykztrdg`,
   every `us-west-` occurrence is exactly `us-west-2`, no `US west`/`US WEST`/
   `US East` anywhere, frontmatter starts with `---`. **PASS.**
2. Task 2 gate (00-05/06/09): no `SUPABASE_DEV_(PROJECT_REF|DB_PASSWORD)` or
   `fincwin-dev`; 00-06 and 00-09 contain `SUPABASE_PROD_PROJECT_REF`; 00-05
   contains no `SUPABASE_PROD_DB_PASSWORD`. **PASS.**
3. Task 3 composed `ALL_GATES_PASS` gate across `.planning/phases/` and
   `.planning/ROADMAP.md`: no `SUPABASE_DEV_*`, no `us-east-1`, every
   `us-west-` is `us-west-2`, no `fincwin-dev`, no
   `project_id = "fincwin"` in 00-03, `cohmcbdfgqmiwykztrdg` present in
   00-03, nothing under `.planning/quick/` modified, and all seven touched
   plan files still have valid frontmatter (`---` first line, a second
   `---` closer, `phase: 00-foundation`). **Printed `ALL_GATES_PASS`.**
4. `git diff --stat` from the pre-task commit (`c3db34a`) to the final commit
   touches exactly 8 files: the 7 Phase 0 plans plus `ROADMAP.md`. **Confirmed.**
5. `git diff c3db34a HEAD -- 00-19-PLAN.md` shows the user's
   `SUPABASE_DB_PASSWORD` rename (from `SUPABASE_DEV_DB_PASSWORD`) survives
   into the final text and is never reverted. **Confirmed** — the only
   `SUPABASE_DEV_DB_PASSWORD` occurrence in the diff is on a removed line;
   every remaining reference uses `SUPABASE_DB_PASSWORD`.
6. Nothing under `.planning/quick/` was touched, and none of the
   out-of-scope files (`00-01`, `00-02`, `00-13`, `00-14`, `00-CONTEXT.md`,
   `00-RESEARCH.md`, `00-DISCUSSION-LOG.md`, `.env.local`, `CLAUDE.md`,
   `docs/ops/accounts.md`, `scripts/supabase-preflight.mjs`,
   `supabase/config.toml`) appear in any commit's diff.

## Known Residuals (out of scope by constraint, reported not fixed)

- `00-01-PLAN.md:95` — dependency register row still reads "Supabase dev
  project … Region US East (D-22)".
- `00-14-PLAN.md:110` — EAS production env still reads its keys from
  `.env.production.local`, a file that does not exist.
- `00-02-PLAN.md:165` — `.gitignore` still lists `.env.production.local`
  (harmless, defensive).
- `00-CONTEXT.md:48`, `00-RESEARCH.md:40/87/226`, `00-DISCUSSION-LOG.md:64` —
  D-22 is recorded as "US East" while the project is in `us-west-2`.
  Historical decision records; correcting them is a separate call.
- `00-03-PLAN.md` step 6 still offers the legacy `anon` key as a fallback,
  while `docs/ops/accounts.md` says not to mint legacy JWTs. Unrelated to
  this collapse.
- `.planning/PROJECT.md` line ~186 records the Key Decision "Separate
  development and production projects, migrations in git," which this
  change contradicts at the phase-plan level. Not touched — amending a
  recorded Key Decision is a call for the user, not this execution
  (consistent with the same flag raised by quick task `260922-sz4`).
- Two ROADMAP.md plan-list lines (00-06, 00-09) still say "dev push" —
  left untouched per this plan's explicit constraint to change only lines
  57 and 63 of ROADMAP.md.

## Commits

- `5d8ca46` — docs(00-03): collapse dual dev/prod provisioning to single production project
- `93fec9a` — docs(00-05,00-06,00-09): retarget push and deploy plans to production
- `f90689b` — docs(00-15,00-19,00-20,roadmap): single production auth config and verification

## Self-Check: PASSED

- FOUND: `.planning/phases/00-foundation/00-03-PLAN.md` contains `cohmcbdfgqmiwykztrdg`
- FOUND: `.planning/phases/00-foundation/00-05-PLAN.md`, `00-06-PLAN.md`, `00-09-PLAN.md` modified as described
- FOUND: `.planning/phases/00-foundation/00-15-PLAN.md`, `00-19-PLAN.md`, `00-20-PLAN.md` modified as described
- FOUND: `.planning/ROADMAP.md` lines for success criterion 8 and the 00-03 plan-list entry updated
- FOUND: commit `5d8ca46` in `git log --oneline`
- FOUND: commit `93fec9a` in `git log --oneline`
- FOUND: commit `f90689b` in `git log --oneline`
- CONFIRMED: `git diff --stat` from `c3db34a` to `HEAD` touches exactly 8 files
- CONFIRMED: nothing under `.planning/quick/` appears in any of the three commits' diffs
