# Phase 9: Tiers & Onboarding - Context

**Gathered:** 2026-11-18 (revision 2 the same day, after two outside reviews and owner answers)
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 delivers:
- the 11-question onboarding that sets a starting feature level;
- the four levels that show or hide features;
- the You > Features list;
- in-context feature offers;
- paid plans through RevenueCat.

Requirements: TIER-01..10, ENV-12, ANL-07, ANL-08.

The owner chose a **hard paywall after a 14-day trial**. Plans are priced in **four group sizes (1, 2, 6, 12)**, and each charges its full price whether or not every seat is filled. Every plan unlocks the same features. The AI Coach is **not** built in this phase.

</domain>

<decisions>
## Implementation Decisions

### Business model and access
- **D-01:** **Hard paywall after a free trial.** Every new household gets one 14-day trial with everything unlocked. The trial is store-managed and needs a card (D-15). After the trial ends, or when a paid plan lapses, the app needs a paid plan to keep working. This replaces the freemium model recommended in `PRICING.md` §1–§2.
- **D-02:** **When locked, the app is read-only.** People can open and scroll their own records. They can't add, edit or import anything, and can't run a new Decide check. Saved Decide answers stay readable, but nothing is recalculated.
- **D-03:** **Always open, whatever the plan state:**
  - CSV export (GDPR portability);
  - Delete account (Apple 5.1.1(v), GDPR erasure);
  - Manage subscription;
  - Restore purchases;
  - Sign out;
  - a **Free help** row with the free debt-advice and money-help links that Decide shows when someone is in trouble (the 08.1 free-help trigger).

  None of these may sit behind the paywall.
- **D-04:** **What happens to the earlier "never paid" rules.** Phase 5 D-17 (the alternatives table is free) and APP-18 (the safety net and confidence sentence are never paid) were rules about a Pro tier. With D-01 there is no free tier: everything is available during the trial or a paid plan. When locked, Decide doesn't run for anyone, so no one ever sees an answer without its safety parts.
  - "Safety parts" in APP-18 means two pieces of a Decide answer: the safety net (keeping emergency savings out of the affordability figure) and the confidence sentence. It does not mean crisis resources. Those are covered by D-03's Free help row.
  - The planner must update `src/features/decide/entitlements.ts` (`PRO_CANDIDATES`, `ALWAYS_FREE`, `PRO_SWITCHES`) and the household feature switches to fit a single paid entitlement plus a read-only lock, and record the change against D-17 and APP-18.
- **D-05:** **Same features on every plan.** Plans differ only in how many people they cover.

### Plans and prices (revised: four group sizes)
- **D-06:** **Four plans, each charged at full price whether or not every seat is filled (US):**

  | Plan | People | Monthly | Yearly |
  |---|---|---|---|
  | Solo | 1 | $6.99 | $49.99 |
  | Duo | 2 | $9.99 | $69.99 |
  | Household | up to 6 | $14.99 | $109.99 |
  | Extended | up to 12 | $24.99 | $189.99 |

  These replace the earlier per-seat prices (+$1.99, then +$2.99/+$3.99). Both reviewers flagged per-seat pricing as needing about 24 store products per store and an awkward upgrade matrix. Household matches YNAB's price for up to 6 people.
- **D-07:** **Store products:** the 4 plans × monthly and yearly = **8 products per store**, in one subscription group per store, ranked Solo < Duo < Household < Extended so that moving between them is an upgrade or downgrade. **Apple Family Sharing is turned off on every product**, because it would grant access outside our household and seat count.
- **D-08:** **Upgrades and downgrades follow each store's own rules.** On Apple, an upgrade takes effect at once with a prorated refund, and a downgrade takes effect at the next renewal. Google Play uses the replacement mode the planner picks; prefer charging the price difference at once for upgrades. The app always says whether a change is immediate or happens at the next renewal.
- **D-09:** **Seats:** every member with their own login counts, **the payer included**.
- **D-10:** **Three separate limits:**
  - **Trial:** up to 2 members (the trial is on Solo or Duo only, D-15).
  - **Paid:** the plan's size (1, 2, 6 or 12).
  - **Server:** the technical cap rises from 6 (Phase 8 D-10, in `supabase/migrations/20261122000500_household_invites.sql`, the `v_members + v_open >= 6` checks) to the plan's size (2 during a trial). It must be raised before paid plans go live, so no one ever pays for seats they can't use.
- **D-11:** **Prices outside the US:** the planner proposes explicit store price points for the priority markets (**owner decision 2026-11-18: Canada, the UK, the euro zone and Australia**). **The owner signs that table before the store products are created.** Every other country uses the store's automatic conversion as a fallback. The local currency and billing period always show before purchase.
- **D-12:** **No sale or introductory price at launch.** **The price pledge, in these exact words:** "The price of your plan won't go up while your subscription stays active. Taxes set by your app store, or moving to a bigger plan, can change what you pay."
- **D-13:** **One household, one bill; the payer is separate from the owner.**
  - A store-neutral plan record holds: household, payer, platform, product, plan size, renewal status, grace or billing-retry status, and an audit history.
  - A RevenueCat webhook goes to a Supabase Edge Function, which writes that record. The app reads "this household is covered for N seats until date X".
  - Apple and Google adapters sit behind the record. The iOS design is done now, even though iOS testing waits (D-24).
  - The **payer** owns the subscription. The **household owner** (Phase 8 `is_owner`) runs the household. They may be different people.
  - Feature flags never grant paid access (PROJECT.md).
- **D-14:** **A member whose home is already covered** sees "Your home already has a plan", who pays and until when. Restore purchases always shows there. A small **"Start your own plan"** link stays visible too, for App Review and for people about to leave.

### Trial
- **D-15:** **Store-managed free trial; the customer must cancel to avoid being charged** (revision 3, 2026-11-18; replaces the no-card trial the app ran itself). The 14-day trial is an Apple or Google introductory free-trial offer, **on Solo and Duo only**. Household and Extended have no trial. A payment method is taken by the store at the start, and the trial turns into the chosen plan, monthly or yearly, unless cancelled. The trial starts when they subscribe.
- **D-16:** **Trial reuse is limited on four levels:**
  1. **Store account:** enforced by the stores (Apple: one introductory offer per Apple ID per subscription group; Google: its own one-trial rules).
  2. **Payment identity:** **enforced only by Apple and Google, under their own rules. The app never sees card details**, so we never claim to check them ourselves.
  3. **Device:** iPhone uses **Apple DeviceCheck** (two private flags per device that survive reinstalls). The Android method is researched in planning, since Play Integrity gives no lasting device ID. It must be declared in the App Privacy and Play Data safety forms and checked against GDPR (legitimate interest, no ad identifiers).
  4. **Person and household (our server):** one trial per person and per household. A partner who joins later is covered by the household's trial and can't start another. Leaving and re-creating a household doesn't give a new trial.

  If any check says a trial was already used, the paywall offers the plans without a trial.
- **D-17:** **The trial includes everything, for up to 2 people** (Solo or Duo). **Inviting a 3rd person during a trial** moves the household to Household. Before Confirm, the app says: "Adding a 3rd person moves you to Household. Your free trial ends and $14.99 is charged today." The planner checks how each store treats an upgrade during an introductory offer and adjusts the wording to match.
- **D-17a:** *(Removed in revision 3: a store trial starts when they subscribe, so the clock can't wait for first real use.)*
- **D-17b:** **A look around before the trial.** Before starting the trial, people can browse the app with the built-in sample data (02.2), including a sample Decide answer. They can't add their own records, import, or run a Decide check on their own money. The way forward is always "Start 14-day free trial".
- **D-18:** **Reminders:**
  - the end date and time (in the user's timezone) and the price that will be charged, always visible in You > Subscription during the trial, with Manage subscription to cancel. The stores' own trial emails are a supplement, not a replacement;
  - a banner in the last 3 days, with the end date and prices;
  - one push notification 2 days before the end, only if notifications are allowed;
  - a "Your trial ends today" message on the last day;
  - after locking, a screen that explains exactly what stays open (D-03), how to export, and how to choose a plan.

### Payer changes and seats
- **D-19:** **The payer leaves, or payment fails:**
  - Every member is told. **Any member can take over; the first to buy wins**, and the others then see "Covered by {name}".
  - Grace lasts 7 days, or the store's own billing-retry or grace period if that is longer. The app's grace never ends access while the store still treats the subscription as active.
  - After grace, the household goes read-only, and the export and delete paths are shown.
  - **A payer who leaves keeps their own store subscription.** The app tells them it is still billing and offers Manage subscription, for example to move down to Solo.
  - **No double charge on takeover.** If the old subscription recovers (a failed card clears) after someone has taken over, the planner decides which one covers the household and tells the other person to cancel or receive a refund. Record this as a planned edge case with tests, including iOS → Android takeover (the old Apple transaction is unlinked and the new Google purchase token linked).
- **D-20:** **A Solo payer invites someone:** "Adding a member needs a household plan. Your next bill would be $X a month or $Y a year." The store product changes only after an explicit Confirm.
- **D-21:** **An invite beyond the plan's size** (Duo → 3rd person, Household → 7th):
  - The invitee cannot join, even provisionally, until the payer approves.
  - Before approving, the payer sees the new plan, the new monthly and yearly price, and whether the change is immediate or at the next renewal, with clear Approve and Cancel buttons.
  - The payer gets a push notification with a direct link to that screen, so the invitee is never stuck waiting.
  - Invites within the plan's size need no approval (Phase 8 invite rules apply).
- **D-21a:** **When members leave and the household fits a smaller plan**, the payer is offered a downgrade, which takes effect at the next renewal. Nothing changes on its own.
- **D-39:** **The once-a-year switch rule applies only in some countries.** A person whose **store country** (from their Apple or Google account, not the app's region setting) is **outside** these places cannot join a *different* household for 12 months after leaving one:
  - the US and Canada;
  - the EU, the EEA (Iceland, Liechtenstein, Norway), the UK and Switzerland;
  - Australia and New Zealand.

  **Exemptions:**
  - being removed by the payer or owner;
  - the household closing (deleted, or no one paid after grace);
  - one support exception for separation, bereavement or safety, with no questions about the details;
  - rejoining the same household.

  The server enforces the rule in the invite and accept RPCs, and the store-country check stays separate from the app's own region preference.

### Store wording and subscription controls
- **D-22:** **Where prices appear:**
  - The welcome screen says what the app does and "Try everything free for 14 days." It shows no prices and never says "no card needed" (the trial needs one, D-15). The trial start screen is a full paywall: it shows the price charged after day 14, the date of the first charge, and that the trial renews into a paid plan unless cancelled.
  - The store listing and **every paywall** show:
    - each plan's size and what it includes;
    - the monthly and yearly price, in local currency, with the renewal period;
    - "Renews automatically until cancelled";
    - how to cancel (You > Subscription, or the store's subscription settings);
    - links to the terms and the privacy policy.

    This covers Apple 3.1.2(c) and guideline 2.3.2.
  - Copy stays declarative: no "should" or "recommend".
  - Starting line for the paywall, to go through owner wording sign-off: "Try everything free for 14 days. After the trial, choose a plan to continue. Subscriptions renew automatically until cancelled. Cancel anytime in You > Subscription or your app store's subscription settings."
- **D-23:** **Three separate actions in separate places:**
  - **Manage subscription**, at the top of You > Subscription. It deep-links to the Apple or Google subscription page. The app never claims to cancel anything itself. One plain line says what happens when a plan ends: read-only, export stays.
  - **Delete account**, in You > Account & privacy, with its own confirmation. If a store subscription is active, it warns: "Deleting your account doesn't cancel billing. Cancel in your app store first." It links to Manage subscription.
  - **Leave household**, separate, which removes the person from the household without deleting their account.

  Both subscription actions are one level deep, which keeps TIER-10 met.
- **D-24:** **Apple timing:** the store-neutral record and both store adapters are designed now. Real purchases are tested on a Google Play test track now. iOS products and the iOS purchase test wait for Apple enrolment, and Phase 9 can close with them listed as open.

### Coach
- **D-25:** **The Coach is not built in Phase 9.** It stays parked as backlog 999.4, and its Home quick action stays hidden.

### Onboarding questions
- **D-26:** **11 questions:** the prototype's 12 (`static QS`) minus tax. The three income questions are the shared `IncomeProfileSteps`, so whichever of onboarding or Decide setup runs first saves them for the other.
- **D-27:** **Any question, or all of them, can be skipped**, using sensible defaults. Skipping everything lands on Everyday (level 2).
- **D-28:** **First-run order:**
  1. sign in;
  2. the questions, with the analytics yes/no last;
  3. the sample-data look-around (D-17b);
  4. the paywall: "Start 14-day free trial" on Solo or Duo, or buy any plan;
  5. the app opens on their own data.

  Revision 3 reverses "no paywall on day one": starting a store trial is a purchase. **Owner decision (2026-11-18): the sample answer counts.** Setup stays short and every question is skippable; the Decide answer shown in the sample-data look-around meets 08.1's 60-second / 8-tap first-answer target. A first answer on the user's own money comes after the trial starts. 08.1's 60-second test measures time to the sample answer for new users.
- **D-29:** **Existing users and testers:**
  - **Named testers** get free access for their whole household until a set date shown in the app (for example 3 months after paid plans launch), then the normal paywall applies.
  - **The owner** stays free.
  - Existing users start on Everything (level 4), so nothing disappears, and see a one-time card: "Run setup to simplify the app". Free access uses RevenueCat promotional entitlements, never feature flags.
- **D-30:** **The invited partner's short version:**
  - It skips: the sharing question (already yes), currency (the household's), and every trial or paywall step.
  - The partner can run the full setup later from You.
  - Their answers are personal and not shown to the payer or other members, in line with Phase 8's private-by-default rule.
  - If they abandon setup, they land on Everyday.
- **D-31:** **Setup can be run again** from You. Cancelling it leaves everything as it was.

### Levels and offers
- **D-32:** **Four levels:** Basics, Everyday, Full picture, Everything (`static LEVELS`). Features follow `static FEATS`, mapped to the real app.
  - **The mapping table goes to the owner for review before it is built.** It must drop features that were cut or never built (receipts, round-ups, widgets, bank link, tax, licence, Coach). It must add features we built that the prototype doesn't list (PDF import, the parts of Decide, the household split types, the parts of Grow).
- **D-33:** **Decide is visible at every level.** Everything Decide needs, such as debts, goals, the safety net and recurring bills, stays reachable from Decide whatever the level.
- **D-34:** **Features above your level are hidden, not greyed out.** You > Features lists every feature with a switch. **A feature that already holds data never hides.**
- **D-35:** **The order of checks:**
  1. **Plan state**, first: is the household locked?
  2. **Household eligibility**: does this person share money, and are they in a household?
  3. **Personal level**: does this person see the feature?

  A switch can't turn on something a check above it rules out. You > Features shows why something is unavailable: "Not in your level", "Not on for your household" or "Needs a plan".
- **D-36:** **The app may suggest a feature based on use.** Nothing turns on without a yes.
- **D-37:** **In-context offers:** at most one a week, never on a Decide answer. "Not now" hides that offer for 30 days; "Don't suggest" stops it for good.
- **D-38:** **Analytics:** the level set at onboarding and every later change are typed PostHog events with no money in them. They are sent only with consent.

### Moving out, going Solo and downgrading (added 2026-11-18)
Data always follows Phase 8 D-25/D-26: a person who leaves or is removed takes their personal records into a new household-of-one. Each shared line they were on becomes a personal copy of their share. Open balances stay owed on both sides.
- **D-41:** **A member (not the payer) leaves a paid household:** 7 days' full access after leaving, with a Solo offer. After that, read-only until they buy Solo. **No new trial** (D-16). The household's plan is unchanged; if the remaining members fit a smaller plan, the payer is offered a downgrade at the next renewal (D-21a). Going Solo is not "joining another household", so D-39 doesn't apply; it applies only if they later join a *different* household.
- **D-42:** **The payer moves out: the plan follows the payer.** Their store subscription covers their new household-of-one. They're offered "Move to Solo", which takes effect at the next renewal (store rule). Until then they keep the spare seats. The old household gets the D-19 notice, 7 days' grace, and a takeover by any member. A payer can't keep paying for a household they've left: there are no sponsors who aren't members.
- **D-43:** **Continuing on Solo after a household plan lapses:** Solo always means leaving. A single **"Leave and continue on Solo"** flow does the leave (D-26 data move) and the Solo purchase together, and access returns as soon as the purchase goes through. There's no extra grace, because the household is already locked. A lapsed household counts as *closed* for D-39, so this person can later join another household freely. One member cannot be covered alone inside an uncovered multi-member household.
- **D-44:** **Downgrades must fit the number of members.** The paywall and Manage screens show only plans that fit the current member count; for example, 3 members can't move to Duo. To go smaller, the owner removes members or members leave first. The app shows this path and never removes anyone on its own. Downgrades take effect at the next renewal. The planner checks whether each store allows a product change during billing retry or grace, and what the app shows if it doesn't.
- **D-45:** **A household that stays locked with no payer** keeps its data read-only and is never deleted without notice. How long it is kept is decided in the Phase 11 privacy review (DPIA retention).
- **D-46 (added 2026-11-19, owner decision during execution):** **12 member colours for Extended.** Members 7 to 12 get six more member colours: Navy #1F3A5F, Magenta #A62D8C (new), Brown #7A4B2A, Orange #A65600 (new), Charcoal #14150F, Brick #933720. Four reuse existing token hexes; Magenta and Orange are new owner-approved hexes, living only in `src/theme/tokens.ts`. An owner-approved exception to the design-fidelity colour rule, like the 06.2 page tints. Built in plan 09-26.

### Locking and offline saves
- **D-40:** **Offline saves are never lost to a lock.** If saves are queued offline when a household locks, the server refuses them on replay. The app keeps them on the phone and says "Saved on this phone. Choose a plan to sync". They sync if the household is covered again, and are included in export. The lock is enforced on the server (RLS or RPC guards) as well as in the app.

### Claude's Discretion
- Default answers for skipped questions, and how answers map to a level.
- The data model and webhook details for the plan record, trial and seats.
- The paywall layout, within the §2 design tokens.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pricing and compliance
- `.planning/research/PRICING.md`: §4–§8 (store fees, compliance, the household entitlement webhook, reminder rules). **§1–§3 are replaced by D-01..D-12.**
- `.planning/PROJECT.md`: the open-decisions table (now decided here), "Feature flags never control paid access", RevenueCat only.
- `.planning/research/LAUNCH-POSITIONING.md`: store name and listing.
- `.planning/research/FEATURES.md`: progressive disclosure (D-34..D-36).
- `.planning/REQUIREMENTS.md`: TIER-01..10, ENV-12, ANL-07, ANL-08.

### Prototype
- `FincWin United.dc.html`: `static LEVELS`, `static FEATS`, `static QS` (around lines 3230–3420), `applyOnb` (around 3629), onboarding (around 6378–6430), the Pro sheet (around 5299), "Run setup again" (around 5343).

### Earlier decisions this phase changes or builds on
- `.planning/phases/05-decide-ui/05-CONTEXT.md` D-16, D-17 (changed by D-04).
- `.planning/research/DECIDE-FIX-PLAN.md` APP-18 (changed by D-04).
- `.planning/phases/08-household/08-CONTEXT.md`: D-01/D-09 private by default, D-10 the 6-member cap (changed by D-10 here), `is_owner`, leaving and removing.
- `.planning/phases/08.1-decide-rebuild-on-real-data/08.1-CONTEXT.md` and PR #159: the short Decide setup, the 60-second first answer (D-28), the free-help trigger (D-03).
- Memory "region preference precedence": the app's region setting is not used for D-39.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/features/decide/entitlements.ts`: the single entitlement hook. Redesign it for D-01..D-05.
- `src/config/householdFeatures.ts` and `src/features/household/useFeature.ts`: the household switches.
- `src/features/income/IncomeProfileSteps.tsx`: the shared income questions.
- `src/features/consent/consentAnswered.ts`: consent, for ANL-07.
- `posthog-react-native` and `expo-notifications` are installed. `react-native-purchases` is not.
- `supabase/functions/delete-account`: deletion stays reachable when locked.

### Established Patterns
- Edge Functions for server work. Migrations reach production only through `npm run supabase:db:push`, with the owner's approval.
- Owner-signed copy for all paywall, listing and pledge wording.

### Integration Points
- Phase 8 invite and accept RPCs (plan-size cap, D-39 switch rule, payer approval).
- You screens: Subscription, Account & privacy, Features, Free help.
- The first-run route after sign-in (`src/features/auth/appHome.ts`).
- Every write path, including the offline queue's replay (D-40).

### Dependencies to check before planning
- **Push from the server** (trial reminder, payer approval, takeover notices). Phase 10 owns alerts; check what Phase 9 must build itself.
- **The Google Play merchant/payments profile** and an internal test track (Phase 0, 00-07 status).
- **The store country for D-39 before any purchase:** check that the Apple storefront and Play billing config give it without a purchase.

</code_context>

<specifics>
## Specific Ideas

- The owner thinks it's unfair for a single person to pay a household price, which is why Solo exists. The owner wants large families covered (Extended), with bulk prices.
- The owner wants protection against strangers splitting a plan without punishing real families. The switch rule applies only in higher-risk markets, with humane exemptions.
- Two outside reviews on 2026-11-18 shaped revision 2. Their misreadings are noted in the discussion log.

</specifics>

<deferred>
## Deferred Ideas

- The AI Coach: backlog 999.4.
- Bank Sync (Plaid) as a paid add-on: v1.1.
- Apple Small Business Program enrolment: the Phase 11 checklist.
- The iOS purchase test and iOS products: when Apple enrolment lands.
- Refund and chargeback handling beyond RevenueCat's revoke events, and Google's "pause subscription": raise at planning if the store setup needs them.

</deferred>

---

*Phase: 09-tiers-onboarding*
*Context gathered: 2026-11-18 (revision 2)*
