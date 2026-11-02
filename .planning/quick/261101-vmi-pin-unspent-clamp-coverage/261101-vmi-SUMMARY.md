---
quick_id: 261101-vmi
status: complete
date: 2026-11-02
commit: 3416e419
files_modified:
  - src/engine/decide/v3/funds/__tests__/unspent.test.ts
---

# Quick Task 261101-vmi: Pin the unspent clamp in the engine tests

## Problem
CI's 100% branch-coverage gate on `src/engine/decide/` failed at 99.97% on main (after PR #92) and on PR #90, although neither changed code. The only uncovered line was `src/engine/decide/v3/funds/unspent.ts:104`, the clamp that keeps the anchor-month everyday base at zero or above. Only the I40 fast-check property reached it, and only when a random case drew a refund on or before the anchor day.

## Fix
A fixed test: a refund before the anchor, with no everyday spending yet, gives the same everyday figure as no refund when spending follows later in the month.

## Verification
- The new test passes with the clamp. With the clamp removed it fails (expected 12500, received 0).
- `src/engine/decide` suite: 2,658 passed; statements and branches at 100% (4,582 statements, 3,760 branches).
- ESLint is clean on the test file.

## Deviations
A test-only change, made by the orchestrator. It ships on PR #90 so one CI run unblocks both that PR and main.
