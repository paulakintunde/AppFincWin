# Apple Organisation Enrolment Checklist

Prerequisites for enrolling FincWin in the Apple Developer Program **as an organisation** (D-03: no individual-account fallback). Check each item before submitting enrolment.

- [x] Legal entity status: the company is already registered as a legal entity (D-01) — Lead Strategy Canada Inc
- [ ] D-U-N-S number assigned to the legal entity (D-01) — look up via `https://developer.apple.com/enroll/duns-lookup/`; request one if missing (~28 days). Requested 2026-09-15, still pending on day 7 as of 2026-09-22, ETA 2026-10-13 (+28 days). Not yet issued
- [ ] D&B record's legal name and address match the government registration exactly (D-02) — verify and record the date checked. Checked 2026-09-22: not yet verifiable, D-U-N-S has not been issued
- [ ] Registered legal name matches the desired App Store seller name; no DBA/trading name needed (D-02) — not yet confirmed
- [ ] The enrolling person is owner/director with authority to accept the Apple Developer Program License Agreement (D-02) — not yet confirmed
- [ ] Public website on the company domain with real company content and a contact route (ENV-20, D-06) — audit in plan 00-07; entity domain (leadstrategy.ca) is what Apple checks
- [x] Work email on the company domain that receives mail (D-07) — fincwin@leadstrategy.ca, Cloudflare Email Routing enabled, test email received
- [x] The Apple ID used for enrolment uses the work email address — fincwin@leadstrategy.ca is the designated Apple enrolment contact address
- [x] Enrolling as an organisation only — no individual-account fallback (D-03)

## Two domains (deviation from original plan)

This plan was originally written assuming a single company domain. There are two:
- **Entity domain — leadstrategy.ca** (Lead Strategy Canada Inc): holds the Apple enrolment contact address (`fincwin@leadstrategy.ca`) and is the domain Apple checks during organisation enrolment.
- **Product domain — fincwin.com** (FincWin): holds the public support address (`support@fincwin.com`) used in both store listings, and is the domain verified with Resend for outbound mail.

## Status: Apple Developer Program enrolment

Status as of 2026-09-25: **blocked: awaiting D-U-N-S**. Enrolment has been
started but cannot be submitted or completed until the D-U-N-S number is
issued. No submission date is confirmed. Requested 2026-09-15, still pending
on day 10, ETA 2026-10-13 (+28 days from request). Website audit
(`docs/enrolment/website-audit.md`) returned `Verdict: REMEDIATE (9 items)`
on 2026-09-23, re-confirmed unchanged on 2026-09-25 — the site also needs
remediation before submission, independent of the D-U-N-S wait, since Apple
rejects parked/placeholder-content organisation sites on sight (the entity
site's three visible "placeholder" admissions are the strongest of the nine
findings).

## Apple enrolment form — exact fields to have ready

Fill these out at `https://developer.apple.com/programs/enroll/` the moment
the D-U-N-S number is issued. Sourced from the form's own field labels (not
guessed) — verify against the live form at submission time in case Apple has
changed it since this was last checked (2026-09-25).

| Field | Value to enter | Source |
| --- | --- | --- |
| Entity type | Organization (never Individual — D-03, no fallback) | D-03 |
| Legal entity name | Exactly as it appears on the D&B/D-U-N-S record once issued — expected "Lead Strategy Canada Inc" but must be copied from the D&B record itself, not assumed | D-02; `docs/dependency-register.md` D-U-N-S row |
| D-U-N-S number | The 9-digit number from the lookup/request at `https://developer.apple.com/enroll/duns-lookup/` | D-01 |
| Website URL | `https://www.leadstrategy.ca/` (redirect target of the entity domain) — do not submit until the REMEDIATE items are resolved (see Status above) | D-06; website-audit.md |
| Work email / Apple ID | `fincwin@leadstrategy.ca` — the Apple ID used to sign in for enrolment must be this address | D-07 |
| Enrolling person's role | Owner/director with authority to accept the Program License Agreement (D-02) — confirm before submitting, no delegate accounts |
| Registered/legal address | The address on the D&B record — must match the government registration exactly (D-02); not yet available until D-U-N-S issues |
| App Store seller name | Same as the legal entity name unless a DBA is filed — D-02 assumes no DBA is needed |
| Payment | $99/year — do not submit payment details anywhere in this repo or its docs |

## Google Play Console organisation registration — steps

Registration at `https://play.google.com/console/signup`, prepared per D-04
(pulled forward to Phase 0) and `docs/ops/accounts.md`. **Re-verify D-U-N-S
requirement live before registering** — this checklist assumes Google Play's
organisation identity-verification step accepts/requires a D-U-N-S number
(consistent with D-04's "same D-U-N-S" decision and Google's published
business-verification requirements for Organization-type developer accounts
as of this project's research), but that has not been independently fetched
against a live Google Play Console Help page in this session (curl attempts
returned only JS-rendered shells or 404s on guessed URLs — the live help
article was not reachable through this tool). Confirm the exact accepted
identifiers on the actual signup form before paying, since Google has also
been known to accept alternative business identifiers by country.

1. Sign in at `https://play.google.com/console/signup` with the Google
   account designated for the company org (per D-08, personal login + org
   inside it — see `docs/ops/accounts.md`).
2. Choose **Organisation** account type (not Personal) — matches D-03/D-04's
   organisation-only pattern.
3. Enter the legal entity name exactly as it will appear on the D&B/D-U-N-S
   record ("Lead Strategy Canada Inc", pending confirmation once D-U-N-S
   issues), the entity website (`https://www.leadstrategy.ca/`), and
   complete whatever business/identity verification step the form presents —
   expect a D-U-N-S number field or equivalent business-ID field per the
   caveat above.
4. Pay the one-off $25 registration fee.
5. Complete any additional identity verification Google requests (may
   include a video call or document upload for organisation accounts — this
   can take longer than the $25 payment step).
6. Record the outcome in `docs/dependency-register.md` (Google Play Console
   row): registered with date, or the exact blocker with an ETA. Never
   record payment details.

## URLs

- Apple enrolment: `https://developer.apple.com/programs/enroll/`
- Apple D-U-N-S lookup: `https://developer.apple.com/enroll/duns-lookup/`
- Google Play Console signup: `https://play.google.com/console/signup`
