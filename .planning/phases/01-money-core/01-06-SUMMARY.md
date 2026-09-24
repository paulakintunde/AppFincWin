---
phase: 01-money-core
plan: 06
subsystem: ci
tags: [squawk, migrations, ci, postgres, expand-contract]

# Dependency graph
requires:
  - phase: 01-money-core
    provides: "01-05's scripts/gen-money-mirror-test.mjs --check (the third CI step this plan wires in); 20260922000200_app_config.sql's min_supported_version seed (the floor the compat checker reads)"
provides:
  - "squawk-cli scoped to 9 backward-compatibility rules via .squawk.toml, everything else (lock-safety, style, timeouts) excluded"
  - "scripts/check-migration-compat.mjs -- the contract-ok/min_supported_version floor check, npm run lint:migrations"
  - "scripts/verify-migration-gate.mjs -- 6-probe self-test proving the gate actually fails/passes correctly, npm run verify:migrations"
  - "CI checks job runs lint:migrations, verify:migrations, check:money-mirror after verify:gates"
  - ".github/pull_request_template.md -- expand/contract checklist"
  - "docs/ops/migration-compatibility.md -- the contract-ok marker convention, including the contract-ok-above-squawk-ignore ordering squawk itself requires"
affects: [every future plan that adds a destructive/breaking migration]

# Tech tracking
tech-stack:
  added: []  # squawk-cli was already installed as a devDependency by plan 01-01
  patterns:
    - "contract-ok comment placed ABOVE squawk-ignore in a migration file, not below -- squawk only associates squawk-ignore with the statement directly beneath it, so an intervening comment line breaks that association and the violation still fires"
    - "A floor bump (app_config.min_supported_version) and the destructive change it authorizes must ship in separate migration files, bump strictly earlier by filename order -- check-migration-compat.mjs evaluates a file's own markers against the floor as it stood after all EARLIER files only"
    - "Windows-safe CLI wrapping: check-migration-compat.mjs resolves the migration file list itself and spawns squawk with explicit paths (shell: true, required for a .cmd shim on Windows) instead of relying on npm script shell glob expansion, which cmd.exe does not do"

key-files:
  created:
    - .squawk.toml
    - scripts/check-migration-compat.mjs
    - scripts/verify-migration-gate.mjs
    - .github/pull_request_template.md
    - docs/ops/migration-compatibility.md
  modified:
    - package.json
    - .github/workflows/ci.yml

key-decisions:
  - "Excluded every squawk rule except the 9 the plan named as kept (ban-drop-column, ban-drop-table, ban-drop-database, renaming-column, renaming-table, changing-column-type, adding-required-field, adding-not-nullable-field, ban-truncate-cascade) -- verified against the live rule list at squawkhq.com/docs/rules (39 total rules) against the installed squawk-cli 2.66.0"
  - "pg_version set to 17.0 (Supabase CLI's default major version, since supabase/config.toml has no explicit [db] major_version override) and assume_in_transaction set to true (Supabase runs each migration file in its own transaction)"
  - "The .squawk.toml header comment deliberately avoids writing the literal string 'ban-drop-column' anywhere outside the excluded_rules array, so the plan's own acceptance check (grep -c 'ban-drop-column' .squawk.toml returns 0) is satisfied without weakening the explanatory comment's content"

requirements-completed: [FND-10]

# Metrics
duration: ~65min
completed: 2026-09-24
---

# Phase 1 Plan 6: Migration Compatibility Gate (FND-10) Summary

**squawk-cli scoped to 9 backward-compatibility rules, a contract-ok/min_supported_version floor checker that is Windows-shell-independent, a 6-probe self-test proving the gate genuinely fails and passes on the right inputs, CI wiring, a PR expand/contract checklist, and an ops doc -- including the contract-ok-above-squawk-ignore comment ordering squawk itself requires, discovered while building the self-test.**

## Performance

- **Duration:** ~65 min (includes a ~12 min `npm ci` in a from-scratch worktree with no `node_modules`)
- **Started:** 2026-09-24T17:40:00Z (approx)
- **Completed:** 2026-09-24T18:46:00Z
- **Tasks:** 2
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- `.squawk.toml` excludes every squawk rule except the 9 named in the plan (drop column/table/database, rename column/table, changing a column's type, adding a required/not-nullable field, truncate-cascade); `pg_version = "17.0"` and `assume_in_transaction = true` set per the installed Supabase CLI's default and its single-transaction-per-file migration behavior
- `scripts/check-migration-compat.mjs` runs squawk against an explicitly resolved file list (not a shell glob, so the npm script is Windows-safe) and separately enforces the `-- contract-ok: min_version >= X.Y.Z` convention: a `squawk-ignore` of a kept rule must be paired with a marker whose required version is already satisfied by `app_config.min_supported_version` as raised by strictly earlier migration files (by filename order) -- a floor bump and the change it authorizes can never share a file
- `scripts/verify-migration-gate.mjs` proves the gate on 6 probes, each run against a fresh temp copy of the real migrations (`supabase/migrations` is never written to): a bare drop fails naming the rule; a squawk-ignore with no marker fails naming the missing marker; a marker whose version the floor doesn't yet cover fails naming the floor; raising the floor in an earlier file then correctly marking the drop passes; `changing-column-type` and `adding-required-field` each fail correctly
- `npm run lint:migrations`, `npm run verify:migrations` and `npm run check:money-mirror` (from plan 01-05) all wired into the CI `checks` job after `verify:gates`
- `.github/pull_request_template.md` adds the expand/contract checklist, including the item squawk cannot see (RLS/grant changes)
- `docs/ops/migration-compatibility.md` documents the rule set, the marker convention and its required comment ordering, local commands, and the single-production-project reminder
- All three plan verification commands pass locally: `npm run lint:migrations && npm run verify:migrations && npm run check:money-mirror`; `npm run lint`/`npm run typecheck` both clean

## Task Commits

Each task was committed atomically:

1. **Task 1: squawk config and the contract-ok compatibility checker** - `2bba7e6` (feat)
2. **Task 2: Gate self-test, CI steps, PR checklist and ops doc** - `f972dd0` (feat)

**Plan metadata:** committed separately by the orchestrator after all worktree agents in this wave complete.

## Files Created/Modified
- `.squawk.toml` - squawk config, 9 kept compatibility rules, pg_version, assume_in_transaction
- `scripts/check-migration-compat.mjs` - squawk runner (explicit file list, Windows-safe) + contract-ok/floor checker
- `scripts/verify-migration-gate.mjs` - 6-probe self-test against temp copies of the real migrations
- `.github/pull_request_template.md` - expand/contract migration checklist
- `docs/ops/migration-compatibility.md` - rule set, marker convention (with required comment ordering), local commands
- `package.json` - `lint:migrations`, `verify:migrations`, `check:money-mirror` npm scripts added
- `.github/workflows/ci.yml` - three new steps in the `checks` job after `verify:gates`

## Decisions Made
- Kept exactly the plan's named 9 rules; every other rule in squawk 2.66.0's live 39-rule list is excluded, verified directly against squawkhq.com/docs/rules
- `.squawk.toml`'s explanatory comment lists the kept-rule *behaviors* in prose rather than spelling out `ban-drop-column` literally, so the file both documents the intent and satisfies the plan's literal `grep -c "ban-drop-column" .squawk.toml` returns-0 acceptance check
- `check-migration-compat.mjs` spawns the resolved `squawk.cmd`/`squawk` binary with `shell: true` unconditionally (required for a `.cmd` shim on Windows via `spawnSync`, harmless on POSIX) and surfaces a spawn error as a compat-check failure rather than letting it produce a silent empty-output pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `squawk-ignore` rule-name regex captured across line breaks**
- **Found during:** Task 2, first `verify-migration-gate.mjs` probe run (P2)
- **Issue:** `check-migration-compat.mjs`'s `SQUAWK_IGNORE_RE` used `[a-z0-9,\s-]+` for the rule-name capture group. `\s` matches newlines, so on a multi-line comment block (e.g. a `squawk-ignore` line followed by a `contract-ok` line, per the plan's example ordering) the capture greedily consumed the following line(s) up to the first character outside that class (a `.` in `public.transactions`), producing a "rule name" like `"ban-drop-column\nalter table public"` instead of `"ban-drop-column"`. That string never matched the kept-rules set, so the missing-marker check silently no-op'd and probe P2 (squawk-ignore with no contract-ok marker) passed when it should have failed.
- **Fix:** Narrowed the capture to `[^\r\n]+` so it stops at end of line, matching squawk's own comment-per-line convention.
- **Files modified:** `scripts/check-migration-compat.mjs`
- **Verification:** `node scripts/verify-migration-gate.mjs` — all 6 probes pass, including P2.
- **Committed in:** `f972dd0` (Task 2 commit; found and fixed before that commit, folded into the same commit as the self-test that caught it)

**2. [Rule 1 - Bug] `spawnSync` of the resolved `squawk.cmd` shim threw `EINVAL` on Windows**
- **Found during:** Task 1 verification, first `npm run lint:migrations` run
- **Issue:** `resolveSquawkBinary()` returns the absolute path to `node_modules/.bin/squawk.cmd` on Windows. `spawnSync(bin, args, { cwd, encoding })` without `shell: true` fails immediately with `EINVAL` (Windows cannot directly exec a `.cmd` file without going through `cmd.exe`), and the script's original error handling swallowed this into an empty-output, exit-1 result with no diagnostic — `MIGRATION COMPAT FAILED` with a blank "squawk reported violations:" line and no indication of the real cause.
- **Fix:** Added `shell: true` to the `spawnSync` call for the resolved binary path (harmless on POSIX, where the `squawk` shim is a plain executable) and added explicit handling of `result.error` so a genuine spawn failure is reported as `failed to spawn squawk: <message>` rather than presenting as an empty squawk violation.
- **Files modified:** `scripts/check-migration-compat.mjs`
- **Verification:** `npm run lint:migrations` — `MIGRATION COMPAT OK (9 files, floor 0.1.0)`.
- **Committed in:** `2bba7e6` (Task 1 commit; found and fixed before that commit was made)

**3. [Rule 3 - Blocking] squawk does not associate `squawk-ignore` with a statement across an intervening comment line**
- **Found during:** Task 2, building probes P3/P4 for `verify-migration-gate.mjs`
- **Issue:** The plan's own example marker ordering (`-- squawk-ignore <rule>` then `-- contract-ok: min_version >= X.Y.Z` then the statement) does not actually suppress squawk's warning: squawk only treats a `squawk-ignore` comment as covering the statement on the line **directly beneath it**. With a `contract-ok` comment in between, squawk still reports the violation, so a correctly-marked destructive migration would still fail CI at the squawk step even with a valid contract-ok marker and a sufficient floor.
- **Fix:** Adopted and documented the reverse ordering -- `contract-ok` **above** `squawk-ignore`, keeping `squawk-ignore` adjacent to the statement it covers. Verified directly against squawk 2.66.0 (`squawk --config .squawk.toml <file>` exits 0 only with this ordering). Reflected in `scripts/verify-migration-gate.mjs`'s P3/P4 probes and called out explicitly in `docs/ops/migration-compatibility.md`.
- **Files modified:** `scripts/verify-migration-gate.mjs` (probe ordering), `docs/ops/migration-compatibility.md` (documented convention)
- **Verification:** `npx squawk --config .squawk.toml <probe-file>` exits 0 with the corrected ordering, exits 1 (violation still reported) with the plan's original ordering; `node scripts/verify-migration-gate.mjs` — all 6 probes pass with the corrected ordering.
- **Committed in:** `f972dd0` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs in the compat-check script itself, found before/during its own self-test; 1 Rule 3 blocking correction to the marker convention's comment ordering, verified directly against the installed squawk binary rather than assumed from the plan's example)
**Impact on plan:** No scope creep. Deviation 3 is the one worth flagging for any future migration author: the marker convention is `contract-ok` above `squawk-ignore`, not the order shown in the plan's own `<action>` text -- `docs/ops/migration-compatibility.md` and the self-test are now the source of truth for the correct ordering.

## Issues Encountered
- The worktree had no `node_modules` (fresh checkout); `npm ci` with the untracked `.npmrc` (`legacy-peer-deps=true`) took ~12 minutes. Not a deviation, expected first-run setup per the environment notes.
- No Windows Jest "No tests found" issue encountered this plan -- this plan's verification is entirely Node-script/CI-config based, no Jest tests were added.

## User Setup Required
None. No external service configuration required. Squawk runs entirely locally/in CI against SQL files already in the repo; no production Supabase access was used or needed.

## Next Phase Readiness
- Every future migration in `supabase/migrations/` is now checked for backward compatibility before it can merge: `npm run lint:migrations` runs in CI immediately after `verify:gates`, followed by `npm run verify:migrations` (the gate's own self-test) and `npm run check:money-mirror` (plan 01-05's SQL/TS rounding-mirror drift check).
- Any later plan that needs to ship a genuinely destructive migration (none currently planned in Phase 1) has a documented, verified path: raise `app_config.min_supported_version` in an earlier file, then mark the destructive statement with `contract-ok` above `squawk-ignore` in a later file.
- No blockers for downstream plans. `01-08` (fx-sync edge function + fx monitoring migration) and `01-10` (src/db, src/data/queries, src/services/locale) ran concurrently in this wave and did not touch any file this plan owns.

## Self-Check: PASSED

- FOUND: .squawk.toml
- FOUND: scripts/check-migration-compat.mjs
- FOUND: scripts/verify-migration-gate.mjs
- FOUND: .github/pull_request_template.md
- FOUND: docs/ops/migration-compatibility.md
- FOUND commit: 2bba7e6 (Task 1)
- FOUND commit: f972dd0 (Task 2)

---
*Phase: 01-money-core*
*Completed: 2026-09-24*
