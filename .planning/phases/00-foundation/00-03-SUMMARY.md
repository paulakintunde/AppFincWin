---
phase: 00-foundation
plan: 03
subsystem: infra
tags: [supabase, postgres, docker, cli, rls]

# Dependency graph
requires:
  - phase: 00-foundation (plan 01/02)
    provides: repo scaffold, dependency register, Supabase CLI pinned as devDependency
provides:
  - Production Supabase project (Fincwin United, ref cohmcbdfgqmiwykztrdg, us-west-2) linked to the repo
  - Local Supabase CLI stack running in Docker (API 127.0.0.1:54321, DB 127.0.0.1:54322)
  - docs/decisions/supabase-environments.md documenting the environment map, ENV-18 region reasoning, and the ENV-17 migrations-only rule
  - Verified .env.local credentials (SUPABASE_ACCESS_TOKEN, SUPABASE_PROD_PROJECT_REF, SUPABASE_DB_PASSWORD, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY) match the live project's keys
affects: [01-record, 00-08 (CI), any phase writing migrations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Supabase CLI invoked via `npx supabase` (pinned devDependency, not on PATH) outside package.json scripts; bare `supabase` resolves via node_modules/.bin inside npm scripts"
    - "Single production Supabase project; local Docker stack for dev/CI; no separate cloud dev project"

key-files:
  created:
    - docs/decisions/supabase-environments.md
    - supabase/.gitignore
  modified:
    - supabase/config.toml

key-decisions:
  - "Supabase CLI installed as a pinned devDependency (supabase@2.117.0) rather than via Scoop, per user-approved deviation from Task 1 — version-pinned in the repo, available to CI in 00-08, no extra Windows tooling"
  - "supabase/.gitignore added for defence-in-depth even though the root .gitignore already covers supabase/.temp/, supabase/.branches/, and .env* patterns"
  - "REST-endpoint verification for ENV-03 was performed against a table-scoped probe rather than the plan's literal root-path curl, because Supabase's new API-key system now restricts the root /rest/v1/ OpenAPI listing to secret keys only (see Deviations)"

patterns-established:
  - "Any shell invocation of the Supabase CLI must use `npx supabase ...`, never bare `supabase`, except inside package.json scripts"

requirements-completed: [ENV-03, ENV-17, ENV-18]

# Metrics
duration: 45min
completed: 2026-09-23
---

# Phase 00 Plan 03: Supabase Provisioning Summary

**Linked the repo to the single production Supabase project (Fincwin United, us-west-2) via the CLI, brought up the local Docker stack, and recorded the environment map and migrations-only rule in docs/decisions/supabase-environments.md.**

## Performance

- **Duration:** ~45 min (Tasks 2-3; Task 1 was pre-resolved by the user before this session)
- **Started:** 2026-09-22T23:02:00Z (approx, per .env.local mtime)
- **Completed:** 2026-09-23T06:25:47Z
- **Tasks:** 2 of 3 (Task 1 checkpoint:human-action resolved by user response, no execution needed)
- **Files modified:** 3 (supabase/config.toml, supabase/.gitignore, docs/decisions/supabase-environments.md)

## Accomplishments
- Confirmed the Supabase org (`Financial Win`, slug `vnmawbzuxcwfryapachu`) and the single production project (`Fincwin United`, ref `cohmcbdfgqmiwykztrdg`, region `us-west-2`, status `ACTIVE_HEALTHY`) via `npx supabase orgs list` / `projects list`
- Verified (with `--reveal`, values never printed to any log or file) that `.env.local`'s `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are byte-for-byte the project's live `sb_publishable_...` and `sb_secret_...` keys — no regeneration needed
- Linked the repo to the production project: `npx supabase link --project-ref cohmcbdfgqmiwykztrdg --password ***`
- Started the local Supabase CLI stack in Docker; `npx supabase status` reports API URL `http://127.0.0.1:54321` and DB URL `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, matching the plan's expected values with no port conflicts
- Verified the production REST endpoint accepts the publishable key for real requests (see Deviations for why the literal root-path check needed adapting)
- Wrote `docs/decisions/supabase-environments.md`: environments table, ENV-18/D-22 region reasoning, D-23 PostHog EU-host note, and the ENV-17 migrations-only rule
- `npm run supabase:preflight` passes after every change

## Task Commits

Each task was committed atomically:

1. **Task 1: Install CLI, start Docker, create org and access token** - `f383069` (chore, prior session — CLI pinned as devDependency) — resolved via user_response, no new execution in this session
2. **Task 2: Init/link the production project, capture keys, write environment doc** - `733794c` (feat)
3. **Task 3: Start the local stack and verify the production REST endpoint** - no commit (verification-only task; no port conflicts meant no file changes were required — see Issues Encountered)

**Plan metadata:** committed as part of this SUMMARY's own commit (see final commit).

## Files Created/Modified
- `supabase/config.toml` - Updated the stale header comment (previously said "the CLI is not installed yet"); `project_id` unchanged, already correctly pinned to `cohmcbdfgqmiwykztrdg`
- `supabase/.gitignore` - New; ignores `.branches`, `.temp`, `.env` for defence-in-depth (root `.gitignore` already covers these)
- `docs/decisions/supabase-environments.md` - New; environment map, ENV-18 region reasoning (D-22), ENV-17 migrations-only rule

## Decisions Made
- Kept `supabase/.gitignore` even though redundant with the root `.gitignore`, because the plan's `files_modified` explicitly calls for it and it documents intent locally for anyone browsing `supabase/` in isolation.
- Did not run `supabase init`, since `supabase/config.toml` already existed with the correct `project_id` (plan explicitly allows skipping init in this case).
- Left the local Docker stack running (not `supabase stop`) per the plan's Task 3 note, since it may be needed by an upcoming plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/stale doc] Corrected `supabase/config.toml`'s misleading header comment**
- **Found during:** Task 2
- **Issue:** The existing comment said "the Supabase CLI is not installed yet" and instructed a future run of `supabase link`. Both are now false: the CLI is installed (pinned devDependency) and the project is linked.
- **Fix:** Rewrote the comment to reflect current state and point to `docs/decisions/supabase-environments.md`.
- **Files modified:** `supabase/config.toml`
- **Verification:** `npm run supabase:preflight` still passes (project_id untouched).
- **Committed in:** `733794c`

**2. [Rule 3 - Blocking/platform drift] Adapted the ENV-03 REST-endpoint verification method**
- **Found during:** Task 3
- **Issue:** The plan's literal check — `curl "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/" -H "apikey: $PUBLISHABLE_KEY"` expecting HTTP 200 — returns **401** (`{"message":"Secret API key required","hint":"Only secret API keys can be used for this endpoint."}`) on the current production project. This is a Supabase platform behavior change since the plan was written: the root `/rest/v1/` path (which serves the full OpenAPI schema listing) is now restricted to secret keys only, as a security hardening of the new `sb_publishable_`/`sb_secret_` key system. The plan's documented fallback (adding an `Authorization: Bearer` header) was also tried and also returns 401 — it does not resolve this, because the restriction is on the root path itself, not the header format.
- **Fix:** Verified the underlying requirement — "the production project's REST endpoint answers with the publishable key" — via a table-scoped request instead: `curl ".../rest/v1/__nonexistent_probe_table__?select=*" -H "apikey: $PUBLISHABLE_KEY"` returns **404** (PostgREST "table not found"), not 401. A 404 (rather than 401) proves the publishable key is accepted and authenticated by PostgREST; the app will call real table endpoints, never the bare root path, so this is the behavior that actually matters for ENV-03. Confirmed the root path *does* return 200 when queried with the secret key, isolating the change to key-tier root-path restriction rather than a broken project or bad key.
- **Files modified:** None (verification-method change only, no code/config change)
- **Verification:** Manual curl checks as described above, run against the live production project.
- **Committed in:** N/A (no file changes; documented here per Rule 3)

---

**Total deviations:** 2 auto-fixed (1 stale-doc bug, 1 blocking/platform-drift adaptation)
**Impact on plan:** Both fixes are corrections to documentation accuracy and verification method, not scope or architecture changes. No new functionality was added. ENV-03's provisioned half, ENV-17, and ENV-18 are all satisfied.

## Issues Encountered
- Task 3's literal automated verification command (`supabase status && ... curl ... = "200"`) will fail as written if re-run verbatim, because of the platform-behavior change described above. This does not block the plan's actual success criteria (the endpoint is reachable and authenticates correctly), but a future phase (00-18, the in-app "connected to Supabase" check per D-13) should call a real table or RPC, not the bare root path, and should not assume 200 from an unauthenticated-feeling root probe.
- `supabase start` pulled roughly 90 container image layers on first run (all Supabase service images were previously absent from Docker on this machine) — this took several minutes but completed cleanly with no errors, as anticipated by the plan.
- The Supabase organisation's actual name is **"Financial Win"** (slug `vnmawbzuxcwfryapachu`), not "FincWin United" as the plan's Task 1 prose assumed. The project itself is correctly named "Fincwin United". This is cosmetic (org display name vs. project display name) and does not affect anything functional; noted here only because the plan's checklist referenced the org by an assumed name.

## User Setup Required
None - no further external service configuration required. All Task 1 prerequisites (CLI, Docker, org, access token, project, keys) were already in place per the user's resolution message.

## Next Phase Readiness
- The production Supabase project is linked and reachable; the local Docker stack is running and left up for the next plan.
- `supabase/migrations/` is empty — no migrations exist yet. The next plan that adds schema (Phase 1: Record, household-of-one tables) is the first to exercise the `npm run supabase:db:push` / `supabase db reset` migrations-only workflow documented in `docs/decisions/supabase-environments.md`.
- No blockers.

## Self-Check: PASSED

All referenced files and commits verified to exist:
- FOUND: docs/decisions/supabase-environments.md
- FOUND: supabase/.gitignore
- FOUND: supabase/config.toml
- FOUND: .planning/phases/00-foundation/00-03-SUMMARY.md
- FOUND commit: f383069
- FOUND commit: 733794c

---
*Phase: 00-foundation*
*Completed: 2026-09-23*
