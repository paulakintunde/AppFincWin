# Phase 5: Decide UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-15
**Phase:** 05-decide-ui
**Areas discussed:** Quick check & first read, Verdict & impact screen, Decision: what gets written, Free/Pro, demo & screenshots, plus remaining small items

---

## Quick check & first read

| Question | Options | Selected |
|---|---|---|
| Quick check with logged months | Full verdict, paid in cash · Cash balance only | Full verdict, paid in cash |
| When cash doesn't cover it | State the gap, offer the full check · Use a rate on record | State the gap, offer the full check |
| Onboarding first read | Build in Phase 5, per LAUNCH order · Decide tab only | Build in Phase 5 |
| Hand-over to real history | Switch automatically, say so · Ask the user to switch | Switch automatically |

## Verdict & impact screen

| Question | Options | Selected |
|---|---|---|
| Step 3 density | Verdict + what breaks first · Full prototype port · Minimal | Verdict + what breaks first |
| Pause case (04 D-35) | Amber warning with the amount · Show it as an option | Amber warning with the amount |
| 'If saved' at 0% return | Rename to 'Kept', return optional · Keep the return input, default 0 | Rename to 'Kept' |
| Step navigation | Tappable once visited · Fully free | Tappable once visited |

## Decision: what gets written

| Question | Options | Selected |
|---|---|---|
| Go ahead | Pending entries by method · Decision record only · One pending expense only | Pending entries by method |
| Wait and save | Record + ready-by reminder · Create a savings goal | Record + reminder |
| Pass | Kept until deleted, no reminders · Auto-archive after 12 months | Kept until deleted |
| Estimate vs actual | From linked lines at 30 and 90 days · Ask the user | From linked lines |

## Free/Pro, demo & screenshots

| Question | Options | Selected |
|---|---|---|
| Gating | Entitlement hooks, all unlocked · No gating code yet | Entitlement hooks |
| Alternatives table is Pro but is screenshot 3 | Make alternatives free · Keep it Pro, label the shot | Make alternatives free |
| Household of two before Phase 8 | Personal demo now, toggle ready · Seed a 2-member demo household | Personal demo now |
| Demo scenario | Sofa fits, then car on a loan · Car only | Sofa fits, then car |

## Remaining items

| Question | Options | Selected |
|---|---|---|
| Date picker | Native picker + offset chips · Custom month grid | Native + chips |
| Limits storage | Per user, applies to all checks · Snapshotted per check | Per user, applies to all |
| Open-check recompute | On view, live · Stored, refreshed on data change | On view, live |
| ANL-06 events | Lifecycle + state only · Minimal | Lifecycle + state only |

## Claude's Discretion

- Snapshot builder query shape, table layout and RLS, exact copy wording, quick-check parser, item-type pre-fill.

## Deferred Ideas

- Goals from Wait (Phase 6), household screenshots (after Phase 8), paywall (Phase 9), level gating (Phase 9), custom date grid (not planned).
