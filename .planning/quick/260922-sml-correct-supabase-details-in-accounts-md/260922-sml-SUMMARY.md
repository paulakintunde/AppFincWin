---
phase: quick
quick_id: 260922-sml
plan: 01
subsystem: docs
tags: [supabase, accounts, docs]
dependency-graph:
  requires: []
  provides: ["accurate Supabase status in docs/ops/accounts.md"]
  affects: []
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - docs/ops/accounts.md
decisions: []
metrics:
  duration: "~5 minutes"
  completed: 2026-09-23T03:41:16Z
requirements: [QUICK-260922-SML]
---

# Quick Task 260922-sml: Correct Supabase details in accounts.md Summary

Corrected two stale Supabase passages in `docs/ops/accounts.md` — the status
row and the "What each account needs from you" section — to match verified
live reality: one project in us-west-2, not two planned projects in us-east-1.

## What changed

**Status table row** — Supabase status changed from `Not started` to
`Dev project live; prod not created`.

**Supabase section body** — replaced entirely with the plan's verbatim
drafted prose, stating:
- The organisation exists and one Free project, `Fincwin United`
  (ref `cohmcbdfgqmiwykztrdg`), is live in us-west-2.
- The region was chosen deliberately for North American users and is
  permanent (fixed at project creation).
- The project serves as dev; renaming it to `fincwin-dev` and creating
  `fincwin-prod` are both still outstanding.
- The access token is generated and verified; the CLI and Docker Desktop
  are still outstanding (install CLI via Scoop, not npm).
- Keys are the new `sb_publishable_`/`sb_secret_` style; legacy `anon`/
  `service_role` JWTs are deprecated end of 2026.
- The Supabase DPA (SCCs + UK addendum) needs accepting.
- MCP connector prohibition is cross-referenced to `CLAUDE.md`'s
  `## Supabase access` section rather than restated.
- The `→` env var trailer now lists only vars that actually exist in
  `.env.local` (`SUPABASE_DEV_PROJECT_REF`, `SUPABASE_PROD_PROJECT_REF`,
  `SUPABASE_PROD_DB_PASSWORD`, etc.) — the old `SUPABASE_*_DB_PASSWORD`
  glob and a nonexistent `SUPABASE_DEV_DB_PASSWORD` were removed.

No other file was touched. No secret value was written.

## Verification

All four automated gates from the plan passed:
- `CONTENT_OK` — us-east-1 absent, us-west-2 and the project ref present,
  `fincwin-prod` mentioned, correct env var names present, stale glob
  removed, CLAUDE.md cross-referenced, "Not started" no longer on the
  Supabase row.
- `NO_SECRETS_OK` — no secret-shaped string (`sb_secret_`, `sb_publishable_`,
  `sbp_`, JWT) appears in the file.
- `SCOPE_OK` — only `docs/ops/accounts.md` changed outside `.planning/`.
- `WRAP_OK` — no non-table line exceeds 82 characters.

Manual diff review confirmed exactly two changed regions: the status table
cell and the Supabase section body.

## Deviations from Plan

None — plan executed exactly as written, using the verbatim drafted prose
supplied in the plan's Task 1 action block.

## Self-Check

- FOUND: docs/ops/accounts.md (modified, contains "us-west-2",
  "cohmcbdfgqmiwykztrdg", "fincwin-prod")
- FOUND: commit e591399 (docs(quick-260922-sml): correct Supabase status in
  accounts.md)

## Self-Check: PASSED
