---
created: 2026-11-15T09:00:00Z
title: Fix Decide crosscheck borrowing mismatch (seed 730688518)
area: testing
files:
  - src/engine/decide/v3/__tests__/crosscheck/crosscheck.test.ts:69-79
---

## Problem

The "cross-check calculator vs engine: borrowing on plans" property fails for seed 730688518. The engine answers "no" where the plain calculator answers "fits_by_borrowing" (variant null).

Counterexample: asOf 2026-10-15, USD, region GB. Monthly pay 1012599 next 2026-11-01, irregular (amounts 1174614, 1164488, 931591, 860709, 1194866, 1073354; day 2). Usual month bills 399369, everyday 289198. One checking account, balance 1262486. userLine 10125. Check: price 2931069, plan 23 months, APR 9.9, fees 1858, deposit 146553, first payment 2026-11-15.

It fails on main at 2493c61d too, so it predates 05.5 wave 2. The test draws a random seed each run, so CI fails now and then (PR #120's first run, 2026-11-15). This is Decide, the core value: one side gives a wrong answer.

Reproduce: `CROSSCHECK_SEED=730688518 npx jest src/engine/decide/v3/__tests__/crosscheck/crosscheck.test.ts`

## Solution

Find which side is wrong (engine borrowing path vs calculator). Likely areas: irregular pay, deposit plus fees on the first payment, or the userLine floor. Fix it, then pin this seed's fixture as a fixed regression case.
