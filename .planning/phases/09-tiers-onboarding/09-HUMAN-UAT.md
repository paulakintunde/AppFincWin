---
status: partial
phase: 09-tiers-onboarding
source: [09-25-PLAN.md, 09-VALIDATION.md, 09-UI-SPEC.md, 09-PUSH-LOG.md, 09-*-SUMMARY.md, 09-WORDING.md]
started: 2026-11-19T00:00:00Z
updated: 2026-11-19T00:00:00Z
---

# Phase 9 — Human UAT

This file holds three lists:

- Part A: the Android device checklist for 09-25 Task 3.
- Part B: open items that do not block phase close.
- Part C: owner review items and deferred follow-ups raised while the plans were built.

It records build ids and results only. No keys, emails or account ids go here (T-09-83).

## Current Test

[awaiting the preview build (09-25 Task 2) and the owner device pass (09-25 Task 3)]

## Preview build

- Build id: a577d4c4-3e89-4a83-972e-08790cc55aae (EAS preview, Android, app 0.2.0, runtime 583da0c2, from phase/09-tiers-onboarding @ 93b8b866, finished 2026-11-19). RevenueCat Android key not yet set in EAS, so Plans shows its store-error state.
- Install link: https://expo.dev/artifacts/eas/MsfJIONxulD7jTn6E_hrpNy8KldtfhMmrsV9ABJ1k8c.apk (install over the current preview with `adb install -r` to keep data)
- Why a new build is needed: react-native-purchases changes the native fingerprint, so an OTA update cannot deliver it. The iOS build waits for Apple enrolment.

---

## Part A — Device checklist (09-25 Task 3, Android, Pixel)

Before the pass: with the owner's OK, Claude adds the test account's user id to `plan_settings.enforce_for` in production. That account then sees the paywall and everyone else stays free (`paid_from` stays null). After the pass Claude removes the id and confirms with a read-only select (T-09-82).

### A1. First run, every question skipped (TIER-01, D-28)
expected: Sign in with a new test account. Skip every question. You reach the summary on Everyday, then the sample Decide answer. Time it: under 60 seconds and 8 taps.
result: [pending]

### A2. Look-around in sample mode (D-28, D-17b)
expected: Look around all five tabs. The Sample bar is pinned on every tab. Tap Add, Import and a new check: each says "That needs your own records". The sample figures card shows once with "Explore the app".
result: [pending]

### A3. Plans screen (TIER-07, TIER-08)
expected: Tap "Start 14-day free trial". The Plans screen shows Yearly selected, the plans with both prices (or "Plans could not load" while the Play products are not set up, which is a valid check of that state), the disclosure lines, the price pledge and Restore purchases.
result: [pending]

### A4. Subscription and Features (TIER-10, TIER-03, TIER-05)
expected: You > Subscription: Manage subscription is first. You > Features: each row shows its reason. Switch a feature above your level on, then off with Undo.
result: [pending]

### A5. Lock with the enforce_for test account (TIER-09, D-02, D-03)
expected: The Read-only banner shows on every tab. Add says "Adding a transaction needs a plan". The "Your plan has ended" screen lists Read, Export, Free help, Manage subscription, Restore, Sign out and Delete account. Export your data produces CSV files.
result: [pending]

### A6. Offline saves while locked (D-40)
expected: Turn on airplane mode, add an entry, turn airplane mode off. "Saved on this phone. Choose a plan to sync" appears with the count. Nothing is lost.
result: [pending]

### A7. TalkBack (UI-SPEC accessibility)
expected: TalkBack on the Plans screen and on one question screen. The reading order matches UI-SPEC.
result: [pending]

### A8. Existing account (D-29)
expected: The owner's own account: no onboarding, Everything level, the "Run setup to simplify the app" card on Home, and "Free access" in Subscription.
result: [pending]

### A9. Device looks raised during the build (see Part C1)
expected: While on the device, also look at: Android back on question 1 (C1.10), the Sample bar at large font (C1.14), where "Explore the app" goes (C1.13), and the Rust and Brick member colours side by side (C1.15).
result: [pending]

### Device pass
result: [pending: owner response and date go here; enforce_for restored, confirmed with a read-only select]

---

## Part B — Open items that do not block phase close

### B1. Google Play purchases with a license tester (TIER-07, TIER-08; Owner Answer 1)
expected: Once the Play account and internal track are active, use a Google Play license tester account:
- Buy a Solo plan with its 14-day trial.
- Upgrade Duo to Household during the trial. Check the D-17 wording and that the change uses CHARGE_FULL_PRICE (RESEARCH A6).
- Downgrade at renewal.
- Restore purchases on a second device.
- Payment failure and the grace period (D-19 notices).
- Takeover: a second payer covers a home that already has a plan (Owner P4 double-cover choice).
result: [pending: blocked on the Play account]

### B2. Apple products and purchases (TIER-07, TIER-08; D-24)
expected: After Apple enrolment:
- Create the 12 products in App Store Connect with Family Sharing off.
- Set the introductory offers (14-day trial) and the no-trial products.
- Run a sandbox purchase.
- Change product during billing retry (RESEARCH A3).
- Downgrade from a trial (RESEARCH A10).
result: [pending: blocked on Apple Developer enrolment]

### B3. DeviceCheck two-bit trial check (D-16 level 3, D-24)
expected: A local Expo module for DeviceCheck plus a DeviceCheck key. One trial per iPhone is checked with the two bits.
result: [pending: blocked on Apple Developer enrolment]

### B4. App Review sandbox access (RESEARCH open question 4; Phase 11)
expected: App Review gets a sandbox account that can reach the paid screens.
result: [pending: Phase 11]

### B5. iOS dev build before the CocoaPods trunk freeze (Pitfall 9)
expected: Build and cache the iOS development build before the CocoaPods trunk freeze on 2026-12-02.
result: [pending: needs Apple enrolment for a device build; date-bound]

### B6. Android device-recall re-check after launch (Owner Answer 3)
expected: After launch, re-check how the Android trial limit behaves for a reinstall on the same device.
result: [pending: after launch]

### B7. CLAUDE.md stack row for react-native-purchases
expected: The CLAUDE.md Technology Stack and Services rows still say react-native-purchases 10.9.1. The installed exact pin is 10.16.0 (09-10). The owner approves the CLAUDE.md edit, then the row is changed to 10.16.0.
result: [pending: owner OK needed; CLAUDE.md not edited]

### B8. ENV-12 RevenueCat (09-08 Task 4; 09-PUSH-LOG open item)
expected: Create the RevenueCat project (entitlement `access`, offerings `default` and `no_trial`, restore "Transfer if there are no active subscriptions", Family Sharing off). Put the secret API key and one webhook secret in the main checkout's `.env.local`, set them as function secrets, add the plan-webhook URL, send a TEST event and record the webhook auth mode in 09-PUSH-LOG.md. Also set the RevenueCat public keys in the EAS preview environment.
result: [pending: owner]

### B9. Launch steps
expected: At launch:
- Set `plan_settings.paid_from`.
- Plan-grant the testers with end = launch + 3 months (plan-grant function, operator secret).
- Plan-grant the owner (to 2100-01-01).
note: The plan points to 09-STORE-SETUP.md for these steps. That file does not exist in the phase folder at 93b8b866. The steps above come from the plan text and 09-07-SUMMARY (plan-grant).
result: [pending: launch]

---

## Part C — Owner review items and deferred follow-ups

### C1. Owner review (copy and behaviour)

| # | Item | Where | What to decide |
|---|------|-------|----------------|
| 1 | `sync.exportFailed`: "The export could not be made. Nothing was changed." | 09-18 | Claude-drafted failure toast for export; sign or reword |
| 2 | Offer sentences, one per offered feature | 09-22 | The offer body uses `features.offer.body` with each feature's one-line sub, first letter lowered. Some read stiffly (for example "Savings goals a target, a monthly amount and a date."). A signed `what` line per offered feature is needed |
| 3 | `household.join.waitingPerson` ("Someone you invited") and `household.join.gotIt` ("Close") | 09-20 | New copy on the approval and waiting screens; sign |
| 4 | `plans.notices.paymentFailed.bodyPayer` | 09-19, 09-WORDING | "Your payment did not go through. Your home keeps full access until {{date}}." Sign |
| 5 | `plans.notices.approvalWaiting.actions.review` | 09-19, 09-WORDING | "See the request". Sign |
| 6 | `plans.doubleCover.*` rows (title, body, choiceNew, choiceOld, defaultLine, notChosen.title, notChosen.body) | 09-01, 09-19, 09-WORDING | Added after sign-off for Owner P4; sign all seven |
| 7 | `plans.paywall.periodWord.month` / `.year` | 09-WORDING | "month" / "year" inside the disclosure lines; sign |
| 8 | Member colour names: Navy, Magenta, Brown, Orange, Charcoal, Brick | 09-26, 09-WORDING `household.members.colours` | Sign the six rows |
| 9 | `onboarding.sample.bar.readerLabel`: "Sample figures. Start 14-day free trial." | 09-24 | Screen-reader label on the Sample bar; sign |
| 10 | Android back on onboarding question 1 signs out to Welcome | 09-23 | Confirm on the Pixel. The gentler choice is to leave the app |
| 11 | Questions 4 to 6 use the income steps' own titles (`income.paid.title`, `income.pay.title`, `income.season.title`), not the signed `onboarding.q.shape/inc/freq` titles; no Why link on those three | 09-21 | Accept, or sign new headings that match what the steps ask |
| 12 | The setup goal is created with no date and no monthly amount, and with `locked: false` (D-23 normally asks) | 09-21, 09-23 | Accept, or ask for the missing parts later |
| 13 | "Explore the app" hides the sample card and goes to Home | 09-24 | UI-SPEC does not say where it goes; confirm Home |
| 14 | The Sample bar is taller than 64 at font scale 1.0 because of the "Choose a different plan" link, and grows at large font | 09-24 | Look on device at large font |
| 15 | Rust vs Brick member colours are 8.0 apart (CIEDE2000; Brown vs Brick 10.7), below the 12 used for the new colours | 09-26 | Accept or swap one; also note Navy and Brick reuse Decide state hexes |
| 16 | A re-run by an existing user who never had setup records applied creates the account and goal they type, once | 09-23 | Accept, or add a marker so re-run answers never create records |
| 17 | No trial-specific line for a Solo to Duo change in the trial; uses `changeConfirm.now` ("This change starts now.") | 09-14 | Accept, or add a wording row |

### C2. Deferred follow-ups

| # | Item | Source | Needs |
|---|------|--------|-------|
| 1 | `left_at` in `plan_state()` (newest `household_leave_log.left_at` for a person alone with no covering plan). Fixes `lock.explainer.afterSeven` and makes `payerAfterLeaving` accurate (today it also matches a Duo payer who has not invited anyone, and `{{home}}` is the current home, not the one left) | 09-19, 09-20 | A migration (later plan) |
| 2 | First read intro on the sample answer: the `StageTag` "First read" (`onboarding.sample.firstRead`) and "Based on sample figures" (`onboarding.sample.basis`) at the `SampleAnswerIntro` seam | 09-24 (PARTIAL, owner-approved) | 08.1 plans 19-20 to merge |
| 3 | Trial reminder tap on a cold start opens the app without routing to Subscription (handled only while the app runs) | 09-19 | Read the last notification response on launch |
| 4 | `plans.invite.waiting.expired` is not wired: the waiting screen does not poll | 09-20 | Invitee-side re-check of the request |
| 5 | CLAUDE.md react-native-purchases 10.9.1 -> 10.16.0 | 09-10 | Owner OK (same as B7) |
| 6 | `plan_join_requests` is not in the CSV export manifest | 09-18, 09-20 | Owner not yet asked whether join requests belong in the export (GDPR portability) |
| 7 | iOS dev build before the CocoaPods trunk freeze on 2026-12-02 | Pitfall 9 | Same as B5 |
| 8 | People who signed up after the 09 backfill migration but before this build ships have no `user_setup` row and get the questions once | 09-23 | Note only; testers included |

---

## Summary

total: 19
passed: 0
issues: 0
pending: 19
skipped: 0
blocked: 7

(Counts: Part A has 10 entries including the device pass, Part B has 9. Blocked: B1 to B6 and B9 wait on outside steps. Part C, 17 review rows and 8 follow-ups, is tracked as lists, not tests. `plan_join_requests` is listed in `src/data/exportManifest.ts` as excluded, "a transient ask to join a plan".)

## Gaps

None found by the automated gate on 2026-11-19: Jest 36,978 passed (992 suites), deno 63 passed, icons match, pgTAP green in CI. Typecheck and lint show only the local react-native-purchases junction errors. See 09-VALIDATION.md "Phase gate (09-25 Task 1)".
