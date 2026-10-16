# Phase 4: Decide Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-26
**Phase:** 04-decide-engine
**Areas discussed:** Hidden defaults & currency, What a 'month' means, Card & item rules, Engine scope & rounding

---

## Hidden defaults & currency

| Question | Options | Selected |
|---|---|---|
| Cash cushion default (prototype: fixed $6,000) | 3 months of own costs · Fixed amount per currency · No default, ask first | 3 months of own costs |
| Debt lines (36% debt service, 12× income unsecured) | Keep both, both editable · Keep as prototype · Stricter defaults | Keep both, both editable |
| Hardcoded dollar floors ($25 / $5,000 / $1,000 / $500) | Relative or per-record · Per-currency table · Home-currency numbers as-is | Relative or per-record |
| Projection return (prototype: 6.5%) | 0%, user can set a rate · Keep 6.5%, editable · Use a savings account's rate | 0%, user can set a rate |
| What counts as a month's costs | Spending + debt payments · Spending only · Everything that goes out | Spending + debt payments |
| Household-scope cushion | My share of household costs · Whole household's costs · Always my personal costs | My share of household costs |
| Card APR with no card on record | Mark the plan 'missing' · Typical rate for the market · Prototype 22.9% everywhere | Mark the plan 'missing' |

## What a 'month' means

| Question | Options | Selected |
|---|---|---|
| Spending basis (prototype: current month only) | Average of recent full months · Current month so far · Recurring commitments only | Average of recent full months |
| Window | Last 6 full months · Last 3 · Last 12 | Last 6 full months |
| Current unfinished month | Leave it out of averages · Pro-rate it · Include it as-is | Leave it out of averages |
| DCU-10 first read | Rough figures, cash-level answer only · Rough figures, full verdict · Real months only | Rough figures, cash-level answer only |
| 1–2 months of history | 'Not enough history', use worst month · Classify anyway · Treat as Variable | 'Not enough history', use worst month |
| Import edge months | Only fully covered months count · Count any month with data · You decide | Only fully covered months count |

## Card & item rules

| Question | Options | Selected |
|---|---|---|
| Card eligibility (prototype: English regex on name) | Explicit item type, regex as default · Port the regex exactly · Drop the rule | Explicit item type, regex as default |
| Minimum-payment rule (US-style $25 / 1% + interest) | Terms from the card record · One universal rule · You decide | Terms from the card record |
| Never-clears detection | Explicit check every month · Only the payment ≤ interest test | Explicit check every month |
| Household share rule | Category default, overridable per check · Household rule only · You decide | Category default, overridable per check |
| Capped item remainder | Rest paid from cash on the day · Mark 'missing' until split chosen · Let the user pick a second method | Rest paid from cash on the day |
| Blocked item paid by card | 'Missing' with a reason code · Allow it with a warning · You decide | 'Missing' with a reason code |

## Engine scope & rounding

| Question | Options | Selected |
|---|---|---|
| Options, alternatives, setbacks | In the engine, in Phase 4 · In the engine, during Phase 5 · In the UI layer | In the engine, in Phase 4 |
| Rounding | Half-up, reconcile the last payment · Always round costs up · You decide | Half-up, reconcile the last payment |
| Engine output | Codes and numbers only · Codes plus default English copy | Codes and numbers only |
| Prototype parity | Golden tests, with deliberate deviations listed · Fresh fixtures only | Golden tests, with deliberate deviations listed |

## Claude's Discretion

- Snapshot and verdict types, file layout, and the scaled representation of APR and ratios.
- Per-market (US / CA / UK) default values, to be sourced in research, never invented.
- How the "cut a named expense line" option picks its lines.
- The instalment `miss` bug fix, and the investment-mode branch.

## Deferred Ideas

- Per-market defaults beyond US, CA and UK.
- Investment-mode checks, how open checks recompute, and where limits are stored (offered, not discussed; the last two belong to Phase 5).

---

# Update session: 2026-10-15

**Trigger:** the context predated Phase 02.2 (recurring series, refund flags, pending/paid status). Areas: Lumpy & scheduled bills, What a month's spending is, Investment-mode checks, Revisit locked decisions (the user asked for advice on what is important or contradictory).

## Lumpy & scheduled bills

| Question | Options | Selected |
|---|---|---|
| Non-monthly bills in the spending basis | Smooth via series · Raw 6-month average · Widen to 12 months | Smooth via series |
| Upcoming bills and cash | Deduct bills due in 90 days · Deduct until next income · No, the cushion covers it | Deduct bills due in 90 days |
| Which series count | Confirmed series only · Confirmed + detected | Confirmed series only |
| Series amount after a change | Latest amount · Average of past hits | Latest amount |

## What a month's spending is

| Question | Options | Selected |
|---|---|---|
| Refunds | Net against spending · Net against original month · Ignore refunds | Net against spending |
| Pending/skipped lines in past months | Paid only · Paid + pending | Paid only |
| One-off spikes | Keep them in · User-marked one-offs excluded · Statistical trim | Keep them in |
| Purchases from past approved checks | Via records as they happen · Engine takes open checks as input | Via records as they happen |

## Investment-mode checks

| Question | Options | Selected |
|---|---|---|
| Interest-bearing debt during an invest check | Neutral fact code · Prototype behaviour · Make it a warning | Neutral fact code |
| Approved monthly investment later | Like existing investing · As a fixed commitment | Like existing investing |
| `inv` warning on invest checks | Skip inv for invest checks · Keep prototype behaviour | Skip inv for invest checks |

## Revisit locked decisions (Claude's review: two contradictions, two trust risks, one cleanup)

| Finding | Options | Selected |
|---|---|---|
| D-03 vs D-15: one share used for both household spending and the purchase | Separate shares · Keep one share | Separate shares |
| D-02 says investing is pausable, but the state rule says any shortfall is `no` (so `inv` only ever duplicates `month`) | Adjust, with the amount · Keep the prototype rule | Adjust, with the amount |
| First read: "fits" can leave $0 | Flag below-cushion (adjust) · Non-blocking code only · Keep as planned | Flag below-cushion |
| D-12: cautious on income, average on spending | Highest month · Keep the average | Highest month |
| D-16: card floor in the card's currency, snapshot in home currency | (recorded without a question) | Snapshot builder converts; the engine rejects mixed currencies |

Judged sound and left unchanged: D-04, D-06, D-07, D-17 (the SC-2 fixture uses interest-not-added), D-19…D-22.
