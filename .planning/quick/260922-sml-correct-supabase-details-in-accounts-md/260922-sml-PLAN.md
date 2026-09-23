---
phase: quick
quick_id: 260922-sml
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/ops/accounts.md
autonomous: true
requirements: [QUICK-260922-SML]

must_haves:
  truths:
    - "A reader of accounts.md sees that the Supabase org, one project, the access token and both API keys already exist and are verified"
    - "A reader sees the region is us-west-2 and why, and that region cannot be changed later"
    - "A reader sees exactly one project exists today (Fincwin United, ref cohmcbdfgqmiwykztrdg) and that the rename to fincwin-dev and the creation of fincwin-prod are both outstanding"
    - "A reader sees the CLI and Docker Desktop are still outstanding"
    - "A reader sees keys are the new sb_publishable_ / sb_secret_ style and legacy anon/service_role JWTs die at end of 2026"
    - "A reader is pointed at CLAUDE.md for the MCP prohibition rather than being told it twice"
    - "A reader knows the Supabase DPA must be accepted"
    - "No secret value appears anywhere in the file"
  artifacts:
    - path: "docs/ops/accounts.md"
      provides: "Corrected Supabase status row and Supabase section"
      contains: "us-west-2"
  key_links:
    - from: "docs/ops/accounts.md"
      to: "CLAUDE.md ## Supabase access"
      via: "one-line cross-reference for the MCP prohibition"
      pattern: "CLAUDE\\.md"
    - from: "docs/ops/accounts.md Supabase section trailer"
      to: ".env.local"
      via: "env var names that actually exist"
      pattern: "SUPABASE_DEV_PROJECT_REF"
---

<objective>
Correct the two stale Supabase passages in `docs/ops/accounts.md` so they match
verified reality: one live project in us-west-2, not two planned projects in
us-east-1.

Purpose: `accounts.md` is the single status board for external accounts. It
currently says Supabase is "Not started" when the org, project, access token
and both API keys exist and are verified, and it promises a region that is
wrong and cannot be changed after creation. Anyone acting on the current text
would create a second project in the wrong region.
Output: An updated `docs/ops/accounts.md`. No other file changes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@docs/ops/accounts.md
@CLAUDE.md

**Ground truth — verified live this session. Do not re-derive, do not re-check
against the Supabase API, do not use the Supabase MCP connector:**

1. Region is `us-west-2`. Chosen deliberately over an EU region because most
   users are in North America. Region is fixed at project creation and cannot
   be changed. This is a settled decision, not drift.
2. Exactly one project exists: name `Fincwin United`, ref
   `cohmcbdfgqmiwykztrdg`, us-west-2, ACTIVE_HEALTHY, empty `public` schema.
   `fincwin-prod` does not exist.
3. The live project is named `Fincwin United`, NOT `fincwin-dev`. Renaming it
   is outstanding. Do not write the doc as if the rename happened.
4. PROJECT.md's dev/prod separation decision still stands — the target is two
   projects. Describe the target and today's reality distinctly; do not
   quietly reduce the target to one project.
5. Keys are new-style `sb_publishable_` / `sb_secret_`, both verified valid.
   Legacy `anon` / `service_role` JWTs are deprecated end of 2026. The env var
   is still literally named `SUPABASE_SERVICE_ROLE_KEY` even though it holds a
   new-style secret key — keep that name as-is.
6. `SUPABASE_ACCESS_TOKEN` exists and is verified (Management API HTTP 200).
   The Supabase CLI is NOT installed. Docker Desktop is NOT running.
7. The MCP connector is authorized against a different account (`Ealchapp`) and
   must not be used. Already documented in `CLAUDE.md` under
   `## Supabase access` — cross-reference it in one line, do not restate it.
8. A signed Supabase DPA (SCCs + UK ICO addendum) is the lawful-transfer
   mechanism for a us-west-2 database serving users globally. One line.

**Env vars that actually exist in `.env.local` (names only, verified):**
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DEV_PROJECT_REF`,
`SUPABASE_PROD_PROJECT_REF`, `SUPABASE_PROD_DB_PASSWORD`,
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`.
Note there is no `SUPABASE_DEV_DB_PASSWORD` — the current doc's
`SUPABASE_*_DB_PASSWORD` glob is wrong on both counts. List real names.

**Style — this file has a distinct voice. Match it, do not homogenise it:**
- Prose paragraphs in "What each account needs from you", never bullet lists.
  Read the Resend, PostHog and Apple entries and match that register.
- British spelling ("organisation").
- Hard-wrap at roughly 78 characters, like every other line in the file.
- Terse and factual. Add no headings. Do not restructure the document.
- The file header says it tracks status only and never holds a secret. Refs and
  region are not secrets and are fine. Never write a key, token or password.

**Out of scope — do not touch:** any other account section, `.env.local`,
`CLAUDE.md`, `supabase/config.toml`, the preflight script. Do not create
`fincwin-prod`, install the CLI, or rename the live project.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Correct the Supabase status row and Supabase section in accounts.md</name>
  <files>docs/ops/accounts.md</files>
  <action>
Two edits to `docs/ops/accounts.md`. Nothing else in the file changes.

**Edit A — the status table row (currently line 37).**

Replace:
```
| Supabase org "FincWin United" | Free plan | 00-03 and everything after | Not started |
```
with:
```
| Supabase org "FincWin United" | Free plan | 00-03 and everything after | Dev project live; prod not created |
```
Only the Status cell changes. The table uses unpadded pipes (`|---|`), so no
column-width alignment work is needed.

**Edit B — the Supabase section (currently lines 66-74).**

Replace the whole section body (the paragraph and its `→` trailer, keeping the
`### Supabase — plan 00-03` heading) with the following. Use it verbatim; it is
already hard-wrapped to ~78 characters and already in the file's voice.

```
### Supabase — plan 00-03
The organisation exists and one Free project is live: `Fincwin United`, ref
`cohmcbdfgqmiwykztrdg`, in us-west-2. That region was chosen over an EU one
because most users are in North America, and it is permanent — Supabase fixes
a project's region at creation. It serves as dev, but renaming it to
`fincwin-dev` is still outstanding, and `fincwin-prod` has not been created,
so the two-project split PROJECT.md calls for is only half done. The access
token is generated and verified against the Management API; the CLI and Docker
Desktop are still outstanding — install the CLI with Scoop, as
`npm install -g supabase` is unsupported. Keys are the new `sb_publishable_`
and `sb_secret_` style, and the legacy `anon` and `service_role` JWTs are
deprecated at the end of 2026, so do not mint them. Accept the Supabase DPA
while you are in the dashboard: it carries the Standard Contractual Clauses
and the UK addendum, which is what makes a us-west-2 database lawful for users
worldwide. Do not use the Supabase MCP connector on this project — see
`## Supabase access` in `CLAUDE.md`. Save each database password in a password
manager, since Supabase shows it once.
→ `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DEV_PROJECT_REF`,
`SUPABASE_PROD_PROJECT_REF`, `SUPABASE_PROD_DB_PASSWORD`,
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` — the last keeps its legacy name but holds a
new-style secret key.
```

Do not add a `SUPABASE_DEV_DB_PASSWORD` to the trailer: it does not exist in
`.env.local`.
  </action>
  <verify>
    <automated>cd "$(git rev-parse --show-toplevel)" && f=docs/ops/accounts.md && ! grep -q 'us-east-1' "$f" && grep -q 'us-west-2' "$f" && grep -q 'cohmcbdfgqmiwykztrdg' "$f" && grep -q 'fincwin-prod' "$f" && grep -q 'SUPABASE_DEV_PROJECT_REF' "$f" && grep -q 'SUPABASE_PROD_DB_PASSWORD' "$f" && ! grep -q 'SUPABASE_\*_DB_PASSWORD' "$f" && grep -q 'CLAUDE.md' "$f" && ! grep 'Supabase org' "$f" | grep -q 'Not started' && echo CONTENT_OK</automated>
    <automated>cd "$(git rev-parse --show-toplevel)" && ! grep -qE 'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}|sbp_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{16,}' docs/ops/accounts.md && echo NO_SECRETS_OK</automated>
    <automated>cd "$(git rev-parse --show-toplevel)" && test "$(git diff --name-only | tr -d '\r' | grep -v '^\.planning/' | wc -l)" -le 1 && git diff --name-only | grep -q 'docs/ops/accounts.md' && echo SCOPE_OK</automated>
    <automated>cd "$(git rev-parse --show-toplevel)" && awk '!/^\|/ && length > 82 {print FILENAME":"FNR": "length; bad=1} END {exit bad?1:0}' docs/ops/accounts.md && echo WRAP_OK</automated>
  </verify>
  <done>
`docs/ops/accounts.md` is the only changed source file. `us-east-1` appears
nowhere; `us-west-2` and the ref `cohmcbdfgqmiwykztrdg` appear. The status row
no longer says "Not started". The Supabase section states the live project, the
outstanding rename, the missing `fincwin-prod`, the outstanding CLI and Docker,
the new key style with the end-of-2026 legacy deprecation, the DPA line, and a
one-line pointer to `CLAUDE.md`. The `→` trailer lists only env vars that exist
in `.env.local`. No secret-shaped string was introduced. Lines stay within the
file's existing wrap.
  </done>
</task>

</tasks>

<verification>
Run all four automated gates above from the repo root. All must print their
OK token. Then eyeball `git diff docs/ops/accounts.md` and confirm the diff
touches exactly two regions: one table cell and the Supabase section.
</verification>

<success_criteria>
- `docs/ops/accounts.md` status row for Supabase reflects that dev is live and
  prod is not created.
- The Supabase section describes verified reality (one project, us-west-2, ref,
  outstanding rename, outstanding prod, outstanding CLI/Docker, new key style,
  legacy JWT deprecation, DPA, MCP cross-reference) in the file's prose voice.
- `us-east-1` is gone from the file.
- No key, token or password value was written.
- No other file was modified.
</success_criteria>

<output>
After completion, create
`.planning/quick/260922-sml-correct-supabase-details-in-accounts-md/260922-sml-SUMMARY.md`.
</output>
