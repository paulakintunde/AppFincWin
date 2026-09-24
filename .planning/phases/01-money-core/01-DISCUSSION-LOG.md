# Phase 1: Money Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-24
**Phase:** 01-money-core
**Areas discussed:** Foreign-currency records, FX monitoring & holds, Offline & queued writes, Rounding & formatting, plus schema scope, FND-10 and home-currency location

---

## Foreign-currency records

| Question | Options | Selected |
|---|---|---|
| What a foreign transaction stores | Both, always / Follow auto-convert toggle / Original only + rate | Both, always |
| Rate for a backdated entry | Transaction date's rate / Today's rate / Transaction date, editable | Transaction date's rate |
| Home currency switch | Re-derive via stored rates / Convert at today's rate / Lock home currency | Re-derive via stored rates |
| Custom currency rate | User-set, user-updated (any reference ccy) / Pinned to USD / Fixed at creation | User-set, user-updated |
| Rates before fx-sync began | Backfill on demand / One-off bulk backfill / Both | Backfill on demand |
| Currency picker list | All Frankfurter v2 / Curated shortlist + search | All Frankfurter v2 |
| Editing a foreign transaction | Date change re-rates / Rate frozen at creation | Date change re-rates |
| Where home currency lives | User profile + household reporting ccy / Household only | User profile + household reporting ccy |

## FX monitoring & holds

| Question | Options | Selected |
|---|---|---|
| Staleness alert recipient | Operator by email / Operator + in-app notice / Error tracker only | Operator by email (Resend) |
| Staleness limit | Business-day aware (~4 days, override column) / Per-currency tiers now / Flat 48h | Business-day aware |
| Rate used while held | Last good rate / Block conversion | Last good rate |
| Second source never confirms | Hold + email, manual release / Auto-accept after N days | Auto-accept after N days |
| Auto-accept window | 2 days, email on hold + accept / 2 days silent / 1 day email | 2 days, email on hold + accept |
| open.er-api attribution | Beside fallback-sourced dates + About / About only | Beside fallback-sourced dates + About |

**Notes:** The user chose auto-accept over the recommended manual release, so there is no manual step unless the operator intervenes within the 2-day window.

## Offline & queued writes

| Question | Options | Selected |
|---|---|---|
| SYN-06 surface | Hook + status line on You / Hook only / Global banner | Hook + status line on You |
| Cache max age | 30 days / 7 days / Until sign-out | 30 days |
| Offline foreign entry without cached rate | Provisional, finalised on flush / Nearest cached is final / Save without conversion | Provisional, finalised on flush |
| Rate authority | Server on write / Client computes, server validates | Server on write |
| Queue collapsing | Defer to Phase 10 / Do it now | Defer to Phase 10 |
| Version conflict on flush | Reject + keep server copy / Last write wins | Reject + keep server copy |
| Permanent rejection | Park as failed, visible / Drop + toast | Park as failed, visible |

## Rounding & formatting

| Question | Options | Selected |
|---|---|---|
| Rounding mode | Half-up (away from zero) / Half-even | Half-up |
| Format locale | Device region / App language | Device region |
| Amount style | Prototype rules via Intl / Always full precision | Prototype rules via Intl |
| Input parsing | Region decimal mark, strict / Accept either mark | Region decimal mark, strict |
| Show cents storage | Profile row / Device-local | Profile row |

## Additional gray areas

| Question | Options | Selected |
|---|---|---|
| FND-10 check | CI rule + PR checklist / Checklist only / Old-client contract test | CI rule + PR checklist |
| Phase 1 tables | Money tables, full shape / Mechanisms only | Money tables, full shape |

## Claude's Discretion

- Computing home totals after a switch (client cross-rate vs a stored base rate)
- Column, table and status names
- The "near" threshold for confirming a held rate; the exact staleness default
- Mutation keys, `onlineManager` wiring
- Destructive-DDL detection tool
- Whether the fallback lives in `fx-sync` or a sibling function

## Deferred Ideas

- Per-row queue collapsing (Phase 10)
- Per-currency staleness tiers
- User-facing stale-rate notices
- Editable per-transaction rate override
- Old-client contract test for migrations
