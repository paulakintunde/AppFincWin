---
status: resolved
trigger: "Phase 02.1 walkthrough step 9b (Pixel, production data): no-balances.pdf imported into 'Checking test' (opening_balance 100000, one paid -10000 row on 2026-02-01); entered Closing balance 2021.70 -> ALL 10 rows show Can't verify; expected 9 verified, only the ambiguous-column row Can't verify (gate count 1)."
created: 2026-10-11
updated: 2026-10-11
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "Every row reads cannot-verify because the PDF reader gives LITWARE BOOKS (18.50, no column, no running balance) no sign, convertDraft reads 'none' as money in (+1850), and a balance-less file is checked only end to end, so the file is 3700 off the bank's closing and reconcile marks all rows cannot-verify."
  confirming_evidence:
    - "Regression test with real db readers + useAccountBalances over a fake Supabase client: 2021.70 -> 0 verified; 2058.70 (90000 + 115870) -> 9 verified, gate 1."
    - "reconcile(): no anchors + both ends -> sum mismatch -> every row 'cannot-verify', file 'ends-only-mismatch'."
    - "no-balances.expected.json: LITWARE BOOKS is -1850; fixtures.test skips the amount check for ambiguous-column rows, and the plan-10 hook test typed 1208.70 = 5000 + 115870, baking in the +1850 reading."
  falsification_test: "If the opening were wrong, 2058.70 would also fail; it passes, so only the sign is wrong."
  fix_rationale: "When there is no running balance and both ends are known, and exactly one line's sign is open, the ends decide it: turn that line only when the file fails as read and ties the other way round. The line keeps pdf-ambiguous-column so it is still reviewed (gate 1), and its stored amount becomes the true -1850."
  blind_spots: "More than one open-sign line is left alone (2^k search not attempted); the in-app balances query is assumed loaded by review (it is the same query the Accounts screen shows)."

status: fix applied and verified locally; awaiting device re-run of walkthrough step 9b.

## Symptoms

expected: stored opening = 100000 - 10000 = 90000; 90000 + 112170 = 202170 = entered closing -> 9 rows verified, ambiguous-column row Can't verify, gate count 1.
actual: all 10 rows Can't verify.
errors: none
reproduction: import no-balances.pdf into a checking account with opening 100000 and one paid -10000 row before 2026-03-03, use the reading, enter 2021.70 at "Add a balance to check against", Check balance.
started: Phase 02.1 plan 10 (D-24 entered closing balance).

## Evidence

- timestamp: 2026-10-11
  checked: useStatementImport.goReview stored-opening path, useAccountBalances, fetchHasRowsBefore/After
  found: storedOpeningForFile = balances.get(accountId).balance, which is accountBalance({openingBalance: account.opening_balance, legs from account_balances RPC}) = 100000 + (-10000) = 90000. fetchHasRowsBefore('2026-03-03') true (row 2026-02-01), none inside, fetchHasRowsAfter('2026-03-30') false. preparePdfDrafts fills periodStart/End from row dates before goReview runs.
  implication: the opening is 90000 as expected; the opening read is not the defect (unless the balance query had not loaded).

- timestamp: 2026-10-11
  checked: existing hook test 'an entered closing balance verifies a period-less PDF against the stored balance' and toDraft.headerlessAmount / fixtures.test
  found: the test enters 1208.70 = 5000 + 115870, i.e. it bakes in the ambiguous row read as +1850 ("read as money in"). The fixture test skips the amount check for pdf-ambiguous-column rows; expected.json says the true amount is -1850. headerlessAmount returns marker 'none' (-> positive) with pdf-ambiguous-column when there is no balance to pick by.
  implication: the passing test encodes the wrong sign; a user typing the bank's real closing (2021.70) is 3700 = 2 x 1850 away and the whole file fails.

- timestamp: 2026-10-11
  checked: new regression test useStatementImport.closingBalance.test.tsx (fake Supabase client: account_balances RPC leg paid_sum -10000, transactions_active row 2026-02-01 -10000; real db readers, real useAccountBalances, opening_balance 100000) entering 2021.70
  found: FAILS -- 0 verified, every row cannot-verify (reproduces the device). Same test entering 2058.70 (= 90000 + 115870) PASSES with 9 verified + gate 1.
  implication: confirmed -- the stored opening is 90000; the 3700 gap is exactly the ambiguous row read as +1850 instead of -1850. reconcile with no running balances compares only sum vs closing - opening and marks every row cannot-verify on a mismatch ('ends-only-mismatch').

## Eliminated

- hypothesis: the stored opening excludes accounts.opening_balance or the -10000 row (or the period fill runs after the opening is decided)
  evidence: the closing 2058.70 = 90000 + 115870 verifies through the real useAccountBalances path, so the opening used is exactly 90000; preparePdfDrafts fills the period before goReview.
  timestamp: 2026-10-11

## Resolution

root_cause: Not the stored opening (it is 90000 = opening_balance 100000 + the -10000 row, read through account_balances). The PDF reader cannot place LITWARE BOOKS' 18.50 (no debit/credit column, no running balance), so it carries marker 'none' + pdf-ambiguous-column and converts as money in (+1850). The file then nets +115870 instead of the bank's +112170. With no running balances the reconcile is end-to-end only, so 90000 + 115870 = 205870 != 202170 fails the whole file ('ends-only-mismatch') and every row reads cannot-verify. The plan-10 hook test passed only because it typed a closing (1208.70 = 5000 + 115870) computed from the wrong +1850 reading, with useAccountBalances mocked to a flat 5000.
fix: New pure engine function signToTurn (src/engine/statement/pdf/signFromEnds.ts): given converted amounts, which lines have an open sign, and the opening/closing, returns the single open-sign line to turn when the file does not tie as read but ties with that line reversed; null otherwise (file already ties, 0 or 2+ open lines, neither sign ties, a missing end or amount). buildPreview applies it for PDF drafts with no running balance anywhere (no balance and no availableSigned on any row), before reconcile, flipping the line's amount (and its foreign original). The line keeps pdf-ambiguous-column, so applyUncertainRows still marks it cannot-verify and the review gate counts it.
verification: New hook regression test (fake Supabase client at the client level; real db readers, useAccountBalances, pipeline, engine) goes red -> green: 2021.70 gives 9 verified, LITWARE BOOKS cannot-verify with amount -1850, file 'partial', gate {required: true, count: 1}; a closing tying neither sign still verifies nothing (gate 10). Engine unit tests for signToTurn cover every branch including bigint exactness near 1e13. Existing plan-10 test (1208.70, ties as read) unchanged and green. Gate: typecheck clean, lint 0 errors, depcruise clean (382 modules), full jest --coverage --ci --forceExit 249 suites / 6638 tests passed, thresholds held (all files 95.28 stmts / 89.88 branches; signFromEnds.ts 100%). Fix commit 4cbed89, failing-test commit d805503.
files_changed: [src/engine/statement/pdf/signFromEnds.ts, src/engine/statement/pdf/index.ts, src/engine/statement/pdf/__tests__/signFromEnds.test.ts, src/features/record/import/importPipeline.ts, src/features/record/import/__tests__/useStatementImport.closingBalance.test.tsx]
