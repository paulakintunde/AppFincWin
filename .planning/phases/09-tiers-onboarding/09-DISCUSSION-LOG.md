# Phase 9: Tiers & Onboarding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 09-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-18
**Phase:** 09-tiers-onboarding
**Areas discussed:** Free vs Pro and price; Coach; Onboarding questions and levels; Offers, trial and Apple timing

---

## Free vs Pro, and price

| Question | Options presented | Owner's answer |
|---|---|---|
| Model | Free + one Pro per home (rec); Free + Pro per person; Everything free at launch | Free trial for 14 days + one Pro per home |
| Price | $7.99/$59.99 (rec); $6.99/$49.99; $9.99/$69.99 | $9.99 / $69.99 |
| Pro items | Decide extras; forecast + payoff; PDF import; detailed splits | All four (later moot: D-05) |
| Trial and pledge | 14-day + pledge (rec); 7-day + pledge; no trial | 14-day + pledge |
| After trial | Keeps a free plan (rec); must pay | **Must pay (hard paywall)** |
| Trial count | One per household (rec); one per person | One per household |
| Locked view | Read-only records (rec); paywall screen only | Read-only |
| Trial start | No card (rec); card up front, store trial | No card |
| Tiers | One plan, everything (rec); two paid plans | One plan, everything |
| Old Decide answers | Readable (rec); fully locked | Readable |
| Store copy | Say "Free 14-day trial" up front (rec); decide at Phase 11 | Up front |
| Local price | C$13.99/94.99, £8.99/64.99 (rec); store auto | Recommended |
| Payer leaves | 7 days' grace (rec); read-only at once | 7 days' grace |
| Home already paid | "Your home already has Pro" (rec); allow second purchase | Recommended |
| Intro price | None (rec); launch discount | None |
| Free text | — | "Pricing should differ between individuals and households" |
| Two prices | Solo $6.99 + Household $9.99 (rec); $7.99 + $11.99; $4.99 + $9.99 | "Household by seat after 2 users, a little on top per account" |
| Difference | Only who it covers (rec); Household gets sharing features | Only who it covers |
| Solo invites | Invite prompts upgrade (rec); partner pays own Solo | Invite prompts upgrade |
| Trial plan | Everything incl. inviting (rec); Solo only | Everything |
| Seat price | Solo $6.99, Home for 2 $9.99, +$1.99 each (rec); +$2.99; Solo $7.99/Home $11.99 | Recommended |
| Extra seat | Payer approves (rec); invite blocked until upgrade | Payer approves |
| Who counts | Every member with a login (rec); adults only | Every member |
| Big family (free text) | — | "Limit of 6 doesn't help larger families; extended plan at higher fees" |
| Big family | Extended flat 7–12 (rec); keep adding seats up to 12; no upper limit | Keep adding seats up to 12 |
| Extended price | $19.99/$149.99 (rec); $24.99/$189.99; not flat | $24.99/$189.99 |
| Clarify | Seats capped at $24.99 (rec); seats to 6 then flat; seats only | "Extra per invite, capped at 12 for extended" → seats only, no price cap |

## Coach

| Question | Options | Answer |
|---|---|---|
| Build in Phase 9? | Leave parked (rec); build in 9; own phase before launch | Leave parked |

## Onboarding questions and levels

| Question | Options | Answer |
|---|---|---|
| Question set | Drop tax, reuse income = 11 (rec); all 12; about 6 | Recommended |
| Hiding | Hidden + Features list (rec); greyed out | Recommended |
| Level up | App suggests, user says yes (rec); quiz and user only | Recommended |
| Skipping | Skip any or all (rec); required only | Recommended |
| First run | Sign in → questions → trial (rec); questions first | Recommended |
| Existing users | Everything + setup prompt (rec); ask once | Recommended |
| Joiner | Short version (rec); full questions | Recommended |

## Offers, trial and Apple timing

| Question | Options | Answer |
|---|---|---|
| Offers | Max 1 a week, never on Decide (rec); every time; only in Features | Recommended |
| Reminder | Push 2 days before + banner (rec); banner only | Recommended |
| Apple | Build both, test Android now (rec); wait for Apple | Recommended |
| Cancel | You > Subscription beside Delete account (rec); Settings only | Recommended |

## Claude's Discretion
Skipped-answer defaults, the answer-to-level mapping, the entitlement data model and webhook, how the lock is enforced, and the paywall layout.

## Deferred Ideas
Coach (999.4), Bank Sync (v1.1), Apple Small Business Program (Phase 11), the iOS purchase test (after enrolment).

## Follow-up 2026-11-18: seat price and cheating

The owner was concerned about people gaming household plans and asked about $4 to $5 per extra seat. Claude looked at what other apps charge (YNAB covers up to 6 for $14.99; Monarch includes a partner free; Spotify Family $21.99 for 6 against Individual $12.99; 1Password Families $5.99 against $3.99). Because household records are private by default, sharing a plan with strangers costs nothing in privacy.

| Question | Options | Answer |
|---|---|---|
| Seat price | $2.99 for 3–6, $3.99 for 7–12 (rec); $3.99 flat; $4.99 flat | Recommended (D-07 revised) |
| Switch rule | Join a new household once a year (rec); none | Yes (D-39) |

## Revision 2 — 2026-11-18: two outside reviews + owner directions

The owner pasted two outside reviews and asked for clarifying questions, along with two directions of their own: price by group size (1, 2, 6, 12) at full price whether or not every seat is filled, and apply the 12-month switch rule only outside North America, Europe, New Zealand and Australia.

**Where the reviews were wrong or out of date (noted, not acted on):**
- APP-18's "safety parts" means the safety net and the confidence sentence in a Decide answer, not crisis resources. The real point nearby (free-help links stay open when locked) was accepted as D-03.
- Yearly seat prices had been set in the written decisions; only the chat summary left them out.
- D-23 already opened the store's subscription page; the label and placement were fixed.
- The "duplicated Solo price" was a display glitch where `$` signs rendered as maths.

**Accepted without a question:** Manage subscription, Delete account and Leave household as separate actions; Restore purchases plus a "Start your own plan" link on "Your home already has a plan"; payer separate from owner; a store-neutral record with Apple and Google adapters; exact Solo-upgrade wording with Confirm; a push to the payer when someone waits for a seat; trial never called a store trial; a "trial ends today" message and a post-lock explainer; Apple Family Sharing off; offline saves kept on lock (D-40); the order of checks: plan state, then household, then level (D-35); features holding data never hide; the feature mapping goes to owner review.

| Question | Options | Answer |
|---|---|---|
| Household up to 6 | $14.99/$109.99 (rec); $17.99/$129.99; $19.99/$149.99 | $14.99 / $109.99 |
| Extended up to 12 | $24.99/$189.99 (rec); $29.99/$219.99; $34.99/$259.99 | $24.99 / $189.99 |
| Trial size | Up to 12 (rec); up to 6 | Up to 12 |
| Trial clock | First real use, 30-day backstop (rec); setup finish | First real use |
| Region signal | Store country (rec); app region setting | Store country |
| Regions | US, CA, EU, EEA, UK, CH + AU, NZ (rec); whole continents | Recommended |
| Exemptions | Removed; household closed; support exception; rejoin same | All four |
| Takeover | Any member, first to buy (rec); owner first | Any member |
| Pledge | Plan price locked while active (rec); drop it | Recommended wording |
| Locked view | Plus free-help links (rec); only the four | Plus free help |
| Price shown | Listing + paywall, not welcome (rec); also welcome | Recommended |
| Testers | Free until a set date (rec); free for good; normal trial | Free until a set date; owner free |

## Addendum 2026-11-18: moving out, going Solo, downgrading

| Question | Options | Answer |
|---|---|---|
| Member leaves a paid home | 7 days' full access (rec); read-only at once; until the household's billing period ends | 7 days (D-41) |
| Payer moves out | Plan follows the payer (rec); payer can sponsor the old home | Plan follows the payer (D-42) |
| Solo inside a lapsed home | Solo means leaving (rec); personal cover inside | Solo means leaving (D-43) |
| Long-locked data | Decide in Phase 11 DPIA (rec); set a limit now | Phase 11 (D-45) |

## Revision 3 — 2026-11-18: store-managed trial, 2 people at most, reuse limits

The owner asked for: trials of at most 2 people; trial reuse limited by device, payment identity and store account, not only by household; and a store-managed free trial that turns into a paid plan unless cancelled (this replaces the no-card trial the app ran itself, D-15). Claude noted that the app can't see payment identity, so that limit is enforced only by Apple and Google.

| Question | Options | Answer |
|---|---|---|
| Trial plans | Solo and Duo only (rec); all four, limited to 2 people | Solo and Duo only |
| 3rd person during a trial | Upgrade ends the trial, said first (rec); blocked until the trial ends | Upgrade ends the trial |
| Before the trial | Look around with sample data (rec); nothing | Sample-data look-around (D-17b) |
| Device check | Apple DeviceCheck, Android researched (rec); store account only | Yes |

D-17a (clock starts at first real use) is removed. D-28 no longer avoids a paywall on day one.

## Follow-up 2026-11-18: 60-second goal and local prices

| Question | Options | Answer |
|---|---|---|
| 60-second first answer vs setup + trial first | Sample answer counts (rec); own answer before paywall; drop the goal | Sample answer counts (D-28) |
| Local prices | Owner signs CA, UK, EU, AU table (rec); stores convert everything | CA, UK, EU, AU (D-11) |
