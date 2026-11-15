---
quick_id: 261114-e9v
slug: decide-audit-fixes
status: complete
date: 2026-11-14
commits: [9643e263, d0895ecb, f4a040c5]
---

# Quick 261114-e9v: Decide audit fixes (problems 2, 3, 6)

## Done
- **Problem 2 (9643e263).** A one-off quick-estimate income, or pay that starts more than a month away, no longer counts as the usual month's pay.
  - `usualPayOf` in `month/series.ts` is used by `typicalIncome`, `needsInput` and `historyPay`.
  - Side effect: a user whose only income is one of these is now asked for their income, instead of being given an answer.
- **Problem 3 (d0895ecb).** Both ways to pay, the save-for-it ready date, the 90-day cash path and the pay days now read the quick lines, as the main answer already did.
  - `withQuickLinesPrepared` was taken out of `judgeWithQuickLines`, with the same answers.
  - `useCheckEngine` folds the quick lines in once per Prepared and check (`foldedOf`, a WeakMap cache like `paydaysOf`).
- **Problem 6 (f4a040c5).** New migration `20261114000100_decide_answered_undo.sql`. It re-issues `apply_patches` with the four `answered_*_at` columns in the `decide_settings` allowlist and type map, so Undo of "I answered this" works.

## Checks
- `check:right-answers`: no approved expected block changed.
- Decide engine jest (`src/engine/decide`): 4215 passed. The revision lock passed, so no `DECIDE_ENGINE_REVISION` bump was needed. The one failure was the barrel surface list; the new export was added, and that test now passes.
- `useCheckEngine` tests: 14 passed. tsc is clean, and eslint is clean on the changed files.
- New tests: 2 for `usualPayOf`, 1 for `withQuickLinesPrepared`, and 1 pgTAP assertion in test 97 (plan count 38). The pgTAP test runs in CI only (no local Docker).

## Owner-gated / follow-up
- Production push of `20261114000100` after the PR is green (`npm run supabase:db:push`).
- Phase 8 (Household) copies the latest `apply_patches` body. Its revision round must carry the 4 allowlist names and 4 type-map lines marked 261114.
