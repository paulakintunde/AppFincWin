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
