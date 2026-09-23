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

Enrolment has been started but cannot be submitted or completed until the D-U-N-S number is issued. No submission date is confirmed. Status: pending. Blocker: D-U-N-S not yet issued (requested 2026-09-15).

## URLs

- Enrolment: `https://developer.apple.com/programs/enroll/`
- D-U-N-S lookup: `https://developer.apple.com/enroll/duns-lookup/`
