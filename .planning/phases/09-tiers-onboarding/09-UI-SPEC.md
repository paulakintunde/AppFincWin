---
phase: 9
slug: tiers-onboarding
status: approved
reviewed_at: 2026-11-18
shadcn_initialized: false
preset: none
created: 2026-11-18
---

# Phase 9 (Tiers and Onboarding) - UI Design Contract

> Visual and interaction contract for every screen-building plan in Phase 9: first-run (welcome, 11 questions, analytics step, sample-data look-around, paywall), the plan screens (You > Subscription, member view, approvals, grace, takeover, downgrade, Solo moves), the locked read-only state, You > Features, in-context offers and the existing-user and tester cards. Behaviour is locked by `09-CONTEXT.md` D-01..D-45 (revision 3). Format and voice follow `08-UI-SPEC.md` and the 08.1 spec (PR #163). The base design is not redrawn: tokens, spacing, rows, tiles and icons are exactly as in CLAUDE.md "Design fidelity". Nothing new is added.

Sources: 09-CONTEXT D-01..D-45, REQUIREMENTS TIER-01..10, ENV-12, ANL-07, ANL-08, prototype `FincWin United.dc.html` (`LEVELS` 3230, `FEATS` 3235, `QS` 3286, `levelFor` 3618, `applyOnb` 3629, onboarding screens 6376-6433, Pro sheet ~5299, "Run setup again" 5343), 08-UI-SPEC, 08.1 UI-SPEC (First read treatment, StatusBadge usage), `IncomeProfileSteps`, `ConsentScreen`, `YouScreen`, CLAUDE.md.

**Precedence:** words and prices come from the signed-copy file and the store. Tokens come from this file and CLAUDE.md. Behaviour comes from 09-CONTEXT. Where the prototype differs (12 questions, tax, Coach, Pro sheet at $8, "Pro" word, no card needed), 09-CONTEXT wins.

**Copy status:** every string in this file is draft. All paywall, trial, pledge, listing and reminder wording goes to owner wording sign-off before the freeze. Strings marked **[exact]** are the owner's words from 09-CONTEXT and are not edited. Strings marked **[sign-off]** are drafts. Voice: declarative, grade-10 English, never "should", "recommend", "advice" or "we suggest" in any string. The app is a record-keeping and planning tool: it holds no money, takes no payments itself and gives no regulated advice.

**Prices are never hard-coded.** Every price, currency, billing period and first-charge date comes from the store (`priceString` and the offer data from RevenueCat). The figures in D-06 are US examples only. In this file `{price}` means a store-localised string. A discount percentage is never computed or shown.

---

## Scope

| In this spec | Not in this spec |
|---|---|
| Welcome, 11 questions, analytics step, summary, sample look-around, paywall (Plans screen) | The AI Coach (D-25); its Home quick action stays hidden |
| You > Subscription, member view, restore, tester date, pledge | The level-to-feature mapping table (D-32): it goes to the owner as its own document. This spec fixes how the list looks, not which feature sits at which level |
| Locked state, lock explainer, offline-saves notice | Phase 10 alert design (push copy here is a draft the Phase 10 channel carries) |
| Invite approval, payer notices, takeover, downgrade, Solo moves | iOS purchase test (D-24); the screens are the same on both stores |
| You > Features, offers, existing-user card, re-run, partner version | The price table for non-US markets (D-11, a separate owner-signed table) |

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (React Native; shadcn gate not applicable) |
| Preset | not applicable |
| Component library | The app's own `src/ui/*`: `Screen`, `Row`, `Pill`, `Chip`, `ChoiceCard`, `ToggleRow`, `SegmentedControl` (44 pt), `Sheet`, `ConfirmSheet`, `DetailSheet`, `ToastView`, `EmptyState`, `WarningCard`, `LabelValueRow`, `ProgressBar`, `RadioDot`, `StatusBadge` (06.2 `src/ui/status`), `IconTile`, `Glyph`, `SettingsGroup`, `SyncStatusLine`, `FailedWritesSheet`, `RiseIn`, `TextInput`, `MoneyInput`, `Dropdown`, the shared `IncomeProfileSteps`, `ConsentScreen` |
| Icon library | FincWin's own set only (`src/ui/icons`, `npm run check:icons`). Names used: `household`, `profile`, `acctCard`, `pinLock`, `download`, `delete`, `signOut`, `privacy`, `categories`, `calendar`, `alerts`, `savedOffline`, `headphones`, `view`, `undo`, `import`, `accounts`, `savings`, `debt`, `checkBuy`, `somethingChanged`, `arrowRight`, `close`, `stateFits`, `stateTight`, `stateDue`, `stateSafetyNet`. No new glyph is drawn. No third-party set. No emoji anywhere, including push text |
| Font | The active pairing via `textRole(pairing, role)` |
| New npm dependency | `react-native-purchases` (already settled in CLAUDE.md). Nothing else |

### New components (composed only from existing tokens and primitives)

| Component | Used on | Notes |
|---|---|---|
| `PlanCard` | Plans screen | `ChoiceCard` with plan name, people line, price lines and an optional "14 days free" `Chip`. Section 5 |
| `PeriodToggle` | Plans screen | `SegmentedControl` with two options, Monthly and Yearly |
| `DisclosureBlock` | Plans screen, Subscription | The required lines of D-22 in one `fill1` card. The same component everywhere so the wording cannot drift |
| `PlanStatusCard` | You > Subscription | Plan, payer, renewal, members, status badge |
| `NoticeCard` | Home, You, Household | One card shape for every plan notice (trial reminder, grace, payer left, takeover, downgrade offer, existing-user card, offline notice). `surface` card, optional `StatusBadge`, title, one sentence, up to two actions |
| `LockedSheet` | Every write entry point when locked | Small `Sheet`, section 9 |
| `LockBanner` | Top of each tab when locked | One line plus link, section 9 |
| `SampleBar` | Look-around, pinned above the tab bar | Section 4 |
| `QuestionScreen` | Onboarding | `Screen` with progress, title, body, options, Continue, Skip. Section 2 |
| `FeatureRow` | You > Features | `ToggleRow` plus an optional reason line. Section 11 |
| `OfferCard` | In-context offer | Section 12 |

New status keys for `src/ui/status/statusMap.ts` (existing tones and icons only, words under `appLife.status.*`):

| Key | Tone | Icon | Word |
|---|---|---|---|
| `trial` | neutral | `calendar` | "Free trial" |
| `planActive` | fits | `stateFits` | "Active" |
| `trialEnding` | tight | `stateDue` | "Trial ends soon" |
| `paymentFailed` | tight | `stateTight` | "Payment failed" |
| `readOnly` | notYet | `pinLock` | "Read-only" |
| `waitingApproval` | notYet | `stateDue` | "Waiting" |
| `coveredBy` | neutral | `household` | "Covered" |
| `freeAccess` | fits | `stateFits` | "Free access" |

Red (`short`) is not used anywhere in Phase 9: a failed payment is amber, a lock is slate. Red stays for over cap, overdue and short (06.2 D-14).

---

## Spacing Scale

The six steps from `src/theme/layout.ts` `step`. No new token and no 24 / 32 / 48 / 64 step.

| Token | Value | Usage in Phase 9 |
|-------|-------|-------|
| `hair` | 4 | Glyph to word in a badge; price to its period word |
| `tight` (`gapSm`) | 8 | Between chips; between the two price lines in a `PlanCard`; between a title and its sub-line |
| `row` (`gapMd`) | 12 | Inside a card; tile to text; between two disclosure lines |
| `card` (`cardPad`) | 16 | `PlanCard`, `NoticeCard`, `DisclosureBlock`, `PlanStatusCard` padding |
| `edge` (`screenH`) | 22 | Horizontal screen padding |
| `section` (`groupGap`) | 28 | Between cards and groups; above the pinned CTA block |

Row heights 52 (one line) and 64 (two lines), minimums that grow with text scale. Icon tiles 36 in rows and 48 on the welcome and lock explainer. Touch targets never below 44 pt; text links reach 52 dp through `LINK_HIT_SLOP`. Exceptions: 22 and 28 are the owner's 06.2 steps. The primary `Pill` is full width and 52 tall.

---

## Typography

No new sizes or weights. Roles from `textRole`:

| Role | Size / weight | Phase 9 use |
|------|------|-----------|
| `heading` | 26 / 700, line 1.16 | Screen titles (welcome, question, paywall, lock explainer); the price in a `PlanCard`. Drops to `sheetTitle` above font scale 1.3 so a price never wraps off the card |
| `sheetTitle` | 16 / 600, line 1.2 | Plan names, card and sheet titles, section headings |
| `body` | 15 / 500, line 1.5 | Explainer sentences, option text, button labels |
| `bodyStrong` | 15 / 600 | Option titles, row amounts, "Covered by {name}" |
| `label` | 13 / 600, line 1.4 | Badges, chips, reason lines, "People" line, progress label ("3 of 11") |
| `meta` | 12.5 | Disclosure lines, pledge text, dates and times, helper lines |

Weights in use: 500, 600, 700. Prices and dates use tabular figures and never truncate. Labels wrap instead of truncating.

---

## Color

Only `src/theme/tokens.ts`. The page is `pageTint[accent]` (fallback `canvas`), cards are `surface` with `shadows.card`, soft blocks are `fill1`. No gradient, no extra shadow, no new hex.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `pageTint[accent]` | Page |
| Secondary (30%) | `surface` cards, `fill1` blocks | Cards, rows, sheets, `DisclosureBlock`, `SampleBar` |
| Accent (10%) | user accent | See list |
| Destructive | `danger` #B4472A on `dangerTint1` | Only: "Delete account" row and its confirm, "Leave household" and its confirm. Nothing on the paywall or subscription screens is red. Cancelling an approval or declining an offer is neutral |

Accent reserved for:
- the primary `Pill` fill: "Start 14-day free trial", "Subscribe to {plan}", "Approve and change plan", "Change to {Plan}", "Leave and subscribe", "Move to Solo", "Continue", "Open FincWin", "Turn on", "Choose a plan", "Take over the plan";
- the selected `PlanCard` ring and its `RadioDot`, the selected `PeriodToggle` option, the selected option row in a question;
- the filled part of the onboarding `ProgressBar`;
- switches that are on in You > Features;
- text links: "Manage subscription" in notices, "Restore purchases", "Not now", "Don't suggest", "Skip", "Skip the rest", "Terms of use", "Privacy policy", "Start your own plan".

State colours appear only in `StatusBadge`, with their shape and word. They are never used on a price. No state colour sits on a CTA.

Contrast: no new pair. `ink` and `inkMuted` on `surface`, `fill1` and the page tint are already tested. `inkFaint` never sits on the page tone, so disclosure and pledge text uses `inkMuted` (or `ink`), not `inkFaint`. Planner adds a `contrast.test.ts` row for `inkMuted` on `fill1` if it is not listed.

---

## Navigation and Entry Points

| Entry | Where | Goes to |
|---|---|---|
| First run | After sign-in, `appHome.ts` sends a new user with no setup record to Onboarding, not Home | Section 2 flow |
| Existing user | Home, one-time `NoticeCard` | "Run setup" opens Onboarding in re-run mode |
| You > **Subscription** | New row at the top of the Account group, tile `acctCard`, sublabel is the status word and date ("Free trial · ends Dec 4", "Active · renews Jan 9", "Read-only", "Covered by Sam") | `app/(app)/subscription` pushed screen |
| You > **Features** | New row in the Money group (tile `categories`), sublabel "Everyday · 27 of 44 on" | `app/(app)/features` pushed screen |
| You > **Free help** | New row in the Account group (tile `headphones`), always visible | The Free help list from 08.1 (D-03). One level deep |
| You > Account and privacy > Delete account | Existing `DeleteAccountScreen` | Gains the billing warning (section 10) |
| You > Household > Leave household | Existing Screen 8 of 08 | Gains the plan line (section 8c) |
| Plans screen | From Subscription "Change plan", from the sample bar, from every `LockedSheet`, from payer notices | `app/(app)/plans` pushed screen, also usable as a full-screen modal at first run |

Subscription actions are one level deep from You (TIER-10): You > Subscription > Manage subscription (store page), or You > Subscription > Change plan.

---

## Layout and Screen Contracts

All screens: `Screen`, scrollable, safe-area aware. Pushed screens have a back chevron (44 x 44, label "Back"), title and optional right action. Sheets use `Sheet` with Close top right and the primary pill pinned. First-run screens have no tab bar.

### 1. Welcome (before sign-in)

Top to bottom, centred, on the page tone:
1. App name and mark (existing brand component) on a 48 `IconTile`-led stack.
2. `heading`: "Know if you can afford it." Then three `body` lines with `hair` gaps: "Log money in and out across your accounts." / "Check a purchase against your own months." / "Keep a shared home in step." **[sign-off]**
3. `sheetTitle`: "Try everything free for 14 days." **[exact: D-22 welcome line]**
4. Primary `Pill` "Get started" (to sign-in). Text link under it: "I already have an account".
5. `meta` footer: "FincWin keeps your records. It holds no money and moves none." **[sign-off]** Terms and Privacy links under it.

Hard rules: no price on this screen; the words "no card needed", "no credit card" and "free forever" do not appear (D-15, D-22).

### 2. The 11 questions (`QuestionScreen`)

Sequence after sign-in (D-28): questions, analytics step, summary, look-around, paywall, app. A first-run partner follows 2c.

**Chrome per question:** top row = back chevron (hidden on question 1), `label` "3 of 11", text link "Skip the rest" (right). Under it a `ProgressBar` (thin, accent fill, 550 ms, none under Reduce Motion). Then `heading` question, `body` sub, content, a "Why this matters" `label` link that opens one `meta` sentence (prototype `w`), then pinned footer: primary `Pill` "Continue" and a text link "Skip this question". Both always present (D-27). "Skip the rest" jumps to the analytics step then the summary with defaults for everything unanswered.

**Defaults:** a skipped question stores no answer and uses the default below. Skipping all lands on Everyday (level 2).

| # | Key | Question | Control | Default when skipped |
|---|---|---|---|---|
| 1 | goal | "What are you here to do?" | Five option rows: Keep track, Stop overspending, Clear debt, Save for something, Run a business | Keep track, with level floor Everyday |
| 2 | cur | "What do you count in?" | Existing currency list | Device region currency (user override > device region > tz; no IP) |
| 3 | acct | "Where does your money sit?" | `TextInput` account name + `MoneyInput` balance | No account created |
| 4 | shape | "Is your income steady or lumpy?" | `IncomeProfileSteps` | Steady |
| 5 | inc | "Roughly what comes in a month?" | `IncomeProfileSteps` | Not set |
| 6 | freq | "How often are you paid?" | `IncomeProfileSteps` | Monthly |
| 7 | debt | "Do you owe anything?" | Four option rows | Nothing |
| 8 | inv | "Do you hold investments?" | Three option rows | No |
| 9 | share | "Do you share money with anyone?" | Four option rows (No, With a partner, With a household, Both) | No |
| 10 | watch | "How closely do you want alerts?" **[sign-off]** | Four option rows | Normally |
| 11 | save | "What are you saving towards?" | Goal name, target, per month fields | No goal created |

Notes: the prototype's tax question is dropped (D-26). Questions 4 to 6 render the shared `IncomeProfileSteps` bodies; the planner maps the three prototype income questions onto the existing steps, and whichever of onboarding or Decide setup runs first saves them for the other. Prototype "why" lines containing "advice" are reworded, for example "Lumpy income changes how a month is read." **[sign-off]**

Option rows are `RadioDot` rows, 64 minimum (title `bodyStrong`, sub `label` in `inkMuted`). Selected: accent dot and ring. Money fields use `MoneyInput` in the currency from question 2.

**2a. Analytics step (not numbered, last, ANL-07).** After question 11 or "Skip the rest". It is the existing `ConsentScreen` content: equal-weight "Share" and "Don't share" buttons, same size and position, neither pre-selected, no skip or close control. Heading and body come from the existing `consent.*` keys, plus one `label` line above the card: "Last step. Your answer is not counted in the 11 questions." **[sign-off]** On answer it moves to the summary and does not redirect to Home. If consent is already answered the step is not shown. Nothing is sent before the answer. The level and later changes are typed PostHog events with no money in them, sent only with consent (D-38, ANL-08).

**2b. Summary.** `heading` "Here is your FincWin" **[sign-off]**. A `surface` card of `LabelValueRow`s (Here to, Counting in, Money sits in, Income, Owes money, Investments, Shares money, Alerts, Saving towards), each showing "Skipped" in `inkMuted` when unanswered. Below it a `fill1` level card: level name and count ("Everyday · 27 of 44 features on", `sheetTitle`) and the level sentence plus "The rest stays out of the way until you ask for it." Text link "See what is on" opens You > Features as a preview (changes apply on Continue). Primary `Pill`: first run "Continue", re-run "Apply these". Re-run secondary link: "Keep what I have".

Level names and sentences (prototype `LEVELS`, edited to built features, **[sign-off]** pending the mapping table):
- Basics: "Money in and out, categories, one account, a month at a time."
- Everyday: "Adds several accounts, category caps, goals, repeating bills and alerts."
- Full picture: "Adds debt payoff, investments, reconciliation and other currencies."
- Everything: "Adds the archive, undo history and every part of Decide."

**2c. Partner short version (D-30).** Shown when the person accepted an invite. Welcome variant: `heading` "You joined {Home}", `body` "A few questions set up your own view. Only you see your answers." Nine questions ("3 of 9"): goal, acct, shape, inc, freq, debt, inv, watch, save. Skipped: share (already yes), cur (the household's), and every trial, look-around and paywall step. The analytics step shows only if unanswered. A `label` line under each question title: "Private. Not shown to {payer} or other members." **[sign-off]** Abandoning at any point lands on Everyday with no notice. The full setup can be run later from You.

**2d. Re-run from You (D-31).** Entry: You > Features, top row "Run setup again" (tile `categories`, sub "The 11 questions, and what they switch on"). Same screens, answers pre-filled from the last run. Top right reads "Keep what I have", which shows toast "Nothing changed" and changes nothing. Re-run omits the analytics step, look-around and paywall. A feature that holds data does not hide when the level drops; the summary adds a `meta` line: "Features that hold your records stay on." **[sign-off]**

### 3. Back, exit and resume

- Back moves one question and keeps answers. Android back on question 1 returns to Welcome on first run, otherwise exits to the previous screen.
- Quitting mid-way and returning restarts at the question where the person left, answers kept locally. The look-around and paywall also resume.
- First-run state is stored per account, so signing in on a second device does not repeat the questions once the level exists on the server.

### 4. Sample-data look-around (D-17b)

Purpose: show the app on the built-in sample data (02.2) and one sample Decide answer, then lead to the paywall.

- Opens on the **sample Decide answer**, which meets 08.1's 60-second / 8-tap target (D-28). It uses the 08.1 First read treatment: `StageTag` "First read", basis line "Based on sample figures", verdict and fact lines from the engine copy keys. The numbers come from the engine on the sample records, not from typed copy.
- A one-time `fill1` card above the verdict: `view` glyph, "You are looking at sample figures. They are not yours." **[sign-off]**, link "Explore the app".
- All five tabs work on sample records. Reading, scrolling, switching months and opening sheets are open.
- **Pinned `SampleBar`** above the tab bar on every screen: `fill1`, `view` glyph and the word "Sample", sub `label` "Free for 14 days", primary `Pill` "Start 14-day free trial". 64 high at font scale 1.0, grows to two lines. Screen bottom padding grows by its height so it never covers content.
- Write entry points (FAB, "Add", import, "Check it" on the person's own money) stay in place with a `pinLock` glyph and open the `LockedSheet` variant: title "That needs your own records", body "Start the free trial to add your own records and run checks on your own money.", primary "Start 14-day free trial", text "Keep looking". **[sign-off]**
- Nothing is written to the person's data. `hapticTap` on Start only.
- Exit: "Start 14-day free trial" opens the Plans screen in first-run mode. There is no way into the app without choosing a plan (D-01). A text link "Choose a different plan" opens the same Plans screen.

### 5. Plans screen (the paywall; D-15, D-16, D-22, D-44)

Full screen. Reached at first run, from the sample bar, from Subscription "Change plan", and from every lock. At first run Back returns to the look-around. No close icon when the household is locked; Back returns to the lock explainer.

Top to bottom:
1. `heading`:
   - Trial available: "Try everything free for 14 days" **[exact]**
   - Trial used or only Household/Extended fit: "Choose a plan"
   - Locked: "Choose a plan to keep going"
2. `body` starting line **[exact, D-22, to owner sign-off]**: "Try everything free for 14 days. After the trial, choose a plan to continue. Subscriptions renew automatically until cancelled. Cancel anytime in You > Subscription or your app store's subscription settings." When the trial is not available the first sentence is dropped.
3. `PeriodToggle` (Monthly / Yearly), **Yearly selected on open** (owner answer Q1). Both prices are printed on every card, so the toggle only changes which one is large and which the button buys.
4. `PlanCard` list, one per plan that fits (D-44):
   - Name `sheetTitle`: Solo, Duo, Household, Extended.
   - People `label`: "1 person", "2 people", "Up to 6 people", "Up to 12 people".
   - Selected-period price `heading` ("{price} a month" / "{price} a year", store strings); other-period price `meta` ("or {price} a year").
   - `Chip` "14 days free" on Solo and Duo only when the trial is available (D-15). Household and Extended carry `meta` "No free trial".
   - `meta` on every card: "Charged in full even if not every place is filled." (D-06)
   - Selected card: accent ring and `RadioDot`. One selection at a time. Minimum height 64, grows.
   - Only plans with size at or above the current member count appear (D-44). A `meta` line when a plan is hidden: "Plans for fewer than {n} people are not shown. To choose a smaller plan, remove members first." with link "See members". The app never removes anyone on its own.
   - A held plan carries `StatusBadge` "Active" and its button reads "Current plan" (disabled). A bigger plan shows `meta` "Takes effect now. The store adjusts the price for the time left." A smaller plan shows "Takes effect at your next renewal on {date}." (D-08). The line always says which.
5. `DisclosureBlock` (`fill1`, `meta`), always visible, never behind a disclosure arrow:
   - Trial plan selected: "Free for 14 days, then {price} a {month|year}. First charge on {date}. Renews automatically until cancelled." **[sign-off, D-22]**
   - Non-trial plan selected: "{price} a {month|year}, charged today. Renews automatically until cancelled." **[sign-off]**
   - "Every plan includes everything. Plans differ only in how many people they cover." **[sign-off]**
   - "Cancel in You > Subscription, or in your app store's subscription settings." **[sign-off]**
   - Pledge **[exact, D-12]**: "The price of your plan won't go up while your subscription stays active. Taxes set by your app store, or moving to a bigger plan, can change what you pay."
   - Links: "Terms of use" and "Privacy policy" (text links, 44 tall).
6. Pinned footer: primary `Pill`:
   - Trial available and Solo or Duo selected: "Start 14-day free trial"
   - Otherwise: "Subscribe to {Plan}"
   - Change from an active plan: "Change to {Plan}", after a `ConfirmSheet` stating whether the change is immediate or at the next renewal.
   Under it a text link "Restore purchases", always visible (D-14).

**Trial-already-used variant (D-16):** the `Chip`s and the first sentence of the starting line disappear. A `label` line above the cards: "A free trial has already been used for this account or home." **[sign-off]** The screen never says which of the four checks fired and never claims the app checked a card.

**States:**

| State | Behaviour |
|---|---|
| Loading prices | `PlanCard`s render as `fill1` blocks with name and people line; prices show "..." in `inkMuted`; button disabled. `RiseIn` once when data lands |
| Store error or offline | `WarningCard` (tone `tight`): "Plans could not load. Check your connection and try again." Button disabled, "Try again" link, Restore still available. No price is shown from memory |
| Purchase pending | Button in pending state; screen non-interactive except Back |
| Purchase cancelled by the person | Returns quietly, no toast, no error |
| Purchase failed | `WarningCard` (`tight`): "The purchase did not go through." plus "You have not been charged." only when the store says so; otherwise "The store reported a problem. Check You > Subscription before trying again." **[sign-off]** |
| Purchase succeeded, server not yet updated | `NoticeCard` "Your purchase went through. Updating your plan..." then Home when the server record confirms. After 60 s: "This is taking longer than usual. Your purchase is safe. Restore purchases or try again later." |
| Restore with nothing found | Toast "No purchases found for this account" |

At 320 dp and font scale 200% cards stack, the price drops to `sheetTitle`, the footer stays pinned and content scrolls above it.

### 6. You > Subscription

`Screen`, title "Subscription". Top to bottom:
1. **Manage subscription** `Row` first (tile `acctCard`, 64, label `bodyStrong`, sub "Opens {App Store|Google Play}", trailing `arrowRight`). It deep-links to the store page. The app never claims to cancel anything itself (D-23). Shown to the payer only; others see 6b.
2. One `body` line under it: "When a plan ends, FincWin becomes read-only. You can still export your data." **[sign-off]**
3. `PlanStatusCard`: plan name (`sheetTitle`) with `StatusBadge` ("Free trial", "Active", "Payment failed", "Read-only", "Free access"), then `LabelValueRow`s:
   - Plan: "Duo · 2 people"
   - Paid by: "You" or "{name}"
   - On trial: "Trial ends: Dec 4, 6:42 pm (your time)" and "First charge: {price} a {period}", always visible (D-18). After: "Renews: Jan 9 at {price}". If cancelled but not ended: "Ends Jan 9. Not renewing".
   - Places: "2 of 2 in use" with link "See members".
4. Applicable `NoticeCard`s (section 7).
5. **Change plan** `Row` (opens Plans). **Restore purchases** `Row`.
6. `meta` pledge **[exact, D-12]** and links "Terms of use", "Privacy policy".
7. Tester variant: `StatusBadge` "Free access", `LabelValueRow` "Free until: {date}", `meta` "Free access for testers ends on {date}. After that, the normal plans apply." **[sign-off]** No Manage subscription row (no store subscription). The owner account shows "Free access" with no date.

**6b. Member of a covered home (D-14).** Card: "Your home already has a plan" (`sheetTitle`), `body` "{name} pays for it. It covers up to {n} people until {date}." Then a Restore purchases `Row` and a small text link "Start your own plan". It first opens a short `ConfirmSheet` (owner answer Q3): title "Start your own plan", body "Solo covers one person. Starting it means leaving {Home}." **[sign-off]**, primary "Continue" (opens the 8d flow; Solo always means leaving), secondary "Stay in {Home}".

**No plan yet** (look-around or never paid): the status card is replaced by an entry card with "Start 14-day free trial".

### 7. Notices and reminders

Every `NoticeCard` has a `sheetTitle` title, one `body` sentence of at most 25 words, an optional `StatusBadge`, and at most two actions. On Home only one shows at a time, in this order: lock explainer prompt, payment failed or payer left, trial ends today, trial ends soon, approval waiting, offline saves, downgrade offer, existing-user card. Others wait in You > Subscription.

| Notice | Where | Draft copy **[sign-off]** | Actions |
|---|---|---|---|
| Trial reminder, last 3 days (D-18) | Home, Subscription | Badge "Trial ends soon". "Your free trial ends on {date} at {time}. After that, {price} a {period} is charged unless you cancel." | "Manage subscription", "Choose a different plan". Dismissible until the next day; not dismissible on the last day |
| Trial ends today (D-18) | Home, Subscription | Badge "Trial ends soon". "Your free trial ends today at {time}. {price} a {period} is charged then unless you cancel." | "Manage subscription" |
| Trial push, 2 days before | Push, only if allowed | "Your free trial ends on {date}. {price} is charged unless you cancel." No emoji | Opens Subscription. Phase 10 owns the channel |
| Payer payment failed (D-19) | Every member | Badge "Payment failed". "{name}'s payment did not go through. Your home keeps full access until {date}." | Payer: "Fix payment" (store page). Member: "Take over the plan", "Not now" |
| Payer left (D-19, D-42) | Every remaining member | "{name} left and no longer pays for this home. Full access continues until {date}." | "Take over the plan", "Not now". First to buy wins |
| Takeover done (D-19) | Every member, Home, Household | Row text "Covered by {name}" with neutral `StatusBadge`; toast "{name} now pays for this home" | none |
| Grace banner | Top of each tab (`LockBanner` variant) | "Plan payment is overdue. Full access until {date}." | "See plan details" opens Subscription |
| Payer after leaving (D-19, D-42) | Payer's Home and Subscription | "You left {Home}. Your subscription is still billing. Move to Solo to pay less." | "Manage subscription", "Move to Solo" |
| Old plan recovers after takeover (D-19) | Previous payer | "{name} now covers {Home}. You do not need your plan for it. Cancel it in your app store. Your store decides on any refund." | "Manage subscription" |
| Member left, 7 days (D-41) | Person who left | "You have full access until {date}. Continue on Solo to keep adding and changing things." | "Continue on Solo" (Plans, no trial), "Not now" |
| Downgrade offer (D-21a) | Payer, Subscription and Household | "Your home now has {n} people. {Plan} fits them and costs {price} a {period}. It would start at your next renewal on {date}." | "Switch at renewal", "Not now". Nothing changes on its own. No card when no smaller plan fits |
| Existing-user card (D-29) | Home, one time | Title "Run setup to simplify the app". "You are seeing everything. Answer 11 short questions and FincWin shows the parts that fit you." | "Run setup", "Not now". "Not now" removes the card for good; the entry stays in You > Features |
| Tester access (D-29) | Subscription; Home once within 30 days of the end | "Your free access ends on {date}. After that, choose a plan to continue." | "See plans" |

All dates and times use the person's timezone and device locale; the timezone abbreviation appears once on the trial end time.

### 8. Invites, approvals, leaving and plan moves

**8a. Solo payer invites a member (D-20).** In the Phase 8 invite sheet, when the plan is Solo, "Send invite" first opens a `ConfirmSheet`:
- Title "Add a member"
- Body **[exact, D-20]**: "Adding a member needs a household plan. Your next bill would be {monthly price} a month or {yearly price} a year."
- `LabelValueRow`s: "New plan: Duo, 2 people" and "Takes effect: now" or "at your next renewal" per store rule.
- Primary "Change to {Plan}" (for example "Change to Duo"), secondary "Keep Solo". The store product changes only after "Change to {Plan}".

**8b. Invite beyond the plan size (D-21).** The invitee sees the waiting state. The payer gets a push and an in-app `NoticeCard` with a direct link to the approval screen.
- **Approval screen** (title "Approve a bigger plan"): `heading` "{Invitee} is waiting to join {Home}". A `surface` card with `LabelValueRow`s: "Plan now: Duo, 2 people", "Plan after: Household, up to 6 people", monthly price and yearly price (store strings), "Takes effect: now" or "at your next renewal on {date}" **[sign-off]**. Primary `Pill` "Approve and change plan", secondary `Pill` "Cancel invite", both full width and equal in size. A text link "Decide later".
- Push **[sign-off]**: "{Invitee} wants to join {Home}. Approve to change your plan." Opens this screen.
- **Invitee waiting state:** `StatusBadge` "Waiting", `heading` "Waiting for {payer} to approve", `body` "{payer} has been told. You will be added when they approve. You can close this screen." The invitee cannot join even provisionally. If the invite expires (Phase 8 rules): "This invite expired. Ask {payer} to send a new one."
- **3rd person during a trial (D-17):** the confirm text is **[exact]** "Adding a 3rd person moves you to Household. Your free trial ends and {price} is charged today." The planner adjusts it to how each store treats an upgrade during an introductory offer and records the final text here.
- Invites within the plan's size follow Phase 8 and need no approval.

**8c. Leave household (existing Screen 8, plan line added).** Above the existing text:
- Non-payer member: "You will have full access for 7 days after leaving. After that, FincWin needs a Solo plan to add or change things. Your records come with you." **[sign-off]**, with a "Continue on Solo" link.
- Payer: "You pay for this plan. Leaving does not cancel your subscription. It then covers your new household of one, and you can move to Solo." **[sign-off]**
- The destructive confirm "Leave household" stays `danger`.

**8d. "Leave and continue on Solo" (D-43, also "Start your own plan", D-14).** `ConfirmSheet`:
- Title "Leave and continue on Solo"
- Body: "You leave {Home} and keep your own records. Solo covers one person: {price} a {period}. Access returns when the purchase goes through." **[sign-off]**
- Primary "Leave and subscribe" (accent, not danger), secondary "Stay in {Home}". No trial. If the purchase fails after the leave step, the person is already a household of one and sees the lock explainer with "Choose a plan".

**8e. Payer "Move to Solo" (D-42).** `ConfirmSheet`: "Move to Solo". Body "Solo takes effect at your next renewal on {date}. Until then you keep the spare places." Primary "Move to Solo", secondary "Keep my plan". When other members remain (D-44) the screen shows "To move to Solo, remove other members first." with link "See members".

**8f. Switch rule, join refused (D-39).** A `WarningCard` (`tight`) on the Join screen: "You left a home recently. You can join a different home from {date}." **[sign-off]** with `body` "Joining the same home is always open. If you left because of separation, bereavement or safety, contact support. No details are needed." Link "Contact support". The text never mentions the store country.

### 9. Locked read-only state (D-02, D-03, D-35, D-40)

**9a. `LockBanner`.** One line at the top of every tab: `StatusBadge` "Read-only" plus `label` "Your plan has ended. Choose a plan to add or change things." and link "Choose a plan". Not dismissible. Household variant: "{Home}'s plan has ended." with "{name} paid".

**9b. Write entry points.** FAB, "Add", edit, import, "Check it", settle up, invite and other write buttons stay in place with a `pinLock` glyph; their accessible name ends "needs a plan". Tap opens the `LockedSheet`, which names the tapped action (TIER-09): title "{Action} needs a plan" (for example "Adding a transaction needs a plan", "Importing a statement needs a plan", "A new Decide check needs a plan"), body "Your records stay here to read. Choose a plan to add, edit or import.", primary "Choose a plan", text "Keep reading". Nothing is hidden by the lock; hiding is for levels (D-34).
- Decide: saved answers open and read, with `meta` "Saved answer. Not recalculated while read-only." **[sign-off]** "Check it" opens the `LockedSheet`. The 08.1 free-help trigger still shows on a saved answer that had one.
- Lists, Activity, Insights and Household balances read as normal.

**9c. Lock explainer screen (D-03, D-18).** Opens once, full screen, the first time the app opens after the lock; reachable later from the banner. `heading` "Your plan has ended" (household: "{Home}'s plan has ended"), `body` "Your records are safe. Here is what you can still do." **[sign-off]**
- "Still open": a `SettingsGroup` of `Row`s (64, tile 36): "Read your records" (`view`), "Export your data" (`download`, CSV), "Free help" (`headphones`, "Free money help and debt support links"), "Manage subscription" (`acctCard`), "Restore purchases", "Sign out" (`signOut`), "Delete account" (`delete`, `danger` text).
- "Needs a plan": `body` list: "Adding or editing records", "Importing", "New Decide checks".
- Primary `Pill` "Choose a plan" (Plans without a trial if used) and text "Continue reading".
- Variants: **member of a lapsed multi-person home** adds "Paid by: {name}", primary "Take over the plan", and secondary "Leave and continue on Solo". **After 7 days after leaving:** "Your 7 days after leaving ended". **Locked with no payer:** adds "Your records stay here read-only. Nothing is deleted without notice." (D-45; the retention period is added after the Phase 11 DPIA review).
- The screen never implies a free version exists.

**9d. Offline saves kept on the phone (D-40).** If a household locks while saves wait in the offline queue, the server refuses them on replay and the app keeps them:
- `NoticeCard` on Home and a count `Chip` in Activity: `savedOffline` glyph and **[exact]** "Saved on this phone. Choose a plan to sync". Sub: "{n} items are kept here. They sync if your plan is active again, and they are included when you export." **[sign-off]**
- Actions "Choose a plan", "Export my data", and a "See them" link to `FailedWritesSheet` reworded for this case. Items are never silently dropped.
- On sync: toast "Your saved items synced".

**9e. Lock transitions.** The lock lifts only when the server plan record says covered. There is no optimistic unlock.

### 10. Account and privacy: delete warning (D-23)

On `DeleteAccountScreen`, when an active store subscription is tied to the account, a `WarningCard` (tone `tight`) above the confirm:
- Title "Billing keeps going" **[sign-off]**
- Body **[exact, D-23]**: "Deleting your account doesn't cancel billing. Cancel in your app store first."
- Link "Manage subscription".
The confirm stays available and unblocked (Apple 5.1.1(v)). Delete stays `danger`. For a payer of a multi-member home the deletion preview adds: "{n} other people are covered by this plan. They will see a notice and 7 days of full access." **[sign-off]**

### 11. You > Features (D-32..D-36)

`Screen`, title "Features". Top to bottom:
1. Level card (`surface`): `sheetTitle` level name with a `Chip` "Your level", `body` level sentence, `label` "27 of 44 features on". A row link "Run setup again".
2. A `TextInput` search field "Find a feature".
3. Sections by area (prototype areas: Recording, Accounts, Planning, Grow, Sharing, Insight, System; final list from the mapping table). Heading `sheetTitle`, `section` gap between them. Empty sections are not drawn.
4. `FeatureRow`s: label `bodyStrong`, sub `label` (one sentence of what it does), switch at the trailing edge, 64 high, whole row is the 44+ target.

**Row states (D-34, D-35):**

| State | Look | Behaviour |
|---|---|---|
| On, in your level | Switch on | Tap toggles off; toast "{Feature} is off" + Undo |
| Off, in your level | Switch off | Tap turns on |
| Above your level | Switch off, `label` "Not in your level" in `inkMuted` | Switch works; toast "{Feature} is on" + Undo. This is the personal-level check, the lowest in the order |
| Household rules it out | Switch off and disabled, line "Not on for your household" | Not tappable; reason is announced. Link "Set up sharing" only when it can be fixed |
| Plan rules it out | Switch off and disabled, line "Needs a plan" | Every row when locked, with one "Choose a plan" link at the top |
| Holds your records | Switch on and disabled, line "Has your records, so it stays on" **[sign-off]** | Never hides (D-34) |

Only the first failing check appears, in the order plan, household, level. A hidden feature (above level, switch off) is absent from the rest of the app but always listed here. Decide is visible at every level (D-33) and is not a row; its parts (debts, goals, safety net, repeating bills) stay reachable from Decide. Coach is not listed (D-25). A switch writes immediately (no Save button) and emits the typed PostHog event only with consent (D-38).

### 12. In-context feature offers (D-36, D-37)

`OfferCard`: `fill1` card, `IconTile` 36 with the feature's glyph, title `sheetTitle` "Turn on {feature}?", `body` "{Feature} {what it does}. You can turn it off in You > Features." **[sign-off]**, primary-small `Pill` "Turn on" and two text links "Not now" and "Don't suggest".
- At most one offer a week across the app (counted on show). "Not now" hides that offer for 30 days. "Don't suggest" stops it for good. Both are silent. "Turn on" shows toast "{Feature} is on" + Undo and `hapticTap`.
- Shown inline in the related screen between sections, never as a popup or over content. Never on any Decide answer or stepper step, during onboarding, in the look-around, when locked, on the same day as a trial or payment notice, or when the household rules the feature out.
- Triggers are use-based and counted locally (for example a debt line exists and Debt is off). Nothing turns on without a yes (D-36).

### 13. Household screen plan line

- Household hero card sublabel adds "Plan: Duo · {name} pays" or "Covered by {name}" (neutral `StatusBadge`). An owner who is not the payer sees "{name} pays. Only they can change the plan."
- When the household is full for its plan, "+ Invite someone" shows `meta` "{Plan} holds {n} people." with "See plans" for the payer; others see "Ask {payer} to change the plan." Invites past the size go to approval (8b).

---

## Copywriting Contract

| Element | Copy |
|---|---|
| Primary CTA, welcome | "Get started" |
| Primary CTA, paywall (trial available) | "Start 14-day free trial" |
| Primary CTA, paywall (no trial) | "Subscribe to {Plan}" |
| Primary CTA, locked | "Choose a plan" |
| Primary CTA, member takeover | "Take over the plan" |
| Empty state: Features search | Heading "No feature matches that", body "Try another word." |
| Empty state: Subscription before any plan | Heading "No plan yet", body "Start the free trial to add your own records.", action "Start 14-day free trial" |
| Error state: plans did not load | "Plans could not load. Check your connection and try again." |
| Error state: restore failed | "Could not restore purchases. Check your connection and try again." |
| Error state: server not updated | "This is taking longer than usual. Your purchase is safe. Restore purchases or try again later." |
| Destructive: Delete account | Existing confirm, plus the billing warning (section 10) |
| Destructive: Leave household | Existing confirm, plus the plan line (8c) |
| Confirmed, not destructive | Plan changes and "Move to Solo" use `ConfirmSheet` with an accent primary |

**Sign-off status by string group.** The planner puts all of these in the signed-copy file under `plans.*`, `onboarding.*`, `features.*`, `lock.*`:

| Group | Status |
|---|---|
| "Try everything free for 14 days" | **exact** (D-22) |
| Paywall starting line | **exact**, to owner sign-off (D-22) |
| Price pledge | **exact** (D-12) |
| 3rd-person warning | **exact**, store price (D-17) |
| Solo payer invite line | **exact** (D-20) |
| Delete warning | **exact** (D-23) |
| Offline kept line | **exact** (D-40) |
| Level names Basics, Everyday, Full picture, Everything | **exact** (D-32); level sentences are drafts |
| Reasons "Not in your level", "Not on for your household", "Needs a plan" | **exact** (D-35) |
| Everything else in this file | draft, needs owner sign-off |

Banned in all Phase 9 strings: "advice", "advise", "recommend", "should", "you must", "Pro", "Premium", "free forever", "no card needed", emoji, and any percentage saved. "Cancel anytime" appears only inside the exact starting line, with where to cancel. The Free help row avoids "advice" ("Free money help and debt support links"). Each row sentence is at most 25 words and 3 numbers (UX-19).

---

## Interaction and Motion

Existing 06.1 and 06.2 rules apply: react-native-svg and Reanimated, once, none under Reduce Motion, no looping.

| Moment | Behaviour | Duration | Reduce Motion |
|---|---|---|---|
| Question to question | Cross-fade of content; progress bar fills | 150 ms; bar 550 ms | At once |
| Plan prices land | `RiseIn` once | 260 ms | At once |
| Plan or period selected | Ring and `RadioDot` change; price swaps | 150 ms cross-fade | At once |
| Notice or offer card appears | `RiseIn` once | 260 ms | At once |
| Sheets | Existing `Sheet` slide and drag to dismiss | existing | existing |
| Lock lifts | Banner removed, no animation | none | none |

Haptics (names from `src/ui/haptics.ts`): `hapticTap` on Start trial, Subscribe, Approve, Turn on and a feature switch. `hapticWarn` is not used (payment notices are not alarms). `hapticSuccess` is not used: success is reserved for goal reached, debt cleared and import done. No confetti or celebration screen after purchase.

---

## Accessibility (acceptance rules)

- Every interactive element has an accessible label that includes its state: "Duo, 2 people, {price} a month or {price} a year, 14 days free, selected"; "Debt, Not in your level, switch off"; "Add, needs a plan, button"; "Sample figures. Start 14-day free trial. Button".
- The question progress bar is `progressbar` (min 0, max 11, now n, "Question 3 of 11"); partner version max 9.
- Reasons in You > Features are part of the row label; disabled rows stay focusable so the reason can be heard.
- All targets at least 44 x 44. Text fits at 320 dp wide and 200% font scale: option rows grow to two lines before truncating; `PlanCard` price drops a size and wraps its period; `SampleBar` grows to two lines with its button below; the paywall footer stays pinned and content scrolls; prices, amounts and dates never truncate.
- Colour is never the only signal: every state is a `StatusBadge` with shape and word; the selected plan has `RadioDot` and "selected" for screen readers; the lock carries `pinLock` and "Read-only".
- Disclosure and pledge text is `meta` at 12.5 in `inkMuted` on `fill1` and is read before the primary button.
- Reading order on Plans: heading, starting line, period toggle, plan cards, disclosure and pledge, links, primary button, Restore purchases.
- TalkBack pass on Android: welcome, each question type, analytics step, summary, sample answer and bar, Plans in each state, Subscription, lock explainer, approval screen, You > Features in each row state. VoiceOver waits with the iOS purchase test (D-24).
- Push and notice text have no emoji and name the date and the price.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none (not used) | not applicable |
| third-party | none | not applicable |

New npm dependency: `react-native-purchases` only (settled in CLAUDE.md).

---

## Dependencies and plan notes for the planner

1. `entitlements.ts` is redesigned per D-04. Screens read one hook, `usePlanState()`, returning `trial | active | grace | locked | tester | sample` plus plan size, payer and dates. No screen reads a feature flag for paid access.
2. The level-to-feature mapping (D-32) is a separate owner document. The Features screen renders whatever it gives. The prototype's `FEATS` includes receipts, round-ups, widgets, bank link, tax, licence and Coach; none is built, so none is listed.
3. Server push for the trial reminder, payer approval and payer notices: Phase 10 owns alerts. Phase 9 builds triggers and screens; if the channel is not ready, notices still appear in-app on next open.
4. `ConsentScreen` redirects to Home on answer. Onboarding mounts its content with an `onDone` callback instead.
5. `appHome.ts` gains the first-run route (Onboarding) ahead of Home. Home stays the landing once setup exists.
6. The store country for D-39 is read before purchase (open item in CONTEXT). The Join refusal screen never shows it.
7. Copy keys go under `plans.*`, `onboarding.*`, `features.*`, `lock.*` and `appLife.status.*` after owner sign-off. The banned-word guard from 08.1 runs on them.

---

## Owner questions

**Answered by the owner 2026-11-18:** Q1 Yearly selected · Q2 write buttons stay with a lock mark · Q3 short message first, then the 8d flow (option 2) · Q4 whole app, read-only · Q5 analytics is a separate unnumbered last step · Q6 yes, the switch works above the level. The spec above already follows these answers.

Plain English, recommended choice first. They change what the screens look like. The level mapping table and the non-US price table are separate documents.

1. **Which price period is selected when the plans screen opens?**
   1. Yearly selected, with both prices always shown at the same size so nothing is hidden. (Recommended)
   2. Monthly selected, both prices shown.
   3. The period the person already has, otherwise Monthly.

2. **When a plan has ended, what happens to the Add button and other write buttons?**
   1. They stay in place with a small lock mark. Tapping one says "Needs a plan" and offers plans. (Recommended: easy to find, and App Review sees where to subscribe.)
   2. They disappear until a plan is chosen.

3. **What does "Start your own plan" do for someone whose home already has a plan?**
   1. It opens "Leave and continue on Solo", which says plainly that Solo means leaving the home. (Recommended: matches the rule that Solo always means leaving.)
   2. It first shows a short message, "Solo covers one person. Starting it means leaving {Home}", with a "Continue" button.

4. **How much of the app can someone open in the sample-data look-around before the trial?**
   1. The whole app, all five tabs, read only, opening on the sample answer. (Recommended: best for the 60-second goal and for App Review.)
   2. Only the Decide tab with the sample answer, plus a short picture tour of the rest.

5. **Does the analytics yes/no count as the 12th question?**
   1. No. It comes after question 11 as its own last step, marked "Last step" and not numbered. (Recommended: keeps the promise of 11 questions.)
   2. Yes. Show it as "12 of 12" and change the promise to 12.

6. **In You > Features, can a person turn on a feature that is above their level?**
   1. Yes. The row says "Not in your level" and the switch works. Only "Not on for your household" and "Needs a plan" block the switch. (Recommended: matches how the prototype's switches override the level and the order of checks in D-35.)
   2. No. They must run setup again first.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: FLAG (generic Confirm/Cancel fixed on revision 1; single-word "Continue"/"Turn on" accepted, bound to a named context)
- [x] Dimension 2 Visuals: FLAG (focal points: look-around = the sample verdict; Plans = the selected PlanCard and its price; Subscription = the PlanStatusCard; Features = the level card)
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: FLAG (owner-locked scale, CLAUDE.md Design fidelity)
- [x] Dimension 5 Spacing: FLAG (owner-locked 06.2 steps 12 and 22)
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-11-18 (gsd-ui-checker, revision 1)
