# Phase 9 wording file

Phase 9 wording file. Draft for owner sign-off.

Signed: owner, 2026-11-19

Plain words first. Every sentence a person will read in Phase 9 is in this file, one row per sentence, each with a key. Plan 09-12 turns the rows into the app's text files, so the keys are fixed once you sign.

How to sign: rows marked `exact` are your own words from the decisions and are not edited. Rows marked `sign-off` are drafts: change any you want, then sign above. `{{name}}` marks a spot where the app fills in a value (a price, a date, a name).

Voice rules held in every row: declarative, plain grade-10 English, no "advice", "advise", "recommend", "should", "you must", "Pro", "Premium", "free forever", "no card needed", no emoji, no percentage saved. Prices, dates and currencies always come from the store, never from this file. FincWin keeps records and plans. It holds no money and gives no regulated advice.

Placeholders: `{{price}}` store price string, `{{monthly}}` monthly price, `{{yearly}}` yearly price, `{{date}}` a date, `{{time}}` a time, `{{plan}}` plan name, `{{home}}` household name, `{{name}}` a person, `{{payer}}` the person paying, `{{count}}` a number, `{{total}}` a total, `{{period}}` month or year, `{{store}}` App Store or Google Play, `{{action}}` the tapped action, `{{feature}}` a feature name.

## plans.paywall (the Plans screen)

| key | text | status | where |
|---|---|---|---|
| plans.paywall.heading.trial | Try everything free for 14 days | exact | Plans heading, trial available (D-22) |
| plans.paywall.heading.choose | Choose a plan | sign-off | Plans heading, trial used |
| plans.paywall.heading.locked | Choose a plan to keep going | sign-off | Plans heading, when locked |
| plans.paywall.startLine | Try everything free for 14 days. After the trial, choose a plan to continue. Subscriptions renew automatically until cancelled. Cancel anytime in You > Subscription or your app store's subscription settings. | exact | Plans starting line (D-22, to owner sign-off) |
| plans.paywall.startLineNoTrial | After the trial, choose a plan to continue. Subscriptions renew automatically until cancelled. Cancel anytime in You > Subscription or your app store's subscription settings. | sign-off | Starting line when the trial is not available |
| plans.paywall.period.monthly | Monthly | sign-off | Period toggle |
| plans.paywall.period.yearly | Yearly | sign-off | Period toggle |
| plans.paywall.cards.solo.name | Solo | sign-off | Plan card name |
| plans.paywall.cards.solo.people | 1 person | sign-off | Plan card people line |
| plans.paywall.cards.duo.name | Duo | sign-off | Plan card name |
| plans.paywall.cards.duo.people | 2 people | sign-off | Plan card people line |
| plans.paywall.cards.household.name | Household | sign-off | Plan card name |
| plans.paywall.cards.household.people | Up to 6 people | sign-off | Plan card people line |
| plans.paywall.cards.extended.name | Extended | sign-off | Plan card name |
| plans.paywall.cards.extended.people | Up to 12 people | sign-off | Plan card people line |
| plans.paywall.priceMonth | {{price}} a month | sign-off | Large price, monthly selected |
| plans.paywall.priceYear | {{price}} a year | sign-off | Large price, yearly selected |
| plans.paywall.priceOtherYear | or {{price}} a year | sign-off | Small price line |
| plans.paywall.priceOtherMonth | or {{price}} a month | sign-off | Small price line |
| plans.paywall.chipTrial | 14 days free | sign-off | Chip on Solo and Duo when the trial is available |
| plans.paywall.noTrial | No free trial | sign-off | Line on Household and Extended |
| plans.paywall.chargedInFull | Charged in full even if not every place is filled. | sign-off | Line on every plan card (D-06) |
| plans.paywall.hiddenPlans | Plans for fewer than {{count}} people are not shown. To choose a smaller plan, remove members first. | sign-off | Line when a plan is hidden (D-44) |
| plans.paywall.hiddenPlansLink | See members | sign-off | Link under the hidden plans line |
| plans.paywall.currentBadge | Active | sign-off | Badge on the plan held now |
| plans.paywall.currentPlan | Current plan | sign-off | Disabled button on the plan held now |
| plans.paywall.takesEffectNow | Takes effect now. The store adjusts the price for the time left. | sign-off | Line on a bigger plan |
| plans.paywall.takesEffectRenewal | Takes effect at your next renewal on {{date}}. | sign-off | Line on a smaller plan (D-08) |
| plans.paywall.periodWord.month | month | sign-off | Added 2026-11-19 - needs owner review. The word dropped into the disclosure lines for a monthly price |
| plans.paywall.periodWord.year | year | sign-off | Added 2026-11-19 - needs owner review. The word dropped into the disclosure lines for a yearly price |
| plans.paywall.disclosure.trial | Free for 14 days, then {{price}} a {{period}}. First charge on {{date}}. Renews automatically until cancelled. | sign-off | Disclosure block, trial plan selected (D-22) |
| plans.paywall.disclosure.noTrial | {{price}} a {{period}}, charged today. Renews automatically until cancelled. | sign-off | Disclosure block, no trial |
| plans.paywall.disclosure.everyPlan | Every plan includes everything. Plans differ only in how many people they cover. | sign-off | Disclosure block |
| plans.paywall.disclosure.cancel | Cancel in You > Subscription, or in your app store's subscription settings. | sign-off | Disclosure block |
| plans.paywall.pledge | The price of your plan won't go up while your subscription stays active. Taxes set by your app store, or moving to a bigger plan, can change what you pay. | exact | Pledge, Plans and Subscription (D-12) |
| plans.paywall.terms | Terms of use | sign-off | Link |
| plans.paywall.privacy | Privacy policy | sign-off | Link |
| plans.paywall.cta.startTrial | Start 14-day free trial | exact | Primary button, trial available |
| plans.paywall.cta.subscribe | Subscribe to {{plan}} | sign-off | Primary button, no trial |
| plans.paywall.cta.change | Change to {{plan}} | sign-off | Primary button, change from an active plan |
| plans.paywall.restore | Restore purchases | sign-off | Link under the button (D-14) |
| plans.paywall.trialUsed | A free trial has already been used for this account or home. | sign-off | Line above the cards (D-16) |
| plans.paywall.fixPaymentFirst | Fix your payment first. Plan changes open again once the payment goes through. | sign-off | Shown instead of plan changes while payment is failing (D-44, P6) |
| plans.paywall.changeConfirm.now | This change starts now. | sign-off | Confirm sheet line, immediate |
| plans.paywall.changeConfirm.renewal | This change starts at your next renewal on {{date}}. | sign-off | Confirm sheet line, at renewal |
| plans.paywall.changeConfirm.keep | Keep my plan | sign-off | Confirm sheet secondary button |

## plans.paywall.states

| key | text | status | where |
|---|---|---|---|
| plans.paywall.states.loadingPrice | ... | sign-off | Price placeholder while loading |
| plans.paywall.states.loadFailed | Plans could not load. Check your connection and try again. | sign-off | Warning card, store error or offline |
| plans.paywall.states.tryAgain | Try again | sign-off | Link on the load error |
| plans.paywall.states.failed | The purchase did not go through. | sign-off | Warning card, purchase failed |
| plans.paywall.states.notCharged | You have not been charged. | sign-off | Added only when the store says so |
| plans.paywall.states.storeProblem | The store reported a problem. Check You > Subscription before trying again. | sign-off | Added when the store does not say |
| plans.paywall.states.updating | Your purchase went through. Updating your plan... | sign-off | Notice, server not yet updated |
| plans.paywall.states.slow | This is taking longer than usual. Your purchase is safe. Restore purchases or try again later. | sign-off | After 60 seconds |
| plans.paywall.states.restoreNone | No purchases found for this account | sign-off | Toast, restore found nothing |
| plans.paywall.states.restoreFailed | Could not restore purchases. Check your connection and try again. | sign-off | Error, restore failed |
| plans.paywall.lockActions.addTransaction | Adding a transaction needs a plan | sign-off | Locked sheet title |
| plans.paywall.lockActions.importStatement | Importing a statement needs a plan | sign-off | Locked sheet title |
| plans.paywall.lockActions.newDecideCheck | A new Decide check needs a plan | sign-off | Locked sheet title |
| plans.paywall.lockActions.editRecord | Editing records needs a plan | sign-off | Locked sheet title |
| plans.paywall.lockActions.settleUp | Settling up needs a plan | sign-off | Locked sheet title |
| plans.paywall.lockActions.invite | Inviting someone needs a plan | sign-off | Locked sheet title |
| plans.paywall.lockActions.addAccount | Adding an account needs a plan | sign-off | Locked sheet title |
| plans.paywall.lockActions.addGoal | Adding a goal needs a plan | sign-off | Locked sheet title |
| plans.paywall.lockActions.addDebt | Adding a debt needs a plan | sign-off | Locked sheet title |
| plans.paywall.lockActions.addHolding | Adding an investment needs a plan | sign-off | Locked sheet title |

## plans.subscription (You > Subscription)

| key | text | status | where |
|---|---|---|---|
| plans.subscription.title | Subscription | sign-off | Screen title |
| plans.subscription.manage | Manage subscription | sign-off | First row |
| plans.subscription.manageSub | Opens {{store}} | sign-off | Sub-line of the manage row |
| plans.subscription.manageFailed | Your app store did not open. Open it to see your subscriptions. | sign-off | Toast when Manage subscription could not open any store page (09-25 A5-2). Added 2026-11-19 - needs owner review |
| plans.subscription.endsLine | When a plan ends, FincWin becomes read-only. You can still export your data. | sign-off | Line under the manage row (D-23) |
| plans.subscription.row.plan | Plan | sign-off | Status card label |
| plans.subscription.row.planValue | {{plan}} · {{count}} people | sign-off | Status card value |
| plans.subscription.row.paidBy | Paid by | sign-off | Status card label |
| plans.subscription.row.paidByYou | You | sign-off | Status card value |
| plans.subscription.row.trialEnds | Trial ends | sign-off | Status card label (D-18) |
| plans.subscription.row.trialEndsValue | {{date}}, {{time}} (your time) | sign-off | Status card value |
| plans.subscription.row.firstCharge | First charge | sign-off | Status card label |
| plans.subscription.row.firstChargeValue | {{price}} a {{period}} | sign-off | Status card value |
| plans.subscription.row.renews | Renews | sign-off | Status card label |
| plans.subscription.row.renewsValue | {{date}} at {{price}} | sign-off | Status card value |
| plans.subscription.row.endsNotRenewing | Ends {{date}}. Not renewing | sign-off | Status card value, cancelled |
| plans.subscription.row.places | Places | sign-off | Status card label |
| plans.subscription.row.placesValue | {{used}} of {{count}} in use | sign-off | Status card value |
| plans.subscription.row.seeMembers | See members | sign-off | Link in the status card |
| plans.subscription.changePlan | Change plan | sign-off | Row |
| plans.subscription.restore | Restore purchases | sign-off | Row |
| plans.subscription.sublabel.trial | Free trial · ends {{date}} | sign-off | You screen row sub-line |
| plans.subscription.sublabel.active | Active · renews {{date}} | sign-off | You screen row sub-line |
| plans.subscription.sublabel.readOnly | Read-only | sign-off | You screen row sub-line |
| plans.subscription.sublabel.covered | Covered by {{name}} | sign-off | You screen row sub-line |
| plans.subscription.empty.title | No plan yet | sign-off | Empty state heading |
| plans.subscription.empty.body | Start the free trial to add your own records. | sign-off | Empty state body |
| plans.subscription.tester.freeUntil | Free until | sign-off | Tester status label |
| plans.subscription.tester.note | Free access for testers ends on {{date}}. After that, the normal plans apply. | sign-off | Tester line |
| plans.subscription.tester.endsNotice | Your free access ends on {{date}}. After that, choose a plan to continue. | sign-off | Tester notice |
| plans.subscription.tester.seePlans | See plans | sign-off | Tester notice action |

## plans.member (member of a covered home)

| key | text | status | where |
|---|---|---|---|
| plans.member.title | Your home already has a plan | sign-off | Card title (D-14) |
| plans.member.body | {{payer}} pays for it. It covers up to {{count}} people until {{date}}. | sign-off | Card body |
| plans.member.startOwn | Start your own plan | sign-off | Text link |
| plans.member.startOwnTitle | Start your own plan | sign-off | Confirm sheet title |
| plans.member.startOwnBody | Solo covers one person. Starting it means leaving {{home}}. | sign-off | Confirm sheet body |
| plans.member.startOwnContinue | Continue | sign-off | Confirm sheet primary |
| plans.member.startOwnStay | Stay in {{home}} | sign-off | Confirm sheet secondary |

## plans.notices (home and subscription cards)

| key | text | status | where |
|---|---|---|---|
| plans.notices.trialReminder.title | Trial ends soon | sign-off | Badge and title, last 3 days (D-18) |
| plans.notices.trialReminder.body | Your free trial ends on {{date}} at {{time}}. After that, {{price}} a {{period}} is charged unless you cancel. | sign-off | Notice body |
| plans.notices.trialReminder.actions.manage | Manage subscription | sign-off | Notice action |
| plans.notices.trialReminder.actions.change | Choose a different plan | sign-off | Notice action |
| plans.notices.trialToday.title | Trial ends soon | sign-off | Badge and title, last day |
| plans.notices.trialToday.body | Your free trial ends today at {{time}}. {{price}} a {{period}} is charged then unless you cancel. | sign-off | Notice body |
| plans.notices.trialToday.actions.manage | Manage subscription | sign-off | Notice action |
| plans.notices.trialPush.body | Your free trial ends on {{date}}. {{price}} is charged unless you cancel. | sign-off | Push text, 2 days before |
| plans.notices.paymentFailed.title | Payment failed | sign-off | Badge and title |
| plans.notices.paymentFailed.body | {{name}}'s payment did not go through. Your home keeps full access until {{date}}. | sign-off | Notice body, every member (D-19) |
| plans.notices.paymentFailed.bodyPayer | Your payment did not go through. Your home keeps full access until {{date}}. | sign-off | Notice body, the payer (D-19). Added by 09-19 2026-11-19 - needs owner review |
| plans.notices.paymentFailed.actions.fix | Fix payment | sign-off | Payer action |
| plans.notices.paymentFailed.actions.takeOver | Take over the plan | sign-off | Member action |
| plans.notices.paymentFailed.actions.notNow | Not now | sign-off | Member action |
| plans.notices.payerLeft.title | The payer left | sign-off | Notice title |
| plans.notices.payerLeft.body | {{name}} left and no longer pays for this home. Full access continues until {{date}}. | sign-off | Notice body (D-19, D-42) |
| plans.notices.payerLeft.actions.takeOver | Take over the plan | sign-off | Notice action |
| plans.notices.payerLeft.actions.notNow | Not now | sign-off | Notice action |
| plans.notices.takeoverDone.row | Covered by {{name}} | sign-off | Row text with a neutral badge |
| plans.notices.takeoverDone.toast | {{name}} now pays for this home | sign-off | Toast |
| plans.notices.grace.banner | Plan payment is overdue. Full access until {{date}}. | sign-off | Banner at the top of each tab |
| plans.notices.grace.action | See plan details | sign-off | Banner link |
| plans.notices.payerAfterLeaving.title | You left {{home}} | sign-off | Notice title |
| plans.notices.payerAfterLeaving.body | You left {{home}}. Your subscription is still billing. Move to Solo to pay less. | sign-off | Notice body (D-42) |
| plans.notices.payerAfterLeaving.actions.manage | Manage subscription | sign-off | Notice action |
| plans.notices.payerAfterLeaving.actions.moveSolo | Move to Solo | sign-off | Notice action |
| plans.notices.oldPlanRecovers.title | Your old plan is not needed | sign-off | Notice title |
| plans.notices.oldPlanRecovers.body | {{name}} now covers {{home}}. You do not need your plan for it. Cancel it in your app store. Your store decides on any refund. | sign-off | Notice body (D-19, P4) |
| plans.notices.oldPlanRecovers.actions.manage | Manage subscription | sign-off | Notice action |
| plans.notices.memberLeft.title | You have 7 days | sign-off | Notice title |
| plans.notices.memberLeft.body | You have full access until {{date}}. Continue on Solo to keep adding and changing things. | sign-off | Notice body (D-41) |
| plans.notices.memberLeft.actions.solo | Continue on Solo | sign-off | Notice action |
| plans.notices.memberLeft.actions.notNow | Not now | sign-off | Notice action |
| plans.notices.approvalWaiting.actions.review | See the request | sign-off | Approval-waiting notice action, opens the approval screen (D-21). Added by 09-19 2026-11-19 - needs owner review |
| plans.notices.downgradeOffer.title | A smaller plan fits | sign-off | Notice title |
| plans.notices.downgradeOffer.body | Your home now has {{count}} people. {{plan}} fits them and costs {{price}} a {{period}}. It would start at your next renewal on {{date}}. | sign-off | Notice body (D-21a) |
| plans.notices.downgradeOffer.actions.switch | Switch at renewal | sign-off | Notice action |
| plans.notices.downgradeOffer.actions.notNow | Not now | sign-off | Notice action |
| plans.notices.existingUser.title | Run setup to simplify the app | sign-off | Existing-user card title (D-29) |
| plans.notices.existingUser.body | You are seeing everything. Answer 11 short questions and FincWin shows the parts that fit you. | sign-off | Existing-user card body |
| plans.notices.existingUser.actions.run | Run setup | sign-off | Card action |
| plans.notices.existingUser.actions.notNow | Not now | sign-off | Card action |

### plans.doubleCover (two plans cover one home, P4)

Added after owner sign-off 2026-11-19 - needs owner review. Shown to both payers.

| key | text | status | where |
|---|---|---|---|
| plans.doubleCover.title | Two plans cover this home | sign-off | Notice title, both payers. Added after owner sign-off 2026-11-19 - needs owner review |
| plans.doubleCover.body | Two plans cover this home. Pick one. The plan you do not pick is not used. Its payer is told to cancel it or ask their store for a refund. FincWin never cancels a plan for you. | sign-off | Notice body. Added after owner sign-off 2026-11-19 - needs owner review |
| plans.doubleCover.choiceNew | Keep {{plan}}, paid by {{name}} | sign-off | Button, the takeover (new) plan. Added after owner sign-off 2026-11-19 - needs owner review |
| plans.doubleCover.choiceOld | Keep {{plan}}, paid by {{name}} | sign-off | Button, the recovered (old) plan. Added after owner sign-off 2026-11-19 - needs owner review |
| plans.doubleCover.defaultLine | If neither of you picks within 7 days, the newer plan stays. The other payer is told to cancel their plan or ask their store for a refund. | sign-off | Default line under the buttons. Added after owner sign-off 2026-11-19 - needs owner review |
| plans.doubleCover.notChosen.title | Your plan was not picked | sign-off | Notice title for the payer whose plan was not picked, either side (P4). Added 2026-11-19 - needs owner review |
| plans.doubleCover.notChosen.body | {{name}}'s plan now covers {{home}}. You do not need yours for it. Cancel it in your app store. Your store decides on any refund. | sign-off | Notice body for the payer not picked (D-19, P4). Added 2026-11-19 - needs owner review |

## plans.invite, plans.leave, plans.solo, plans.switchRule

| key | text | status | where |
|---|---|---|---|
| plans.invite.soloConfirm.title | Add a member | sign-off | Confirm sheet title |
| plans.invite.soloConfirm.body | Adding a member needs a household plan. Your next bill would be {{monthly}} a month or {{yearly}} a year. | exact | Solo payer invites (D-20) |
| plans.invite.soloConfirm.newPlan | New plan: {{plan}}, {{count}} people | sign-off | Confirm sheet row |
| plans.invite.soloConfirm.takesEffectNow | Takes effect: now | sign-off | Confirm sheet row |
| plans.invite.soloConfirm.takesEffectRenewal | Takes effect: at your next renewal | sign-off | Confirm sheet row |
| plans.invite.soloConfirm.change | Change to {{plan}} | sign-off | Primary button |
| plans.invite.soloConfirm.keep | Keep Solo | sign-off | Secondary button |
| plans.invite.approval.title | Approve a bigger plan | sign-off | Approval screen title |
| plans.invite.approval.heading | {{name}} is waiting to join {{home}} | sign-off | Approval screen heading |
| plans.invite.approval.planNow | Plan now: {{plan}}, {{count}} people | sign-off | Approval row |
| plans.invite.approval.planAfter | Plan after: {{plan}}, up to {{count}} people | sign-off | Approval row |
| plans.invite.approval.takesEffectNow | Takes effect: now | sign-off | Approval row |
| plans.invite.approval.takesEffectRenewal | Takes effect: at your next renewal on {{date}} | sign-off | Approval row |
| plans.invite.approval.approve | Approve and change plan | sign-off | Primary button |
| plans.invite.approval.cancel | Cancel invite | sign-off | Secondary button |
| plans.invite.approval.later | Decide later | sign-off | Text link |
| plans.invite.approval.push | {{name}} wants to join {{home}}. Approve to change your plan. | sign-off | Push text |
| plans.invite.waiting.badge | Waiting | sign-off | Invitee badge |
| plans.invite.waiting.heading | Waiting for {{payer}} to approve | sign-off | Invitee heading |
| plans.invite.waiting.body | {{payer}} has been told. You will be added when they approve. You can close this screen. | sign-off | Invitee body |
| plans.invite.waiting.expired | This invite expired. Ask {{payer}} to send a new one. | sign-off | Invitee expired state |
| plans.invite.thirdPersonTrial | Adding a 3rd person moves you to Household. Your free trial ends and {{price}} is charged today. | exact | Confirm text, 3rd person during a trial (D-17) |
| plans.invite.thirdPersonTrialContinues | Adding a 2nd person moves you to Duo. Your free trial continues, and the Duo price starts when it ends. | sign-off | Confirm text, Solo to Duo during a trial (P5) |
| plans.leave.member | You will have full access for 7 days after leaving. After that, FincWin needs a Solo plan to add or change things. Your records come with you. | sign-off | Leave screen, non-payer member |
| plans.leave.memberLink | Continue on Solo | sign-off | Link on the leave screen |
| plans.leave.payer | You pay for this plan. Leaving does not cancel your subscription. It then covers your new household of one, and you can move to Solo. | sign-off | Leave screen, payer |
| plans.leave.confirm | Leave household | sign-off | Existing destructive button |
| plans.leave.solo.title | Leave and continue on Solo | sign-off | Confirm sheet title (D-43) |
| plans.leave.solo.body | You leave {{home}} and keep your own records. Solo covers one person: {{price}} a {{period}}. Access returns when the purchase goes through. | sign-off | Confirm sheet body |
| plans.leave.solo.primary | Leave and subscribe | sign-off | Primary button |
| plans.leave.solo.secondary | Stay in {{home}} | sign-off | Secondary button |
| plans.solo.title | Move to Solo | sign-off | Confirm sheet title (D-42) |
| plans.solo.body | Solo takes effect at your next renewal on {{date}}. Until then you keep the spare places. | sign-off | Confirm sheet body |
| plans.solo.primary | Move to Solo | sign-off | Primary button |
| plans.solo.secondary | Keep my plan | sign-off | Secondary button |
| plans.solo.removeFirst | To move to Solo, remove other members first. | sign-off | Line when other members remain (D-44) |
| plans.solo.seeMembers | See members | sign-off | Link under the line |
| plans.switchRule.title | You left a home recently. You can join a different home from {{date}}. | sign-off | Join screen warning (D-39) |
| plans.switchRule.body | Joining the same home is always open. If you left because of separation, bereavement or safety, contact support. No details are needed. | sign-off | Join screen body |
| plans.switchRule.contact | Contact support | sign-off | Link |

## plans.deleteWarning, plans.freeHelp, plans.export

| key | text | status | where |
|---|---|---|---|
| plans.deleteWarning.title | Billing keeps going | sign-off | Delete account warning title |
| plans.deleteWarning.body | Deleting your account doesn't cancel billing. Cancel in your app store first. | exact | Delete account warning (D-23) |
| plans.deleteWarning.manage | Manage subscription | sign-off | Link |
| plans.deleteWarning.payerCovers | {{count}} other people are covered by this plan. They will see a notice and 7 days of full access. | sign-off | Added for a payer of a multi-member home |
| plans.freeHelp.row | Free help | sign-off | You row |
| plans.freeHelp.sub | Free money help and debt support links | sign-off | Row sub-line |
| plans.export.youRow | Export your data | sign-off | You row and lock explainer row |
| plans.export.title | Export your data | sign-off | Export screen title |
| plans.export.body | A CSV file of your own records. It stays open whatever your plan. | sign-off | Export screen body |
| plans.export.button | Export | sign-off | Button |
| plans.export.done | Your export is ready | sign-off | Toast |
| plans.export.savedOnPhoneIncluded | Items saved on this phone are included. | sign-off | Export line when offline items are kept |

## onboarding.welcome and onboarding.chrome

| key | text | status | where |
|---|---|---|---|
| onboarding.welcome.heading | Know if you can afford it. | sign-off | Welcome heading |
| onboarding.welcome.line1 | Log money in and out across your accounts. | sign-off | Welcome line |
| onboarding.welcome.line2 | Check a purchase against your own months. | sign-off | Welcome line |
| onboarding.welcome.line3 | Keep a shared home in step. | sign-off | Welcome line |
| onboarding.welcome.trialLine | Try everything free for 14 days. | exact | Welcome screen (D-22) |
| onboarding.welcome.start | Get started | sign-off | Primary button |
| onboarding.welcome.haveAccount | I already have an account | sign-off | Text link |
| onboarding.welcome.footer | FincWin keeps your records. It holds no money and moves none. | sign-off | Footer line |
| onboarding.welcome.terms | Terms of use | sign-off | Link |
| onboarding.welcome.privacy | Privacy policy | sign-off | Link |
| onboarding.chrome.progress | {{n}} of {{total}} | exact | Progress label (UI contract) |
| onboarding.chrome.back | Back | sign-off | Back chevron label |
| onboarding.chrome.why | Why this matters | sign-off | Link that opens one sentence |
| onboarding.chrome.skipQuestion | Skip this question | sign-off | Text link, footer |
| onboarding.chrome.skipRest | Skip the rest | sign-off | Text link, top right |
| onboarding.chrome.continue | Continue | sign-off | Primary button |
| onboarding.analytics.lastStep | Last step. Your answer is not counted in the 11 questions. | sign-off | Line above the analytics card |

## onboarding.q (the 11 questions)

| key | text | status | where |
|---|---|---|---|
| onboarding.q.goal.title | What are you here to do? | sign-off | Question 1 |
| onboarding.q.goal.sub | Pick the closest. It decides how much of the app you meet on day one. | sign-off | Question 1 |
| onboarding.q.goal.why | Everything below is tuned from this. Say clear debt and the payoff planner is waiting for you. Say keep track and it stays out of sight. | sign-off | Question 1 |
| onboarding.q.goal.options.track | Keep track | sign-off | Option title |
| onboarding.q.goal.options.trackSub | See where the money actually went | sign-off | Option sub |
| onboarding.q.goal.options.stop | Stop overspending | sign-off | Option title |
| onboarding.q.goal.options.stopSub | Caps per category, and a note when one is close | sign-off | Option sub |
| onboarding.q.goal.options.debt | Clear debt | sign-off | Option title |
| onboarding.q.goal.options.debtSub | An order to pay things off in, and what it saves | sign-off | Option sub |
| onboarding.q.goal.options.save | Save for something | sign-off | Option title |
| onboarding.q.goal.options.saveSub | A target, a date and what it takes each month | sign-off | Option sub |
| onboarding.q.goal.options.biz | Run a business | sign-off | Option title |
| onboarding.q.goal.options.bizSub | Business income and costs, kept in one place | sign-off | Option sub |
| onboarding.q.cur.title | What do you count in? | sign-off | Question 2 |
| onboarding.q.cur.sub | Every total converts into this. Foreign entries keep their own amount and show both. | sign-off | Question 2 |
| onboarding.q.cur.why | Pick the currency you get paid in, not the one you spend most in. It is the one your head does maths in. | sign-off | Question 2 |
| onboarding.q.acct.title | Where does your money sit? | sign-off | Question 3 |
| onboarding.q.acct.sub | One account is enough to start. Add the rest whenever you like. | sign-off | Question 3 |
| onboarding.q.acct.why | Putting lines in an account is what makes the balance on Home true rather than decorative. | sign-off | Question 3 |
| onboarding.q.acct.fieldName | Account | sign-off | Field label |
| onboarding.q.acct.fieldBalance | Balance | sign-off | Field label |
| onboarding.q.shape.title | Is your income steady or lumpy? | sign-off | Question 4 |
| onboarding.q.shape.sub | Steady means the same figure most months. Lumpy means it moves about. | sign-off | Question 4 |
| onboarding.q.shape.why | Lumpy income changes how a month is read. If you say lumpy, the forecast leads on what has actually landed, not an average. | sign-off | Question 4 |
| onboarding.q.shape.options.steady | Steady | sign-off | Option title |
| onboarding.q.shape.options.steadySub | Roughly the same every month | sign-off | Option sub |
| onboarding.q.shape.options.lumpy | Lumpy | sign-off | Option title |
| onboarding.q.shape.options.lumpySub | Some months are double, some are nothing | sign-off | Option sub |
| onboarding.q.shape.options.mixed | A bit of both | sign-off | Option title |
| onboarding.q.shape.options.mixedSub | A base amount plus work on top | sign-off | Option sub |
| onboarding.q.inc.title | Roughly what comes in a month? | sign-off | Question 5 |
| onboarding.q.inc.sub | A rough figure is fine. It is only used to size things against. | sign-off | Question 5 |
| onboarding.q.inc.why | Without it, a savings rate and a debt-to-income figure are guesses. Nothing is sent anywhere. | sign-off | Question 5 |
| onboarding.q.freq.title | How often are you paid? | sign-off | Question 6 |
| onboarding.q.freq.sub | This sets how the month is grouped and when bills are expected to clear. | sign-off | Question 6 |
| onboarding.q.freq.why | Being paid fortnightly means two months a year have three pay days. The app stops treating those as windfalls. | sign-off | Question 6 |
| onboarding.q.freq.options.weekly | Weekly | sign-off | Option title |
| onboarding.q.freq.options.fort | Fortnightly | sign-off | Option title |
| onboarding.q.freq.options.monthly | Monthly | sign-off | Option title |
| onboarding.q.freq.options.irr | Whenever it lands | sign-off | Option title |
| onboarding.q.freq.options.irrSub | Invoices, commission, tips | sign-off | Option sub |
| onboarding.q.debt.title | Do you owe anything? | sign-off | Question 7 |
| onboarding.q.debt.sub | Cards, loans, a mortgage, money to a friend. Anything with a balance. | sign-off | Question 7 |
| onboarding.q.debt.why | Saying yes turns on the payoff planner, which works out the order that costs least in interest. | sign-off | Question 7 |
| onboarding.q.debt.options.no | Nothing | sign-off | Option title |
| onboarding.q.debt.options.card | A card or two | sign-off | Option title |
| onboarding.q.debt.options.cardSub | Revolving, with a minimum | sign-off | Option sub |
| onboarding.q.debt.options.loan | A loan | sign-off | Option title |
| onboarding.q.debt.options.loanSub | Fixed payments to an end date | sign-off | Option sub |
| onboarding.q.debt.options.both | Both | sign-off | Option title |
| onboarding.q.debt.options.bothSub | Cards and loans | sign-off | Option sub |
| onboarding.q.inv.title | Do you hold investments? | sign-off | Question 8 |
| onboarding.q.inv.sub | Shares, funds, crypto, a pension you can see the value of. | sign-off | Question 8 |
| onboarding.q.inv.why | Investments change what net worth means. Off by default because most people starting out do not have them. | sign-off | Question 8 |
| onboarding.q.inv.options.no | No | sign-off | Option title |
| onboarding.q.inv.options.some | A little | sign-off | Option title |
| onboarding.q.inv.options.someSub | A fund or two, checked occasionally | sign-off | Option sub |
| onboarding.q.inv.options.lots | Yes, and I track them closely | sign-off | Option title |
| onboarding.q.inv.options.lotsSub | Cost basis, lots, live prices | sign-off | Option sub |
| onboarding.q.share.title | Do you share money with anyone? | sign-off | Question 9 |
| onboarding.q.share.sub | A partner, a flat, a family pot. | sign-off | Question 9 |
| onboarding.q.share.why | Say yes and a household appears: split a line with whoever it belongs to, keep a running balance and settle up. Say no and none of it is shown to you. | sign-off | Question 9 |
| onboarding.q.share.options.no | No, it is just me | sign-off | Option title |
| onboarding.q.share.options.partner | With a partner | sign-off | Option title |
| onboarding.q.share.options.house | With a household | sign-off | Option title |
| onboarding.q.share.options.houseSub | Flatmates, family | sign-off | Option sub |
| onboarding.q.share.options.both | Both | sign-off | Option title |
| onboarding.q.share.options.bothSub | A partner and a wider pot | sign-off | Option sub |
| onboarding.q.watch.title | How closely do you want alerts? | sign-off | Question 10 |
| onboarding.q.watch.sub | This sets what you are told about, and when. | sign-off | Question 10 |
| onboarding.q.watch.why | Most people turn alerts off because the first week was too loud. Starting quiet and turning things up works better. | sign-off | Question 10 |
| onboarding.q.watch.options.light | Barely | sign-off | Option title |
| onboarding.q.watch.options.lightSub | Bills only, once a week | sign-off | Option sub |
| onboarding.q.watch.options.normal | Normally | sign-off | Option title |
| onboarding.q.watch.options.normalSub | Bills, caps and anything unusual, once a day | sign-off | Option sub |
| onboarding.q.watch.options.close | Closely | sign-off | Option title |
| onboarding.q.watch.options.closeSub | Everything, as it happens | sign-off | Option sub |
| onboarding.q.watch.options.none | Not at all | sign-off | Option title |
| onboarding.q.watch.options.noneSub | No alerts of any kind | sign-off | Option sub |
| onboarding.q.save.title | What are you saving towards? | sign-off | Question 11 |
| onboarding.q.save.sub | A name and a target. Leave the target blank for an open-ended pot. | sign-off | Question 11 |
| onboarding.q.save.why | A goal with a name gets funded about twice as often as a pot called savings. | sign-off | Question 11 |
| onboarding.q.save.fieldGoal | Goal | sign-off | Field label |
| onboarding.q.save.fieldTarget | Target | sign-off | Field label |
| onboarding.q.save.fieldMonthly | Per month | sign-off | Field label |

## onboarding.summary, onboarding.partner, onboarding.rerun, onboarding.sample

| key | text | status | where |
|---|---|---|---|
| onboarding.summary.heading | Here is your FincWin | sign-off | Summary heading |
| onboarding.summary.skipped | Skipped | sign-off | Row value when unanswered |
| onboarding.summary.row.goal | Here to | sign-off | Summary label |
| onboarding.summary.row.cur | Counting in | sign-off | Summary label |
| onboarding.summary.row.acct | Money sits in | sign-off | Summary label |
| onboarding.summary.row.inc | Income | sign-off | Summary label |
| onboarding.summary.row.debt | Owes money | sign-off | Summary label |
| onboarding.summary.row.inv | Investments | sign-off | Summary label |
| onboarding.summary.row.share | Shares money | sign-off | Summary label |
| onboarding.summary.row.watch | Alerts | sign-off | Summary label |
| onboarding.summary.row.save | Saving towards | sign-off | Summary label |
| onboarding.summary.levelLine | {{level}} · {{count}} of {{total}} features on | sign-off | Level card title |
| onboarding.summary.restStays | The rest stays out of the way until you ask for it. | sign-off | Level card line |
| onboarding.summary.seeWhatIsOn | See what is on | sign-off | Text link |
| onboarding.summary.continue | Continue | sign-off | Primary button, first run |
| onboarding.summary.apply | Apply these | sign-off | Primary button, re-run |
| onboarding.summary.keep | Keep what I have | sign-off | Secondary link, re-run |
| onboarding.summary.recordsStayOn | Features that hold your records stay on. | sign-off | Re-run summary line |
| onboarding.partner.heading | You joined {{home}} | sign-off | Partner welcome heading |
| onboarding.partner.body | A few questions set up your own view. Only you see your answers. | sign-off | Partner welcome body |
| onboarding.partner.private | Private. Not shown to {{payer}} or other members. | sign-off | Line under each partner question title |
| onboarding.rerun.row | Run setup again | sign-off | You > Features top row |
| onboarding.rerun.sub | The 11 questions, and what they switch on | sign-off | Row sub-line |
| onboarding.rerun.keepToast | Nothing changed | sign-off | Toast on Keep what I have |
| onboarding.sample.card | You are looking at sample figures. They are not yours. | sign-off | Look-around card |
| onboarding.sample.explore | Explore the app | sign-off | Look-around card link |
| onboarding.sample.firstRead | First read | sign-off | Stage tag on the sample answer |
| onboarding.sample.basis | Based on sample figures | sign-off | Basis line on the sample answer |
| onboarding.sample.bar.word | Sample | sign-off | Sample bar word |
| onboarding.sample.bar.sub | Free for 14 days | sign-off | Sample bar sub-line |
| onboarding.sample.bar.start | Start 14-day free trial | sign-off | Sample bar button |
| onboarding.sample.bar.readerLabel | Sample figures. Start 14-day free trial. | sign-off | Added 2026-11-19 (09-24) - needs owner review. Screen-reader label on the Sample bar button (UI-SPEC 4); the reader adds "Button" |
| onboarding.sample.lockedTitle | That needs your own records | sign-off | Locked sheet title in the look-around |
| onboarding.sample.lockedBody | Start the free trial to add your own records and run checks on your own money. | sign-off | Locked sheet body in the look-around |
| onboarding.sample.keepLooking | Keep looking | sign-off | Locked sheet text button |
| onboarding.sample.differentPlan | Choose a different plan | sign-off | Text link under the trial button |

## features (You > Features)

| key | text | status | where |
|---|---|---|---|
| features.title | Features | sign-off | Screen title |
| features.levelChip | Your level | sign-off | Chip on the level card |
| features.count | {{count}} of {{total}} features on | sign-off | Level card line |
| features.sublabel | {{level}} · {{count}} of {{total}} on | sign-off | You screen row sub-line |
| features.runSetup | Run setup again | sign-off | Row link |
| features.search | Find a feature | sign-off | Search field |
| features.empty.title | No feature matches that | sign-off | Empty state heading |
| features.empty.body | Try another word. | sign-off | Empty state body |
| features.reasons.level | Not in your level | exact | Reason line (D-35) |
| features.reasons.household | Not on for your household | exact | Reason line (D-35) |
| features.reasons.plan | Needs a plan | exact | Reason line (D-35) |
| features.reasons.holdsData | Has your records, so it stays on | sign-off | Reason line (D-34) |
| features.reasons.choosePlan | Choose a plan | sign-off | Link at the top when locked |
| features.reasons.setUpSharing | Set up sharing | sign-off | Link when the household reason can be fixed |
| features.toastOn | {{feature}} is on | sign-off | Toast with Undo |
| features.toastOff | {{feature}} is off | sign-off | Toast with Undo |
| features.offer.title | Turn on {{feature}}? | sign-off | Offer card title (D-36) |
| features.offer.body | {{feature}} {{what}}. You can turn it off in You > Features. | sign-off | Offer card body |
| features.offer.turnOn | Turn on | sign-off | Offer button |
| features.offer.notNow | Not now | sign-off | Offer link |
| features.offer.dontSuggest | Don't suggest | sign-off | Offer link |
| features.levels.basics.name | Basics | exact | Level name (D-32) |
| features.levels.basics.sentence | Money in and out, categories, one account, a month at a time. | sign-off | Level sentence |
| features.levels.everyday.name | Everyday | exact | Level name (D-32) |
| features.levels.everyday.sentence | Adds several accounts, category caps, goals, repeating bills and alerts. | sign-off | Level sentence |
| features.levels.fullPicture.name | Full picture | exact | Level name (D-32) |
| features.levels.fullPicture.sentence | Adds debt payoff, investments, reconciliation and other currencies. | sign-off | Level sentence |
| features.levels.everything.name | Everything | exact | Level name (D-32) |
| features.levels.everything.sentence | Adds the archive, undo history and every part of Decide. | sign-off | Level sentence |
| features.areas.recording | Recording | sign-off | Section heading |
| features.areas.accounts | Accounts | sign-off | Section heading |
| features.areas.planning | Planning | sign-off | Section heading |
| features.areas.grow | Grow | sign-off | Section heading |
| features.areas.sharing | Sharing | sign-off | Section heading |
| features.areas.insight | Insight | sign-off | Section heading |
| features.areas.system | System | sign-off | Section heading |

## lock (read-only state)

| key | text | status | where |
|---|---|---|---|
| lock.banner | Your plan has ended. Choose a plan to add or change things. | sign-off | Banner line, top of each tab |
| lock.bannerHousehold | {{home}}'s plan has ended. | sign-off | Banner line, household |
| lock.bannerPaidBy | {{name}} paid | sign-off | Banner sub-line, household |
| lock.bannerBadge | Read-only | sign-off | Banner badge |
| lock.bannerLink | Choose a plan | sign-off | Banner link |
| lock.sheetTitle | {{action}} needs a plan | sign-off | Locked sheet title (named per action in plans.paywall.lockActions) |
| lock.sheetBody | Your records stay here to read. Choose a plan to add, edit or import. | sign-off | Locked sheet body |
| lock.sheetPrimary | Choose a plan | sign-off | Locked sheet button |
| lock.sheetKeepReading | Keep reading | sign-off | Locked sheet text button |
| lock.accessibleSuffix | needs a plan | sign-off | Spoken after a locked button's name |
| lock.decideSaved | Saved answer. Not recalculated while read-only. | sign-off | Line on a saved Decide answer |
| lock.explainer.heading | Your plan has ended | sign-off | Lock explainer heading |
| lock.explainer.headingHousehold | {{home}}'s plan has ended | sign-off | Lock explainer heading, household |
| lock.explainer.body | Your records are safe. Here is what you can still do. | sign-off | Lock explainer body |
| lock.explainer.stillOpen | Still open | sign-off | Group heading |
| lock.explainer.readRecords | Read your records | sign-off | Row |
| lock.explainer.freeHelp | Free help | sign-off | Row |
| lock.explainer.freeHelpSub | Free money help and debt support links | sign-off | Row sub-line |
| lock.explainer.manage | Manage subscription | sign-off | Row |
| lock.explainer.restore | Restore purchases | sign-off | Row |
| lock.explainer.signOut | Sign out | sign-off | Row |
| lock.explainer.deleteAccount | Delete account | sign-off | Row |
| lock.explainer.needsPlan | Needs a plan | sign-off | Group heading |
| lock.explainer.needs.edit | Adding or editing records | sign-off | List line |
| lock.explainer.needs.import | Importing | sign-off | List line |
| lock.explainer.needs.decide | New Decide checks | sign-off | List line |
| lock.explainer.choose | Choose a plan | sign-off | Primary button |
| lock.explainer.continueReading | Continue reading | sign-off | Text button |
| lock.explainer.paidBy | Paid by {{name}} | sign-off | Member variant line |
| lock.explainer.takeOver | Take over the plan | sign-off | Member variant button |
| lock.explainer.leaveSolo | Leave and continue on Solo | sign-off | Member variant link |
| lock.explainer.afterSeven | Your 7 days after leaving ended | sign-off | Variant after 7 days |
| lock.explainer.noPayer | Your records stay here read-only. Nothing is deleted without notice. | sign-off | Variant, no payer (D-45) |
| lock.savedOffline.title | Saved on this phone. Choose a plan to sync | exact | Notice and chip (D-40) |
| lock.savedOffline.body | {{count}} items are kept here. They sync if your plan is active again, and they are included when you export. | sign-off | Notice sub-line |
| lock.savedOffline.choose | Choose a plan | sign-off | Notice action |
| lock.savedOffline.export | Export my data | sign-off | Notice action |
| lock.savedOffline.see | See them | sign-off | Link to the failed-saves sheet |
| lock.savedOffline.synced | Your saved items synced | sign-off | Toast on sync |

## appLife.status (badge words)

| key | text | status | where |
|---|---|---|---|
| appLife.status.trial | Free trial | sign-off | Badge |
| appLife.status.planActive | Active | sign-off | Badge |
| appLife.status.trialEnding | Trial ends soon | sign-off | Badge |
| appLife.status.paymentFailed | Payment failed | sign-off | Badge |
| appLife.status.readOnly | Read-only | sign-off | Badge |
| appLife.status.waitingApproval | Waiting | sign-off | Badge |
| appLife.status.coveredBy | Covered | sign-off | Badge |
| appLife.status.freeAccess | Free access | sign-off | Badge |

## household plan line (section 13)

| key | text | status | where |
|---|---|---|---|
| plans.household.planLine | Plan: {{plan}} · {{name}} pays | sign-off | Household hero sub-line |
| plans.household.coveredBy | Covered by {{name}} | sign-off | Household hero sub-line |
| plans.household.notPayer | {{name}} pays. Only they can change the plan. | sign-off | Household hero, owner who is not the payer |
| plans.household.full | {{plan}} holds {{count}} people. | sign-off | Line under Invite someone when full |
| plans.household.seePlans | See plans | sign-off | Payer link when full |
| plans.household.askPayer | Ask {{payer}} to change the plan. | sign-off | Line for others when full |

## household.members.colours (added 2026-11-19, needs owner review)

Six more member colour names for Extended (12). The owner signed the file on 2026-11-19 before these rows existed; these six rows are not yet signed.

| key | text | status | where |
|---|---|---|---|
| household.members.colours.navy | Navy | sign-off | Member colour picker and hidden-name label |
| household.members.colours.magenta | Magenta | sign-off | Member colour picker and hidden-name label |
| household.members.colours.brown | Brown | sign-off | Member colour picker and hidden-name label |
| household.members.colours.orange | Orange | sign-off | Member colour picker and hidden-name label |
| household.members.colours.charcoal | Charcoal | sign-off | Member colour picker and hidden-name label |
| household.members.colours.brick | Brick | sign-off | Member colour picker and hidden-name label |

Owner glance at the 09-25 device pass: the six colours (Navy #1F3A5F, Magenta #A62D8C, Brown #7A4B2A, Orange #A65600, Charcoal #14150F, Brick #933720) beside the first six; Magenta and Orange are new hexes (owner 2026-11-19); Orange is closest to Brown (ΔE00 12.3) and Brick is closest to Rust (ΔE00 8.0).
