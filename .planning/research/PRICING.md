# Pricing Advisory

**Researched:** 2026-09-26 · **Status:** advisory. The Free/Pro split is still the open blocking decision for Phase 9 (PROJECT.md).
**Inputs:**
- Competitor prices: App Store purchase lists for US, CA and GB, plus vendor pages, for 18 apps.
- Benchmarks: RevenueCat *State of Subscription Apps 2026*, Adapty 2026.
- Service costs: vendor pricing pages, fetched 2026-09-26.
- The launch-positioning audit (`LAUNCH-POSITIONING.md`).
- The prototype paywall (html:5299, $8 a month, 14-day trial).

**Label key:** EST means modelled here. 3P means a third-party figure, not from the vendor.

---

## 1. Recommendation

| | Free | **Pro** | Pro + Bank Sync (v1.1) |
|---|---|---|---|
| US | $0 | **$7.99 / month · $59.99 / year** | $11.99 / month · $89.99 / year |
| Canada | $0 | C$10.99 · C$79.99 | C$15.99 · C$119.99 |
| UK (VAT inclusive) | £0 | £6.99 · £54.99 | £10.99 · £84.99 |
| Trial | — | 14 days, through the store | 14 days |
| Covers | one person, or a whole household as members | **the whole household** (up to 6 members) | the household, up to 3 bank logins |

What the recommendation rests on:
- **A generous free tier.** It includes the quick Decide check and statement import.
- **One Pro plan per household.** Every household member gets Pro through a single subscription.
- **A written price pledge:** "your price never rises while you stay subscribed."
- **No lifetime plan at launch.** Test it at month 6.
- **No hard paywall.** Paid bank sync waits for v1.1.

### Why this wins
1. **The price undercuts the category and the value still reads clearly.**
   - Sync-led competitors cost $13–15 a month or $95–109 a year (YNAB, Monarch, Copilot). Manual-first apps cost $36–70 a year (Spendee, Buddy, Goodbudget Plus).
   - v1 has no bank sync, so it prices near the top of the manual band. $59.99 is about 40% below Monarch and YNAB and sits beside Goodbudget Plus. The only thing to beat it at this price is Decide, and nobody else has Decide.
   - $7.99 keeps the prototype's $8 anchor, which the paywall is already designed around.
2. **Household pricing is an advantage.**
   - Copilot charges per person, which is the "$190 couples trap". YNAB includes up to 6 people and Monarch includes a partner.
   - One FincWin Pro plan covers the household, and invited members join free. Every invite brings in a user who doesn't need a card.
3. **The free tier keeps the store promise.** The name is *Can I Afford It?*, so the quick check has to work without paying. Charging for it would contradict the name, and Apple guideline 3.1.2(c) would require spelling that out on the paywall. Price is already the third most common review complaint in the category ("I want to get out of debt but simply can't afford this app").
4. **The costs fit comfortably.**
   - A free user costs about $0.01–0.06 a month, and a Pro user without sync about $0.08–0.13 (EST).
   - Net of 15% store commission and RevenueCat's 1%, Pro annual pays about **$4.20 a month net**, a gross margin of roughly 97%.
5. **The trial length follows the data.** Trials of 10–16 days convert best on monthly plans (46.6%) and renew better than 3-day trials (72% against 54%, RevenueCat). A 3-day trial loses 55% of its cancellations on day 0.
6. **The price pledge answers the category's worst memory.** YNAB's 2021 grandfathering reversal and Simplifi's intro-then-renewal pricing both drew anger. Lunch Money's price-lock guarantee earns goodwill. At FincWin's size, the pledge costs almost nothing.

---

## 2. What's free, what's Pro

Principle: **the free tier looks back and answers today's question. Pro looks forward, explores scenarios, and handles the household in detail.** Everything that gets a new user to a first answer stays free. That includes import, which solves the cold-start problem.

| Area | Free | Pro |
|---|---|---|
| **Decide** | Quick check, unlimited. Full 5-step check with a verdict and what breaks. 1 open check at a time. | Unlimited open checks, recomputed live. **The alternatives table** (cheaper, wait and save, skip). Setbacks (job loss, late invoices, income drop). Card and loan payoff comparisons. The decision journal with estimate against actual. |
| Recording | Unlimited entries, categories, search in the current month, repeating bills, transfers, refunds | Split a line, bulk select, search across all months, receipts |
| Accounts | Unlimited accounts, multi-currency (already built), balances and net worth | Reconcile against a statement |
| **Import** | **CSV, OFX and QFX statements** (read on the device, near-zero cost) | **PDF statements** (Phase 2.1, needs the server worker), import beyond transactions (goals, debt, investments) |
| Planning | Envelopes and caps, alerts, health score, what's coming | Envelope rollover, **12-month forecast and scenarios** |
| Grow | Savings goals, emergency fund, debt list, investments valued by hand | **Payoff planner** (avalanche and snowball scenarios), cost-basis lots |
| Insights | Month charts, category breakdown | Compare months, cash-flow history, extra views, year calendar |
| **Household** | Create one household, invite members, even split, settle up | Split by weight or amount, per-category split defaults, read-only summary link. **One Pro covers every member.** |
| System | CSV export, **account deletion** (never paywalled), undo for recent changes | 12-deep undo history, archive, widgets (v1.1) |
| Coach (if built) | — | Included, capped at 5 a day (see §5) |
| Bank sync (v1.1) | — | Separate plan, Pro + Bank Sync |

Three things are never paywalled, whatever the pricing: export, deletion and cancellation. PROJECT.md requires Pro cancellation to be "as frictionless as account deletion".

**App Store rule:** the description must say which features need a purchase (guideline 2.3.2). Add "Some features need FincWin Pro" to both store descriptions.

---

## 3. The options considered

Each option is scored 1–5 on six criteria: conversion, goodwill, margin, low risk, simplicity, and fit with the store name's promise.

| # | Model | Example | Conv. | Goodwill | Margin | Low risk | Simple | Promise | Total | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| **A** | **Freemium plus one Pro plan per household** *(recommended)* | Goodbudget, Spendee | 3 | 5 | 5 | 5 | 4 | 5 | **27** | Recommended |
| B | Hard paywall with a trial, no free tier | YNAB, Monarch, Copilot | 5 | 2 | 5 | 3 | 5 | 1 | 21 | Converts 5× better at day 35 (10.7% against 2.1%), but the name promises a free answer, and the category resents it |
| C | Freemium with Pro and a Premium tier | Emma, Monarch Plus, EveryDollar | 3 | 3 | 5 | 4 | 2 | 5 | 22 | Tier sprawl before there's data to justify it. Revisit when sync and Coach exist |
| D | Pay what you want (with a floor) | Rocket Money, Lunch Money | 3 | 5 | 3 | 4 | 3 | 5 | 23 | Wins goodwill, but anchors low, is hard to explain in 3.1.2 disclosures, and FincWin has no community yet |
| E | Lifetime purchase next to the subscription | Wallet $29.99, Spendee $44.99, PocketGuard $149.99 | 4 | 5 | 2 | 2 | 3 | 5 | 21 | Cash now, but ongoing costs (Coach, sync, Supabase) turn it into a liability. **Test at month 6 for Pro without sync, at $149.99.** |
| F | Tips only, everything free | Honeydue | 1 | 5 | 1 | 5 | 5 | 5 | 22 | Honeydue now runs on ads and referrals and is going stale. Not sustainable |
| G | Charge per person | Copilot | 3 | 1 | 5 | 4 | 4 | 4 | 21 | Contradicts the household positioning |
| H | Usage-based: charge per Coach question or per check | — | 2 | 2 | 4 | 2 | 1 | 1 | 12 | Charging per check fights the name directly |
| I | Reverse trial: every new user gets Pro for 14 days with no card, then drops to Free | Some SaaS apps | 3 | 4 | 5 | 4 | 3 | 5 | 24 | Strong for showing Pro, but no-card trials convert 18.2% against 48.8% for store opt-out trials (Adapty). **Keep it as a later test** through RevenueCat promotional entitlements |

**Variants within A:**
- **Price points to test:**
  - $6.99 / $49.99 (closer to Goodbudget and Buddy)
  - **$7.99 / $59.99 (recommended)**
  - $9.99 / $69.99 (the all-app median of $10 a month)
- **Evidence on higher prices:** RevenueCat finds high-priced apps convert downloads about 2× better, because price signals quality. Adapty finds price tests lift LTV 46% of the time.
- **What to test first:** annual price, not monthly. Most buyers see the annual plan highlighted.
- **Annual discount:** 37% at $59.99. The category median is 40–45%, and EveryDollar goes as far as 63%. Don't go deeper, because annual churn in year one is about 72% (RevenueCat 2026).
- **Launch offer:** don't run an intro price that renews higher. Simplifi's $47.88 renewing at $83.88 draws complaints. Instead, launch at list price and make the price pledge the launch message.
- **Students:** a free year like YNAB's needs verification (SheerID or similar). Park it until after launch, and treat it as a growth channel if campuses turn out to matter.

---

## 4. External services: what they cost, and the Plaid plan

| Service | Pricing (2026-09-26) | Per-user impact |
|---|---|---|
| Supabase | Pro $25 a month with a $10 compute credit. 100K MAU included. Compute $15–210. PITR $100 | $0.01–0.06 per MAU at 1K–100K (EST) |
| RevenueCat | Free to $2,500 monthly tracked revenue, then **1% of revenue above $2,500**. PROJECT.md says "1% of all gross revenue", which is wrong; fix it | ≈ 1% |
| Apple | 15% under the Small Business Program (**enrol before launch**), otherwise 30% in year one, then 15% | 15% |
| Google Play | Subscriptions 10% + 5% billing fee = 15% (US, UK, EEA from 2026-06-30). Canada 15% | 15% |
| EAS | Free, then Starter $19, then Production $199 | Fixed |
| PostHog / Sentry | Free tiers cover up to about 10K MAU | Fixed |
| Claude Haiku 4.5 (Coach) | $1 in / $5 out per million tokens. Caching only applies above 4,096 tokens | ≈ $0.005 a question; $0.065 a month at 3 a week; **$3 a month at the prototype's 20-a-day cap** |
| PDF parsing | Self-run on Fly.io at $4–12 a month, or Textract at $0.0015–0.015 a page | Under $0.02 per importing user |
| **Plaid** | **No public price list.** Pay-as-you-go has no minimum. Growth plan minimums are $1–3K a month (3P). Transactions are billed **per connected bank login (Item) per month**, for as long as the Item exists | **$0.30–0.60 per Item per month (EST, 3P)**, or $0.60–1.20 for 2 logins |
| Teller (US only) | $0.30 per enrollment per month, published. Free up to 100 connections | $0.60 for 2 logins |
| Canada | Plaid covers the Big Six, Desjardins, Tangerine and Simplii. Flinks has no public rates. Open banking (the Consumer-Driven Banking Act) gets read access around 2026–27, date unset | Unknown; re-quote when the rules take effect |
| UK | Plaid UK is Custom plans only. TrueLayer, Salt Edge and Yapily are all sales-gated. **GoCardless Bank Account Data (formerly Nordigen) is closed to new signups** | Unknown; needs quotes |

**Plaid plan (v1.1):**
- **Price the Bank Sync plan above what it costs, not near it.** The added cost is $0.60–2.00 a month per household, so break-even is $0.71–2.38 a month after commission. The add-on is +$4 a month or +$30 a year. That covers up to about 3 logins at the high Plaid estimate, so **cap the plan at 3 bank logins per household.**
- **Start on Pay-as-you-go.** A Growth contract ($1–3K a month minimum) only pays off at roughly 500–1,500 sync subscribers.
- **Remove lapsed subscribers' Items** with `/item/remove`. Plaid bills for every Item that exists, not only active ones.
- **Get a real Plaid quote** through the Production access flow, which is the only place Plaid shows rates, before fixing the price. Price Teller for the US as a lower-cost alternative behind the existing provider abstraction.
- **Bank fees are a live risk.** JPMorgan now charges aggregators for data. Plaid says current agreements are unaffected, but the CFPB's §1033 rewrite may let banks charge fees. Keep the sync price wide enough to absorb a pass-through at renewal.
- **The store copy has to stay true.** "No bank login required" remains true after v1.1, because sync is optional and paid.

**Coach (if built):**
- Cap it at **5 questions a day**, not 20. The worst-case cost falls from $3 to $0.75 a month per heavy user, and realistic use (about 3 a week) stays unaffected.
- Include it in Pro rather than selling it separately. As a separate product, Apple would treat it as a stand-alone advice feature, which invites the 3.2.1 review.

---

## 5. Unit economics (EST)

| | Pro annual $59.99 | Pro monthly $7.99 | Bank Sync annual $89.99 |
|---|---|---|---|
| Net after 15% store + 1% RevenueCat | $50.39 a year = $4.20 a month | $6.71 a month | $75.59 a year = $6.30 a month |
| Cost to serve (realistic) | $0.08–0.13 | $0.08–0.13 | $0.68–2.13 (up to 3 logins, about $3.10 at the high estimate) |
| Gross margin | ≈ 97% | ≈ 98% | ≈ 51–89% |

**Illustrative year-one revenue per 10,000 installs (EST):**
- 2.0–2.8% become paying subscribers by day 35 (RevenueCat median; North America 2.8%), which is 200–280 subscribers.
- About 60% choose annual.
- That gives roughly **$9–13K net in year one** (monthly subscribers assumed to stay about 6 months).
- Annual churn in year one is about 72% industry-wide, so retention is the lever. The Decide journal (estimate against actual) is the feature that brings users back.

---

## 6. Compliance and store rules for pricing

- **Apple 3.1.2(c):** the paywall must show the price, period, what's included, auto-renewal terms, and links to the terms and privacy policy, before any purchase. The prototype's Pro sheet needs those lines added.
- **Subscriptions must be attached to the submitted app version.** Record a fresh purchase for App Review, not a Restore Purchases (see the lesson in CLAUDE.md).
- **Trial-end reminder:** send a push 2 days before the trial converts. Law will require it (UK DMCC subscription rules, expected spring 2027; Ontario's Consumer Protection Act 2023 once in force). It also reduces refunds and bad reviews.
- **Cancellation is never harder than signing up** (FTC ROSCA and state auto-renewal laws still apply after the Click-to-Cancel rule was vacated). Link to the store's subscription management from the You screen.
- **US web checkout:** guideline 3.1.1(a) currently allows links to web purchase at 0% commission. That is on hold pending the Supreme Court (term starting October 2026). Don't build it for v1. Stripe arrives with the web app in 1.1 anyway.
- **Price-increase notices:** Apple and Google handle consent for existing subscribers. The pledge makes this moot for current subscribers.

---

## 7. Decisions this advisory asks for (Phase 9)

1. Adopt model A (freemium, one Pro plan per household), or choose another from §3.
2. Pro price: $7.99 / $59.99 (recommended), $6.99 / $49.99, or $9.99 / $69.99.
3. The Free/Pro split in §2. The key calls are:
   - the alternatives table goes to Pro
   - CSV/OFX/QFX import stays free
   - basic household stays free
4. Adopt the price pledge.
5. Coach cap of 5 a day, and Coach included in Pro.
6. For v1.1, get a Plaid quote before fixing the Bank Sync price, and cap sync at 3 bank logins per household.
7. Enrol in the Apple Small Business Program before launch.
8. Correct PROJECT.md's RevenueCat line. (Done 2026-09-26.)

---

## 8. Build notes for Phase 9

These apply whichever model is adopted. Items 1–4 assume model A.

1. **Household-wide Pro needs a server-side entitlement.**
   - App Store and Play subscriptions belong to the purchaser's store account, so RevenueCat grants the entitlement to one person, not the household.
   - Mirror it to the household: a RevenueCat webhook (INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE) calls a Supabase Edge Function. The function verifies the webhook's auth header and writes a `household_entitlements` row (household id, plan, expires_at, source purchaser), protected by row-level security (RLS).
   - The app checks "does my household have Pro". It uses the purchaser's own RevenueCat entitlement only as an offline fallback.
   - Feature flags never grant paid access (PROJECT.md).
2. **When the purchaser leaves the household,** Pro leaves with them. Say so on the paywall and in the household screen. Settle the edge cases at Phase 8 and 9 discuss: a member who already pays alone joins a Pro household; two members both subscribe.
3. **Gating:** one entitlement check per feature, keyed to the Free and Pro split in §2. Everything built before Phase 9 stays tier-agnostic behind that single check.
4. **Paywall** (the prototype's Pro sheet, html:5299):
   - Add the 3.1.2(c) lines: price, period, what's included, auto-renewal terms, and links to the terms and privacy policy.
   - Highlight the annual plan.
   - Show the price pledge.
   - Present the trial through the store's introductory offer, not a custom timer.
5. **Store products:** one subscription group, "FincWin Pro", with monthly and annual products, and later a "Pro + Bank Sync" group, with prices set per storefront (§1). Give the products keyword-bearing display names (see `LAUNCH-POSITIONING.md`), and attach them to the submitted app version.
6. **Lifecycle:**
   - Send a trial-end push 2 days before conversion.
   - Link to the store's subscription management from the You screen.
   - Use the grace period and billing-retry states from RevenueCat. Google Play loses 31% of cancellations to billing failure.
7. **Bank Sync (v1.1):**
   - Count Items per household and enforce the cap of 3 when linking.
   - On expiration or cancellation, the webhook queues `/item/remove` for every Item in the household.
   - Put the provider behind the existing abstraction, so Plaid and Teller can be swapped per country.
8. **Coach (if built):**
   - Enforce the 5-a-day cap server-side in the Edge Function, counted per user per local day.
   - Pad or structure the prompt above 4,096 tokens only if caching on Haiku is worth it.
9. **Analytics (money-free, per ANL rules):**
   - Track: paywall shown (with its trigger feature), trial started, converted, cancelled, and which Pro feature was first used.
   - Never send the price the user paid, only the plan id.

## Sources
- Pricing and services:
  - ynab.com/pricing
  - Monarch Plus press release (PR Newswire, 2026-04-21)
  - App Store purchase lists (US, CA, GB), fetched 2026-09-26
  - rocketmoney.com pricing article (2026-01-19)
  - spendee.com/pricing
  - Emma help centre
  - lunchmoney.app blog (2026-03-15)
  - supabase.com/pricing
  - revenuecat.com/pricing
  - Apple Small Business Program
  - Play Console help 16954621
  - expo.dev/pricing
  - claude.com/pricing
  - plaid.com/pricing and plaid.com/docs/account/billing
  - teller.io
  - aws.amazon.com/textract/pricing
  - docs.fly.io/about/pricing
- Benchmarks:
  - RevenueCat *State of Subscription Apps 2026* and 2025
  - RevenueCat free-trial-length post
  - Adapty *State of In-App Subscriptions 2026*
  - Adapty *trial vs direct purchase* (2026-03-24)
- Regulation:
  - Gibson Dunn and Jones Day on the FTC negative-option rule
  - Reed Smith on the UK DMCC delay
  - Torys on Canadian provincial consumer protection (July 2026)
  - Consumer Finance Monitor on CFPB §1033 (2026-08-06)
  - CNBC and Payments Dive on JPMorgan's data fees
- 3P figures: Vendr (Plaid), fincomparelab (Copilot), getfinny (PocketGuard), CostBench (Goodbudget), areweeven (Splitwise). Treat these as directional.
