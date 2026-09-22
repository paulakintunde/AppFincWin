# Feature Research

**Domain:** Personal and household finance app with a purchase-affordability decision engine
**Researched:** 2026-09-21
**Confidence:** MEDIUM-HIGH (competitor feature claims verified via multiple 2026 sources; retention-percentage claims are LOW confidence and flagged individually)

This file does not re-list FincWin's planned feature inventory (§5 of `BUILD-PROMPT.md` already does that exhaustively). It exists to answer: *where does the plan sit relative to what shipped competitors do in September 2026, and where does the plan diverge from what users will unconsciously compare it against?*

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features every credible 2026 personal-finance app has, that FincWin's plan already covers or must cover.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Multi-account ledger with categories, search, filter | Baseline of every app in the category (YNAB, Monarch, Copilot, PocketGuard, Lunch Money, Actual) | MEDIUM | Already Active |
| Category budgets / spending caps with over-cap alerts | PocketGuard's entire identity is one "In My Pocket" number; Monarch, YNAB, Copilot all budget-by-category | MEDIUM | Already Active (`caps` table, alerts) |
| Net worth over time + cash-flow charts | Universal across Monarch, Copilot, YNAB, PocketGuard | MEDIUM | Already Active |
| Multi-currency | Splitwise Pro gates this behind paid; Monarch/Copilot handle it natively for US-centric users. FincWin's Frankfurter-based approach is more thorough than most competitors, who lean on live FX APIs with narrower coverage | MEDIUM | Already Active, arguably exceeds competitor depth |
| Goals with progress tracking | Monarch relaunched Goals out of beta in 2026 specifically because the old version underperformed; goals are now core, not peripheral | LOW-MEDIUM | Already Active |
| Debt payoff planning (avalanche/snowball) | Standard in YNAB, Monarch, Undebt.it-style tools | MEDIUM | Already Active, and deeper than most (extra-payment + projection) |
| Biometric/PIN app lock | Standard for any app holding account balances, mandatory-feeling once accounts are cloud-backed | LOW | Already Active |
| In-app account deletion that actually purges | Apple-mandated since June 2022; Google Play Data Safety form checks for it too | LOW-MEDIUM | Already Active |
| Bill/recurring-item awareness | See **Gaps** below — this is present in spirit (Home "Upcoming", Alerts) but not modeled as a first-class recurring-transaction entity anywhere in the Active list | MEDIUM | **Gap — see below** |
| Household member colours + per-transaction split | Monarch's 2026 "yours/mine/ours" labelling made this explicitly mainstream, not a niche feature | MEDIUM | Already Active |
| Data export (CSV) | Every serious competitor offers export; several markets require it for GDPR portability | LOW | Already Active |
| No third-party data sharing / ad-free | A 2026 Incogni study found 60% of popular budgeting apps share user data with outside parties — this is now a live source of distrust, not a hypothetical. Not a "feature" per se but a claim users increasingly check for | LOW | Aligns with FincWin's architecture (RLS, no ad SDKs); **state it explicitly in App Privacy answers and marketing copy as a differentiator, not just a compliance answer** |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Decide: decision journal + estimate-vs-actual** | See dedicated section below — this is the standout finding of this research. Nothing shipped in 2026 combines (a) a computed verdict from the user's own logged history, (b) a persisted decision record, and (c) a later comparison against what actually happened | HIGH | This is FincWin's real moat. Protect it in the roadmap — see recommendation below |
| **Alternatives table with ethical suppression** | Cleo and "Buy or Wait?" both surface alternative framings (wait, partial pay), but neither is documented as *refusing* to show a "save the difference" row when the difference isn't genuinely spare. This is a trust-building detail competitors don't appear to have | MEDIUM | Cheap relative to its value — it's a conditional on an already-computed number, not new maths |
| **Household as a persistent entity with split rules + expiring settlement window**, not an ad-hoc group | Splitwise groups are ad-hoc and permanent-visibility; Monarch's household is bank-sync-anchored and US-centric; nobody combines a persistent single household, four split-rule types, per-category defaults, and a name-privacy fallback the way FincWin's plan does | MEDIUM-HIGH | Closest comparator is Honeydue for privacy granularity (see Household section) — FincWin's privacy model is coarser (single toggle vs Honeydue's per-account levels), which is a reasonable v1 simplification, not a gap |
| **Financial-health score computed from logged data**, not a survey | Credit-union "financial wellness quizzes" (DuPage CU, Credit Human) produce a score from *self-reported* survey answers. FincWin's score (savings rate, emergency cover, DTI, unpaid ratio) is computed from actual transaction history, same philosophy as `dmoney`'s income-steadiness calculation | LOW (formula already fully specified) | Genuinely different mechanism from what "financial health score" usually means in this market — worth stating that distinction in product copy so it isn't mistaken for a quiz result |
| **Progressive four-level disclosure set by an 11-question quiz** | Not found anywhere else in the finance-app category in this form. See dedicated section below — this cuts both ways | MEDIUM-HIGH | Real UX research on progressive disclosure in fintech (2026) favors *behavior-triggered* gating over *one-time quiz-set static tiers*. Treat the quiz as a **default**, not a lock — see recommendation |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Cash advances / "get paid early" / instant-money features | Feels like natural extension of "Decide" ("just let me borrow the difference") | The FTC's March 2025 $17M settlement against Cleo AI was specifically for deceptive cash-advance amount claims and hard-to-cancel subscriptions — this is a live, recent enforcement precedent in exactly this product category, not a hypothetical risk | Already correctly excluded by "not a lender" positioning. Keep it excluded explicitly in any future roadmap discussion, don't let it re-enter as a "Pro" feature |
| Conversational AI that answers open-ended money questions in a helpful, unhedged tone | Copilot's "Money Assistant" and Monarch's "AI Assistant" both do this in 2026 and are well received; Cleo's chat-based "can I afford X" is the most-cited example of the pattern | An AI chatbot has no fiduciary duty and isn't SEC-regulated for the advice it dispenses; Cleo is the same product category and is under a live FTC consent order. Apple 3.2.1's "no advice" framing applies with extra force to conversational output, which is much harder to audit for advisory language than a fixed verdict template | The prototype's own "Coach" is already flagged in PROJECT.md as the feature most likely to invite 3.2.1 scrutiny — this research reinforces that flag with a concrete enforcement precedent in the same category. If Coach ships, its output needs the same declarative-not-prescriptive discipline as Decide's verdict copy, reviewed line by line, not just at the system-prompt level |
| Dark-pattern subscription cancellation (multi-step, retention-offer-gated cancel flows) | Reduces churn short-term | Explicit FTC target in the Cleo case and broader 2025-2026 enforcement trend ("click to cancel" rule). FincWin's Pro tier will have this exact surface | Make in-app subscription cancellation exactly as frictionless as account deletion is already specified to be. This should be a stated requirement alongside "in-app account deletion is mandatory," not left implicit |
| Robo-advisor-style investment allocation recommendations | Monarch's roadmap is visibly moving this direction ("model your entire financial future") | Crosses from "calculator over user-entered figures" into "investment advice," triggering 3.2.1's financial-institution requirement | Cost-basis lots, gain/loss and per-holding history (already planned) stop at reporting on what the user holds. Do not add "what should I buy" recommendations |
| Ad-supported free tier / data monetization | Revenue pressure, especially once the Pro-tier boundary question resolves | Splitwise moved its free tier to ads + daily expense limits in 2026 and drew user resentment for it, specifically in a shared-money context where non-paying household members are a captive audience; the 60%-of-apps-share-data finding above is the same trust erosion at the data layer | Keep monetization to RevenueCat subscription only, as already decided. Do not let a future pricing discussion reach for ads as a lever, especially not in the Household surface where one member paying doesn't mean all members consented to being monetized |
| Tax liability computation | Users will ask for it once they see cost-basis/gain-loss data | Already correctly cut in PROJECT.md — reaffirmed here as the right call; nothing in 2026 competitor behavior argues for reopening it |
| Bank-feed-quality "automatic" round-ups without a bank feed | Feels like it should be easy to fake with manual entries | Already correctly deferred to arrive with Plaid — round-ups simulated on manually-entered data would be meaningless (nothing was actually rounded up from a real transaction) |

---

## The Decide Engine vs. 2026 Competitors — Direct Findings

**Verdict: genuinely novel as a shipped, persisted product feature.** No mainstream 2026 competitor combines all three of: (1) a verdict computed from the user's own logged history rather than a survey or live bank feed alone, (2) a persisted, revisitable decision record, (3) automated estimate-vs-actual comparison after the fact.

What exists adjacent to it:

- **Cleo** — conversational, chat-based "Can I afford X?" answered from real transaction data (bank-synced, not manually logged). Casual/Gen-Z tone. No evidence of a persisted decision record or later actual-vs-estimate reconciliation; it's a stateless Q&A pattern, and the company is under an active FTC consent order for a related product (cash advances) that damages trust in its financial-judgment features generally. (Confidence: MEDIUM — verified via FTC.gov and multiple secondary sources, but Cleo's exact affordability-answer mechanics are not independently documented in detail.)
- **"Buy or Wait?"** — the closest conceptual match: reconstructs financial state, runs a 90-day forward cash-flow simulation, and recommends full pay / partial pay / installment / wait / decline, with safety checks against protected expenses and a minimum-balance floor. Structurally this is very close to `dassess`'s now-vs-after ledger check. **However, this is not a shipped consumer product** — it originated as a HackerRank "Orchestrate 2026" AI-agent challenge, and every reference found is an independent GitHub implementation of the same challenge brief, not a live product with real users. Its existence is still meaningful: it shows the *shape* of this idea is being independently discovered by developers building AI agents in 2026, which validates the concept, but it means FincWin would be first to actually ship it as a persisted, revisitable, household-aware product feature. (Confidence: HIGH that it is a hackathon artifact, not a product — multiple independent GitHub repos all reference the same challenge name and structure.)
- **Origin** — positions itself as unifying budgeting, investing and "financial advice" into one picture. This is advisory-framed by its own marketing, which is a regulatory-exposure model FincWin's plan deliberately avoids. Not a direct feature competitor to Decide's mechanics so much as a different, riskier positioning choice.

**Implication for the roadmap:** treat Decide as the one component of the product worth defending disproportionately — deeper testing, more design iteration budget, and a phase (per BUILD-PROMPT §8, phase 4 engine-then-UI) that isn't compressed under schedule pressure. Nothing found in this research changes that priority; if anything it raises the stakes, because the closest comparable idea is being built by hobbyists right now, which is a 12-24 month countdown on someone shipping the same shape as a real product, not evidence FincWin is wrong to build it.

---

## Household and Shared Finance — What Users Will Compare This Against

| Product | Model | Privacy granularity | Settlement mechanics |
|---|---|---|---|
| **Splitwise** | Ad-hoc, unlimited groups, permanent full visibility to all group members | None — everyone in a group sees every expense in that group | "Simplify debts" — globally minimizes the number of payments needed to settle a group, strong at n>2 people. This is the reference UX for "settle up" |
| **Monarch Money** | One persistent household, both partners get separate logins to a shared dashboard | "Filter by Owner" + 2026's "yours/mine/ours" transaction labels — visibility is per-transaction-label, not per-account | Not settlement-oriented; it's a shared single ledger, not a debts-between-people model |
| **Honeydue** | Couples-specific, both connect own accounts | Per-account: share full transactions, balances-only, or nothing — the most granular privacy model found | Bill reminders and shared-view, not Splitwise-style settlement |
| **Origin** | "Shared visibility, not shared accounts" — partner access layered on top of individual accounts | Coarser than Honeydue, finer than Splitwise | Not settlement-focused |
| **FincWin (planned)** | One persistent household, four split rules (even/weight/amount/mine-only), per-category split defaults, expiring invite link | Single name-sharing toggle with colour-name fallback — coarser than Honeydue, but simpler to build and reason about | Settlements with per-person balances and an **expiry window** — the expiry window is not something any of the above do; worth keeping as a genuine point of difference, but confirm the product reasoning for it (what happens when a settlement expires unresolved is a real UX question worth resolving explicitly in the household phase, not left implicit) |

**What this means for FincWin:** the plan sits between Monarch's "one shared ledger" model and Splitwise's "settle debts between people" model, which is actually a reasonable synthesis — households have both shared-expense and settle-up needs. The one place FincWin's plan is *coarser* than the category's privacy leader (Honeydue) is per-account/per-category visibility; that's a defensible v1 simplification given PROJECT.md's decision to ship one household only, not a gap that needs fixing before launch. If a future partner-privacy complaint arrives post-launch, Honeydue's per-account model (not Splitwise's, which has none) is the pattern to look at.

---

## Progressive Disclosure — Does This Pattern Exist Elsewhere, and Does It Work?

**Nothing in the finance-app category matches FincWin's exact mechanism** (an 11-question quiz setting a static starting tier that gates ~50 features across four levels). What exists nearby:

- Credit-union "financial wellness quizzes" (DuPage CU, Credit Human) produce a **score out of 100**, not a feature-gating tier. They're diagnostic, not access-control.
- General fintech-onboarding UX research (2026) is consistent on one point: **progressive disclosure that reduces abandonment is asking-only-what's-needed-per-step**, and the more modern best practice for feature gating specifically is **behavioral triggering** — a feature unlocks after the user completes a prerequisite action, not after a quiz assigns them a static tier up front. The distinction matters: behavior-triggered unlocks feel earned in the moment; a quiz-assigned tier can feel like a judgment made about the user before they've done anything in the app, and a wrong initial classification (a sophisticated user who under-answers, or vice versa) creates a "why can't I see X" support/frustration moment with no clear recourse. (Confidence: MEDIUM — general UX/fintech-onboarding sources, not finance-app-specific case studies, since no finance app appears to run this exact experiment publicly.)

**Recommendation, not a finding:** this doesn't mean the quiz-based tier is wrong — FincWin's version differs from typical SaaS gating in a way that may actually suit it (a money app's "right" feature depth correlates with life complexity, which a short quiz can reasonably estimate, unlike most SaaS feature-gating which correlates with usage sophistication that's only visible from behavior). But the roadmap should confirm two things explicitly, since neither is stated in PROJECT.md's Active list: (1) can a user manually change their level at any time after onboarding, independent of the quiz result, and (2) is there a path to reaching level 4 by *behavior* (e.g., "you've logged 3 months, added a goal, and added a debt — unlock investments") as a secondary trigger alongside the quiz. If the answer to (1) is already "yes, level is just a user setting," this entire concern is resolved by that alone and worth stating plainly in the UI so users don't feel gated by a one-time quiz.

---

## Manual Entry as a Product Choice — Sizing the Risk

FincWin ships v1 with **manual entry only**, deferring Plaid/bank aggregation to v1.1. This is a real and non-trivial risk, and the roadmap should carry it as a named risk rather than an implementation detail.

**What the competitive landscape shows:**

- Every mainstream growth-stage competitor found in this research (YNAB, Monarch, Copilot, Cleo) is **bank-sync-first**. Copilot in particular is bank-sync-only with no manual path at all.
- Manual-capable products exist and are viable (PocketGuard allows manual entry, Lunch Money is manual-friendly and web-first, Actual Budget is local-first with *optional* bank sync via goCardless/SimpleFIN) — but none of them are manual-*only*; all treat bank sync as the default path and manual as a fallback for cash or unsupported institutions. **No mainstream 2026 finance app ships with manual entry as the sole path the way FincWin's v1 plans to.**
- Marketing-blog sources (moneypatrol.com, dev.to) claim manual entry is "the #1 abandonment cause with 3x higher churn" and that bank-sync apps see "68% higher retention." **These specific percentages are LOW confidence** — they come from content-marketing blog posts, not published studies, and no primary source was found. Treat the *direction* (manual entry has materially higher drop-off than bank sync) as directionally credible given how consistently every growth-stage competitor has converged on bank-sync-first, but do not treat the numbers as fact.

**Why this risk compounds for FincWin specifically, not just generically:** Decide's core value proposition — a verdict "computed from your own logged months, not a survey" — depends on the user having already built up months of logged history. Manual entry is exactly the friction point that causes budget apps to lose users before they reach that history depth. This is a **chicken-and-egg problem specific to this product**, not a generic manual-entry downside: the feature that's supposed to be the retention hook (Decide) has a cold-start dependency on the exact behavior (sustained manual logging) that manual-only apps struggle to sustain.

**This is where CSV import earns more weight than PROJECT.md currently gives it.** CSV import is already in the Active list ("CSV-style import for expenses, income, goals, debt, investments and accounts") but is framed as a System/utility feature, not connected explicitly to Decide's cold-start problem. Recommend the roadmap treat import quality (a clean Monarch/Mint/spreadsheet-export → FincWin path) as a **day-one activation feature**, not a later-phase nicety — a new user who can backfill 3-6 months of real history on day one gets a working Decide verdict immediately instead of waiting three months for enough logged data to exist. This connection is not currently stated anywhere in PROJECT.md or BUILD-PROMPT.md.

---

## Gaps: Table-Stakes Items Missing from PROJECT.md's Active List

This is the highest-value output of this research per the brief. Two gaps found; both are concrete and actionable.

### Gap 1 — Recurring transactions / bill templates (moderate-to-high priority)

**What's missing:** there is no first-class "this repeats" entity anywhere in the Active list. Home has "Upcoming" and Alerts has "five kinds" (unnamed in PROJECT.md), which implies *some* recurring awareness, but nothing in Record, Money core, or System describes a recurring-transaction template (rent, salary, subscriptions) that a user defines once and which then prefills or reminds monthly.

**Why it matters more here than elsewhere:** bank-synced competitors (Monarch, Copilot, Rocket Money-style tools) can *detect* recurring charges automatically from transaction history. FincWin cannot do this in v1 — there's no bank feed to pattern-match against. That makes an explicit, user-defined recurring-transaction feature **more** necessary for FincWin than for its bank-synced competitors, not less: without it, every month's rent, salary and subscriptions must be re-entered from scratch, which directly worsens the manual-entry retention risk identified above, and it undermines `dmoney`'s income-steadiness calculation (which depends on consistent logged income) if salary entries are inconsistently logged because there's no template nudging the user to log it.

**Recommendation:** add a recurring-transaction/template feature to the Record or Money-core requirement area — even a minimal version (name, amount, category, account, cadence, next-due date, one-tap "log this occurrence") — and sequence it early, since Decide's `dmoney` and the alerts' "bills due" kind both depend on it existing.

### Gap 2 — Subscription tracking surface (lower priority, related to Gap 1)

**What's missing:** a consumer-facing "your subscriptions" view (list of recognized recurring charges, next-charge date, total monthly subscription spend) is now near-universal in 2026 competitors (Copilot, Monarch, and the broader Rocket-Money-style category). True subscription *detection* requires bank data and is correctly out of scope for manual-only v1 — but subscription *tracking* (the same recurring-transaction entity from Gap 1, filtered to a "Subscriptions" category, surfaced as its own view) is feasible without a bank feed and is cheap once Gap 1 exists.

**Recommendation:** don't build this as a separate feature — resolve Gap 1 first, and treat this as a filtered view on top of it, worth a line in Insights or Home rather than a new requirement area.

**Everything else checked against the Active list — budgets/caps, net worth, goals, debt payoff, multi-currency, search/filter, biometric lock, account deletion, data export, household splitting — has a direct table-stakes equivalent in at least one competitor and is already covered. Receipt photo attachment (Monarch's 2026 differentiator, OCR-matched to bank transactions) was considered and deliberately not flagged as a gap: it's materially less valuable without a bank feed to auto-match against, and `expo-image-picker` is already listed in BUILD-PROMPT §3's Services table for this purpose, so the capability exists even if not yet elevated to a PROJECT.md requirement.**

---

## Feature Dependencies

```
Recurring transaction / bill template (GAP — recommend adding)
    └──strengthens──> dmoney (income steadiness needs consistent logged income)
    └──strengthens──> Alerts (bills-due kind needs a due-date source)
    └──reduces──> Manual-entry retention risk

CSV import (already Active)
    └──mitigates──> Manual-entry cold-start problem for Decide
    └──should be sequenced──> early (day-one activation), not late-System-phase

Decide (dmoney, dassess)
    └──requires──> ≥1 logged month of transactions (Record)
    └──requires──> Accounts + Categories (Money core)
    └──enhanced by──> Household split rules (dshare) when scope = household

Household split rules
    └──requires──> Household members with weights/roles
    └──requires──> Accounts/transactions to attach a split to

Financial-health score
    └──requires──> isEmergencyFund flag on a goal (Grow)
    └──requires──> Debt records (Grow) for DTI
    └──requires──> Logged income/expense history (Record)

Progressive-disclosure levels
    └──gates──> ~50 features across all other areas
    └──should allow──> manual override (RECOMMEND — not currently stated as Active)

Subscription tracking view
    └──requires──> Recurring transaction / bill template (GAP above)
```

### Dependency Notes

- **Recurring transactions strengthens dmoney and Alerts:** both currently assume income/bill data exists without specifying how it gets there reliably under manual-only entry. Building the recurring-transaction entity earlier removes ambiguity from both.
- **CSV import mitigates the Decide cold-start problem:** this is a sequencing recommendation, not a new feature — CSV import is already Active, but its priority should reflect that it directly de-risks the product's core differentiator, not just general data portability.
- **Decide requires logged history:** this is why BUILD-PROMPT's phase ordering (engine before UI, Record before Decide) is correct — flagging it here only to confirm the research doesn't contradict that sequencing.

---

## Feature Prioritization Matrix (research-informed additions only)

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Recurring transaction / bill template | HIGH | MEDIUM | P1 — recommend pulling into an earlier phase than System (phase 10); it blocks correct `dmoney` and Alerts behavior |
| CSV import prioritized for day-one backfill | HIGH | LOW (already planned; this is a sequencing/framing change) | P1 |
| Manual level-override for onboarding tier | MEDIUM | LOW | P2 — cheap insurance against the quiz-misclassification risk noted above |
| Subscription tracking view | LOW-MEDIUM | LOW (once recurring transactions exist) | P3 |
| Per-account/per-category privacy granularity (Honeydue-style) | LOW at v1 scope (one household) | MEDIUM-HIGH | P3 — explicitly defer; current single toggle is a reasonable v1 simplification |

---

## Competitor Feature Analysis

| Feature | Monarch Money (2026) | Copilot Money (2026) | Splitwise (2026) | FincWin's Approach |
|---------|----------------------|-----------------------|-------------------|---------------------|
| Affordability check | None (has forecasting, not a persisted decision-with-verdict) | None | N/A | Decide: verdict + alternatives + decision journal + estimate-vs-actual — no direct competitor |
| AI assistant | Chat-based, "trained on CFP/CFA best practices," edits budgets via chat | "Money Assistant" — proactive, can create/edit transactions/rules, MCP integration to external AI tools | N/A | Coach exists in prototype but is flagged in PROJECT.md as highest compliance risk; this research reinforces that given Cleo's FTC precedent in the same category |
| Household/couples | Persistent household, shared dashboard, "yours/mine/ours" labels, filter-by-owner | Split transactions rebuilt in 2026 (equal/$/%) but no persistent household concept | Ad-hoc groups, permanent full visibility, "simplify debts" settlement | Persistent household, 4 split rules, expiring settlements, single privacy toggle |
| Data entry | Bank-sync only (Plaid-based) | Bank-sync only | N/A (expense entry, not budgeting) | Manual-only v1, provider-abstracted for future Plaid |
| Monetization | Two-tier (Core/Plus) subscription | Subscription | Free tier now ad-supported + daily limits (2026 change, user-resented) | RevenueCat subscription only, no ads (recommend keeping this explicit against future pricing pressure) |
| Receipt handling | Photo → OCR → auto-matched to bank transaction | N/A found | N/A | Not yet a stated requirement; lower priority without bank data to match against |

---

## Sources

- [What's New at Monarch](https://www.monarch.com/whats-new) — 2026 feature releases (AI Assistant, receipt scanning, Goals relaunch, equity tracking, Core/Plus tiers)
- [Monarch Winter Release blog](https://www.monarch.com/blog/winter-release)
- [YNAB What's New](https://www.ynab.com/whats-new) and [Updates to YNAB](https://support.ynab.com/updates-to-ynab-S1f4aRLeC) — 2026 mobile/web/API updates, real-time multi-user budgets
- [Copilot Money Dispatch — Money Assistant beta](https://www.copilot.money/dispatch/beta-introducing-your-money-assistant) — proactive AI assistant, MCP integration, rebuilt split transactions
- [Copilot Money](https://www.copilot.money/) — AI auto-categorization, Apple-first, bank-sync-only positioning
- ["Buy or Wait?" GitHub implementations](https://github.com/nalziori/buy-or-wait-financial-agent) (and related repos: Code-tech77, GenZ-CODER-X, Marahman02, Darshaannn, anushkasenmehar1208-hub) — confirmed as HackerRank "Orchestrate 2026" challenge artifacts, not a shipped product
- [Bankrate — AI apps to save money](https://www.bankrate.com/banking/savings/ai-apps-to-help-you-save-money/) — Cleo's conversational affordability pattern
- [Splitwise app review — Android Central 2026](https://www.androidcentral.com/apps-software/the-app-splitwise-is-the-best-hack-to-split-group-trip-expenses-in-2026) and [Splitwise Pro pricing coverage](https://splitterup.app/blog/best-expense-splitting-apps) — simplify-debts settlement mechanics, 2026 ad-supported free tier
- [Finance apps that let you add a partner — Origin, 2026](https://useorigin.com/resources/blog/finance-apps-that-let-you-add-a-partner-in-2026) — Honeydue per-account privacy levels, Origin's "shared visibility not shared accounts," Monarch's yours/mine/ours
- [FTC v. Cleo AI, Inc.](https://www.ftc.gov/legal-library/browse/cases-proceedings/cleo-ai-inc-ftc-v) and [National Law Review coverage](https://natlawreview.com/article/ftc-alleges-fintech-cleo-ai-deceived-consumers) — $17M settlement, deceptive cash-advance claims, hard-to-cancel subscriptions, March 2025
- [Apple Developer Forums — Guideline 3.2.1(viii) discussion](https://developer.apple.com/forums/thread/775803) — 2026 update: 36% APR cap, 60-day minimum term, lending-partner disclosure requirements (confirms these do not bind FincWin, which offers no loans)
- [Actual Budget GitHub](https://github.com/actualbudget/actual) and [actualbudget.org](https://actualbudget.org/) — local-first, optional bank sync via goCardless/SimpleFIN, E2E-encrypted self-hosted sync
- Manual-vs-bank-sync retention claims: [MoneyPatrol](https://moneypatrol.com/moneytalk/budgeting/manual-budget-app-vs-bank-sync-which-fits-your-style/) and [dev.to](https://dev.to/eastkap/your-brain-on-budgets-why-manual-entry-beats-bank-sync-backed-by-psychology-1ike) — **LOW confidence, content-marketing sources, directional only**
- Progressive disclosure / feature-gating UX research: [Pendo](https://www.pendo.io/pendo-blog/onboarding-progressive-disclosure/), [Trio.dev fintech onboarding guide](https://trio.dev/fintech-onboarding-best-practices/), [Digia mobile onboarding guide](https://www.digia.tech/post/mobile-app-onboarding-activation-retention/) — MEDIUM confidence, general fintech/SaaS UX research, not finance-app-specific case studies
- [Financial wellness quiz examples — DuPage Credit Union](https://www.dupagecu.com/blog/digital-banking-tools-financial-health/), [Credit Human](https://www.credithuman.com/building-slack/it-all-starts-now-financial-health-quiz) — confirms these are score-producing, not tier-gating, mechanisms

---
*Feature research for: personal and household finance app with a purchase-affordability decision engine*
*Researched: 2026-09-21*
