# Phase 2: Record - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-25
**Phase:** 02-record
**Areas discussed:** Planned vs paid + recurring, CSV import, Undo & history, Categories & entry fields

---

## Planned vs paid + recurring

| Question | Options | Selected |
|---|---|---|
| Transaction status | Yes: pending/paid · No: ledger of actuals only | Yes: pending/paid |
| How series produce entries | Materialise ahead as pending · Create on due date as paid · Clone into month on demand | Materialise ahead as pending |
| Overdue pending | Stays pending, flagged overdue · Auto-mark paid if autopay | Stays pending, flagged overdue |
| Edit scope | Ask: this one / this and future · This one only; series edited separately | Ask: this one / this and future |
| Schedule shapes | Prototype set + weekly/yearly · Full RRULE · Prototype set only | Prototype set + weekly/yearly |
| Pending in balances | Balance = paid only; totals show both · Everything counts | Balance = paid only; totals show both |
| Mark paid | One tap, optional adjust · Always confirm amount + date | One tap, optional adjust |
| Horizon | Through end of next month · Rolling 12 months | Through end of next month |
| End/delete series | Remove future pending, keep paid · Keep everything | Remove future pending, keep paid |
| Convert one-off | Yes, from entry or detail · Only when creating | Yes, from entry or detail |

## CSV import

| Question | Options | Selected |
|---|---|---|
| Formats | Generic + mapping · Generic + bank presets · Also own export | Generic + mapping |
| Account assignment | One target account per import · Account column in file | One target account |
| Duplicates | Flag in preview, skip by default · Import everything · Hard skip exact | Flag in preview, skip by default |
| Category | Rule-based guess, editable · Map category column only | Rule-based guess, editable |
| Imported status | Paid · Paid if past, pending if future | Paid |
| Undo | One step + batch id · Not undoable | One step + batch id |
| Onboarding | Optional step after first account · Only later | Optional step after first account |
| Recurring detection | Suggestions after import · Not in this phase | Suggestions after import |
| Pipeline | On device, batched inserts · Upload to Edge Function | On device |
| Size | ~5,000 rows cap · No cap | ~5,000 rows |
| FX | Reuse D-03/D-17 · Pre-fetch date range | Reuse D-03/D-17 |
| Names | Keep raw · Learn renames | Keep raw |

## Undo & history

| Question | Options | Selected |
|---|---|---|
| Persistence | Server-side per user · On device · In memory | Server-side per user |
| Rollback | Everything back to that point · Only that step | Everything back to that point |
| Conflict | Any version change refuses · Field-level merge | Any version change refuses |
| Granularity | One user action = one step · One record = one step | One user action |
| Refused step | Stays, marked, ages out · Removed | Stays, marked |
| Offline | Queued like any write · Online only | Queued |
| Delete reversal | Soft delete · Hard delete + re-insert | Soft delete |
| Expiry | 12-deep only · 12-deep + 30 days | 12-deep only |
| Toast | 3.2s, longer for destructive · 3.2s everywhere | 3.2s, longer for destructive |
| History visibility | Now, gate later · Hidden until levels | Now, gate later |

## Categories & entry fields

| Question | Options | Selected |
|---|---|---|
| Colours | Existing swatch pairs · Free picker | Existing swatch pairs |
| Ownership | Household-scoped · Per user | **Per user** (against recommendation) |
| Built-ins | Seeded, fully editable · Fixed | Seeded, fully editable (interpreted as per user, given ownership answer) |
| Remove in-use | Archive or merge · Block | Archive or merge |
| Shared txn category (follow-up) | Each member own category · Creator's shown · Reconsider household | Each member own category |
| Fields | Name/payee · Payment type · Tax flag · Receipt | All four initially chosen |
| Tax flag (conflict follow-up) | Drop · Neutral tags · Reopen scope | Drop — honours Out of Scope |
| Receipts (scope follow-up) | Defer · Add to Phase 2 | Defer |

**Notes:** Tax flag conflicted with REQUIREMENTS.md Out of Scope ("tax categorisation"); receipts had no v1 requirement. Both were surfaced and resolved.

## Claude's Discretion

Activity list mechanics (search, amount filter, bulk select), account UI and foreign-currency balance display, server materialisation mechanism, naming, similarity thresholds, ANL-05 event names, ENV-16 task placement, future-dated manual entry default status.

## Deferred Ideas

Receipt attachments; bank CSV presets; own-format lossless import; payee rename rules; field-level undo merge; autopay; RRULE schedules; tax flag (dropped).
