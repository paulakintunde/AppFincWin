# Work Email Setup

Status as of 2026-09-22.

## Two-domain deviation from the plan

This plan (00-01) was originally written assuming a single company domain.
There are actually two, matching the two-entity split recorded in
`docs/ops/accounts.md`:

- **Entity domain — `leadstrategy.ca`** (Lead Strategy Canada Inc): carries
  the Apple Developer Program enrolment contact address. Apple's organisation
  enrolment checks the entity's own domain and email, not the product's.
- **Product domain — `fincwin.com`** (FincWin): carries the public support
  address used in both the Apple App Store and Google Play store listings,
  and is the domain verified with Resend for outbound mail.

Both domains' DNS already lives in Cloudflare (D-05); no domain purchase or
migration was needed.

## Entity domain — leadstrategy.ca

- **Inbound:** Cloudflare Email Routing enabled for the domain. Address
  `fincwin@leadstrategy.ca` created, forwarding to the owner's personal
  inbox. A test email was sent and received successfully.
- **Purpose:** this is the Apple Developer Program enrolment contact
  address, and must stay on the entity's own domain per Apple's
  organisation-enrolment requirements.
- **Outbound (Resend):** `leadstrategy.ca` is not added to Resend. This
  domain is inbound-only for now.

## Product domain — fincwin.com

- **Inbound:** Cloudflare Email Routing enabled for the domain. Address
  `support@fincwin.com` created, forwarding to the owner's personal inbox. A
  test email was sent and received successfully.
- **Purpose:** this is the public support contact for both store listings.
- **Outbound (Resend):** `fincwin.com` is added to Resend and shows
  **Verified**. Outbound product mail sends as `no-reply@fincwin.com`.
- **DNS records added in Cloudflare (types and names only — see note
  below):**
  - SPF — TXT record on the domain, as provided by Resend
  - DKIM — TXT record on the domain, as provided by Resend
  - DMARC (`_dmarc` TXT record) — not confirmed as added in this session;
    add per Resend's guidance if not already present, per the D-07 setup
    steps in the plan

No record values (SPF/DKIM content, DMARC policy string) are written here or
anywhere tracked by git. No Resend API key, SMTP password or DKIM public-key
value is recorded in this file.

## D-07 caveat (verbatim)

Email Routing only forwards. To reply as the domain address, configure
Resend SMTP (smtp.resend.com, port 465, user `resend`, password = a Resend
API key) in the mail client, or use Gmail "Send mail as" with the same SMTP
settings. Apple's verification emails only need inbound.

## Status summary

| Address | Domain | Direction | Status |
| --- | --- | --- | --- |
| fincwin@leadstrategy.ca | leadstrategy.ca (entity) | inbound | provisioned — receives mail, forwards to owner's personal inbox |
| support@fincwin.com | fincwin.com (product) | inbound | provisioned — receives mail, forwards to owner's personal inbox |
| no-reply@fincwin.com | fincwin.com (product) | outbound (Resend) | provisioned — domain shows Verified in Resend |
| (none) | leadstrategy.ca (entity) | outbound (Resend) | not started — domain not added to Resend, inbound-only for now |
