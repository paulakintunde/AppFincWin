---
phase: quick
plan: 260922-s7g
subsystem: infra
tags: [supabase, mcp, env-config, ci-guardrail, node]

requires: []
provides:
  - "CLAUDE.md Supabase access section warning against the wrong-account MCP connector"
  - "supabase/config.toml pinning the repo to the live Fincwin United project"
  - "scripts/supabase-preflight.mjs ref-match guard, wired into package.json"
  - "Corrected SUPABASE_DEV_PROJECT_REF / SUPABASE_PROD_PROJECT_REF in .env.local (not committed)"
affects: [supabase-schema, auth, ci-cd, docs-ops-accounts]

tech-stack:
  added: []
  patterns:
    - "Preflight-gated npm scripts: supabase:db:push chains supabase:preflight with && so a mismatch blocks the CLI before it runs"
    - "Hand-parsed env files with Node builtins only (no dotenv) for pre-install-safe tooling scripts"

key-files:
  created:
    - supabase/config.toml
    - scripts/supabase-preflight.mjs
  modified:
    - CLAUDE.md
    - package.json
    - .env.local (gitignored, not committed)

key-decisions:
  - "Supabase access guidance placed in the unmarked gap between GSD:workflow-end and GSD:profile-start so it survives GSD marker-block regeneration"
  - "Preflight script is dependency-free .mjs (Node builtins only) so it runs on a fresh clone before npm install"
  - "SUPABASE_PROD_PROJECT_REF left empty with a comment, since fincwin-prod does not exist yet, rather than filling it with a placeholder"

patterns-established:
  - "Any future secret-adjacent script must literally avoid referencing forbidden env key names even in comments, since verification greps raw file text"

requirements-completed: []

duration: 5min
completed: 2026-09-23
---

# Quick Task 260922-s7g: Supabase Project Selection Guardrails Summary

**Three-layer guardrail (CLAUDE.md warning, committed config.toml pin, and a Node preflight script) stops any agent or `db push` from targeting the wrong Supabase account.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-09-23T03:27:01Z
- **Completed:** 2026-09-23T03:30:00Z
- **Tasks:** 3
- **Files modified:** 4 tracked (`CLAUDE.md`, `supabase/config.toml`, `scripts/supabase-preflight.mjs`, `package.json`) + 1 untracked (`.env.local`, gitignored)

## Accomplishments

- `CLAUDE.md` now carries a `## Supabase access` section, placed outside every GSD marker block, telling any session the Supabase MCP connector is authorized against an unrelated account (org `Ealchapp`, ref `ogbothupjcivwruesgsu`) and to use the CLI/Management API with `SUPABASE_ACCESS_TOKEN` instead.
- `supabase/config.toml` was created and committed, pinning `project_id = "cohmcbdfgqmiwykztrdg"` (the live `Fincwin United` project), so the repo declares its own target independent of any session's tool authorization.
- `scripts/supabase-preflight.mjs` was written (Node builtins only, no dependencies) to assert `config.toml`'s `project_id` matches `.env.local`'s `SUPABASE_DEV_PROJECT_REF`, refusing loudly on mismatch or if `config.toml` is ever pinned to a non-empty production ref. Wired into `package.json` as `supabase:preflight` and `supabase:db:push` (which chains `&& supabase db push`).
- `.env.local` was corrected: added `SUPABASE_DEV_PROJECT_REF=cohmcbdfgqmiwykztrdg` (previously absent entirely) and cleared `SUPABASE_PROD_PROJECT_REF` (previously held a stray dashboard URL, not a placeholder or real prod ref) with a comment noting `fincwin-prod` doesn't exist yet. This file remains gitignored and was not staged or committed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the Supabase access section to CLAUDE.md** - `8f582ce` (docs)
2. **Task 2: Pin the project ref in supabase/config.toml and fix the two env vars** - `c5632ab` (chore) — `.env.local` edits are intentionally uncommitted (gitignored)
3. **Task 3: Write the preflight assertion script and wire it into package.json** - `1342926` (feat)

_No plan-metadata commit yet — SUMMARY.md/STATE.md commit is handled by the orchestrator per this run's constraints._

## Files Created/Modified

- `CLAUDE.md` - Added `## Supabase access` section warning against the MCP connector and pointing at the CLI/Management API path
- `supabase/config.toml` - New file, pins `project_id = "cohmcbdfgqmiwykztrdg"` with a comment pointing at `supabase link` for future reconciliation
- `scripts/supabase-preflight.mjs` - New file, hand-parses `.env.local` and `supabase/config.toml`, asserts dev ref match, refuses on prod-ref mismatch, prints only the two ref values it compares
- `package.json` - Added `supabase:preflight` and `supabase:db:push` script entries
- `.env.local` (not committed, gitignored) - Added `SUPABASE_DEV_PROJECT_REF=cohmcbdfgqmiwykztrdg`; cleared `SUPABASE_PROD_PROJECT_REF` to empty with an explanatory comment

## Decisions Made

- Placed the new CLAUDE.md section in the blank gap between `<!-- GSD:workflow-end -->` and `<!-- GSD:profile-start -->` rather than editing any existing marker block, since anything inside a GSD block is destroyed on regeneration.
- Kept `scripts/supabase-preflight.mjs` free of any third-party dependency (including `dotenv`) so it works on a fresh clone before `npm install`, per the plan's platform constraint (Windows, Node-only).
- Reworded a script comment that had originally spelled out `SUPABASE_ACCESS_TOKEN` literally, after the secret-hygiene verify gate correctly flagged it as a forbidden string appearing anywhere in the file (not just in code) — now describes it as "the CLI access token" instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preflight script's own doc comment tripped the secret-hygiene verify gate**
- **Found during:** Task 3 verify (secret-scan gate)
- **Issue:** The script's header comment explaining what it must never touch literally contained the strings `SUPABASE_ACCESS_TOKEN`, `SERVICE_ROLE`, and `DB_PASSWORD` as prose, which the plan's verify gate (correctly) greps for anywhere in the file, not just executable code.
- **Fix:** Reworded the comment to describe the forbidden keys without spelling them out verbatim ("the CLI access token", "any service-role key", "any DB password env var").
- **Files modified:** `scripts/supabase-preflight.mjs`
- **Verification:** Re-ran the secret-scan gate (`node -e '...for(const bad of [...]) if(s.includes(bad))...'`) — passes clean.
- **Committed in:** `1342926` (Task 3 commit; fixed before the commit was made, so no separate commit was needed)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Cosmetic-only fix to a comment; no behavior change to the script's logic. No scope creep.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None - no external service configuration required. `.env.local` already held a valid `SUPABASE_ACCESS_TOKEN`; only the two ref variables needed correction, which this plan handled directly.

## Next Phase Readiness

- Any future Supabase schema/migration work in phase 00-03 or later can safely run `npm run supabase:db:push`, which will refuse before reaching the CLI if the pinned ref and `.env.local` disagree.
- `docs/ops/accounts.md`'s us-east-1 / two-project drift was deliberately left untouched, as instructed — that correction belongs to plan `00-03`.
- The Supabase CLI itself is still not installed and `fincwin-prod` still does not exist; both remain out of scope until their respective future plans.

## Self-Check: PASSED

- FOUND: `CLAUDE.md` contains `## Supabase access` outside GSD markers (verified via automated gate)
- FOUND: `supabase/config.toml` (tracked, `git ls-files` confirms)
- FOUND: `scripts/supabase-preflight.mjs` (tracked, exits 0 against real `.env.local`, exits 1 against mismatched fixture)
- FOUND: `package.json` scripts `supabase:preflight` and `supabase:db:push`
- FOUND: commit `8f582ce` (docs), `c5632ab` (chore), `1342926` (feat) all present in `git log --oneline`
- CONFIRMED: `.env.local` has no git history entries and is not in any commit's changed-files list
- CONFIRMED: no fixture temp file left behind after the negative test

---
*Phase: quick*
*Completed: 2026-09-23*
