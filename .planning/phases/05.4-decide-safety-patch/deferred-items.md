# Deferred items (05.4)

- 05.4-03: `src/db/__tests__/columns05_2.test.ts` (decide_settings) fails: SQL grants list `custom_options` (migration 20261031001000, plan 05.4-02) but the `decide_settings` patch keys in `src/db` do not. Not caused by the engine harvest (no src/db file changed). Needs `custom_options` added to the patch keys when the plan that reads/writes custom options lands.
  RESOLVED in 05.4-04: `src/db/decideSettings.ts` harvested from the parked branch (adds `custom_options`); `npx jest src/db` passes. `src/db/decideOutcomes.ts` (client use of the 4-arg record_decide_outcome overload, migration 20261031000100) was NOT harvested: main's client still works with the 3-key call. Left for 05.4-06.

- 05.4-06: RESOLVED `src/db/decideOutcomes.ts` (4-arg record_decide_outcome overload) harvested with its test.

- 05.4-15 (observation, pre-existing, not changed): before the month's pay has landed (e.g. the 1st), the one-off ladder still takes this month's room out of the money sitting in the account (`judge.ts` ladder: `earlierRoom = unspent - B`, "this month's room counted once"). On the 1st the balance holds only last month's money, so money left from earlier months plus this month's room is undercounted. Example: QE-07 Lucy at $1,500 on 1 December (records synced 29 Nov): cash path lowest $500 on 31 Dec, room $1,000, $1,000 from November still in the account, answer not_yet. The plain calculator mirrors the engine rule, so the cross-check agrees. For the planner of the earlier-months / unspent rules (D-44) to decide.

## Test adapter ignores each person's currency (found 2026-11-03, orchestrator)
- `golden/adapter.ts` `toV3Inputs(person)` builds on the USD base fixture and never passes `person.currency`, so the 13 GBP audit people run as USD. Amounts are the same minor units, but currency-dependent rules (band edges, tax region) use USD. The changed-answers pages therefore show "$" for them.
- Fix in 05.4-40 (personas as goldens): pass `person.currency` through, re-run the reviewed diff, and bring any changed answers to the owner (D-14).

## Carried to 08.1 (screens)
- D-61 compulsory setup step before Decide's first answer: 'Do you have a safety net?': pick the account and amount, locked by default; 'No safety net yet' allowed (then the D-35 no-net line shows). Writes decide_settings.safety_net_locked / safety_net_size and the net account.
- D-61 unlock in Decide settings only, with a confirm step ('Your safety net will count in answers'); stays unlocked until locked again; only then can 'Dips into your safety net' appear.

05.4-35: map decide_settings.safety_net_locked into V3Inputs.safetyNet.locked (absent = locked).

## Found in 05.4-20 (FIN-04 / FIN-10)
- **Quick-estimates everyday still to come counts the bills again (engine, pre-existing).** With quick estimates the typical
  everyday figure is the estimates' whole spending (bills + everyday, D-32), and thisMonth's Erest is worked out from it while the
  bills are also counted: QE-13 Zoe (£1,000 bills + £300 everyday, £220 spent by 22 November) gets £1,080 still to come instead of
  £80, so "Not yet" instead of "Fits, £600 left"; QE-01 asks for more records (records_look_behind) for the same reason.
  essentialSpendingOf already takes the bills out once. No plan owns it: QE-13 re-tagged ENG-11 in knownRed. Needs a gap plan.
- **A minimum is taken every month even past the balance.** debtOutflows lands the minimum on each due date inside the 90 days
  whatever the balance (gen:136: $707.08 a month on $587.32). Not capped here (no right-answer case states it); owner question.
- **The app builder does not pass the new debt fields yet.** buildV3Inputs (src/features/decide/snapshot/**, not edited in 05.4)
  maps no dueDay, joint, paidThisMonth, seriesId or factLines, so in shadow runs every minimum is counted from tomorrow with
  debt_due_day_assumed. debts.due_day exists (05.4-29). Map them with the snapshot work (05.5 / 08.1).

## Found in 05.4-57 (ENG-11)
- **Closed:** the quick-estimates bills double count above (QE-13, QE-01) is fixed in 05.4-57 (ENG11-QE-BILLS).
- **The app does not carry an essential part of quick estimates yet.** TypedEstimates.essential (ENG11-QE-ESSENTIAL) is set only
  by the right-answer fixtures. The quick-estimates sheet does not ask it (08.1 screen) and buildV3Inputs
  (src/features/decide/snapshot/**, not edited in 05.4) does not map it (05.5 builder). Until then app users keep the larger
  starter (all everyday spending counts as essential). Owner question 1 at the 05.4-57 D-14 review.
- **Closed by D-74 (05.4-57 Task 5):** the usual month from quick estimates leaves out recorded card and loan minimums and a regular saving (ENG11-QE-SETASIDE) was: 
  typicalOf's typed typicalLeft = income - money out - typed debt - typed saving - typed invest; recorded minimums and saving
  series are not taken out, so a quick-estimates person with a card or loan can miss the D-65 "month already short" tier (found
  by the crosscheck, seed 0). In the app a quick-estimates snapshot carries no series or debts today, so no user meets it yet;
  it bites once records sit beside estimates (05.5, D-43). How typed and recorded figures combine is an owner choice (owner
  question 3). The crosscheck draws quick-estimates people without a card, loan or regular saving until then (fixtureArb.ts).

## Found in 05.4-21 (FIN-06 / FIN-07)
- **The app does not pass the user's own tight line yet.** V3Inputs.tightLine (the money-left-each-month line, BR-09) is set only by
  the right-answer fixtures and the crosscheck. No existing limit line means "money left each month" (unspent_floor is about unspent
  money), so buildV3Inputs (src/features/decide/snapshot/**, not edited in 05.4) maps nothing; the screen that sets it is 08.1.
  Until then every app answer uses the tenth-of-spending floor.
- **Which tight row a screen shows.** verdictRowFor(code, 'tight', once) reads the one-off rows ("Fits, but tight") when `once` is
  true; the caller passes true for a check paid once or a D-68 plan judged by cash (short_plan_from_cash). A one-off with a running
  cost that is tight on its monthly cost (golden #22) reads better with the plan row: 08.1 decides.
- **BR-06 (owner question 2 at the 05.4-21 review):** approved Short each month; engine and plain give Not yet (the account goes
  below $0 before payday, which is stricter). Stays in knownRed under FIN-05.

## Found in 05.4-22 (FIN-05 / ENG-08 / UX-13)
- **The random crosscheck still leaves plans out of the whole-code comparison (BO-05).** With the fixture's first payment mapped
  (05.4-22), plans could be compared for the first time. At seed 0 (441 plans) 28 disagree, none about borrowing: the plain plan
  branch has no fits_unspent (a deposit paid from earlier money: engine "Fits from spare money", plain "Fits"), no overdraft (a 0%
  plan that dips inside a 1-cent limit: engine "Uses your overdraft", plain "Not yet", which is what BR-13 says: "A 0% plan cannot
  look fine while the account is ... overdrawn"), and reads FIN-06's this-month rule differently (engine Short each month, plain Not
  yet). The borrowing answer itself is compared on every random plan where both sides say it fits (crosscheck.test, 05.4-22). Needs
  a gap plan to make the plain plan branch ladder-complete, and an owner answer on a plan that only fits inside the overdraft.
- **A first payment less than one period away is paid before any interest.** buildSchedule reads a deferred first payment as an
  annuity due with interest only for whole periods of pause (05.1 D-24). QE-11 / QE-12 (first payment 15 days after buying, 9.9%):
  engine interest £1,641.24; the cases' hand figure £1,720.75 (interest from the day of buying). Both are over 10% of the £8,000, so
  no answer changes; the interest line's figure does. For the schedule's owner.
- **The fixture reads a deferred first payment with no interest during the pause.** No right-answer case defers a whole period at a
  rate above 0%, so the answer is the same either way; a case that does should state the pause interest (BO-05).
- **The cash route ignores a trade-in.** The save-or-borrow comparison judges the same check paid once, which has no trade-in, so a
  plan with a trade-in is compared with paying the whole price in cash. No fixture or golden uses a trade-in; 08.1 / BO-05.
- **The app builder does not pass check.pay.housing yet.** PayV2.housing (D-39c) is set only by the fixtures; the check sheet does
  not ask "Is this a home loan?" (08.1) and src/features/decide/snapshot/** (not edited in 05.4) maps nothing. Until then every app
  mortgage takes the 10% interest test.

## Found in 05.4-23 (FIN-08 / FIN-15 / D-46)
- **The runway lines are for monthly plans only.** covered_from_savings / further_shortfall_runway count payments against a monthly
  gap; a fortnightly or every-N-months plan on Short each month shows neither. For 08.1 / a later plan if the owner wants them.
- **Seasonal earners are not term-scaled.** Their bridge is the run of lean months ahead (D-37), all from savings; the whole-term
  count (QE-04) is for variable and steady low-pay earners.
- **A plan paid less often than monthly counts its payment months as the term** for the low-month count (random I44 cases with
  every-2-to-12-month cadences). No approved case has one.
- **The app builder passes no pay arrivals beyond the records.** FIN-15 and the steady low-pay months read the pay lines linked to
  the pay series; a pay logged without its series link is not read (05.5 builder).

## Found in 05.4-24 (FIN-09 / ENG-05 / UX-02)
- **Two bases for the month figure in the approved cases.** BR-06 (approved -$300) reads the account at month end (October's
  overdraft carried); OD-04, QE-09 and QE-11 read this month after its plans (D-22). The engine reads D-22, so BR-06 stays in
  knownRed under FIN-09 until the owner answers (05.4-24 owner question 2).
- **QE-11 / QE-12 usual month:** the cases' payment £202.52 (interest from the day of buying) against the schedule's £200.86 (a first
  payment less than one period away is paid before any interest). Same item as 05.4-22's schedule note; no plan owns it. knownRed FIN-09.
- **RC-10's code and figure:** the case counts the whole £1,500 free as this month's money (Fits, £50 left); the engine reads this
  month after its plans as £687.10 and the rest as spare money (Fits from spare money, £0 this month). knownRed FIN-09, owner question 4.
- **Plans' month figure in the random crosscheck:** plans stay out of the whole-code comparison (BO-05), so the plain plan figure
  (deposit, fees and payments dated this month) is checked only by the approved cases and I64. Compare it when BO-05 lifts.
- **audit.json is keyed by corpus key:** the 130 FIN-09 boxes replace 92 boxes from earlier fixes, so rebuilding an older fix's page
  (--page FIN-05) now shows the FIN-09 box. Earlier pages are in the scratchpad copies.
- **Screens (08.1):** Decide Home shows homeFigure; the answer shows afterBuy with its lead (a plan leads with the usual month) and the
  Over lines below 0; earlier_money_from under the figure.
- **D-86 (FIN-09b) reads the opening balance from this month's lines.** Spending that is not logged, or card spending logged as
  spending but not yet out of the checking account, shifts the opening balance by that much. Under-logged spending can look like an
  overdraft carried in (which errs toward caution); card spending not yet paid can hide one. The 05.5 month picture, which knows which
  account each line hits, is the place to make it exact.
- **The month figure sets aside a card or loan minimum even when the balance is already paid off** (debtsInMonth does not read the
  balance; pre-existing). D-86's opening balance reads such a minimum as gone too, so no false overdraft appears; the month figure
  itself is for the owner of the month picture (05.5).

## From 05.4-25 (FIN-27)

- **A guard regex holds backspace characters (pre-existing, not fixed):** src/i18n/__tests__/decideCopy.test.ts, the "no advice,
  recommend or you should" check near the investing copy, is `/<BS>advice<BS>|recommend|you should/i` with two raw 0x08 bytes
  instead of `\b`, so its "advice" part never matches anything. The broader BANNED and catalogue guards still catch the word. A
  one-line fix for the D-15 copy review.
- **App users in the US and Canada see "Tax not included" until 05.4-35 wires the state or province.** The snapshot builder passes
  only the country (V3Inputs.region); V3Inputs.regionSubdivision is new and nothing sets it yet (profiles.region_subdivision,
  CONTEXT Claude's discretion). The engine is ready; src/features/decide/snapshot is not touched here (plan rule).
- **Countries outside D-18 (US, Canada, UK, EU) read as unknown** and get "Tax not included. Set your region to add it.", including
  places whose shop prices already include tax (Australia, Norway, Switzerland). Adding them is a new row in tax/lookup.ts.
- **The CMP-F24 disclaimer and the example-rate label are copy keys only** (decide.v3.tax.disclaimer, decide.v3.tax.exampleRate);
  where they show is 08.1.
