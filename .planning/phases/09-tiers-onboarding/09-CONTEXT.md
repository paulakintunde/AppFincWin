# Phase 9: Tiers & Onboarding - Context

**Gathered:** 2026-11-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 delivers the 11-question onboarding that sets a starting feature level, the four levels that show or hide features, the You > Features list, in-context feature offers, and paid plans through RevenueCat (TIER-01..10, ENV-12, ANL-07, ANL-08).

The owner chose a **hard paywall after a 14-day trial**, with plans priced by **how many people they cover**. All plans unlock the same features. The AI Coach is **not** built in this phase.

</domain>

<decisions>
## Implementation Decisions

### Business model and access
- **D-01:** **Hard paywall after a free trial.** Every new household gets one 14-day trial with everything unlocked. After it ends, or when a paid plan lapses, the app needs a paid plan to keep working. This replaces the freemium model recommended in `PRICING.md` §1 and §2.
- **D-02:** **Locked state is read-only.** A locked user can open and scroll their own records. They cannot add, edit or import, and cannot run a new Decide check. Saved Decide answers stay readable, but nothing is recalculated.
- **D-03:** **Always open, whatever the plan state:** CSV export, account deletion, cancelling, restoring a purchase, and sign-out. GDPR portability and erasure need these, and so does TIER-10. They must never sit behind the paywall.
- **D-04:** **Effect on earlier "never paid" rules.** Phase 5 D-17 (the alternatives table is free) and APP-18 (the safety net and confidence sentence are never paid) are rules about Pro tiers. With D-01 there is no free tier: during a trial or a paid plan, everything is available. Once locked, Decide does not run for anyone, so no one is shown an answer that lacks its safety parts. **The planner must update `src/features/decide/entitlements.ts` (`PRO_CANDIDATES`, `ALWAYS_FREE`, `PRO_SWITCHES`) and the household feature switches to fit a single paid entitlement plus a read-only lock, and record the change against D-17 and APP-18.** A locked Decide must never show a verdict without its safety net and confidence sentence.
- **D-05:** **Same features on every plan.** Plans differ only in how many people they cover. There is no feature split between plans. The Pro list in `PRICING.md` §2 no longer applies.

### Plans and prices
- **D-06:** **Solo:** 1 person. US $6.99 a month or $49.99 a year.
- **D-07:** **Household:** starts at "Home for 2" for US $9.99 a month or $69.99 a year. **Members 3 to 6 add $2.99 a month or $19.99 a year each. Members 7 to 12 ("Extended") add $3.99 a month or $29.99 a year each.** The limit is 12 members. A home of 4 pays $15.97 a month; a home of 6 pays $21.95; a home of 12 pays $45.89 (about $3.82 each). There is no price cap. *Revised 2026-11-18:* the owner raised the seat price from a flat +$1.99 because of concern about people outside a real household splitting one plan. Phase 8 makes records private by default (08 D-01, D-09), so sharing a household exposes nothing and doesn't put strangers off. The owner considered +$4.99 a seat and rejected it: a family of 4 would pay $19.97 a month, more than twice YNAB's $14.99 for up to 6 people.
- **D-39:** **Anti-sharing guard: one household switch a year.** A person who leaves a household cannot join a *different* household for 12 months; rejoining the same household is allowed. Apple Family Sharing has a similar yearly switching limit. Together with the payer's approval of every new seat (D-21), this is the main protection against group-buying. The rule is enforced in the invite and accept RPCs on the server, not only in the client.
- **D-08:** **Building the seat ladder:** neither store offers true per-seat billing, so each size (Solo, 2, 3 … 12) is its own subscription product in one store subscription group, monthly and yearly. Moving up or down a size is an upgrade or downgrade inside the group, so the store handles proration. The planner checks the store's limit on products per group and how RevenueCat models this.
- **D-09:** **Who counts as a seat:** every household member with their own login.
- **D-10:** **Server household cap:** Phase 8 caps a household at 6 (D-10 in `supabase/migrations/20261122000500_household_invites.sql`, the `v_members + v_open >= 6` checks). Phase 9 replaces the fixed 6 with the household's paid seat count, up to 12. The trial allows up to 6, the current cap.
- **D-11:** **Canada, UK and other countries:** Phase 1 fixed only "Home for 2" at C$13.99 / C$94.99 and £8.99 / £64.99. The planner proposes a full CAD and GBP table for every size in the same proportion, using each store's price points, and **the owner signs the table before the store products are created.** Other countries use the store's automatic conversion.
- **D-12:** **No sale or introductory price at launch.** **Price pledge:** the price never rises while the subscription stays active.
- **D-13:** **One household, one bill.** Paid access is a household entitlement, not a per-purchaser one: a RevenueCat webhook goes to a Supabase Edge Function, which writes a household entitlement row (`PRICING.md` §8). The app reads "this household is covered for N seats until date X". Feature flags never grant paid access (PROJECT.md).
- **D-14:** **Home already paid for:** a member whose household is covered sees "Your home already has a plan", who pays and until when, and no Buy button. This stops couples paying twice.

### Trial
- **D-15:** **No card needed.** The app runs the trial itself, not as a store trial: 14 days from household creation, recorded on the server. That makes one trial per household enforceable.
- **D-16:** **One trial per household.** A partner who joins later cannot start another. A household created by someone who has had a trial before does not get a new one. The planner decides how to key this to the user so leaving and re-creating a household doesn't restart it.
- **D-17:** **The trial includes everything, inviting people too** (up to the current 6). At the end, the household picks Solo or a household size.
- **D-18:** **Reminders:** a banner in the last 3 days shows the end date and prices. One push notification 2 days before the end, only if notifications are allowed. UK DMCC and Ontario rules expect a reminder.

### Payer changes and seats
- **D-19:** **Payer leaves, or payment fails:** 7 days of grace. Every member is told who paid and that payment stopped, and any member can take over payment. After 7 days, the household goes read-only.
- **D-20:** **A Solo subscriber invites someone:** sending the invite shows the Household price for both of them, and the store credits unused Solo time.
- **D-21:** **Adding a seat beyond the paid size:** the invite goes out, and the person inviting sees the new price. The new member joins only after the payer approves the step up.

### Store and compliance wording
- **D-22:** The store listing and the first screen say up front: "Free for 14 days, then …" with the prices. The paywall meets Apple 3.1.2(c): price, period, what's included, auto-renewal terms, and links to the terms and privacy policy. Store descriptions follow guideline 2.3.2. Copy keeps the declarative voice: no "should" or "recommend".
- **D-23:** **Cancel:** You > Subscription, next to Delete account. It opens the Apple or Google subscription page directly, with one plain line on what happens when the plan ends (read-only, export stays). This meets TIER-10.
- **D-24:** **Apple timing:** build for both stores and test real purchases on a Google Play test track now. iOS products and the iOS purchase test wait for Apple enrolment. Phase 9 can close with the iOS check listed as open, as earlier phases did.

### Coach
- **D-25:** **The Coach is not built in Phase 9.** It stays parked as backlog 999.4, and its Home quick action stays hidden (03 D-30). The paid plan does not depend on it.

### Onboarding questions
- **D-26:** **11 questions:** the prototype's 12 (`FincWin United.dc.html`, `static QS`) minus the tax question, because tax features were cut. The three income questions (steady or lumpy, roughly how much, how often) are the shared `IncomeProfileSteps` from 05.2. Whichever of onboarding or Decide setup runs first saves the answers, and the other skips them. 08.1's short Decide setup is planned in parallel (PR #159), so the planner checks how the two connect.
- **D-27:** **Skip any question, or all of them.** Each skipped answer uses a sensible default, as in the prototype. Skipping everything lands on Everyday (level 2).
- **D-28:** **Order on first run:** sign in with Apple or Google, then the questions (the analytics yes/no from ANL-07 is the last one), then the trial starts and the app opens. There is no paywall on day one.
- **D-29:** **Existing users** (the owner and testers, who never did setup) get Everything (level 4), so nothing disappears. A one-time card offers "Run setup to simplify the app".
- **D-30:** **An invited partner gets a short version:** sharing is skipped (already yes), currency comes from the household, and there is no trial step. They answer the rest, which sets their own level.
- **D-31:** **Re-running setup** (TIER-04) is reached from You, as in the prototype's "Run setup again". Cancelling leaves everything as it was.

### Levels and offers
- **D-32:** **The four levels from the prototype** (`static LEVELS`): Basics, Everyday, Full picture, Everything. Features follow `static FEATS` minimum levels, adjusted for what the app has today (the planner maps prototype IDs to real features and drops cut ones such as tax and licence). Answers turn on specific features the same way the prototype's `applyOnb` does.
- **D-33:** **Decide is visible at every level.** It is the core value.
- **D-34:** **Features above your level are hidden, not greyed out.** You > Features lists every feature with a switch, so nothing is secret (TIER-03 lets you change the level any time).
- **D-35:** **Sharing is its own switch, not a level** (TIER-06). It follows the "Do you share money?" answer and household membership.
- **D-36:** **Growing by use:** the app may suggest a level or feature based on what someone does (for example, 3 months logged and a debt added: "Turn on the payoff planner?"). Nothing turns on until the user says yes, as with the earlier rule that the app suggests and never auto-applies.
- **D-37:** **In-context offers (TIER-05):** at most 1 a week, never on or over a Decide answer. Shown as a small card under the action that triggered it. "Not now" hides that feature's offer for 30 days; "Don't suggest" stops it for good.
- **D-38:** **Analytics (ANL-08):** the level onboarding assigns, and every later change (by setup re-run, by the You screen, or by accepting a suggestion), is recorded as a typed PostHog event with no money in it. It only fires with consent.

### Claude's Discretion
- Default answers for skipped questions, and the exact mapping from answers to a level.
- The data model for the household entitlement, seats and trial rows, and the webhook design.
- How the read-only lock is enforced: in the client plus RLS or RPC guards on writes, so a locked household can't write through the API.
- The paywall layout, within the §2 design tokens and the prototype's Pro sheet.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pricing and compliance
- `.planning/research/PRICING.md`: §4 to §8, for store fees, RevenueCat fees, compliance rules, the household entitlement webhook and trial-reminder rules. **§1 to §3 are overridden by D-01 to D-12 here.**
- `.planning/PROJECT.md`: open-decisions table (Free/Pro and Coach, now decided here), "Feature flags never control paid access", and RevenueCat only.
- `.planning/research/LAUNCH-POSITIONING.md`: store name and listing wording (D-22).
- `.planning/research/FEATURES.md`: the progressive-disclosure research behind D-34 to D-36.
- `.planning/REQUIREMENTS.md`: TIER-01..10, ENV-12, ANL-07, ANL-08.

### Prototype
- `FincWin United.dc.html`: `static LEVELS`, `static FEATS`, `static QS` (around lines 3230 to 3420), `applyOnb` (around 3629), the onboarding screens (around 6378 to 6430), the Pro sheet (around 5299) and "Run setup again" (around 5343).

### Earlier decisions this phase changes or builds on
- `.planning/phases/05-decide-ui/05-CONTEXT.md` D-16, D-17: one entitlement hook, alternatives table free (changed by D-04).
- `.planning/research/DECIDE-FIX-PLAN.md` APP-18: paywall switches, safety kept free (changed by D-04).
- `.planning/phases/08-household/`: D-10 six-member cap (changed by D-10 here), invites and leaving.
- `.planning/phases/08.1-decide-rebuild-on-real-data/08.1-CONTEXT.md` and PR #159: the short Decide setup that shares `IncomeProfileSteps`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/features/decide/entitlements.ts`: the single entitlement hook from 05 D-16. Redesign it for D-01 to D-05.
- `src/config/householdFeatures.ts` and `src/features/household/useFeature.ts`: household feature switches, which already point at "the real household entitlement" for Phase 9.
- `src/features/income/IncomeProfileSteps.tsx`: the shared income questions (D-26).
- `src/features/consent/consentAnswered.ts`: the existing consent state, for ANL-07 (D-28).
- `posthog-react-native` and `expo-notifications` are installed. `react-native-purchases` is not installed yet.
- `supabase/functions/delete-account`: deletion must stay reachable while locked (D-03).

### Established Patterns
- Edge Functions for server work, with secrets kept on the server. The RevenueCat webhook belongs there.
- Migrations go to production only through `npm run supabase:db:push` after preflight, with the owner's approval.
- Owner-signed copy (the signed-copy file mechanism) for any paywall and listing wording.

### Integration Points
- The household invite RPCs (the 6-member cap moves to seat-based).
- The You screen (Subscription and Features rows, next to Delete account).
- The first-run route after sign-in (`src/features/auth/appHome.ts`).
- The write paths: the read-only lock has to cover every mutation, including the offline write queue's replay.

</code_context>

<specifics>
## Specific Ideas

- The owner wants larger families to be able to grow by paying a little more per person, not to be stopped at 6.
- The owner thinks it's unfair for a single person to pay a household price, hence Solo.

</specifics>

<deferred>
## Deferred Ideas

- The AI Coach: backlog 999.4 (D-25).
- Bank Sync (Plaid) as a paid add-on: v1.1, per `PRICING.md` §4.
- Apple Small Business Program enrolment: Phase 11 checklist.
- The iOS purchase test and iOS products: when Apple enrolment lands (D-24).

</deferred>

---

*Phase: 09-tiers-onboarding*
*Context gathered: 2026-11-18*
