---
status: awaiting_human_verify
trigger: "Nightly engine properties (FC_RUNS=2000) red every night since 2026-11-23: safetyNet.test.ts I-D41 (need_net_line first) and depletion.test.ts I-D54 (depletion block leads); diagnose only"
created: 2026-11-27
updated: 2026-11-27
goal: find_root_cause_only
---

# Debug: Nightly safety-net and depletion properties (later-dip line leads)

## Symptoms

DATA_START
- **Expected:** the Nightly workflow (job engine-deep-checks, "Engine properties (2,000 cases each)") is green on main.
- **Actual:** red every night since 2026-11-23 (last green 2026-11-22). Same two failures, fixed seeds, every night
  (runs 45999751398, 45619787424, 45407649950, 45179185759; run 45822373426 failed on a different check, see Side notes):
  1. `src/engine/decide/v3/__tests__/invariants/safetyNet.test.ts` "I-D41 a need leads with need_net_line and drops the wait line;
     a want or no purpose keeps the wait line first". Property failed after 222 tests,
     `{ seed: 1365, path: "2392:3:1:1:3:1:1:1:1:4:2:5:3:5:5:5:5:6:5:5:6:5:6:8:6:5:5" }`.
     Expected `need_net_line`, received `below_zero_later_without` (safetyNet.test.ts:148).
  2. `src/engine/decide/v3/__tests__/invariants/depletion.test.ts` "I-D54 the lines appear only under (a) to (c), lead the answer,
     add up, and never show a locked net lasting". Property failed after 1727 tests, seed 21588 (long path, kept in the repro test).
     `expect(block.length).toBeGreaterThan(0)`, received 0 (depletion.test.ts:48).
- **Timeline:** Phase 08.1 merged 2026-11-22 (PR #180, merge 36028c69). The first nightly after it is the first red one.
- **Stakes:** Decide is on for testers. If the engine were giving a wrong answer here, a real person could be told the wrong thing.
DATA_END

## Counterexamples in plain words

Both are the golden person Riley (pay $2,800 a month, rent $1,500, utilities $500, everyday spending drawn by the test).

1. **I-D41 (seed 1365).** Riley's usual month is already **$69 short** (costs $2,869 against $2,800 pay). The account holds $1,500, a
   $10,000 safety net is protected and full. Riley checks a **$510.01 need** (purpose "necessity"). Answer: **Fits, uses the safety
   net**, Large tier ("month already short"): $510 comes from money left from earlier months and 1 cent from the net.
   Facts, in order: `below_zero_later_without` (29 Sep 2027) · `usual_month_short` ($69) · `net_lasts` / `net_lasts_without`
   (144 months) · `balanced_month_room` · `month_balance_gap` · **`need_net_line`** · `net_used` · ...
   Because Riley spends $69 more than they earn every month, the account would go below $0 around Sep 2027 **even without this
   purchase**, and since 08.1-13 the engine says so in the first line. The property expects `need_net_line` to be the first line
   after the depletion lines, and it does not know the new later-dip line, so it reads the later-dip line as "first".

2. **I-D54 (seed 21588).** Riley again, usual month **$58 short**, $980 in the everyday account, $520 in an emergency fund with
   protection off. A **$1.00 one-off** (no purpose). Answer: **Fits, uses the safety net**, month already short. Facts:
   `below_zero_later_without` (27 Feb 2027) · `usual_month_short` ($58) · `balanced_month_room` · `month_balance_gap` · `net_used` · ...
   The usual month is short, so the depletion lines must appear and lead. They do appear, directly after the later-dip line.
   The property only sets aside `not_within_year` and `below_zero_without` before it looks for the block, so it sees the
   later-dip line at the lead position, finds a block of length 0 and fails.

In both cases the verdict, tier, split and figures are the ones the approved rules give. The only thing the property trips over
is the new line in first place.

## Root cause

Commit **606f0bc2** "feat(08.1-13): below_zero_later_without and below_zero_later_with on a Fits answer (facts only, owner option 1)",
merged to main with PR #180 (36028c69, 2026-11-22). judge/judge.ts:1006 places the later-dip fact together with
`below_zero_without`, at the top of the facts (or right after `overdraft_not_cleared`, CO-D-36), exactly as the owner approved
on 2026-11-20 ("option 1: keep the answer, add a dated line"; 08.1-13-SUMMARY.md: "It leads with below_zero_without").

08.1-06 had already taught both properties to skip `not_within_year` and `below_zero_without` (`D08` sets in safetyNet.test.ts:19
and depletion.test.ts:15). 08.1-13 added two more lines in the same place but did not add them to those sets. The properties were
not caught in PR CI because PR CI runs them at 200/300 cases with fixed seeds, and those draws never produce a Fits answer with
an already-short month and a later dip; at 2,000 cases they do (draw 222 and draw 1727).

So: **the tests are out of date with an owner-approved rule. The engine is not giving a wrong answer.**

## Evidence

- timestamp: 2026-11-27
  checked: `gh run view 45999751398 --log-failed` (and the four earlier runs)
  found: same two failures every night with the same seeds and paths (fixed seeds 0x0555 and 0x5454).
  implication: deterministic, not a flake.
- timestamp: 2026-11-27
  checked: replay of both properties with the recorded seed and path on origin/main 8beeabfd
  (`src/engine/decide/v3/__tests__/invariants/nightlySafetyNetDepletion.repro.test.ts`, `it.failing`)
  found: both fail as in CI; the shrunk facts above (first fact `below_zero_later_without` in both).
  implication: reproduces locally.
- timestamp: 2026-11-27
  checked: the same replay with `below_zero_later_without` and `below_zero_later_with` added to the skipped set
  found: with the two later-dip codes added to the D08 sets in safetyNet.test.ts and depletion.test.ts (temporary edit, reverted), both whole files pass at FC_RUNS=2000 on 8beeabfd: 9 of 9 tests, including I-D41, I-D54, I50, I51, I52, I-saved and I-D65.
  implication: the new line in first place is the whole cause.
- timestamp: 2026-11-27
  checked: real properties at FC_RUNS=2000 on 36028c69^1 (f4b63685, main before 08.1), on 36028c69 (08.1 merged) and on d3b1add1 (#188)
  found: f4b63685 (36028c69^1) green 2/2; bc4b5c68 (parent of 606f0bc2, on the 08.1 branch) green 2/2; 606f0bc2 red with the same seeds, same draws (222, 1727) and same received values; 36028c69 red, identical. d3b1add1 (#188) not run on its own: main 8beeabfd contains it and fails identically, and #188 does not touch the fact order.
  implication: introduced by 606f0bc2, landed on main by the 08.1 merge 36028c69. Later merges (#185, #186, #188) are not involved.
- timestamp: 2026-11-27
  checked: judge/judge.ts:1005-1006, depletion.ts:79-85, 08.1-13-SUMMARY.md decisions, 08.1-FOLLOWUPS.md line 48, right-answer cases SN-32..SN-34 in cases/safety-net.json
  found: the placement is deliberate and owner-approved (2026-11-20, option 1, facts only, never a code, variant or date change).
  implication: changing the engine to move the line would break an owner decision; the properties must learn the line.

## Proposed fix options

1. **Test fix (recommended).** Add `below_zero_later_without` and `below_zero_later_with` to the `D08` sets in
   safetyNet.test.ts and depletion.test.ts, with a comment citing 08.1-13 (owner 2026-11-20, option 1). Both properties then say
   what they meant: "after the below-zero lines at the top, the need line / depletion block comes first". No user sees any change.
   Also grep the other invariants for other "first fact" checks that list only the D08 pair (none failed at 2,000, but a shared
   constant, e.g. `TOP_LINES` in arbitraries.ts, would stop this happening again). Then flip the repro file's `it.failing` to `it`
   or delete it. Run both files at FC_RUNS=2000.
2. **Engine change: put the later-dip line lower** (for example after the depletion block or at the end of the facts). Changes
   what testers see and goes against the approved 08.1-13 placement and SN-32..SN-34; needs an owner decision, a revision bump,
   and a reason. Not recommended: a dip later in the year that happens even without the purchase is important news and belongs
   near the top.
3. **Test-only: lower the nightly count or pin different seeds.** Hides the problem; not recommended.

## Stakes for real users

None from this failure: the verdict, tier, split and every figure match the approved rules; only the line order differs from
what two old tests assumed, and that order is the approved one. Real users this matches: someone whose usual month already
runs a little short, who buys something that fits from money on hand or the net, now sees "your account goes below $0 on <date>
even without this" first, then the short-month lines, then the safety-net lines.

One wording point worth a look in the sign-off (not a bug): in counterexample 1 the answer says the account goes below $0 in
Sep 2027 even without the buy, while `net_lasts` says the safety net covers the $69 gap for 144 months. Both are true (the
12-month path tracks the everyday account; the net is separate money), but read together they may confuse. Worth checking the
copy of `below_zero_later_without` when the net covers the gap.

## Side notes

- Run 45822373426 failed differently: the crosscheck "agrees on 20000 random fixtures" (and the price-limits variant) with seed
  17686, path ...687 tests. Crosscheck uses a random seed only at night (#133); not looked at here.
- Local runs used a node_modules junction to C:\dev\fincwin-10b (the main checkout's node_modules is missing expo-haptics).

## Resolution

(pending owner approval of option 1)
