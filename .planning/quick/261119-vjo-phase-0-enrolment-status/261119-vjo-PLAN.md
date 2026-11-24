---
phase: quick-261119-vjo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/dependency-register.md
  - docs/enrolment/apple-org-checklist.md
  - .planning/STATE.md
  - .planning/ROADMAP.md
autonomous: true
requirements: [ENV-10, ENV-20]
must_haves:
  truths:
    - "The register shows D-U-N-S as issued by 2026-11-19, with no number written anywhere"
    - "The register shows Apple organisation enrolment as submitted and awaiting Apple review, not enrolled"
    - "The register shows the Play Console organisation account as set up, with Android developer verification pending and package names not yet registrable"
    - "The third-party app stores decision (manage individually, decline all four, decline each new request within 30 days, revisit in Phase 11) is recorded"
    - "STATE.md no longer says ETA 2026-10-13 for Phase 0; 00-07 and 00-20 stay open"
  artifacts:
    - path: "docs/dependency-register.md"
      provides: "Updated D-U-N-S, Company website, Apple, Google rows plus a third-party stores row"
      contains: "Third-party app stores"
    - path: "docs/enrolment/apple-org-checklist.md"
      provides: "D-U-N-S item ticked with dated note; status section says submitted"
      contains: "issued by 2026-11-19"
  key_links:
    - from: ".planning/STATE.md"
      to: "docs/dependency-register.md"
      via: "Phase 0 blocker line names the new wait (Apple review, Play verification)"
      pattern: "Apple review"
---

<objective>
Record the store-enrolment facts the owner reported on 2026-11-19 in the Phase 0 status docs. Docs only, no code.

Owner facts (the only facts to record; invent nothing else, no dates beyond these):
1. D-U-N-S number issued. Exact issue date unknown: write "issued by 2026-11-19". NEVER write the number itself.
2. Apple Developer Program (organisation) enrolment SUBMITTED, awaiting Apple's review. Not enrolled. 00-20 (Sign in with Apple, first iOS build on iPhone XR) stays blocked until membership is active. Submission date: write "submitted (reported 2026-11-19)" — do not claim it was submitted on 2026-11-19.
3. Google Play Console organisation account (Lead Strategy Canada Inc) set up (reported 2026-11-19). Android developer verification PENDING (Play shows: "We're checking your verification status so that you can register package names"). Package names (`com.fincwin.app`) cannot be registered until it clears.
4. Owner decision, Play Console "third-party app stores" catalogue sharing: chose "I'll manage all third-party app stores individually" and declined all four listed (Aptoide Games, Galaxy Store, Onside Store, Skich Store) for now. Reasons: hard-paywall subscriptions via RevenueCat/Play Billing are untested on those stores; support burden; the upcoming Kint rename. Trap: if a new store's request is ignored for 30 days, Google publishes anyway — each new request must be actively declined. Revisit (e.g. Galaxy Store) after launch, in Phase 11 store work.

Output: four files updated, plain English, short, dated 2026-11-19.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
Working tree: C:\dev\fincwin-enrol (branch quick/261119-enrolment-status). Use absolute paths under C:\dev\fincwin-enrol only. Do NOT touch C:\dev\fincwin.

@C:\dev\fincwin-enrol\docs\dependency-register.md
@C:\dev\fincwin-enrol\docs\enrolment\apple-org-checklist.md

Current text to replace (verified by the planner):
- dependency-register.md line 7 (D-U-N-S row): status `pending`, blocker "blocked: awaiting D-U-N-S — requested, not yet issued", last checked 2026-09-26, notes "Requested 2026-09-15; ... ETA unchanged at 2026-10-13..."
- line 10 (Company website row): "Two items remain: legal-name-vs-D&B match (blocked on the D-U-N-S itself) and the entity footer stating "registered in Canada""
- line 14 (Apple Developer Program row): blocker "blocked: awaiting D-U-N-S (requested 2026-09-15, ETA 2026-10-13)..."; notes "Enrolment started but cannot be submitted/completed until D-U-N-S is issued..."
- line 15 (Google Play Console row): blocker "blocked: awaiting D-U-N-S (same request as Apple; ETA 2026-10-13)"; notes "$25 one-off. Not started. ... D-U-N-S requirement ... assumed per D-04 but not independently re-verified live..."
- line 30 (App identifier row) stays as is.
- STATE.md line 38: "Phase: 00 (foundation) — 18/20; 00-07 and 00-20 wait on Apple enrolment."
- STATE.md line 156: "- **Phase 0 verification** — run the gsd-verifier for Phase 00 once 00-07 and 00-20 have SUMMARY files (triggered by the D-U-N-S number, ETA 2026-10-13, then Apple enrolment)."
- ROADMAP.md has no stale D-U-N-S/ETA status line. Only line 82 (`- [ ] 00-07-PLAN.md — Website audit, Apple org enrolment submission, Play Console registration (W2)`) gets a short status suffix. Leave lines 49, 118-121 (planning guidance tables) and line 1686 (progress table, 18/20) unchanged.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update the dependency register</name>
  <files>C:\dev\fincwin-enrol\docs\dependency-register.md</files>
  <action>
Edit only these rows; keep the 8-column table shape (escape no pipes inside cells). Set Last checked to 2026-11-19 on every row you edit.

- D-U-N-S row: Status `provisioned`. Blocker `—`. Notes: "Requested 2026-09-15; issued by 2026-11-19 (exact issue date not recorded). The number is not stored in this repo." Remove the ETA 2026-10-13 text.
- Company website row: keep the 2026-09-26 audit history short; change the closing note so the legal-name-vs-D&B match is "now checkable (D-U-N-S issued by 2026-11-19), not yet checked" and the "registered in Canada" footer line stays as recommended/not yet added (do not claim either item is done). Status stays `pending`.
- Apple Developer Program row: Status `pending`. Blocker: "awaiting Apple review — organisation enrolment submitted (reported 2026-11-19); not yet enrolled". Notes: keep "$99/yr. No individual fallback (D-03)." and "00-20 (iOS) stays blocked until membership is active; Phase 0 is not complete until 00-20 lands". Remove the "cannot be submitted until D-U-N-S" text and ETA.
- Google Play Console row: Status `pending`. Blocker: "Android developer verification pending (Play: \"We're checking your verification status so that you can register package names\"); package names (com.fincwin.app) cannot be registered until it clears". Notes: "Organisation account (Lead Strategy Canada Inc) set up (reported 2026-11-19). $25 one-off. The earlier D-U-N-S caveat (requirement assumed, not re-verified) is moot: the D-U-N-S is issued and the account is set up." Do not record payment details or the D-U-N-S number.
- Add a new row directly after the Google Play Console row: Service "Third-party app stores (Play catalogue sharing)"; Needed for "nothing at launch"; Status `deferred`; Account / org "Google Play Console (company)"; Blocker "owner decision 2026-11-19"; Must land by "revisit in Phase 11"; Last checked 2026-11-19; Notes: "Chose \"I'll manage all third-party app stores individually\"; declined Aptoide Games, Galaxy Store, Onside Store, Skich Store. Why: hard-paywall subscriptions via RevenueCat/Play Billing untested there, support load, Kint rename coming. Trap: a store request left unanswered for 30 days is published anyway — decline each new request. Revisit after launch (e.g. Galaxy Store) in Phase 11 store work."
- Sign in with Apple row (line 21): only change its Last checked to 2026-11-19 and blocker to "Apple Developer Program membership (ENV-10; enrolment submitted, awaiting review)". Nothing else.
  </action>
  <verify>
    <automated>cd /c/dev/fincwin-enrol && ! grep -nE "ETA 2026-10-13|ETA unchanged" docs/dependency-register.md && grep -n "Third-party app stores" docs/dependency-register.md && grep -n "issued by 2026-11-19" docs/dependency-register.md && ! grep -nE "\b[0-9]{9}\b|[0-9]{2}-[0-9]{3}-[0-9]{4}" docs/dependency-register.md</automated>
  </verify>
  <done>No "ETA 2026-10-13" remains in the register; the D-U-N-S, Company website, Apple, Google and Sign in with Apple rows carry 2026-11-19; the third-party stores row exists; no 9-digit number appears.</done>
</task>

<task type="auto">
  <name>Task 2: Update the Apple org checklist</name>
  <files>C:\dev\fincwin-enrol\docs\enrolment\apple-org-checklist.md</files>
  <action>
- Line 6 (D-U-N-S item): tick it `[x]`. Replace the trailing status with: "Requested 2026-09-15; issued by 2026-11-19 (number not stored here)."
- Line 7 (D&B record match): leave unticked. Replace "Checked 2026-09-22: not yet verifiable, D-U-N-S has not been issued" with "Now checkable (D-U-N-S issued by 2026-11-19); match not yet recorded." Do not infer the match from the submission.
- Lines 8, 9, 10: leave unticked and unchanged (the owner did not report on them; submission alone does not prove them).
- "## Status: Apple Developer Program enrolment" section: replace the paragraph with a short dated one: "Status as of 2026-11-19: **submitted, awaiting Apple's review** (reported by the owner 2026-11-19). Not yet enrolled. 00-20 (Sign in with Apple, first iOS build on the iPhone XR) stays blocked until membership is active. D-U-N-S issued by 2026-11-19. Website audit history: REMEDIATE (9 items) 2026-09-23, READY pending two items after the 2026-09-26 re-audit (see `docs/enrolment/website-audit.md`)."
- "## Google Play Console organisation registration — steps" section: add a dated status line directly under the heading: "Status as of 2026-11-19: organisation account (Lead Strategy Canada Inc) set up; Android developer verification pending, so package names cannot be registered yet. The D-U-N-S caveat below is moot now that the number is issued and the account exists. Third-party app stores: owner chose to manage them individually and declined all four for now (see the register row)." Leave the numbered steps as historical.
  </action>
  <verify>
    <automated>cd /c/dev/fincwin-enrol && grep -n "^\- \[x\] D-U-N-S" docs/enrolment/apple-org-checklist.md && grep -n "awaiting Apple's review" docs/enrolment/apple-org-checklist.md && grep -n "Status as of 2026-11-19" docs/enrolment/apple-org-checklist.md && ! grep -nE "\b[0-9]{9}\b" docs/enrolment/apple-org-checklist.md</automated>
  </verify>
  <done>D-U-N-S item ticked with dated note; D&B-match, legal-name, authority and website items still unticked; Apple status says submitted/awaiting review; Play section has a 2026-11-19 status line.</done>
</task>

<task type="auto">
  <name>Task 3: Update STATE.md and the ROADMAP 00-07 line</name>
  <files>C:\dev\fincwin-enrol\.planning\STATE.md, C:\dev\fincwin-enrol\.planning\ROADMAP.md</files>
  <action>
STATE.md (status text only — do NOT mark 00-07 complete, do NOT write any SUMMARY, do NOT change the 18/20 count):
- Line 38 becomes: "Phase: 00 (foundation) — 18/20. 2026-11-19: D-U-N-S issued; Apple org enrolment submitted, awaiting Apple review; Play Console org set up, Android developer verification pending. 00-07 and 00-20 stay open until Apple membership is active and Play verification clears."
- Line 156 becomes: "- **Phase 0 verification** — run the gsd-verifier for Phase 00 once 00-07 and 00-20 have SUMMARY files. As of 2026-11-19 the D-U-N-S is issued; waits now on Apple review of the submitted enrolment and Play developer verification (see `docs/dependency-register.md`)."
- Use Edit with exact string matches; touch no other line (other sessions edit this file, keep the diff tiny).

ROADMAP.md:
- Line 82 only: append to the end of the 00-07 item " — 2026-11-19: D-U-N-S issued, Apple enrolment submitted (awaiting review), Play org set up (verification pending)". Keep `- [ ]` unticked and keep "(W2)" in place before the suffix. No other ROADMAP edits (the progress table row 1686 stays 18/20 In Progress).
  </action>
  <verify>
    <automated>cd /c/dev/fincwin-enrol && ! grep -n "ETA 2026-10-13" .planning/STATE.md && grep -n "awaiting Apple review" .planning/STATE.md && grep -n "^- \[ \] 00-07-PLAN.md.*2026-11-19" .planning/ROADMAP.md && grep -n "| 0. Foundation | 18/20 | In Progress" .planning/ROADMAP.md && git diff --stat</automated>
  </verify>
  <done>STATE.md lines 38 and 156 carry the 2026-11-19 status with no 2026-10-13 ETA; ROADMAP 00-07 stays unticked with a dated suffix; git diff touches only the four planned files.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo docs → public GitHub history | anything written here is permanent in git history |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-vjo-01 | I | D-U-N-S number, payment details | mitigate | Never write the D-U-N-S number or any payment detail; Task 1 and 2 verify gates reject any 9-digit number |
| T-vjo-02 | R | status records | mitigate | Write only owner-reported facts with "reported 2026-11-19" / "issued by 2026-11-19" wording; no invented dates or ticks |
</threat_model>

<verification>
- `git diff --stat` in C:\dev\fincwin-enrol lists exactly the four files.
- No file contains a 9-digit D-U-N-S-like number.
- No "ETA 2026-10-13" remains in the register or STATE.md.
</verification>

<success_criteria>
All four owner facts recorded, dated 2026-11-19, in the register and the checklist; STATE.md and the ROADMAP 00-07 line reflect the new wait (Apple review, Play verification); 00-07 and 00-20 remain open; nothing invented.
</success_criteria>

<output>
After completion, create `C:\dev\fincwin-enrol\.planning\quick\261119-vjo-phase-0-enrolment-status\261119-vjo-SUMMARY.md`
</output>
