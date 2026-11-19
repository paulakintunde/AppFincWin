# Kint pivot: briefing and plan

**Date:** 2026-11-19
**Status:** decided by the owner; not yet planned as a phase
**Evidence:**
- `NAMING-KINT-2026-11-19.md`: 20 store names, live store suggestions, and the FincWin vs Kint comparison
- `GROWTH-RESEARCH-2026-11-19.md`: positioning, audiences, bank linking, privacy

## 1. Decisions (owner, 2026-11-19)

| # | Decision |
|---|---|
| K-1 | **Brand:** FincWin becomes **Kint**. "Kin" = your people; the app is the daily shared money tracker (G-1). |
| K-2 | **Store name:** **Kint: Shared Budget Tracker** (27/30). **iOS subtitle:** **Expenses for Couples & Family** (29/30). Same name on Google Play. |
| K-3 | **Timing:** switch **now**, before the Phase 9 paywall ships. Paywall, plan and trial copy are written once, as Kint. |
| K-4 | **Web:** main home **getkint.app** (free on 2026-11-19, to register). **kint.ca** (owned) serves Canada and redirects. |
| K-5 | **Developer and seller name:** keep the current legal entity. Only the app is called Kint. |

## 2. Store listing (ASO)

| Field | Text | Count |
|---|---|---|
| Name (both stores) | Kint: Shared Budget Tracker | 27/30 |
| iOS subtitle | Expenses for Couples & Family | 29/30 |
| iOS keyword field | `planner,household,spending,money,split,bills,joint,flatmates,roommates,savings,debt,afford,kin,goals` | 99/100 bytes, no repeats |
| Play short description | Shared budget & expense tracker for couples, families & flatmates. No bank login | 80/80 |
| Tagline (web, ads) | Track money together. | — |
| Brand defence (Apple Search Ads exact) | `kint` and its mishearings: `kind budget`, `kent budget` (test them) | — |

**Why this name:** live Google Play suggestions show what people type, and this name matches them:
- shared budget app
- shared budget couple
- couples budget tracker
- family budget tracker
- family budget and expenses
- shared expense tracker

**What's left open:** no App Store result combines family, couples and flatmates.

**Watch:** Play suggests **Kinto** and **Kintone** next to "kint".

## 3. What changes, and what deliberately does not

**Changes (what people see):**
- the app display name and launcher label
- the icon mark (a "K" replaces the "F")
- the splash screen
- the wordmark
- every "FincWin" in user-facing copy, including the legal lines ("Kint is a planning tool, not a lender.")
- OAuth consent screens
- auth emails
- the store listing
- the website and legal pages

**Does NOT change (hidden identifiers):**
- the bundle ID and package (`APP_ID`)
- the Expo `slug` and `owner`
- the URL `scheme: 'fincwin'`
- the EAS project
- the Supabase project `Fincwin United` (ref unchanged; stays in us-west-2, G-4)
- database names, migrations already applied, and RevenueCat app IDs

**Why keep them:**
- People never see them.
- Changing the scheme breaks OAuth redirects and deep links.
- Changing the bundle ID makes a new app on testers' phones.
- Applied migrations must not be edited (the FND-10 gate).

## 4. Scope measured on main (2026-11-19)

| Area | "FincWin" mentions | Treatment |
|---|---|---|
| `src/` and `app/` | ~251 lines | Change user-facing strings; code comments may stay or be swept |
| `src/i18n` incl. `decideWordingSigned.json` | ~20 user-visible strings | **A brand-word swap inside signed wording.** One owner sign-off for "brand name only" changes, recorded in the wording register |
| `src/i18n/__tests__` | compliance tests assert exact text | Update the expected strings |
| `.maestro/` | 12 flows | Update text selectors |
| `supabase/migrations` | 46 files | **Leave.** Applied migrations are immutable |
| `supabase/functions` | 6 | Email sender names and subjects only |
| `docs/` | ~23 | Sweep the user-facing ones (compliance, enrolment) |
| `.planning/` | ~495 files | **Leave as history.** Update CLAUDE.md, PROJECT.md and the live docs only |

## 5. Plan (proposed decimal phase, about 8–10 plans)

| Wave | Work | Who | Notes |
|---|---|---|---|
| **0 · Gates (start today)** | 1. Trademark searches for "Kint" in classes 9, 36 and 42: CIPO (Canada), USPTO (US), EUIPO (EU). Check **Kintone** (Cybozu) closely. 2. Register **getkint.app**; set kint.ca to redirect. 3. Claim @kint or @kintapp on TikTok, Instagram, X and YouTube. | Owner | If the trademark search fails, stop. Nothing below is public until then, so a stop costs little |
| **1 · Identity** | 1. "K" mark and wordmark in the §2 palette (navy #172A4F, canvas, green block), extending `scripts/brand/generate-icons.py`. 2. App icons, adaptive icon, splash and favicon. 3. Owner picks from 2–3 options on a board. | Agent + owner | Same palette rules (CLAUDE.md design fidelity). No new colours |
| **2 · In-app rename** | 1. `app.config.ts`: `name: 'Kint'` only. 2. i18n: wordmark, the update screen, legal lines, Decide signed strings (brand word only), household and appLife copy. 3. Tests and Maestro selectors. 4. A one-time "FincWin is now Kint" card for existing testers. | Agent | Name and icon need a **new native build**, not OTA. Build and install previews on the Pixel 6 and Pixel 9 |
| **3 · Accounts and services** | 1. Google OAuth consent screen: app name and logo. 2. Supabase auth email templates and sender name. 3. Resend sender. 4. RevenueCat app display name. 5. Apple Sign In service name at enrolment. | Owner + agent | The owner holds the console logins |
| **4 · Web and legal** | 1. getkint.app: landing page, privacy policy, terms, support page and contact address. These are required store URLs; the 1.5 support-URL rejection is a known trap. 2. kint.ca → redirect. | Agent + owner | The privacy wording follows the G-section promise in GROWTH-RESEARCH §5 |
| **5 · Phase 9 hand-off** | Phase 9 paywall, trial, pledge and You > Subscription copy use **Kint**. Merge order: the rebrand lands on main → the Phase 9 branch merges main. | Agent | Coordinate with the `phase/09-tiers-onboarding` session |
| **6 · Store and ASO (with Phase 11)** | 1. Listing text from §2. 2. Screenshot captions in the G-1 order. 3. Promotional text. 4. In-app purchase names. 5. Reserve the app name in App Store Connect as soon as enrolment completes. | Agent + owner | Apple reserves names per store, so do it early |
| **7 · Docs and memory** | CLAUDE.md project name, PROJECT.md, LAUNCH-POSITIONING (superseded note), ROADMAP note, memory | Agent | History stays as it is |

**Rough effort:**
- Waves 1–2: 2–3 days of agent work, plus owner reviews.
- Waves 3–4: 1–2 days, needing the owner's console access.
- Wave 6 rides on Phase 11.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Trademark conflict (Kintone in software, Kinto in mobility) | Wave 0 gate before anything public |
| Pronunciation ("kind", "kent") | Say "Kint, K-I-N-T" in early videos; test mishearings as Apple Search Ads brand terms |
| Testers confused by the new name and icon | One-time "FincWin is now Kint" card; tell named testers before the build |
| Signed Decide wording changed outside a review | Brand-word-only swap, one owner sign-off recorded; no other wording changes in the same PR |
| Breaking sign-in or deep links | Hidden identifiers unchanged (§3) |
| Phase 9 writes copy as FincWin meanwhile | Wave 5 merge order; tell the Phase 9 session |
| kint.com owned by someone else | getkint.app is the home; a buy approach for kint.com is optional and later |

## 7. Next step

Insert this as a decimal phase through `/gsd-phase insert`, then `/gsd-plan-phase`.

**Proposed name:** "Kint rebrand", placed before Phase 9's paywall plans land.

**Watch for the known gsd-sdk ROADMAP bugs** (memory: gsd-sdk ROADMAP bugs), and check ROADMAP and STATE after the insert.
