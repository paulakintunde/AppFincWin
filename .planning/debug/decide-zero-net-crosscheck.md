---
status: awaiting_human_verify
trigger: "CROSSCHECK_SEED=349832153 run 925: engine fits_uses_net, plain calculator not_yet ($0 safety net, locked: true, $14,898 in it)"
created: 2026-11-10
updated: 2026-11-10
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "plain.ts freshAnswer (records fresh, QE-07 branch) returns not_yet at `if (rest > earlier)` without ever offering the net's lendable money, when the purchase's money test (margin) is >= 0. Here margin >= 0 only because `brought` (a stopped everyday cost's $55 share back on 31 Dec) is counted in the money test but not in the ladder, so the ladder is $17.26 short and the off net (all $14,898.22 lendable) is never asked."
  confirming_evidence:
    - "Probe: plainNet gives off=true, locked=false, lend=1489822 for the drawn net; the $0 / locked flag is handled identically on both sides (engine safetyNet.ts:60-78, plain.ts:527-535)."
    - "Instrumented freshAnswer: cost 19744, monthEnd -13728, later 12002, brought 5500, money 3774, pathLowest 6016, margin 3774 (>= 0), fromMonth 18003, rest 1741, earlier 15 -> line 833 not_yet."
    - "Same fixture without `replaces`: margin < 0, the margin<0 branch offers net.lend, plain = engine = fits_uses_net/protection_off/6001."
    - "Protection ON, unlocked, size $20,000: still disagrees (engine fits_uses_net, plain not_yet) -> not a zero-net bug. Protection on and locked: both not_yet (agree)."
  falsification_test: "After adding the net step to freshAnswer's margin>=0 branch, the seed still fails, or seeds 1/2/3 newly fail, or right-answer cases change."
  fix_rationale: "Every other ladder in plain.ts (plainOnce line 726-732, freshAnswer margin<0 line 825) and the engine ladder (judge.ts:281) try the net (net.lend / net.usable) before Not yet. SN-04/SN-05/SN-07 say Not yet only when the price is past spare money plus the whole net; with protection off ($0 size) the net's money counts like any other. freshAnswer's margin>=0 branch skipped that step."
  blind_spots: "Whether money freed by stopped costs (replaces.stops) should also count on the ladder (it would make this fits_unspent, not fits_uses_net). Neither side does that today; no approved case covers it; that is an owner question, not changed here."

## Symptoms

expected: engine and plain calculator agree on code, tight, costly, month figure for every random fixture
actual: seed 349832153, run 925: engine {code: fits_uses_net, month: 6001}; plain {code: not_yet, month: 6001}. Second test ("price limits and accounts with no rate") fails on the same fixture.
errors: expect(received).toEqual(expected) - code "not_yet" vs "fits_uses_net"
reproduction: CROSSCHECK_SEED=349832153 npx jest -c jest.engine.config.js src/engine/decide/v3/__tests__/crosscheck/crosscheck.test.ts
started: pre-existing (same failure on 0b7c97ae, before Phase 6)

Full counterexample: .planning/debug/decide-zero-net-crosscheck.fixture.json

## Eliminated

- hypothesis: "$0 safety-net size with locked: true is treated as locked by one side (D-61 violation)"
  evidence: "Both sides resolve it as off and unlocked, lend/usable = all $14,898.22 (plain.ts:527-535, safetyNet.ts:60-78). Engine variant is protection_off. Variants with locked absent / false / protect:false give the identical disagreement; protection ON + unlocked also disagrees."
  timestamp: 2026-11-10

## Evidence

- timestamp: 2026-11-10
  checked: probe of 11 variants through evaluate() and plainAnswer()
  found: "disagreement needs fresh records + a later purchase date + replaces.stops; drops away with replaces null or a same-day purchase; empty net -> both not_yet"
  implication: "the trigger is the stopped-cost money in plain's fresh money test, not the net's lock"
- timestamp: 2026-11-10
  checked: instrumented plain.ts freshAnswer
  found: "margin = money = monthEnd(-13728) + laterMoney(12002) + brought(5500) = 3774 >= 0; ladder rest 1741 > earlier 15 -> not_yet at plain.ts:833 with net.lend 1489822 never consulted"
  implication: "plain's margin>=0 branch has no net step"
- timestamp: 2026-11-10
  checked: engine judge.ts ladder (233-292) and oneOffPart (300-350)
  found: "cash kind ok (path low 6016); ladder B = 6001 + later 12002 = 18003, rest 1741, earlierRoom 15, above 0, net.usable 1489822 -> fits_uses_net taking $17.26 from the net (judge.ts:281-288); variant protection_off (judge.ts:918)"
  implication: "engine follows SN-05/SN-07"
- timestamp: 2026-11-10
  checked: right-answer cases with a $0 / off / locked net
  found: "SN-05 (protect false) and SN-07 (protect true, size 0, no locked field, $1,000 saved) approved: fits_uses_net / protection_off. No approved case has size 0 with locked: true, nor fresh records (recordsAsOf set) with a net dip, nor stops (SO-05/SO-06 only, same-day purchases)"
  implication: "the engine's answer here matches the closest approved cases; the plain helper is the wrong side"

## Resolution

root_cause: "Plain calculator (test helper) bug. plain.ts freshAnswer, margin >= 0 branch: `if (rest > earlier) return not_yet` (line 833) never tries the net's lendable money, unlike plainOnce (726-732), freshAnswer's own margin<0 branch (825) and the engine ladder (judge.ts:281). Exposed when the money test passes only thanks to stopped-cost money (`brought`) that the ladder does not count."
fix: "plain.ts freshAnswer: before Not yet, if rest <= earlier + net.lend answer fits_uses_net (protection_off when off) with the netDipFigure month figure, as the margin<0 branch does. Engine unchanged."
verification: "Seed 349832153: all 3 crosscheck tests pass (852 compared). Seeds 1, 2, 3: all pass. npm run check:right-answers: no approved expected block changed. npx jest -c jest.engine.config.js src/engine/decide/v3: 143 suites passed, 1 skipped; 2489 tests passed (revision test included, no engine answer changed, DECIDE_ENGINE_REVISION stays '06.1')."
open_question_for_owner: "Should money freed by costs a purchase stops (replaces.stops) count toward paying for a later-dated purchase on the ladder? Today neither side counts it (engine judge.ts ladder 233-292; plain ladder fromMonth/earlier), only plain's fresh money test does (brought, plain.ts:809). If yes, this fixture becomes fits_unspent (no net needed: $60.01 now + $120.02 Dec-Jan + $55 freed covers $197.44) and that would be an engine answer change needing approval. No approved case covers it."
side_lead: "Hand-made variant (not drawable by fixtureArb: recordsAsOf null with asOf 1 Nov and nothing recorded) gives engine fits_uses_net/6001 vs plain fits_unspent/60528. Not investigated."
files_changed: [src/engine/decide/v3/__tests__/crosscheck/plain.ts]
