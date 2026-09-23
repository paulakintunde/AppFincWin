# Phase 0: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-22
**Phase:** 0-Foundation
**Areas discussed:** Company & enrolment, Sign-in & first launch, Analytics consent moment, Quality gates & infra

---

## Company & enrolment

| Question | Options presented | Selected |
|---|---|---|
| Company status | Registered, D-U-N-S unknown / Registered, has D-U-N-S / Not yet registered | Registered, D-U-N-S unknown |
| Domain | Domain owned already / Need to pick & buy one / Company domain ≠ app domain | Domain owned already |
| Website platform | WordPress.com (rec) / Static site on Vercel/Netlify / Already have a site | Already have a site |
| Work email | Google Workspace / Microsoft 365 / Bundled with host | Other: "resend / cloudflare" |
| Site passes Apple check? | Yes, real site / Thin or placeholder / Not sure | Not sure |
| DNS | On Cloudflare / Elsewhere, will move / Elsewhere, keep | On Cloudflare |
| Legal name = seller name | Yes / Want a trading name / Unsure | Yes, matches |
| Enrolling person | Me, owner/director / Someone else signs | Me |
| Service account ownership | Shared company alias (rec) / Personal login + company org / Personal throughout | Personal login + company org |
| Play Console timing | Register in Phase 0 (rec) / Wait until Phase 9 | Register in Phase 0 |
| Individual Apple fallback | No, org only / Individual now, migrate later | No, org only |
| Repo host | GitHub company org / GitHub personal / Already has a remote | Already has a remote |

**Notes:** Email interpreted as Cloudflare Email Routing (inbound) + Resend (outbound). No git remote was found locally, so connecting it is folded into Phase 0.

---

## Sign-in & first launch

| Question | Options presented | Selected |
|---|---|---|
| First screen | Full-screen welcome + sign-in (rec) / Prototype account sheet / Onboarding first | Full-screen welcome + sign-in |
| Apple on Android | Both buttons everywhere (rec) / Google only on Android | Both buttons everywhere |
| Post sign-in screen | Minimal You/settings (rec) / Dev diagnostics / Stub five-tab shell | Minimal You/settings |
| Theme pref storage | Supabase profile + local cache (rec) / Device only | Supabase profile + local cache |
| Button style | Official buttons, pill-shaped (rec) / Fully custom pills | Official buttons, pill-shaped |
| Sign-out | Wipe cache + queued writes (rec) / Keep cache | Wipe cache + queued writes |
| Pre-enrolment Apple button | Hide via config flag / Show disabled / You decide | You decide |
| Welcome copy | Draft, I review / I'll supply it | I'll supply it |

---

## Analytics consent moment

| Question | Options presented | Selected |
|---|---|---|
| Timing | Screen after first sign-in (rec) / In onboarding (Phase 9) / Settings only | Screen after first sign-in |
| Errors when opted out | Always on, scrubbed (rec) / Same consent / Separate toggle | Always on, scrubbed |
| Error tool | Evaluate PostHog, Sentry fallback (rec) / Sentry now | Evaluate PostHog first |
| Consent copy | I'll supply it / Draft it, I review | Draft it, I review |

---

## Quality gates & infra

| Question | Options presented | Selected |
|---|---|---|
| Coverage | 100% core folders / 95% rest (rec) / 100% flat / 95% flat | 100% core / 95% rest |
| Supabase region | EU London / EU Frankfurt / US East | US East |
| CI host | GitHub Actions + EAS builds (rec) / EAS Workflows for everything | GitHub Actions + EAS |
| Min-version location | Supabase app_config (rec) / PostHog flag / You decide | Supabase app_config |
| PostHog host given US DB | Keep EU host / Move to US host | Keep EU host |
| Region reasoning | North American users / US company / Both | North American users |

*Revised 2026-09-22: D-22 was changed to US West (us-west-2). The project was created in that region and the decision was ratified. The row above records the original choice.*

---

## Claude's Discretion

- Pre-enrolment Apple button behaviour
- OTA runtime-version policy details, credential-scan tool, lint config, dependency register format
- Font loading strategy, household-of-one schema shape

## Deferred Ideas

- App Review demo-account sign-in path → Compliance & Release
- Re-verify legitimate interest for always-on crash reports → Compliance phase
