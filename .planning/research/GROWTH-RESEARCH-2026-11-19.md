# Growth research: positioning, audiences, bank linking, capture, privacy, coming soon

**Researched:** 2026-11-19.
**Status:** research plus owner decisions. Not yet a plan.

**Inputs:**
- live iTunes Search API (US, GB, AU);
- Apple and Google developer docs;
- aggregator and competitor pricing pages;
- the repo (`PROJECT.md`, Phase 9 `09-CONTEXT.md`);
- the Supabase Management API.

Confidence: **HIGH** means a primary source. **MEDIUM** means several secondary sources agree. **LOW** means one source or inference. Treat vendor-blog prices as approximate.

**Related:**
- `.planning/aso/2026-11-18.md`: the listing re-check and the features FincWin can compete on.
- `LAUNCH-POSITIONING.md`: the September Decide-led positioning, partly replaced by §1 below.

## 0. Owner decisions (2026-11-19)

| # | Decision |
|---|---|
| G-1 | **Positioning:** a daily shared money tracker. Decide is a full feature everyone gets, marketed as a strong supporting feature, like the calculators, not as the headline. |
| G-2 | **Audiences:** Solo and groups, promoted both ways. Groups include couples, families, roommates and flatmates, and siblings. |
| G-3 | **Bank linking:** optional and paid, later, by region. **Capacity is attached to the subscription, not to individual members.** Any member can connect their own bank within the household's capacity. Billing sits with the plan payer. More capacity comes from paid connection packs. The quantities are examples, not validated (§3). |
| G-4 | **Data region:** keep production in **us-west-2 (Oregon)**. GDPR is met through Supabase's DPA and standard EU transfer clauses. Verified 2026-11-19 through the Management API. |
| G-5 | **Coming soon:** one informational "What's next" page in You, with vote counts. Wording: "Votes help us choose what to build next." No names, no free text, no leaderboard, and nothing in the store listing. |

## 1. Positioning (supersedes the Decide-led store name)

**One line:** Track money together. One shared budget for couples, families and flatmates: everyone logs, everyone sees, no bank login needed.

**Usage loop:**
- **Daily:** log in seconds, and the household sees it.
- **Weekly:** caps, what's coming, settle up.
- **Monthly:** the money meeting (month view, goals, debt, net worth).
- **When needed:** Decide and the calculators.

**Store metadata (proposal):**

| Field | Text | Count |
|---|---|---|
| Name | FincWin: Budget Tracker | 23/30 |
| A/B test name | FincWin: Shared Budget | 22/30 |
| iOS subtitle | Couples & Family Expenses | 25/30 |
| iOS keyword field | `planner,household,shared,split,spending,money,bills,savings,debt,networth,afford,finwin,app,goals` | 97/100 bytes, no repeats |
| Play short description | Track spending together, shared budget & expense tracker for couples and families | 80/80 |

**Screenshot order:**
1. Track money together (shared Activity, both people's lines)
2. Log it in seconds
3. Split fairly, settle up
4. Every account, any currency
5. Import statements, no bank login
6. Caps and what's coming
7. Savings, debt and net worth
8. Can we afford it? (Decide and calculators)

**Brand searchability:**
- Typing "fincwin" returns other "fin…" apps until launch. An exact name match takes #1 once FincWin is live.
- **"finwin" is taken** by a UAE broker app, a ChatGPT GPT and FinWin Technologies.
  - Put `finwin` in the keyword field.
  - Bid exact-match on `fincwin` and `finwin` in Apple Search Ads.
  - Use the same spoken spelling everywhere.
  - Claim the social handles and the domain.

**Daily-use gaps to close before launch marketing:**
- **Who logged each line.** No member names on Activity rows were found in a code search. Check this.
- **Push when a partner logs or a cap is near.** This is Phase 10, and iOS waits on Apple enrolment.

## 2. Audiences and group buying

Competition proxy: the median rating count of the top 10 App Store results.

| Term | US | GB | AU | Notes |
|---|---|---|---|---|
| shared expenses | 1 | 153 | 40 | Splitwise 29.7K, Tricount 7.7K, Splid 4.2K, then almost nothing |
| bill splitter | 1,047 (BNPL noise) | 14 | 6 | Open |
| split bills | 33,848 | 3 | 547 | US results are buy-now-pay-later apps |
| roommates expenses | 3,000 | 11 | 248 | |
| roommate / flatmate / house share | — | — | — | **Room-finding intent. Avoid as standalone keywords.** |
| family budget | 11,933 | 1,679 | 569 | Monarch 119K, EveryDollar 84K, YNAB 62K |
| siblings | 13 | 2 | 1 | No money app |

**Findings:**
- **Splitwise** has the lowest rating of the splitters (4.0★ US). Its free tier is capped at **4 new expenses a day**, with complaints in reviews. Pro costs about $4.99/mo, and there is now a Duo plan. (HIGH for the cap, MEDIUM for the price)
- **Tricount** (bunq) is free and pushes users to bunq accounts.
- **Splid** and **Settle Up** are simple splitters.
- **Zeta** closed in 2025. **Honeydue** is couples-only and free.
- **No app combines group splitting with full budgeting.** Guides pair YNAB with Splitwise. (MEDIUM-HIGH)
- **Siblings sharing a parent's care costs** use spreadsheets and group chats. There's no app, real money is involved, and Extended fits. (MEDIUM)

**Audience bets:**
1. Flatmates and roommates leaving Splitwise, with the UK, Australia and New Zealand first. They are price-sensitive and turn over every lease, so show the per-person price.
2. Couples.
3. Siblings, through content and social, not store keywords.

**Messaging:** one product, with group size picked at checkout (as YNAB, Monarch and Spotify do). "Starts as your money app. Add people when you're ready."

**Group buy:**
- Keep **one payer**. Neither store supports splitting one subscription's billing, and no competitor does it.
- Show the per-person price on the paywall ("$14.99/mo · about $2.50 each for 6") and A/B test the order. No solid evidence either way. (LOW)
- Members may log the subscription as a shared expense and settle up. Reimbursing each other is between users and unlocks nothing. (MEDIUM)
- **Never** add a "pay FincWin your share" link or button (Apple 3.1.1 and 3.1.3).

## 3. Bank linking: capacity attached to the subscription (G-3)

**Owner's example model** (quantities are examples, not validated):

| Plan | Bank-linking entitlement |
|---|---|
| Basic (today's plans) | Manual entry and file import |
| Individual Plus | 2 connected institutions |
| Household | 4 shared connected institutions |
| Household Extended | 8 shared connected institutions |
| Extra capacity | Paid connection packs |

### 3.1 Mapping to Phase 9 plans

D-01 means there is **no free tier**. "Basic" therefore means today's four plans (Solo, Duo, Household, Extended), which have manual entry and import and no bank linking.

Bank capacity becomes a **"Plus" version of each plan**. These are example numbers; the owner sets the real ones once provider quotes are in.

| Plan | People | Example connections | Worst-case provider cost / month (at $1 per connection) |
|---|---|---|---|
| Solo Plus | 1 | 2 | $2 |
| Duo Plus | 2 | 4 | $4 |
| Household Plus | up to 6 | 4–6 | $4–6 |
| Extended Plus | up to 12 | 8 | $8 |
| Connection pack | — | +2 | $2 |

**Unit:** one connection = one bank login, called an "Item" at Plaid. One login that covers several accounts is still one connection. That matches how aggregators bill. (MEDIUM)

### 3.2 How the stores handle it

- **Plus plans:**
  - They go in the **same subscription group** as the base plans, ranked Solo < Solo Plus < Duo < Duo Plus and so on.
  - Moving to Plus is an upgrade, and the person still holds one subscription.
  - No second group is needed for capacity. (HIGH: Apple allows one active subscription per group.)
- **Connection packs:**
  - Connections cost money every month, so packs must be **auto-renewing**.
  - They go in a **second subscription group** (Apple) or as a separate subscription product (Play). Play's own add-on feature needs the same billing period as the base plan, so avoid it. (HIGH)
  - A store subscription can't be bought in multiples, so offer pack sizes as tiers in that group, for example +2, +4, +8.
- **Price pledge:** moving to a Plus plan or buying a pack is the user's choice, not a price rise. The pledge holds as long as nothing in today's plans moves behind Plus.
  - Reword the pledge to "your **current** plan".
  - Always keep existing prices for current subscribers: Apple's "preserve" option, and Google's legacy price cohorts. (HIGH)
- **Billing with the payer:**
  - Only the plan payer buys Plus or packs.
  - Any member can start a connection while capacity remains.
  - When capacity is full, the member sees "Your home's bank links are all in use" and an "Ask {payer} for more" request (reuse the payer-approval pattern).
  - This avoids two members paying for the same thing (Apple 3.1.2(b)).
- **Downgrades:**
  - A Plus → base or pack removal needs connections at or below the new capacity first. The person disconnects; the app never disconnects on its own. This follows D-44.
  - When access lapses, call the provider's item-removal API so the provider stops billing.
- **Regions:**
  - Sell Plus and packs only where a provider is contracted. Gate it on the server.
  - Both stores let you set availability per country. (MEDIUM for Apple per-IAP territory availability; verify)

### 3.3 Providers and cost (rough; get written quotes)

| Region | Provider | Price signal |
|---|---|---|
| US, Canada | Plaid | ~$0.25–1.00 per connection per month; production minimums often $500–2,000/mo (LOW) |
| UK | Plaid, TrueLayer, Yapily | Sales-led, £150–500/mo entry (LOW) |
| EU | Tink, Salt Edge, Enable Banking; GoCardless closed to self-serve | Quote only |
| Australia | Basiq | A$0.50 per user per month plus platform fee, 12-month minimum (MEDIUM) |
| New Zealand | Akahu | Quote only |

**Risks:**
- Minimums arrive before revenue.
- US Section 1033 is being rewritten, and JPMorgan now charges aggregators for data access. (MEDIUM)
- Revisit the compliance position (3.2.1, 5.1) once bank data is held.

### 3.4 Against competitors

- **US apps include bank sync in one per-household price:** Monarch ~$99.99/yr, YNAB ~$109/yr (up to 6 people), Copilot ~$95/yr.
- **UK and EU apps include it free or cheap:** Emma, Snoop, BudgetBakers Wallet, Toshl.
- **No competitor sells bank sync as a separate add-on.** Keep the Plus uplift small. Solo Plus near $100/yr matches apps that include sync.

## 4. Capturing spending without a bank login

| Idea | iOS | Android | Store risk | Effort | Plan |
|---|---|---|---|---|---|
| Auto-reconcile with review page (matched / added / corrected / moved) | ✓ | ✓ | None | M | **Build first.** Match on file ID, then amount, then a ±7–10 day date window, then merchant similarity; one-to-one matching; split sums. Every other capture method feeds it. |
| Statement screenshot → lines (on-device OCR: Apple Vision, ML Kit) | ✓ | ✓ | Low | M | **Build.** Reuses paste and reconcile; images stay on the phone. Test `expo-mlkit-ocr` on SDK 57, or write a small local Expo module. |
| Apple Pay tap → log (Shortcuts "Transaction" automation → App Intent) | ✓ iOS 17+ | — | Low | S–M | **Build after a spike.** Shortcuts sometimes passes empty or $0 values, so it always goes through review. `expo-app-intents` is alpha and targets SDK 58; fallback is `@bacons/apple-targets`. |
| Receipt and invoice snap | ✓ | ✓ | Low | M | Coming soon. On-device first; paid services are about $0.06–0.10 per receipt. |
| Android payment-notification listener | — | ✓ | Medium | M | Coming soon. Filter by package on the phone and drop the rest. |
| Forwarding email address | ✓ | ✓ | Low | M | Coming soon. Inbound mail → Edge Function. Accept verified senders only; set retention limits. |
| Bank SMS | ✗ | ✓ with Play exception | Medium-high | M | Only for markets where banks alert by text. |
| Gmail or Outlook inbox access | ✓ | ✓ | Yearly CASA audit | L | **Drop.** |
| FinanceKit | US Apple Card; UK open banking | — | Apple approval, needs enrolment | M–L | Request after enrolment. Don't market it. |

## 5. Privacy

- **Now:**
  - App lock (Face ID and PIN, Phase 10).
  - An exact promise: no ads, no tracking SDKs, no selling or sharing of financial data (anonymised included), encrypted in transit and at rest, encrypted offline cache, export anytime, deletion that really erases.
    - Keep the wording identical across the App Privacy label, the Play Data safety form and the listing.
  - Analytics stay consent-gated and free of amounts.
  - "No email" = Sign in with Apple, Hide My Email.
- **Soon after launch:** "hidden from household" lines and private categories.
  - Builds on the 08 name-sharing switch.
  - Household totals and Decide must not leak hidden amounts.
- **Later, if asked:** optional end-to-end encryption of descriptions and notes only.
  - Full end-to-end encryption breaks PDF import, FX stamping and Realtime.
- **Drop:**
  - local-only mode (no sharing between phones; reopens cloud-first; one privacy label per app anyway);
  - a per-user EU/US region choice;
  - anonymous accounts.
- **Copy rule:** never say "data stays on your device" or "we can't see your data" with a cloud database. PROJECT.md already lists about 15 strings to fix.

## 6. Coming soon and feature voting (G-5)

- **Store listing:** no unshipped features (Apple 2.3, 2.3.1). Bank linking stays off the listing until it ships. Website and social posts may say "coming to some regions". (HIGH)
- **In the app:** one "What's next" page.
  - No muted rows in the main screens; Apple 2.1 rejects placeholder content. (MEDIUM)
  - No in-app purchase products before the feature works (Apple 2.1(b)). (HIGH)
- **Votes:**
  - Show counts only. Names, written ideas or a leaderboard count as user content, which needs reporting and blocking tools (Apple 1.2).
  - No "faster" promise.
  - Use the counts as demand data for the per-region aggregator decision.

## 7. Paid and social acquisition (from the 2026-11-18 session)

- **Approximate install costs** (vendor blogs): Apple Search Ads ~$4–5 (finance ~$5.20); Meta $15–40 for fintech; TikTok ~$2–12.
- **Break-even cost per install** = net yearly revenue × the share of installs that pay. Measure it before scaling.
- **Apple Search Ads campaigns:**
  - Brand: `fincwin`, `finwin`.
  - Category: budget tracker, expense tracker, shared expenses, couples budget, family budget, bill splitter.
  - Competitors: Splitwise, Honeydue, YNAB, Goodbudget, each with its own Custom Product Page.
  - Discovery.
- **Content pillars:**
  - Couples money: 35%.
  - Flatmates splitting with no daily limit: 25%.
  - Daily tracking habit: 20%.
  - Family and siblings sharing care costs: 10%.
  - "Can we afford it?": 10%.
- **Wording:** ad and copy rules match the app's. No "advice", "you should" or "recommend". Check Meta and TikTok financial-ad policies before launch.
