---
phase: 01-money-core
partition: C
fixed_at: 2026-09-24
review_path: .planning/phases/01-money-core/01-REVIEW.md
iteration: 1
findings_in_scope: 16
fixed: 14
skipped: 2
status: partial
---

# Phase 1: Code Review Fix Report (Partition C)

**Fixed at:** 2026-09-24
**Source review:** .planning/phases/01-money-core/01-REVIEW.md (Partition C)
**Iteration:** 1

**Summary:**
- Findings in scope: 16 (4 critical, 8 warning, 4 info)
- Fixed: 14
- Skipped: 2 (WR-C08 by instruction, IN-C02 because the SHAs can't be checked offline)

## Per-finding outcome

| ID | Outcome | Commit | Note |
|---|---|---|---|
| CR-C01 | fixed | b8d1e1f | A new SQL lexer finds real comments. Any `squawk-ignore-file` that names an enforced rule, or names no rule (squawk treats that as every rule), is rejected outright. Probes P7-P9. |
| CR-C02 | fixed | 4d7211e | Rule lists drop trailing `-- ...` text, split on commas and whitespace, and are lower-cased. Unknown tokens count as enforced. Covers `--squawk-ignore` and `/* squawk-ignore */`. Probes P10-P15. Squawk's real parsing was checked by probing squawk 2.66.0 directly. |
| CR-C03 | fixed: requires human verification | c2b0fb3 | Floor bumps are matched only as whole top-level statements with comments stripped. Two forms count: the exact `update ... set value = 'X' where key = 'min_supported_version'`, and `insert (key, value) values (...)`, optionally with `on conflict (key) do update set value = excluded.value`. These do not count: bumps in comments, `on conflict do nothing`, bumps inside DO blocks, and bumps with extra predicates. Any of those prints a warning. Probes P16-P21. |
| CR-C04 | fixed | 323c8c6 | squawk's native binary is resolved through `squawk-cli/js/index.js` `getBinaryPath()` and spawned with an argv array and `shell: false`. The `npx --yes` fallback is gone. A missing squawk-cli fails closed. Filenames must match `^\d{14}_[a-z0-9_]+\.sql$`. Every probe now runs from a temp path that contains a space. Probes P22-P24. |
| WR-C01 | fixed | a5991d1 | Adds P25 (same-file bump and drop must fail). The bypass probes, missing-squawk probe (P24) and npx removal landed with CR-C01..C04. |
| WR-C02 | fixed: requires human verification | 0ab49db | Markers are paired per statement: every destructive statement needs its own marker among the comments directly above it. Rule: `floorBeforeLastRaise < X <= floor`. The finding's literal wording ("strictly greater than the floor before its file") contradicts `X <= floor`, so this reads it as: X must cite a floor that an earlier migration actually raised to. A marker at the seed floor or at a stale older floor fails. Malformed markers are errors. Documented in docs/ops/migration-compatibility.md. Probes P26-P29. |
| WR-C03 | fixed | 0fb9aca | The script flags contract breaks: drop function/procedure/routine/aggregate, drop (materialized) view, drop type/domain, drop schema, `alter ... rename`, and `alter type ... drop/alter attribute`. It checks each whole statement, including DO bodies and strings. Each match needs its own contract-ok marker. Docs and the PR checklist now cover RPC signatures, return shapes and view columns. Probes P30-P36. |
| WR-C04 | fixed | 2e901d1 | The hard-coded `KEPT_COMPAT_RULES` list is gone. The script reads `excluded_rules` from `.squawk.toml` (strict parse, fails closed), and any other rule name counts as enforced. `squawk-cli` is pinned to exactly `2.66.0` in package.json and package-lock.json. Probes P37-P38. |
| WR-C05 | fixed | f4cd0f4 | `supabase/setup-cli` now uses `version: 2.117.0`, matching package.json. `verify:migrations` fails if the two drift. |
| WR-C06 | fixed | d28180e | `Linking.openURL(...).catch(() => undefined)`. A test covers a rejected openURL; it failed before the fix with an unhandled rejection. |
| WR-C07 | fixed | df57b10 | `hitSlop` is derived from `space.touchMin` and `fontSize.meta` (vertical target at least 44pt), with `space.gapSm` horizontally. The row View's `accessibilityLabel` is removed, so TalkBack reads the attribution once. Two tests. |
| WR-C08 | skipped | — | Wired by plan 01-15 (blocked on Phase 0 00-16/17/18). No components were mounted. |
| IN-C01 | fixed | 92a2538 | New `src/i18n/mandatedCopy.ts` feeds both en keys and RateAttribution's URL. `src/i18n/__tests__/mandatedCopy.test.ts` asserts it equals `supabase/functions/fx-sync/openErApi.ts`. That file was imported, not edited. |
| IN-C02 | skipped | — | The repo has no lockfile or metadata recording action commit SHAs or the gitleaks image digest, so they can't be checked offline, and a guessed SHA would break or mis-pin CI. Pin them online (for example `gh api repos/actions/checkout/commits/v4`, `docker buildx imagetools inspect ghcr.io/gitleaks/gitleaks:v8.30.1`) and add a Dependabot `github-actions` entry. |
| IN-C03 | fixed | 2bcfc66 | `pending = ratePending \|\| !rateDate \|\| !rateSource`. It shows 'Rate pending' and never 'Rate of ' with no date or link. Two tests. |
| IN-C04 | fixed | 40d297b | Fake-timer test: the label goes from 'just now' to '1 minute ago' to '2 minutes ago', and the component's own 30s interval id is cleared on unmount. Checked by mutation: with the cleanup removed, the test fails. |

## Verification

- `npm run lint`: 0 errors. The 20 warnings were already there, in src/engine tests and src/i18n/index.ts.
- `npm run typecheck`: clean.
- `npm run lint:migrations`: `MIGRATION COMPAT OK (11 files, floor 0.1.0)`.
- `npm run verify:migrations`: `MIGRATION GATE OK` (38 probes plus the CLI-version check).
- `npm run check:money-mirror`: up to date.
- `npx jest src/ui src/i18n` (disposable config, deleted afterwards): 5 suites, 296 tests passed.

## Notes for the orchestrator

- **Parallel migration fixers:** the gate now flags `drop function`, `drop view` and `drop type`. If a Partition B fix drops an old function signature (for example to change the CR-B03 lookup arguments), the gate will require a `contract-ok` marker that cites a floor raised in an earlier migration. The simplest route is `create or replace` with the same signature, or leaving the old overload in place. This is intended expand/contract behaviour, not a regression.
- The gate still can't see a `create or replace function` that changes a return shape, or a dynamic `execute` that drops a column or table. Both are documented under "Not caught by the linter", and the PR checklist asks about them.
- `docs/ops/fx-operations.md` still calls `openErApi.ts` "the canonical strings". That is still true, and the new test enforces it. The file is outside this fixer's ownership, so it was not edited.

---

_Fixed: 2026-09-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
