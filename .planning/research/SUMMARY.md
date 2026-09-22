# Project Research Summary

**Project:** FincWin United
**Domain:** Cloud-first personal/household finance app — Expo/React Native (iOS + Android), Supabase source of truth, with a purchase-affordability decision engine as the core differentiator
**Researched:** 2026-09-21
**Confidence:** MEDIUM-HIGH overall — package versions and RLS/store-compliance findings are HIGH (verified against primary sources, several cross-checked live against the npm registry on 2026-09-21); the offline/Realtime reconciliation design and a handful of feature-landscape claims are MEDIUM/LOW and flagged as such throughout

## Executive Summary

FincWin United is a manual-entry, cloud-first household finance app whose real product bet is Decide — a verdict computed from a user's own logged history, persisted as a decision record, and later checked against what actually happened. Research across all four tracks converges on one thing worth protecting disproportionately: nothing shipped in the category in 2026 combines those three properties (computed-not-surveyed, persisted, reconciled-after-the-fact), so Decide deserves the deepest testing budget and the least schedule pressure in the roadmap. Everything else in the plan — ledger, budgets, goals, debt payoff, household splitting — is well-precedented table stakes that experienced competitors (Monarch, Copilot, YNAB, Splitwise, Honeydue) already validate the shape of; the research found two concrete gaps against that table-stakes bar (recurring transactions/bill templates, and CSV import's sequencing) that should be pulled forward, not treated as later-phase utilities.

The single most load-bearing architectural finding is that rejecting local-first changes the *build order*, not just the tech choices: because there is no local database at all, every phase from Record onward is hard-blocked on a working, authenticated Supabase connection with RLS-protected tables. The roadmap should move Supabase provisioning, Auth (Apple/Google), and a "household of one" schema/RLS bootstrap into Foundation — materially earlier than PROJECT.md's brief-inherited phase groupings imply — so that Household (originally scoped to "stand up Supabase") shrinks to genuinely new work: multi-member semantics, invite RPCs, and Realtime conflict handling. A second major correction is that native passkeys on React Native are not the turnkey feature the brief assumed: Supabase's `signInWithPasskey()` is browser-only and will throw if called from RN. This is presented here as a real, unresolved decision — not settled — with a clear recommendation (ship Apple + Google as the load-bearing v1 sign-in methods, scope passkeys as a separately-timed research spike) that the roadmap should carry forward without treating it as chosen.

Risk in this project is concentrated less in "will reviewers reject the advice framing" and more in mechanical submission hygiene: the one detailed real-world 2026 rejection account found in this category failed on subscription/IAP mechanics (App Store Connect version attachment, disclosure copy, a demo video showing restore instead of a fresh purchase), not on 3.2.1 content review. Real numerical, RLS-performance, and offline-queue pitfalls (rounding residuals, `auth.uid()` re-evaluation cost, idempotency keys, duplicate-write-on-retry) are well-documented and cheap to design in from day one, expensive to retrofit. The recommended mitigation across all of these is the same pattern repeated at different layers: a single integer `version` column and client-generated UUID primary keys, which together back optimistic concurrency, Realtime reconciliation, and undo-as-compensating-writes with one mechanism instead of three.

## Key Findings

### Recommended Stack

The brief (`BUILD-PROMPT.md` §3) was accurate for February 2026 but is now two Expo SDKs stale. **Expo SDK 57** (`~57.0.24`) is current stable — not SDK 55 as the brief and PROJECT.md's Foundation requirements currently state — with SDK 58 still preview-only and not a build target. New Architecture is permanently on (RN 0.82 removed the legacy bridge entirely); there is no opt-out to plan around. The data layer is **not** a local-first sync engine: it is `@supabase/supabase-js` direct queries, wrapped in **TanStack Query v5** for cached reads, a persister for offline survival across restarts, and TanStack Query's **paused-mutations** pattern (`setMutationDefaults` + `resumePausedMutations`) as the write queue — this is a first-party, actively maintained mechanism, not a hack, and it is the correct reading of PROJECT.md's "persisted query cache and write queue" decision.

**Core technologies (versions confirmed live against npm on 2026-09-21):**
- `expo` **57.0.24** (SDK 57) — current stable; SDK 55 references in PROJECT.md/BUILD-PROMPT are stale and should be corrected during Foundation
- `expo-router` **57.0.22** — now versions in lockstep with the SDK number, not its own vN scheme; pin `~57.0.22`, not `^7.0.0`
- `react-native-reanimated` **4.7.0** + `react-native-worklets` **0.13.0** (separate package, required explicitly) — both patch numbers in STACK.md are stale (it cited 4.5.5 / 0.12.x); the worklet-runtime split itself is correctly identified as a real gotcha
- `@shopify/flash-list` **2.3.2** — New-Architecture-only, matches the mandatory-New-Arch runtime, no size-estimate props needed
- `react-native-purchases` (RevenueCat) **10.10.1** — confirmed current, not "in flight" as STACK.md hedged
- `@tanstack/react-query` **5.103.2** + `@tanstack/query-async-storage-persister` **5.103.2** — the read-cache/write-queue mechanism described above
- `react-native-passkeys` **0.4.2** (STACK.md's 0.4.1 is one patch stale) — native WebAuthn ceremony module, see Passkeys section below
- `expo-haptics` (SDK-locked ~57.x) — **breaking change**: only `notificationAsync`/`impactAsync`/`selectionAsync` remain; the old `notification()`/`impact()`/`selection()` names were dropped in the SDK 57 line and will not compile against current `expo-haptics`

**Correction — a package referenced in ARCHITECTURE.md does not exist:** `@supabase/tanstack-db` is not a real npm package (registry returns "Not found"). ARCHITECTURE.md cites this non-existent package's documentation for a claim that its "Realtime integration is still being stabilized" — that specific claim should be discarded along with the package reference. The real, adjacent package is **`@tanstack/db` at 0.9.2**, which is genuinely pre-1.0 and immature, and is *not* recommended. The correct, verified data-layer recommendation stands as written above: TanStack Query v5 (5.103.2) with paused mutations plus a persister — a Supabase-specific "TanStack DB" integration is not part of this stack.

**Money engine dependency — recommend hand-rolled, not dinero.js:** ARCHITECTURE.md floats `dinero.js` v2 as a MEDIUM-confidence option for `engine/money/`. `dinero.js`'s `latest` tag is 2.0.2 but its `alpha` tag (`2.0.0-alpha.17`) was last touched 2026-03-13, an ambiguous signal for a dependency this load-bearing. Given the engine purity boundary, the narrow actual surface needed (integer minor units; `add`/`subtract`/`multiplyAndRound`/`allocate` with largest-remainder rounding), and the project's ~100% branch-coverage requirement on `engine/`, the recommendation is a **hand-rolled `engine/money/` module with no third-party dependency** as the primary path, with dinero.js evaluated only as an alternative if the hand-rolled module proves more work than expected.

**Passkeys on React Native + Supabase Auth — present as an open decision, not settled:** Supabase's native passkey support officially covers Flutter and Swift only; `supabase.auth.signInWithPasskey()` calls `navigator.credentials.get()` internally, a browser DOM API that doesn't exist in the RN/Hermes runtime, and will throw if called from the app. Two real paths exist: **Path A** — `react-native-passkeys` (native WebAuthn ceremony) + a custom Supabase Edge Function using `@simplewebauthn/server` for verification — stable primitives, but custom engineering the team owns, not a vendor feature. **Path B** — front Supabase with Clerk (`@clerk/expo-passkeys`), which has full native support today but a verified peer-dependency range of `expo: ">=53 <57"` that does not yet declare SDK 57 support, plus a schema cost (Clerk's user id is a string, Supabase's is a UUID by convention — every RLS policy and FK needs to be designed around that from day one, not retrofitted). **Recommendation for the roadmap, not a decision already made:** ship Apple + Google Sign-In as the load-bearing v1 auth methods (both fully supported, HIGH confidence), and scope passkeys as an explicitly separate task with its own research spike, rather than assuming it as a Foundation checkbox alongside Apple/Google. This directly affects PROJECT.md's "Account required... via Sign in with Apple, Google and passkeys" requirement and its Key Decisions table (currently marked "— Pending"); the user still needs to make this call.

### Expected Features

FincWin's planned feature set covers the category's table stakes (multi-account ledger, category budgets, net worth, goals, debt payoff, multi-currency, biometric lock, account deletion, CSV export, household splitting) at parity with or ahead of Monarch/Copilot/YNAB/Splitwise. The real differentiator — Decide — is genuinely novel as a shipped, persisted feature: the closest conceptual match ("Buy or Wait?") is a hackathon artifact with no real users, not a competing product, which validates the concept's shape without eroding FincWin's first-mover position. Two anti-features are worth reaffirming explicitly in the roadmap rather than leaving implicit: no cash-advance/instant-money features (live FTC precedent against Cleo AI in this exact category, March 2025, $17M settlement) and no ad-supported free tier (Splitwise's 2026 shift to ads drew user resentment, especially risky in a shared-household context where non-paying members become a captive audience).

**Must have (table stakes) — largely already Active in PROJECT.md:**
- Multi-account ledger, categories, search/filter, budgets/caps, net worth, goals, debt payoff, multi-currency, biometric lock, purging account deletion, CSV export — all directly covered
- No third-party data sharing / ad-free positioning — architecturally already true (RLS, no ad SDKs); recommend stating it explicitly in App Privacy answers and marketing copy as a differentiator, not just a compliance answer

**Should have (differentiators) — protect these in the roadmap:**
- Decide (verdict + alternatives + decision journal + estimate-vs-actual) — the product's real moat; deserves disproportionate testing/design budget and a phase that isn't compressed under schedule pressure
- Alternatives table with ethical suppression of a "save the difference" row when the difference isn't genuinely spare — cheap relative to its trust-building value
- Household as a persistent entity with four split rules plus an expiring settlement window — no direct competitor combines this; the expiry-window UX (what happens when a settlement expires unresolved) is a real product question that should be resolved explicitly during the Household phase, not left implicit
- Financial-health score computed from logged transaction history, not a survey — genuinely different mechanism from how "financial wellness score" usually works in this market

**Gaps found — recommend adding/resequencing, not currently reflected in PROJECT.md's Active list:**
- Recurring transactions / bill templates (P1): no first-class "this repeats" entity exists anywhere in Record or Money core, even though dmoney's income-steadiness calculation and Alerts' "bills due" kind both implicitly depend on one. Bank-synced competitors can detect recurring charges automatically; FincWin cannot in v1, which makes an explicit user-defined recurring-transaction feature more necessary here than for competitors, not less. Recommend adding a minimal version (name, amount, category, account, cadence, next-due date, one-tap "log this occurrence") to Record or Money core and sequencing it early.
- CSV import re-framing (P1): already Active, but currently filed as a late System-phase utility. It should be treated as a day-one activation feature — it directly de-risks Decide's cold-start problem, since a user who backfills 3-6 months of history on day one gets a working verdict immediately instead of waiting three months of manual logging to accumulate enough data. This is a sequencing/framing correction, not a new feature.
- Manual-level override for onboarding tier (P2, cheap insurance): confirm whether a user's progressive-disclosure level can be changed manually after the 11-question quiz, independent of the quiz result — not currently stated as Active. UX research on 2026 fintech onboarding favors behavior-triggered unlocks over static quiz-assigned tiers; if level is already just a user setting, state that plainly in the UI.
- Subscription tracking view (P3, trivial once recurring transactions exist): a filtered view over the recurring-transaction entity, not a separate feature.

Explicitly flagged as LOW confidence and not to be treated as fact: claimed manual-entry-vs-bank-sync churn percentages ("3x higher churn," "68% higher retention") come from content-marketing blog posts with no primary source. The direction (manual entry has materially higher drop-off) is directionally credible given how uniformly growth-stage competitors have converged on bank-sync-first, but the specific numbers should not appear in planning docs as sourced facts.

### Architecture Approach

The engine (src/engine/) is a pure, zero-I/O, zero-React leaf module enforced by a two-layer lint gate (eslint-plugin-boundaries for immediate local feedback, dependency-cruiser in CI for transitive-leak detection) — both wired in from the first Foundation commit, not added later. Around it, data/ owns everything that round-trips through Supabase (queries, mutations, cache, write queue, Realtime reconciliation), state/ (Zustand) owns ephemeral device-local UI state only, services/ wraps every external I/O system, and features/<area>/ composes data/ + engine/ + ui/ per screen. Two design decisions unify several mechanisms into one: client-generated UUID primary keys (the optimistic row created offline is the final row, identity-wise — no server-id-swap to reconcile) and a single integer version column on every mutable row, incremented by a Postgres trigger, that simultaneously backs optimistic-concurrency writes, Realtime reconciliation (deciding whether an incoming event is a genuine external change, a predates-local-write no-op, an echo of this device's own write, or a real conflict), and undo (every compensating write carries the expectedVersion it was computed against, so an undo against a row someone else already touched surfaces as "Cannot undo — changed by X" instead of silently clobbering).

**Major components:**
1. engine/ — deterministic financial logic (decide, money, split, payoff, health, undo-inverse computation); pure functions, snapshot-in/verdict-out, no side effects
2. data/ — Supabase queries, TanStack Query cache + persister, durable write queue (collapses same-row operations, flushes on reconnect), Realtime subscription to cache-patch reconciler
3. state/ — Zustand slices for nav stack, sheet stack, undo stack (holding CompensatingWrite descriptors), toast, bulk-select
4. services/ — thin I/O adapters: Supabase client/auth, RevenueCat, notifications, biometrics, Frankfurter cache, Plaid stub
5. Postgres (Supabase) — source of truth, RLS enforcement, version/updated_at triggers, SQL migrations independent of app bundle

**RLS performance — concrete, not generic:** every policy must wrap auth.uid() as (select auth.uid()) (Supabase's own benchmarks: 179ms to 9ms on one query, 178s to 12ms on a security-definer check) and must have supporting indexes on the RLS join columns (household_members(user_id), a composite (household_id, user_id), and household_id on every data table) — unindexed policies showed over 100x degradation in Supabase's own published numbers. Subquery direction matters: filter the small household_members table by the indexed user_id and return household_ids to check against, not a correlated subquery re-run per row of the data table. Household joining should go through a security-definer RPC (redeem_invite(code)) with row-locking to close a race on single-use invite codes, not a raw client insert.

**Honest flag — the Realtime reconciliation state machine is a synthesized design, not a documented recipe.** Supabase and TanStack Query's own docs confirm the building blocks (optimistic mutations that roll back on rejection, per-row Realtime sync, echoed own-writes) but do not specify this exact four-case reconciliation logic (no pending write / write still queued / echo of own flush / genuine version conflict). It should be validated with integration tests — two simulated clients, one taken offline mid-edit — as a dedicated spike during the Household phase, not assumed correct from the design document alone.

### Critical Pitfalls

1. Submission mechanics, not advice framing, is where real 2026 rejections in this category clustered. The one detailed real account found (an AI budgeting app, "CoinCoach") was rejected twice on 2.1(b) (subscription not attached to the submitted version), 3.1.2(c) (missing subscription disclosure copy — auto-renewal terms, 24-hour cancellation notice, Privacy Policy/Terms links), and 1.5 (support URL pointing back into the app instead of a real page) — plus a second-round rejection because the review demo showed "Restore Purchases" instead of a full fresh purchase flow. Avoid by treating IAP/subscription submission mechanics as their own pre-submission checklist, separate from content-framing review, with the demo recorded from a freshly signed-out Apple ID.
2. The brief's guideline citation is wrong and should be corrected in PROJECT.md. The 36% APR / 60-day personal-loan cap is 3.2.2(ix), not 3.2.1(viii) as currently stated. Separately, live 3.2.1(viii) text no longer carries the qualifier PROJECT.md assumes softens it for record-keeping apps — the App Review Notes field should proactively state, on every submission, that the app performs no trading/investing/lending/custody and all figures are user-entered.
3. The Coach (free-text LLM) is the genuine 3.2.1 risk, separate from the mechanical risk above, and its terms are still an open, unresolved decision per PROJECT.md. Unlike the deterministic dassess verdict (auditable word-by-word), an LLM's free-text output can drift into prescriptive language even against a system prompt. Resolve the "is Coach a real LLM, on what terms" question before Tiers & onboarding starts, and design a server-side post-filter rejecting prescriptive trigger phrases before implementation, not as a bolt-on.
4. Offline write-queue correctness has five specific failure modes that do not show up until real usage: duplicate writes on retry (missing idempotency key), clock skew corrupting month-bucket logic, in-memory-only queue loss on force-quit, unbounded queue growth, and delete/undo replay against a row another household member already moved. All five should be designed in from the System/Record phase's first line of code — retrofitting an idempotency key onto an already-wired write path means re-touching every mutation call site.
5. Financial calculation correctness has three failure classes integer minor units alone do not fix: amortisation rounding-residual distribution (every row must satisfy principal + interest == payment except the final row, which absorbs the residual), dSimMin's never-clears branch needing an explicit payment <= interest check rather than inference from hitting the 600-month cap, and bisection's assumption that dfits is monotonic in price across all five of dassess's independent warning ledgers — worth a property-based test (fast-check, already planned), not just fixture tables.

## Implications for Roadmap

The central reordering point, from ARCHITECTURE.md, is the highest-priority input to roadmap structure: because local-first was rejected and there is no local database at all, every phase from Record onward is hard-blocked on a working, authenticated Supabase connection with RLS-protected tables — not just the Household phase, which is where the brief's original phase-8 grouping put "stand up Supabase." PROJECT.md's Active list already partly reflects this (Supabase + RLS is filed under Money core, not System), but this research recommends moving further: the auth and household-of-one bootstrap specifically belongs in Foundation, because Record cannot write a transaction without a signed-in user and an existing household_id, and every table's RLS policy is written against household_members, which must exist before the first transaction migration, not after.

### Phase 0: Foundation (expanded scope vs. the brief)
Rationale: Nothing downstream can be built, tested, or demoed against a live backend without this landing first — this is the reordering correction, not a new phase.
Delivers: Expo SDK 57 (corrected from 55) + TS strict + Router ~57.0.22. engine/ purity boundary with the dual lint gate (ESLint + dependency-cruiser) wired into CI as a required check. Design tokens, reduced-motion. Supabase project provisioned; Apple + Google Sign-In wired end-to-end (passkeys scoped separately, see Research Flags); households/household_members schema with household-of-one auto-provisioning at signup and baseline RLS; RevenueCat identity linked to the Supabase user id at first sign-in.
Addresses: the auth requirement from PROJECT.md's System section (functional mechanics only — session-list/sign-out-everywhere/biometric-lock refinements stay in System).
Avoids: provisioning/entitlement mismatches surfacing late (get the SIWA entitlement into the profile here, not discovered missing at Compliance); avoids the mock's pixel-perfect trap by establishing token/inset/shadow patterns correctly before they propagate through every UI phase.

### Phase 1: Money core
Rationale: Record (next) has nowhere to write without accounts/categories/transactions schema and the data/ layer plumbing existing first.
Delivers: Money on integer minor units (hand-rolled engine/money/, not dinero.js — see Key Findings), full transaction/account/category schema + RLS building on phase 0's household-of-one model, FX via a scheduled Frankfurter Edge Function, data/ scaffolding (query cache persister, write queue, Realtime subscription plumbing).
Uses: TanStack Query v5 + paused-mutations write-queue pattern; Postgres bigint for amounts, numeric only for FX rates.
Implements: client-generated UUID PKs and money-as-integer-minor-units from day one — retrofitting either after real transactions exist means reconciling every historical record.

### Phase 2: Record
Rationale: First real dogfood build, now against a live Supabase backend rather than a local DB.
Delivers: Entry sheet, transactions, Activity list, month switcher, toast + 12-deep undo implemented as compensating writes from day one (not deferred/snapshot-based, since the server is authoritative from the start).
Addresses: the recurring-transaction/bill-template gap should land here or in Money core, not System — see Gaps above.
Avoids: full-state-snapshot undo, which is materially wrong once the server and other household members are real from day one.

### Phase 3: Shell
Rationale: Unaffected by the cloud-first reordering — pure UI/navigation work, can proceed once Record's screens exist to navigate between.
Delivers: Five tabs, bespoke glyphs, back stack, sheets, FAB.

### Phase 4: Decide engine
Rationale: Zero dependency on the data layer — fully testable with fixtures alone. Could in principle run in parallel with phases 1-3 if parallel workstreams exist; not a required reordering, just a flagged opportunity.
Delivers: Pure TypeScript dplan/dassess/dmoney/dSimMin/dpmt/dfv/bisection, at the branch-coverage threshold, with the never-clears branch and bisection-monotonicity property tests as first-class, not incidental.
Avoids: all three financial-calculation pitfalls (rounding residuals, never-clears detection, bisection monotonicity) — this is the phase where they are cheap to catch and catastrophic to ship wrong.

### Phase 5: Decide UI
Rationale: Depends on both the engine (phase 4) and a live data layer (phase 1) to source the "logged months" snapshot.
Delivers: Quick check, five-step flow, open checks with live verdict, past decisions, estimate-vs-actual, the alternatives table with ethical suppression.
Addresses: Decide's differentiator status — this phase should carry the deepest testing and design-iteration budget in the roadmap per the Features research.

### Phase 6: Grow / Phase 7: Insights
Rationale: Unaffected by cloud-first reordering; standard build order once Money core and Record exist.
Delivers: Goals, investments, debt/payoff (Grow); net-worth/cash-flow charts, Activity's remaining views (Insights).

### Phase 8: Household (re-scoped smaller than the brief's original phase 8)
Rationale: The household-of-one schema and baseline RLS already exist from phase 0, so this phase is no longer "stand up Supabase" — it's genuinely new multi-member work.
Delivers: Invite-by-expiring-link RPC (security-definer, row-locked to close redemption races), multi-member roles/weights, four split rules with largest-remainder allocation, settlements, scope/privacy toggles, and — the real new infrastructure — turning on Realtime subscriptions and the conflict-reconciliation logic for actual multi-device, multi-member concurrent edits.
Research flag: the Realtime reconciliation state machine is a synthesized design (see Architecture Approach honesty note) — budget an explicit spike here with two simulated clients before considering it verified.
Resolve explicitly: what happens when a settlement's expiry window lapses unresolved (Features research flags this as undefined).

### Phase 9: Tiers & onboarding
Rationale: Pricing/gating decisions (Free vs. Pro feature split, Coach LLM terms) are currently open per PROJECT.md and should be resolved before this phase starts, not during it.
Delivers: 11-question onboarding flow, four-level gating, RevenueCat entitlements — identify(supabaseUserId) called immediately after auth (from phase 0), never left on RevenueCat's anonymous default.
Avoids: the RevenueCat identity/restore/product-ID pitfalls (cross-platform entitlement sync depends entirely on this identify-at-auth wiring).

### Phase 10: System
Rationale: The sign-in mechanism is not built here (it's in Foundation) — only its refinements.
Delivers: Active-session list, sign-out-everywhere, biometric/PIN lock, offline-tolerance polish, CSV import (recommend re-sequenced earlier per Gaps above, or at minimum explicitly connected to Decide's cold-start problem here), account deletion that purges both Postgres and any local cache.

### Phase 11: Compliance & release
Rationale: Final verification, but several items (guideline citation correction, Financial-features-declaration filing, App Review notes justifying account-before-use) should be prepared earlier and only verified here.
Delivers: Store submission — with the corrected 3.2.2(ix) citation, an IAP/subscription mechanical-hygiene checklist (version attachment, disclosure copy, fresh-purchase demo), and a Financial features declaration filed broad from Money core onward, not narrowed and expanded later.

### Phase 12: v1.1 (deferred, unchanged)
Widgets, Plaid, brokerage linking, web, round-ups.

### Phase Ordering Rationale

- The cloud-first decision is why Foundation's scope grows and Household's shrinks — this is a sequencing correction, not a feature-inventory change; nothing moves in or out of the product, only when the backend exists moves earlier.
- Decide's engine-then-UI split (phases 4-5) is preserved from the brief because it's correct independent of cloud-first: the engine has no data-layer dependency and should be the hardest-tested, least-rushed phase in the whole roadmap given its status as the product's actual moat.
- Undo-as-compensating-writes must land with Record (phase 2), not be deferred to System or Household, because the server is authoritative from day one under cloud-first — there is no "easy" local-snapshot version to ship first and replace later.

### Research Flags

Needs deeper research or a dedicated spike during planning:
- Foundation — the Path A (native WebAuthn + Edge Function) vs. Path B (Clerk) passkey decision is unresolved and has real schema consequences (UUID vs. string user ids) if Path B is chosen; needs a discussion/decision before implementation, not a default assumption either way.
- Household — the Realtime reconciliation state machine (four-case logic: no pending write / write still queued / own-write echo / version conflict) is a synthesized design built on verified primitives, not a documented recipe. Needs an explicit spike with two simulated clients (one taken offline mid-edit) before being trusted in production.
- Tiers & onboarding — the Coach LLM's scoping (real LLM vs. templated, prompt design, prescriptive-language filter) is an open product decision per PROJECT.md with direct compliance consequences; resolve before this phase starts.

Phases with well-documented, standard patterns (research-phase likely unnecessary):
- Money core / Decide engine — integer-minor-units money handling, largest-remainder splitting, amortisation row-invariants, and RLS wrap/index patterns are all documented against primary sources (Supabase's own benchmarks, standard financial-math conventions) with concrete code examples already available in ARCHITECTURE.md and PITFALLS.md.
- Compliance & release — the mechanical IAP/subscription checklist and the corrected guideline citations are concrete and actionable as written; the main remaining task is execution, not research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Package versions cross-checked against the live npm registry on 2026-09-21 (this document carries those corrections over STACK.md's slightly stale patch numbers); the passkey non-viability finding is verified against a supabase-js PR and Supabase's own docs, not inferred |
| Features | MEDIUM-HIGH | Competitor feature claims verified via multiple 2026 sources; the two gap findings (recurring transactions, CSV import sequencing) are structurally sound and low-risk to act on; retention/churn percentage claims are explicitly LOW confidence and excluded from any planning number |
| Architecture | MEDIUM-HIGH | RLS performance numbers and boundary-tooling recommendations are HIGH confidence (Supabase's own published benchmarks, official docs); the Realtime reconciliation state machine is a synthesized design flagged as needing validation, not a documented pattern — treat it as engineering judgment, not verified fact, until the recommended spike runs |
| Pitfalls | MEDIUM-HIGH | Store-guideline text verified live against developer.apple.com and Play Console Help; the submission-mechanics finding rests on one detailed real account (CoinCoach, self-reported) rather than a large sample — directionally trustworthy but not statistically broad |

Overall confidence: MEDIUM-HIGH — strong enough to plan a roadmap against directly, with two flagged spikes (passkey path decision, Realtime reconciliation validation) called out rather than silently assumed.

### Gaps to Address

- Passkey implementation path (Path A vs. Path B) is unresolved — carry PROJECT.md's Key Decisions entry as still "Pending"; do not let the roadmap silently pick one. Recommend deciding via a dedicated discussion at or before Foundation.
- Coach LLM scoping is unresolved per PROJECT.md's own Open Questions table — resolve before Tiers & onboarding, not during it.
- Free/Pro feature split is unresolved — everything built before that decision should stay tier-agnostic behind a single entitlement check, per PROJECT.md's existing guidance.
- Settlement expiry-window UX is undefined — what happens when a household settlement expires unresolved needs an explicit product answer during the Household phase.
- On-device cache encryption scope is deferred — narrower than the original SQLCipher question now that local-first is cut, but still needs resolution (affects the ITSAppUsesNonExemptEncryption App Privacy answer).
- Realtime reconciliation correctness is unverified — treat as a design, not a fact, until validated by the recommended two-client spike during Household.
- Manual-entry churn/retention percentages are unsourced — do not cite the specific numbers found in content-marketing sources; only the directional claim (manual entry has real activation risk) is credible, and it's already accounted for via the CSV-import resequencing recommendation.

## Sources

### Primary (HIGH confidence)
- npmjs.com package registry — expo, expo-router, react-native-reanimated, react-native-worklets, @shopify/flash-list, react-native-purchases, @tanstack/react-query, @tanstack/query-async-storage-persister, react-native-passkeys, @supabase/supabase-js — all versions independently verified live 2026-09-21 (orchestrator verification; supersedes STACK.md's slightly stale patch numbers where they differ)
- developer.apple.com/app-store/review/guidelines — live guideline text for 3.2.1(viii), 3.2.2(ix), 5.1.1(v), fetched 2026-09-21
- supabase.com/docs/guides/auth/passkeys, supabase.com/changelog/46458-passkeys-for-supabase-auth-beta, github.com/supabase/supabase-js/pull/2675 — passkey platform-coverage and navigator.credentials.get() findings
- supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv — RLS auth.uid() wrap and indexing benchmark numbers
- support.google.com/googleplay/android-developer — Financial features declaration requirements

### Secondary (MEDIUM confidence)
- indiehackers.com — CoinCoach rejection account (single detailed real-world submission story, self-reported)
- Monarch/Copilot/Splitwise/Honeydue product pages and 2026 release notes — competitor feature landscape
- Community RLS-performance writeups (AntStack, Axonbuild, DEV Community) — cross-checked against Supabase's own primary benchmark numbers

### Tertiary (LOW confidence, flagged, not to be treated as fact)
- moneypatrol.com, dev.to manual-entry-churn blog posts — specific retention percentages, directional only
- "Buy or Wait?" GitHub repos — confirms a hackathon artifact exists with the same conceptual shape as Decide, not a competing shipped product

### Detailed research files
- .planning/research/STACK.md
- .planning/research/FEATURES.md
- .planning/research/ARCHITECTURE.md
- .planning/research/PITFALLS.md

---
*Research completed: 2026-09-21*
*Ready for roadmap: yes*
