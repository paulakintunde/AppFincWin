---
status: resolved
trigger: "Decide v3 cross-check 'borrowing on plans' fails for seed 745051798 (found by nightly Mutation (full) dry run, 2026-11-15, part 3)"
created: 2026-11-15
updated: 2026-11-15
---

# Debug: crosscheck borrowing on plans (seed 745051798)

(Symptoms, counterexample and constraints as in the original file; see git history / orchestrator brief.)

## Current Focus

- hypothesis: CONFIRMED. The plain calculator is stale: plainBorrowed/plainExpensive (plain.ts ~1582-1608) read the typed APR as nominal (APR/12) everywhere, but FIN-23 (06.1-30, owner D-26, commit f28129fd) says UK/EU read it as effective. The engine applies that via periodicRateFor in schedule.ts/exactInterestBp; plainPlanPayment already applies it, plainBorrowed/plainExpensive were not updated.
- next_action: none (resolved, owner-approved fix applied 2026-11-15)

## Evidence

- Probe (temporary test, removed): engine = fits_month/no_net, interest not "expensive". Plain = fits_by_borrowing/borrowing_costs_more; plainBorrowed = amount 400417, interest 40831 (10.2% of amount, over the 10% line).
- Fixture region is GB. Effective reading: monthly rate (1.099)^(1/12)-1 = 0.7898% (not 0.825%); hand-computed total interest share = about 9.74%, under the 10% line. Engine is right under the owner-approved rule; plain used 10.2%.
- Fixture is otherwise valid; the card minimum above its balance and overdraft rate "0" are not involved (both sides agree on the underlying fit code, fits_month).
- Same seed would only appear when region is GB/EU, a plan APR is typed, and the interest share lands between the nominal and effective figures near 10% (narrow band), which is why it is rare.

## Eliminated

- Invalid fixture (debt minimum above balance): not involved.
- Engine bug in exactInterestBp: formula takes the already-converted period rate; consistent with schedule totals.

## Resolution

- root_cause: plain calculator (crosscheck/plain.ts plainBorrowed + plainExpensive's exact 10% test) ignores the UK/EU effective-APR rule (FIN-23 / D-26) that the engine and plainPlanPayment apply.
- fix: plain.ts planPayments takes an optional country and, for UK/EU, runs the same schedule at plainPeriodRate over PLAIN_RATE_SCALE; plainBorrowed passes the fixture's country; plainExpensive's exact 10% test uses the effective period rate for UK/EU (APR/12 elsewhere). Own maths, no engine imports. Regression added in crosscheck/table.test.ts (verbatim seed 745051798 fixture, engine and plain agree; GB 9.9%/23 months not expensive, same plan in US is). Default crosscheck seed is now fixed (20261115); CROSSCHECK_SEED=random restores the clock seed, set in nightly.yml.
- verification: seed 745051798 passes all three crosscheck describes; whole crosscheck folder passes (137 tests) at the default seed; seeds 111, 222, 333 and one random clock seed (776179585) pass at 1000 runs; eslint clean on changed files.
- files_changed: [src/engine/decide/v3/__tests__/crosscheck/plain.ts, src/engine/decide/v3/__tests__/crosscheck/table.test.ts, src/engine/decide/v3/__tests__/crosscheck/crosscheck.test.ts, .github/workflows/nightly.yml]
