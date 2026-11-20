---
phase: 09-tiers-onboarding
plan: 25
status: complete
completed: 2026-11-19
---

# 09-25 Summary: phase gate, preview build, owner device pass

## Gate (Task 1)

Full jest green (992 suites, 36,978 tests at 93b8b866; 994 suites, 37,022 tests after the A2-W guard), deno 63, icons 64, pgTAP green in CI. 09-VALIDATION.md complete; 09-HUMAN-UAT.md written.

## Builds (Task 2)

- a577d4c4 (93b8b866), fcc53439 (ef3976b5), f1139d8f (91c1efc8, all device-check fixes built in).
- OTAs on branch preview, runtime 583da0c2: 99300f1e, 79a157af, 47171e95, 3f88c955, e2e22fef, 12fc258c.

## Owner device pass (Task 3): PASSED 2026-11-19

Pixel 6 and Pixel 9. A1-A9 all pass, most after fixes made during the pass:

| Finding | Fix |
|---|---|
| A2.4 Sample bar squeezed to a one-letter column at large text | stacks from font scale 1.3 (5c241f7c) |
| A2-W Creates, edits and deletes still worked in sample (Decide, safety net, pay details, Grow, Activity); a refused write queued on the phone | central plan guard at the write layer (MutationCache.onMutate + send wrapper), lock marks swept, sample writes never queued, chip hidden in sample (merge c0e2bb1e) |
| Features greyed out in sample with "Needs a plan" on every row | owner decision: switches work in sample, no per-row reason |
| A5-1..4 locked home forced to the first-account screen; Money rows looped; Manage subscription dead; Needs a plan lines looked tappable | gate only for writable plans, store page fallback, list styling |
| A8 Run setup card edge to edge | Home card margins |
| A7 TalkBack focus stayed on "1 of 11" / Skip | heading takes focus 500 ms after each question, label reads the number |
| Locked Home: double status-bar gap under the banner; FAB no lock; Add a bill / Add a transaction / Paste a list offered | inset 0 under the banner, FAB lock mark, actions hidden while read-only |

Server checks after the pass: no own records and no sample edits written by the test accounts; test setup removed (enforce_for empty, lapsed test row deleted).

## Open (not blocking close)

- Owner review list (09-HUMAN-UAT Part C1) and new copy rows marked "needs owner review" in 09-WORDING.md.
- Part B: Play license-tester purchases, Apple products/sandbox, DeviceCheck, App Review sandbox (Phase 11), iOS dev build before 2026-12-02, RevenueCat ENV-12, launch steps, owner grant.
- 09-24 partial: First read intro at the SampleAnswerIntro seam after 08.1 plans 19-20.
- plan_state left_at (lock.explainer.afterSeven, payer-after-leaving accuracy); trial reminder cold-start routing; plans.invite.waiting.expired; one orphan household with no members and no plan (Phase 8 leftover).
