---
phase: quick-260922-sz4
plan: 01
subsystem: ops/supabase-guardrails
tags: [supabase, ci-guardrails, docs]
dependency-graph:
  requires: []
  provides: [single-project-supabase-preflight]
  affects: [scripts/supabase-preflight.mjs, CLAUDE.md, docs/ops/accounts.md]
tech-stack:
  added: []
  patterns: ["ref-match preflight (no confirmation gate, by explicit user decision)"]
key-files:
  created: []
  modified:
    - scripts/supabase-preflight.mjs
    - CLAUDE.md
    - docs/ops/accounts.md
    - .env.local (uncommitted, gitignored)
decisions:
  - "Locked user decision honored: ref-match-only preflight, no confirmation gate, no opt-in flag, no warning banner added — this was explicitly declined and not re-litigated."
metrics:
  duration: "~15 minutes"
  completed: 2026-09-22
---

# Phase quick-260922-sz4 Plan 01: Repoint Supabase guardrails to a single production project Summary

Rewrote the Supabase preflight script and its documentation to reflect that
`Fincwin United` (ref `cohmcbdfgqmiwykztrdg`) is the one and only Supabase
cloud project and it is production — removing the dev/prod split guardrails
that were blocking every legitimate `supabase db push`.

## What changed

**`scripts/supabase-preflight.mjs`** — removed all `SUPABASE_DEV_PROJECT_REF`
handling and the old refusal block that errored out whenever
`config.toml`'s `project_id` equaled `SUPABASE_PROD_PROJECT_REF` (the exact
bug blocking pushes). New semantics: read `project_id` from
`supabase/config.toml`, read `SUPABASE_PROD_PROJECT_REF` from the env file
(still overridable via `SUPABASE_PREFLIGHT_ENV_FILE`), fail with both refs
named on any missing/invalid/mismatched value, otherwise print an OK line
and exit 0. Header comments rewritten for the single-project reality; the
MCP-prohibition rationale and "Node builtins only" rationale preserved. No
confirmation gate, opt-in flag, or warning banner was added — per the
locked user decision, that trade-off was already decided and explicitly
declined.

**`.env.local`** (gitignored, never committed) — verified idempotently:
exactly one non-empty `SUPABASE_PROD_PROJECT_REF` line, zero
`SUPABASE_DEV_PROJECT_REF` occurrences (the duplicate-key bug from the
original briefing was already fixed before this task ran). Fixed two stale
comments: the "from each project's URL" plural → singular, and the "Dev
project → Settings → API" line → "Project → Settings → API".

**`CLAUDE.md`** — rewrote the `## Supabase access` section (still in the
unmarked gap between `GSD:workflow-end` and `GSD:profile-start`, untouched
by GSD marker regeneration). Kept the MCP prohibition verbatim (org
`Ealchapp`, ref `ogbothupjcivwruesgsu`, disjoint project lists) and the
CLI/Management-API guidance. Replaced the four stale dev/prod bullets with
three accurate ones describing the single production project, where its
ref lives, and that `supabase db push` targets production directly (a
factual statement, not a warning).

**`docs/ops/accounts.md`** — status table row changed from "Dev project
live; prod not created" to "Production project live". The Supabase section
body's sentence about the `fincwin-dev` rename and `fincwin-prod` creation
being outstanding was removed (not reworded) and replaced with "It is the
production project, and the only one." Singularized the database-password
sentence. Dropped `SUPABASE_DEV_PROJECT_REF` from the `→` env-var trailer.
House style preserved: prose paragraphs, British spelling, ~78-char wrap,
no new headings.

## Deviations from Plan

None — plan executed exactly as written. `.env.local`'s duplicate-key bug
was already fixed prior to this task (as the plan itself anticipated);
Task 1 Part A was executed as the idempotent verification the plan
specified, with the two stale comments corrected.

## Verification

All plan-level verification gates passed:

1. `npm run supabase:preflight` → exit 0 against the real `.env.local`.
2. Fixture with a wrong ref (written to the session scratchpad, deleted
   after use, never in the repo) → exit 1, message names both
   `cohmcbdfgqmiwykztrdg` and the fixture's `aaaaaaaaaaaaaaaaaaaa`.
3. `grep -rn "SUPABASE_DEV_PROJECT_REF\|fincwin-dev" scripts/ CLAUDE.md docs/ops/accounts.md` → no matches.
4. `git status --porcelain` shows only `.planning/` plus the three
   committed files (already committed by the time of the final check) —
   `.env.local` never appears.
5. `git diff --name-only | grep -v '^\.planning/' | grep -q '\.env\.local'` → no match (exit 1), confirming `.env.local` was never staged.
6. `git diff supabase/config.toml` → empty.
7. `git diff package.json` and `git diff .planning/PROJECT.md` → both empty (neither file touched).
8. Secret hygiene: `scripts/supabase-preflight.mjs` contains zero
   occurrences of `SUPABASE_ACCESS_TOKEN`, `SERVICE_ROLE`, or `DB_PASSWORD`.

## Commits

- `a516d8a` — fix(supabase): repoint preflight to single-project ref match
- `757cd5a` — docs(claude): describe Supabase as a single production project
- `99b4142` — docs(ops): describe Supabase as a single production project

## Flag for the orchestrator

`.planning/PROJECT.md` line 186 records the Key Decision "Separate
development and production projects, migrations in git", which this change
contradicts. Left untouched deliberately, per the plan's explicit
instruction — amending a recorded Key Decision is the user's call, not
this execution's.

## Self-Check: PASSED

- FOUND: scripts/supabase-preflight.mjs (rewritten, verified via `node scripts/supabase-preflight.mjs` exit 0)
- FOUND: CLAUDE.md `## Supabase access` section (verified via grep line-number bounds against GSD markers)
- FOUND: docs/ops/accounts.md status row and Supabase section (verified via grep)
- FOUND: commit a516d8a in `git log --oneline`
- FOUND: commit 757cd5a in `git log --oneline`
- FOUND: commit 99b4142 in `git log --oneline`
- CONFIRMED: `.env.local` absent from `git status --porcelain` and `git diff --name-only`
