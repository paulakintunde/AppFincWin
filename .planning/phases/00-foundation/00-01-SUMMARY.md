---
phase: 00-foundation
plan: 01
subsystem: infra
tags: [dependency-register, apple-enrolment, duns, cloudflare-email-routing, resend, google-play-console]

# Dependency graph
requires: []
provides:
  - "docs/dependency-register.md as the single living status source for every external dependency (ENV-09)"
  - "D-U-N-S request tracked with submission date and ETA (D-01)"
  - "Apple organisation enrolment checklist with real day-one status (D-02, D-03)"
  - "Two-domain record: entity domain (leadstrategy.ca) for Apple enrolment contact, product domain (fincwin.com) for support/store listings"
  - "Work email provisioned and receiving mail on both domains; outbound via Resend on the product domain"
  - "ROADMAP.md Play Console row pulled forward to Phase 0 (D-04)"
affects: [00-07, 00-14, 00-15, 00-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependency register: one Markdown table, git-tracked, status one of provisioned/pending/deferred, updated by whichever plan changes a row"
    - "Two-entity/two-domain split recorded consistently: entity (Lead Strategy Canada Inc, leadstrategy.ca) vs product (FincWin, fincwin.com)"
    - "Never write secret values (API keys, SMTP passwords, DKIM/DNS record values) into tracked docs — record record types and names only"

key-files:
  created:
    - docs/dependency-register.md
    - docs/enrolment/apple-org-checklist.md
    - docs/enrolment/email-setup.md
  modified:
    - .planning/ROADMAP.md
    - docs/dependency-register.md
    - docs/enrolment/apple-org-checklist.md

key-decisions:
  - "Two domains, not one: leadstrategy.ca (entity) carries the Apple enrolment contact address; fincwin.com (product) carries the public support address and outbound mail. Plan 00-01 and 00-07 were written assuming a single domain and are now corrected to cover both, per docs/ops/accounts.md."
  - "D-U-N-S requested 2026-09-15, still pending on day 7 as of 2026-09-22, ETA 2026-10-13 (+28 days) — no number issued yet."
  - "Apple Developer Program (organisation) enrolment started but cannot be submitted or completed until the D-U-N-S number is issued; no submission date invented or assumed."
  - "Google Play Console (organisation) enrolment not started; blocked on the same D-U-N-S number."
  - "leadstrategy.ca is inbound-only in Resend for now (not added); fincwin.com is added and shows Verified, and outbound product mail sends as no-reply@fincwin.com."

requirements-completed: [ENV-09, ENV-15, ENV-20, FND-08]

# Metrics
duration: ~35min active (Task 1 + Task 3); spans a multi-day checkpoint:human-action wait for Task 2
completed: 2026-09-22
---

# Phase 00 Plan 01: Dependency Register, Apple Enrolment Checklist, and Email Setup Summary

**Dependency register and Apple org enrolment checklist tracking a pending D-U-N-S request (ETA 2026-10-13) across a corrected two-domain setup — leadstrategy.ca for Apple's enrolment contact, fincwin.com for support and outbound mail.**

## Performance

- **Started:** 2026-09-22T07:07:21-07:00 (Task 1 commit)
- **Completed:** 2026-09-22T23:04:35-07:00 (Task 3 commit)
- **Tasks:** 3 (1 auto, 1 checkpoint:human-action, 1 auto)
- **Files modified:** 4 (docs/dependency-register.md, docs/enrolment/apple-org-checklist.md, docs/enrolment/email-setup.md created, .planning/ROADMAP.md)

Elapsed wall-clock time spans a `checkpoint:human-action` (Task 2: D-U-N-S lookup, Cloudflare Email Routing, Resend setup) that required the user's own logins and several days of real-world waiting on D&B/Apple. Active execution time across Tasks 1 and 3 was on the order of 30–40 minutes.

## Accomplishments
- Created `docs/dependency-register.md` as the single living status source for every external service (21+ rows), with the Google Play Console row pulled forward to Phase 0 per D-04
- Created `docs/enrolment/apple-org-checklist.md` recording real day-one enrolment status: legal entity and work-email prerequisites satisfied, D-U-N-S still pending
- Resolved the Task 2 human-action checkpoint: D-U-N-S requested and tracked with an ETA; work email provisioned and verified as receiving mail on both domains; Resend verified for the product domain
- Corrected a plan-level assumption: recorded two domains (entity + product) everywhere the plan said "the domain," instead of one
- Created `docs/enrolment/email-setup.md` with the D-07 reply-as-domain caveat verbatim, and a domain/address status table

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the dependency register, Apple enrolment checklist, and update the ROADMAP Play Console row** - `a7ed543` (docs)
2. **Task 2: Look up the D-U-N-S number and set up work email on the company domain** - checkpoint:human-action, resolved via user reply (no code/doc commit of its own; values consumed by Task 3)
3. **Task 3: Record D-U-N-S, domain and email status in the register and email-setup doc** - `b9c7311` (docs)

**Plan metadata:** (this commit, to follow)

## Files Created/Modified
- `docs/dependency-register.md` - Split the single "Domain" row into entity (leadstrategy.ca) and product (fincwin.com) rows; split the single inbound work-email row into one per domain; marked both inbound rows and the Resend outbound row `provisioned`; updated D-U-N-S row with requested date and ETA; updated Apple Developer Program and Google Play Console rows with current blocker/status
- `docs/enrolment/apple-org-checklist.md` - Ticked satisfied prerequisites (legal entity, work email, enrolment Apple ID, organisation-only enrolment); left D-U-N-S and D&B-match items unchecked with dated notes explaining why; added a "Two domains" section and an enrolment status section stating no submission date is confirmed
- `docs/enrolment/email-setup.md` - New file: records both domains' inbound Cloudflare Email Routing setup, Resend outbound status for the product domain only, DNS record types/names (never values), the D-07 caveat verbatim, and a status summary table. Forwarding target is described as "owner's personal inbox," never the actual address
- `.planning/ROADMAP.md` - Play Console row unchanged in this plan run (already updated in Task 1's commit `a7ed543`)

## Decisions Made
- Recorded the two-domain split as a documented deviation rather than silently picking one domain, since the plan's `docs/ops/accounts.md` context already established the two-entity model and both plans 00-01/00-07 needed correcting to match it
- Did not invent an Apple submission date; recorded "no submission date confirmed" and the explicit blocker (D-U-N-S not yet issued) instead
- Did not tick D&B-match or seller-name-match checklist items, since they cannot be verified before a D-U-N-S/D&B record exists — recorded a dated note explaining the gap rather than a false checkmark
- Kept DNS record values, SMTP passwords and API keys out of every tracked file; recorded only record types (SPF, DKIM, DMARC) and names, per the plan's threat model (T-00-01-01)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical / correctness] Two-domain split not represented in the original plan**
- **Found during:** Task 3, applying the user's resolved checkpoint values
- **Issue:** The plan's `dependency-register.md` and `apple-org-checklist.md` templates assumed a single company domain ("Domain," "Work email (inbound)" as single rows). The actual setup has two domains with distinct purposes (entity vs product), per `docs/ops/accounts.md`. Recording everything under one domain row would have been factually wrong and would mislead plan 00-07 (website/enrolment audit).
- **Fix:** Split the Domain row into "Domain (entity)" and "Domain (product)"; split the inbound work-email row into one per domain; documented the split explicitly in both `apple-org-checklist.md` and `email-setup.md` with a dedicated "Two domains" note.
- **Files modified:** docs/dependency-register.md, docs/enrolment/apple-org-checklist.md, docs/enrolment/email-setup.md
- **Verification:** Both domains and their respective addresses (fincwin@leadstrategy.ca, support@fincwin.com, no-reply@fincwin.com) are traceable in the register and the checklist, matching the user's resolved values exactly
- **Committed in:** b9c7311 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 missing-critical/correctness, per instruction from the orchestrator's `additional_instructions`)
**Impact on plan:** Necessary for the register to reflect reality; no scope creep — only the rows the plan already specified were split or corrected, no new services were added.

## Issues Encountered
None beyond the two-domain correction above, which was explicitly flagged in the executor's instructions rather than discovered independently.

## User Setup Required
None further for this plan. Remaining external waits (D-U-N-S issuance, Apple/Google org enrolment submission) are tracked in `docs/dependency-register.md` and will be picked up by plan 00-07.

## Next Phase Readiness
- `docs/dependency-register.md` is the live status source plans 00-07, 00-19 and 00-20 will update next
- Plan 00-07 (website audit, Apple/Google enrolment submission) is unblocked to proceed with everything except the actual Apple/Google submission step, which stays blocked on the D-U-N-S number (ETA 2026-10-13)
- No secrets were written to any tracked file; `grep -iE "re_[A-Za-z0-9]{10,}|p=MIG"` over the new/changed docs returns no matches

## Self-Check: PASSED

- FOUND: docs/dependency-register.md
- FOUND: docs/enrolment/apple-org-checklist.md
- FOUND: docs/enrolment/email-setup.md
- FOUND commit a7ed543 (Task 1)
- FOUND commit b9c7311 (Task 3)

---
*Phase: 00-foundation*
*Completed: 2026-09-22*
