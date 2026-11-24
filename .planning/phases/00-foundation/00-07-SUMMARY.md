---
phase: 00-foundation
plan: 07
subsystem: enrolment
tags: [apple-developer, google-play, d-u-n-s, website-audit]
requirements: [FND-08, ENV-10, ENV-20, ENV-15, ENV-09]
key-files:
  modified:
    - docs/dependency-register.md
    - docs/enrolment/apple-org-checklist.md
    - docs/enrolment/website-audit.md
completed: 2026-11-23
---

# 00-07 Summary: store enrolment

## Outcome
- **Website audit (Task 1):** done 2026-09-23 (REMEDIATE, 9 items), re-audited 2026-09-26 (READY pending the D-U-N-S name match and a "registered in Canada" line). See `docs/enrolment/website-audit.md`.
- **D-U-N-S:** issued by 2026-11-19 (number not stored in the repo).
- **Apple Developer Program:** organisation enrolment (Lead Strategy Canada Inc) submitted (reported 2026-11-19) and **approved by Apple on 2026-11-22** (reported by the owner 2026-11-23). No individual account (D-03).
- **Google Play Console:** organisation account set up 2026-11-19; Android developer verification approved 2026-11-21. Third-party app store catalogue sharing: all four declined, managed individually.
- **Register (Task 3):** Apple Developer Program row is now `provisioned`; Sign in with Apple row moves from `deferred` to `pending` (00-20).

## Still open (outside this plan)
- Register the package name `com.fincwin.app` in the Play Console (owner step).
- The two remaining website items (legal-name match against D&B, "registered in Canada" footer line) are recommended, not blocking now that Apple has approved.
- 00-20 (Sign in with Apple, first iOS build on the iPhone XR) is unblocked and is the last Phase 0 plan.

## Deviations
- Apple's review took from 2026-11-19 to 2026-11-22; the plan allowed for a wait of days to weeks.

## Self-Check: PASSED
Register and checklist reflect the approval; ROADMAP marks 00-07 done (Phase 0 19/20).
