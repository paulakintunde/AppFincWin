---
phase: 08-household
plan: 21
subsystem: household-ui
tags: [household, ui, balances, settle-up, notices, leaver, offline-refusal]
requires: [08-15, 08-17]
provides: [heroSentence, BalancesSection, PairSheet, SettleUpSheet, PendingSettlementCard, SettlementCards, NoticeSettleActions, ArrivedInSheet, DepartedBalancesCard, useDepartedLabel]
affects: [08-24, 08-25]
key-files:
  created:
    - src/features/household/settle/heroSentence.ts
    - src/features/household/settle/settleHelpers.ts
    - src/features/household/settle/BalancesCard.tsx
    - src/features/household/settle/PairSheet.tsx
    - src/features/household/settle/SettleUpSheet.tsx
    - src/features/household/settle/PendingSettlementCard.tsx
    - src/features/household/settle/ArrivedInSheet.tsx
    - src/features/household/settle/DepartedBalancesCard.tsx
    - src/features/household/settle/__tests__/heroSentence.test.ts
    - src/features/household/settle/__tests__/SettleUpSheet.test.tsx
    - src/features/household/settle/__tests__/PendingSettlementCard.test.tsx
  modified:
    - src/features/household/HouseholdHomeScreen.tsx
    - src/features/household/NoticesScreen.tsx
    - src/features/household/noticeText.ts
    - src/features/household/useMemberLabel.ts
    - src/features/household/__tests__/HouseholdHomeScreen.test.tsx
    - src/i18n/locales/household/settle.ts
requirements: [HH-07, HH-08]
completed: 2026-11-15
---

# Phase 8 Plan 21: Who owes whom and settling up Summary

The Household home now says who owes whom in one declarative sentence, lists a row per person with an open balance (members who left stay listed as "(left)"), and opens a pair sheet with every line behind the number. Settling up works for both sides (payer tells, receiver records or confirms), including the wave-6 owner answers: the leaver's "I paid", the receiver's card for a leaver proposal, no Undo once a party has left, the `settle_departed` notice, and online-only settle-ups.

## Commits
- d1088339: feat(08-21) hero sentence and settle copy (task 1, pure part)
- the second `feat(08-21)` commit on `hh/w8-c`: screens, sheets, notices, tests (task 1 screens and task 2)

## What was built
- `heroSentence(pairs)`: pure; one line for one person owing, "across N people" for several, both directions joined (owed to you first), "square" when nothing nets. Returns copy keys with raw values; the screen resolves names (resolver) and amounts (formatter).
- `BalancesSection` on the home (at the `{/* 08-21: balances */}` marker): hero sentence, "Not spendable until it arrives" when owed to you (ENG-25), a card of 64 px `Row`s (avatar, name through the resolver, "owes you" / "you owe", amount, a `StatusBadge status="pending"` "Waiting for Sam" / "Sam says they paid you" when a settle-up waits), the waiting / recent settle-up cards, and the pair and settle-up sheets. Hidden for a household of one with nothing owed.
- `PairSheet` (DetailSheet): total, "Lines behind this" with date, rule, paid by, your share (when you owe) and the signed amount, "Every amount traces back to these lines.", Settle up, Ask to settle up (once per 24 h; `too_soon` shows the time), and for someone who left: "Record $X received" / "Record that you paid" and Write off through a `ConfirmSheet` (danger "Write off" / "Keep it").
- `SettleUpSheet`: all open lines ticked, total from `settleUpTotal` (live region, 600 ms debounce through `useSettledLabel`), "Paid from" / "Arrived in" account picker, not-spending-or-income note, cross-currency note, `lines_changed` card with a Review step that must be tapped before the button works again, offline disabled with a plain message. Payer: waiting settle-up (`useProposeSettlement`, toast "Waiting for Sam"). Receiver: `useRecordReceived` (settles at once, toast with Undo). Someone who left: `useRecordPaid` / `useRecordReceived`.
- `PendingSettlementCard` / `ReceiverActions` / `ArrivedInSheet`: payer view with day 7 / day 14 words and Cancel; receiver view with "Yes, I got $84" (opens the account list, then Confirm, `hapticTap`) and "Not yet"; the two answers stack at font scale 1.3 and above; confirmed within 24 h shows Undo only while both people are still members (`party_left`); lapsed shows a `behind` badge "Lapsed". A leaver's proposal (payer no longer a member) says only the account you pick is updated.
- `DepartedBalancesCard` (leaver side): "You owe Sam $40.00 from Flat 4B" rows from `my_departed_balances`, read-only, with an "I paid" entry (`useProposeLeaverPayment`) that turns into "Waiting for Sam to confirm $40.00" from `pending_settlement_id` / `pending_amount`.
- Notices: `NoticeSettleActions` gives a `settle_request` Yes / Not yet, a `settled` notice with `needs_account` the "Which account did it leave?" picker (`useSetSettlementPayerAccount`), and `settle_ask` "Settle up with Sam". `noticeText` renders `settle_departed` in its own words (left / removed / deleted).
- Settlement records are transfers: the sheet says "This moves money between accounts. It is not spending or income." and no copy says FincWin moves money (grep on the copy file is clean).

## Verification
- `npx tsc --noEmit`: clean. eslint on `src/features/household`, `src/i18n/locales/household`, `app`: clean.
- jest (targeted, each run alone): `src/features/household/settle` (heroSentence 6, SettleUpSheet 7, PendingSettlementCard 6), `HouseholdHomeScreen` (incl. 4 balances tests and the `settle_departed` notice), `householdCopy`, `hapticNames`, `memberNameOnly`, `useMemberLabel`, `noRawColours`: all pass. No full suite, no database.

## Deviations from Plan
1. [Rule 3] `useDepartedLabel` added to `useMemberLabel.ts` (not in the plan's file list). The leaver's balance rows carry the other person's name column and the D-32 guard test forbids reading it outside the resolver; the leaver is no longer in that household, so the member list cannot resolve it. Same pattern as 08-16's `useMemberSeen`.
2. [Rule 3] `noticeText.ts` gets one `settle_departed` case (not in the plan's file list). Without it the owner-answer-10 notice fell to the generic fallback sentence.
3. [Rule 3] Two small helper files not in the plan: `settle/settleHelpers.ts` (turns a traced `PairLine` into the engine's input, undo-window and waiting checks, the money/account hook, refusal words) and the existing `HouseholdHomeScreen.test.tsx` gained mocks and five tests.
4. Line amounts in the settle-up list are "+$42.00" / "-$42.00" words in `ink` (the shared `CheckRow` draws its amount in ink; the plan's accent for "owed to you" is shown in the pair sheet, not in the tick list).
5. The departed balance row has no currency, and the leaver cannot read the old household, so amounts use the currency of the household the leaver is in now (see Known limits).
6. Tasks 1 and 2 are committed as two commits, but task 1's components import task 2's sheets, so only the second commit compiles on its own.

## Known limits (needs a follow-up, flagged for the owner)
- **Leaver "I paid" cannot name its lines reliably.** `propose_leaver_payment` needs the exact line ids and the server compares them with `hh_pair_owed`; a leaver cannot read the old household's lines. The card sends the original ids remembered on the leaver's own personal copies (`copied_from`). That matches only when every copied line is open between the two people (a household of two with nothing settled yet). Otherwise the server answers `lines_changed` and the card says "These lines couldn't be matched from here. Ask Sam to record it." A server change would fix it: have `my_departed_balances` return `line_ids` for each row (08-14 follow-up).
- **Currency of the departed balance** is not in the `my_departed_balances` row; it should carry `currency` too.
- Settle-ups are online-only by design; offline shows "Settling up needs a connection. Nothing is saved until you are back online." and nothing is queued.
- Tests do not cover haptic feel or real-device keyboard behaviour (08-VALIDATION manual rows).

## Known Stubs
None.

## Threat Flags
None. All settlement calls go through the 08-15 online-only hooks; the server recomputes amounts and checks roles (T-08-74, T-08-75, T-08-76). Copy grep for "transfer", "pays for you", "we move", "fincwin pays" is clean (T-08-77).
