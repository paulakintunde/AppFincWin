# Phase 9 owner questions (planner defaults P1 to P8)

Signed: owner, 2026-11-19

Plain words first. These are the open points the planner settled with a default. Each shows the recommended option first and the plan that builds from your answer. Pick an option for each, or write what you want instead, then sign above.

Answer format: write the number you pick next to "Your answer".

## P1. The launch switch (plans 09-02 and 09-07)

Paid plans start on a date you set on the server (setting `plan_settings.paid_from`). Until then every household can add records. Your own test account can be put on the paywall early (setting `enforce_for`), so you can test it before anyone else sees it.

1. Yes, use the date switch and the test-account switch. (Recommended)
2. Turn the paywall on for everyone the moment the database change is pushed.

Your answer: 1 (recommended) (owner, 2026-11-19)

## P2. Store product ids (plan 09-07)

A product id is the name a store files a plan under. Once created, a product id can never be reused, so these need your yes before anything is made.

Apple (12 products): `fincwin.solo.month`, `fincwin.solo.year`, `fincwin.solo.month.notrial`, `fincwin.solo.year.notrial`, `fincwin.duo.month`, `fincwin.duo.year`, `fincwin.duo.month.notrial`, `fincwin.duo.year.notrial`, `fincwin.household.month`, `fincwin.household.year`, `fincwin.extended.month`, `fincwin.extended.year`.

The "notrial" copies exist so a person who already used a trial can be shown a plan with no trial (Owner Answer 5).

Google Play (4 subscriptions): `fincwin_solo`, `fincwin_duo`, `fincwin_household`, `fincwin_extended`. Each has two base plans, `monthly` and `yearly`. Solo and Duo base plans carry an offer called `trial14` (14 days free), open to "New customer acquisition" only.

RevenueCat: access name `access`, offering `default`.

1. Use these ids exactly. (Recommended)
2. Change some ids (write which).

Your answer: 1 (recommended) (owner, 2026-11-19)

## P3. Onboarding answers before the trial (plans 09-19 and 09-20)

The first answers are given before the person has paid. The account answer (question 3) and the goal answer (question 11) are kept with your setup answers and are only created as real records when the trial starts. The income answers (questions 4 to 6) are kept on the phone and sync when the trial starts.

1. Keep them and create the records when the trial starts. (Recommended)
2. Create the account and goal at once, before the trial.

Your answer: 1 (recommended) (owner, 2026-11-19)

## P4. When the old payer's plan recovers after someone took over (plans 09-05 and 09-19, D-19)

If a member took over the plan and the old payer's plan then comes back, the takeover plan keeps covering the home. The old payer is told to cancel theirs, and the store decides on any refund.

1. The takeover plan keeps covering the home. (Recommended)
2. The old payer's plan takes over again.

Your answer: CHANGED from the draft. See the decision below. (owner, 2026-11-19)

Decision (owner, 2026-11-19, changed from the draft): when two plans cover one home after a takeover (the old payer's subscription recovers), BOTH payers are shown a choice: "Two plans cover this home. Pick one." If neither picks within 7 days, the takeover (new) plan stays and the old payer is told to cancel theirs or ask their store for a refund. Whichever plan is not chosen, its payer is told to cancel or ask the store for a refund. The app never cancels anything itself.

Affects 09-05 (plan_apply double-cover state + 7-day default via sweep) and 09-19 (notice + choice UI) - orchestrator will patch those plans.

## P5. Solo to Duo during a trial (plan 09-18)

When a Solo payer in a trial adds a 2nd person, the trial continues and the Duo price starts when it ends. The words are `plans.invite.thirdPersonTrialContinues` in the wording file.

1. The trial continues. (Recommended)
2. The trial ends and Duo is charged at once.

Your answer: 1 (recommended) (owner, 2026-11-19)

## P6. Plan changes while a payment is failing (plan 09-13, D-44)

Plan changes are not offered while a payment is failing. The app shows "Fix your payment first. Plan changes open again once the payment goes through."

1. Not offered, show the line. (Recommended)
2. Offer changes anyway and let the store decide.

Your answer: 1 (recommended) (owner, 2026-11-19)

## P7. Someone who joins during the 7 days after another member left (plan 09-04)

The normal invite rules apply. Nothing extra is blocked or allowed because of the 7-day window.

1. Normal invite rules. (Recommended)
2. Block new joins until the 7 days end.

Your answer: 1 (recommended) (owner, 2026-11-19)

## P8. Account deletion and the trial record (plan 09-02)

Deleting an account deletes its trial record, as the right to erasure requires. The store's own one-trial-per-account rule still applies, so a person cannot get a second free trial from the same store account.

1. Delete the trial record. (Recommended)
2. Keep a one-way fingerprint so a deleted account cannot start a new trial.

Your answer: 1 (recommended) (owner, 2026-11-19)
