---
quick_id: 261106-bf2
status: complete
date: 2026-11-06
commit: 8096e25a
---

# Quick 261106-bf2: switch Decide on for testers

`DECIDE_OPEN` and `DECIDE_V3` are true (owner 2026-11-06). `DECIDE_SETUP_VISIBLE` stays false (BO-06). Branch
`quick/decide-switch-on`, cut from `phase/05.4-decide-safety-patch` (PR #94); rebase onto main after #94 merges.

## How the switches combine (05.4-32 check)
- `decideEngine()` returns v3 when `DECIDE_V3 || profiles.decide_v3`. With the constant true, every account gets v3,
  whatever `profiles.decide_v3` says (it defaults to false). No data update is needed.
- `useDecideAccess().v3` is now true for everyone, so the Record-side v3 surfaces (account use row, occurrence actions,
  income steps, refund tags, pots, debts) show for every tester too.
- The 05.4-32 release gate (`scripts/decide-switch-check.mjs --online`, `docs/ops/decide-release-check.md`) only reads
  `profiles.decide_v3` / `decide_shadow`. It cannot see the build constant, so it no longer limits who gets v3. Fine while
  the app is testers-only; before any store build, demo or App Store review accounts would get v3 too.
- Shadow runs still run only for `profiles.decide_shadow` testers.
- With `DECIDE_OPEN` true, onboarding goes account -> `/setup/rough` -> first check -> history again (05-23 D-03).

## Tests changed
availability, useDecideAccess, DecideShadowHost, DecideComingSoonScreen, decideHiddenForEveryone, decideSetupPage,
record setup.

## Checks
- `tsc --noEmit`: clean.
- eslint (decide, shell/decide, record/setup, app): 0 errors, existing warnings only.
- jest src/features/decide, src/shell, src/features/record, src/features/income, src/features/devHarness, app:
  356 suites passed (1 skipped), 4479 tests passed (1 skipped).

## Shipping
JS only (no native or config change). Testers on preview builds get it by `eas update --channel preview --environment preview`.
