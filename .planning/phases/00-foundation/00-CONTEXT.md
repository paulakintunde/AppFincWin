# Phase 0: Foundation - Context

**Gathered:** 2026-09-22
**Status:** Ready for planning

<domain>
## Phase Boundary

A signed-in user has a working, authenticated, RLS-protected Supabase connection, and the project has everything feature work stands on: Expo SDK 57 dev builds (Android emulator now, iPhone XR once Apple enrolment clears), the `engine/` purity boundary and coverage gate in CI, the design-token/theme/i18n system with live accent and font switching, reduced-motion handling, separate dev/prod Supabase environments driven by migrations, opt-in analytics, a minimum-version gate, OTA runtime policy, a dependency register — and the company/store-enrolment machinery started on day one.

Requirements: FND-01–09, FND-11, FND-12, ENV-01–10, ENV-13–15, ENV-17, ENV-18, ENV-20, ANL-01–04, ACC-01–05, ACC-12, DSG-02–04 (see `.planning/REQUIREMENTS.md`).

Not in this phase: the five-tab shell (Phase 3), onboarding questions (Phase 9), any money/transaction schema beyond the household-of-one (Phase 1), App Review demo-account sign-in path (Compliance & Release).

</domain>

<decisions>
## Implementation Decisions

### Company, enrolment and accounts
- **D-01:** The company is already registered as a legal entity. Its D-U-N-S status is **unknown**. First task of the phase: look it up through Apple's D-U-N-S lookup tool and request one if it's missing (allow up to ~28 days). This is the longest external clock in the project.
- **D-02:** The user is owner/director and enrols personally, with authority to accept Apple's Program License Agreement. The registered legal name matches the desired App Store seller name, so no DBA/trading name is needed. Still verify the D&B record matches the government registration exactly.
- **D-03:** Apple enrolment is **organisation only, no individual-account fallback**, even if D-U-N-S or review drags on. iOS device builds (FND-03) and Sign in with Apple (ENV-07) wait. Android and everything else carries on at full speed.
- **D-04:** **Google Play Console organisation account is registered in Phase 0** ($25, same D-U-N-S), pulled forward from the roadmap's Phase 9. Update ROADMAP.md's dependency table and the dependency register to match.
- **D-05:** The company domain is already owned, and its **DNS is already on Cloudflare**.
- **D-06:** A company website already exists, but nobody knows whether it meets Apple's enrolment bar (real content about the company, contact route, not parked or a placeholder). Phase 0 includes an **audit of the existing site against Apple's criteria**, and remediation if it falls short. The same site later hosts privacy, terms and support pages.
- **D-07:** Work email on the domain = **Cloudflare Email Routing for inbound** (forwarding to the user's inbox) + **Resend for outbound** (SPF/DKIM/DMARC records added in Cloudflare). Caveat to handle in the plan: routing only forwards mail. Replying *as* the domain address needs Resend SMTP configured in the mail client, or Gmail "send mail as". Apple's verification emails only need inbound to work.
- **D-08:** Service accounts (Expo/EAS, Supabase, PostHog, Google Cloud, Apple, Resend, Play) use the **user's personal login, with a company organisation/team created inside each service**, so assets belong to the org, not the personal account.
- **D-09:** Repo hosting: the user believes a remote exists, but **no git remote is configured locally**. The only branch is `master`, and the `main` the tooling expects doesn't exist. Phase 0 connects the remote (the user supplies the URL, GitHub assumed, since CI runs on GitHub Actions) and settles the default branch name.

### Sign-in and first launch
- **D-10:** First launch shows a **full-screen welcome + sign-in** screen, not a dismissible sheet, since the account is required. Base the layout on the prototype's signed-out screen (`FincWin United.dc.html` ~line 2941): canvas `#FBFAF7`, FincWin wordmark in the display face at 34px, one line of body copy, then the pill buttons. The prototype's account sheet (lines ~3181–3205, logic ~6437–6451) drops its email/password fields entirely.
- **D-11:** **Both Apple and Google buttons appear on both iOS and Android.** Apple on Android runs through Supabase's web OAuth flow using the Apple Services ID.
- **D-12:** Use the **official Sign in with Apple button** (native, black style, corner radius set to pill) and a **Google button that follows Google's branding rules**, restyled to match the prototype's "Continue with Google" outline pill. Provider brand marks are the single sanctioned exception to the "token colours only" rule (DSG-02). Document the exception so the DSG-02 check doesn't flag it.
- **D-13:** After sign-in, a Phase 0 build lands on a **minimal "You"/settings screen**: signed-in identity, accent switcher (4), font-pairing switcher (4), analytics opt-in toggle, sign out, and a live "connected to Supabase" check. It must look like the real product (tokens, type scale, radii), because it becomes the You tab later rather than being thrown away.
- **D-14:** Accent and font choice are stored on the **user's profile row in Supabase**, with a local cache so first paint uses the saved theme. No flash of the default green on cold start.
- **D-15:** **Sign-out wipes the encrypted query cache, its key, and any queued writes.** If unsynced writes exist, warn before signing out (e.g. "3 changes not yet saved"). The prototype's "Signed out. Your figures stay on this device" copy is false under cloud-first and must not be ported.
- **D-16:** **The user supplies welcome/sign-in screen copy.** The planner creates placeholder i18n keys for it, clearly marked as awaiting copy.

### Analytics consent and error tracking
- **D-17:** The analytics opt-in is asked on **one screen immediately after first sign-in**. Two equal-weight choices (share usage / not now), no dark patterns, and changeable later in settings (ANL-02). No event leaves the device before an explicit yes.
- **D-18:** **Crash/error reports stay on even when analytics is declined.** They're scrubbed to stack traces and technical context only, never amounts, payees, account names, free text or email, under legitimate interest, and disclosed in the privacy policy. Flag for re-verification at the Compliance phase.
- **D-19:** Error tracking tool: **spike PostHog's React Native error tracking first** (symbolicated stack traces from EAS builds, source-map upload). If it holds up, drop Sentry (ENV-13 becomes "deferred, not needed"). If not, fall back to Sentry.
- **D-20:** **Claude drafts the consent screen and settings copy** in the prototype's voice (declarative, plain, British-ish spelling, typographic apostrophes) and lists exactly what is never sent. The user reviews it before it's final.

### Quality gates and infrastructure
- **D-21:** `engine/` branch-coverage thresholds: **100% on `engine/money/`, `engine/decide/`, `engine/payoff/`, `engine/split/`**, and **95% on the rest of `engine/`**. Any uncovered branch in the 100% folders needs an explicit, reviewed ignore comment giving a reason. CI fails below threshold (FND-05).
- **D-22:** **Supabase region: US East**, because launch users are mostly North American. Record this as the ENV-18 reasoning. GDPR-everywhere still applies: rely on Supabase's DPA and SCCs for EU users, and say so in the privacy policy.
- **D-23:** **PostHog stays on its EU host** despite the US database. The split geography is accepted, and it keeps the stronger consent story for European users.
- **D-24:** CI split: **GitHub Actions** runs lint, typecheck, dependency-cruiser, Jest with coverage gates, the RLS isolation tests (FND-12) against a Supabase CLI stack in Docker, and the credential scan (ENV-02). **EAS Build/Workflows** handles native builds and OTA updates only.
- **D-25:** Minimum supported version (FND-09) lives in a **Supabase `app_config` table**, readable before sign-in through a public read-only RLS policy and changed only through migrations or controlled updates. Not a PostHog flag: analytics is off until opt-in, and flags never gate critical access.

### Claude's Discretion
- How the Apple button behaves before enrolment clears (config-flag hide vs visible-but-disabled). Pick whatever keeps Android dev builds usable and the layout honest.
- OTA runtime-version policy details (FND-11), e.g. fingerprint vs appVersion policy, and the rollback mechanism.
- Credential-scan tool choice (e.g. gitleaks), lint configuration, and the format and location of the dependency register (ENV-09).
- Font loading strategy for the four pairings (all loaded at boot vs lazy on switch), provided switching is live with no reload.
- Household-of-one schema shape and RLS policy structure, within PROJECT.md's locked decisions (client-generated UUIDs, `version` column).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope and locked decisions
- `.planning/PROJECT.md` — Key Decisions table (cloud-first, Expo SDK 57, organisation enrolment, dual-tool engine boundary, encrypted session, separate environments, migrations compatible with the oldest supported app version, PostHog rules), Constraints, Running Costs
- `.planning/REQUIREMENTS.md` — full text of every Phase 0 requirement ID listed above
- `.planning/ROADMAP.md` §"Phase 0: Foundation" — success criteria 1–8 and the dependency provisioning table (update the Play Console row per D-04)
- `.planning/STATE.md` — blocker: trigger the first iOS EAS Build on day one once enrolment allows

### Design system and prototype
- `BUILD-PROMPT.md` §2 — the complete colour token set, the 4 accents, the 4 font pairings, type scale, radii, shadows, the seven animations and easing, reduced-motion, layout/safe-area rules
- `BUILD-PROMPT.md` §3 — stack and Windows/EAS dev loop (as amended by PROJECT.md and CLAUDE.md's SDK 57 table)
- `BUILD-PROMPT.md` §6 — architecture folder layout and testing strategy
- `FincWin United.dc.html` ~line 2941 — signed-out screen, the layout basis for the welcome screen (D-10)
- `FincWin United.dc.html` ~lines 3181–3205 and 6437–6451 — account sheet markup and logic (the Google pill styling to match; email/password fields to drop)
- `FincWin United.dc.html` line 3359 (`Component.FONTS`) and lines 3217–3218 (`Component.COL` / `Component.TINT`) — font pairings and category colour maps
- `ios-frame.jsx` — design reference frame size (402 × 874)

### Research
- `.planning/research/ARCHITECTURE.md` — folder layout, engine boundary enforcement (eslint-plugin-boundaries + dependency-cruiser CI wiring, ~line 174), Edge Functions (`fx-sync`)
- `.planning/research/STACK.md` — verified package versions for SDK 57, the passkeys-out rationale, `expo-secure-store` 2048-byte limit context
- `.planning/research/PITFALLS.md` — Frankfurter v2 pinning and store-rate-at-write-time pitfalls
- `.planning/research/SUMMARY.md` — phase sequencing rationale
- `CLAUDE.md` (project root) — SDK 57 staleness table, version compatibility matrix, "What NOT to use"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. Greenfield: the repo holds only the design prototype handoff (`FincWin United.dc.html`, `ios-frame.jsx`, `support.js`, `doc-page.js`, `screens/*.png`). It is the specification, not code to port structurally (its `sc-if`/`sc-for` DSL must not carry over).

### Established Patterns
- None in code yet. Phase 0 *establishes* the patterns every later phase follows: `engine/` purity, theme context with tokens, typed i18n catalogue, env-driven config, migrations-only schema changes.

### Integration Points
- No git remote configured. The only local branch is `master` (see D-09).
- Supabase CLI local stack (Docker) for development. A free cloud project for on-device testing. Production is a separate project (moves to Pro in Phase 2, ENV-16).

</code_context>

<specifics>
## Specific Ideas

- The welcome screen should feel like the prototype's signed-out screen: wordmark, one line, pill buttons, no clutter.
- The Phase 0 settings screen doubles as the proof that every success criterion works on device: theme switch, analytics toggle, connection check, sign out.
- Copy honesty: nothing in Phase 0 may claim on-device-only storage. Lean on what's true: RLS-isolated, encrypted in transit and at rest, exportable, deletable.

</specifics>

<deferred>
## Deferred Ideas

- **App Review demo-account sign-in path**: an allow-listed review login with sample data (PROJECT.md constraint). It belongs in Compliance & Release, not Phase 0.
- **Re-verify legitimate interest for always-on crash reports** (D-18) against live GDPR guidance and the App Privacy / Data safety answers during the Compliance phase.

</deferred>

---

*Phase: 00-foundation*
*Context gathered: 2026-09-22*
