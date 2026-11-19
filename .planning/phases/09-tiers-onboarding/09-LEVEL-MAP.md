# Phase 9 level-to-feature map (D-32)

Phase 9 level-to-feature map (D-32). Draft for owner sign-off.

Signed: (owner fills: name, date)

Plain words first. This file says which feature turns up at which level. A person starts at the level their answers give. They can turn any feature on or off later in You > Features. A feature that already holds their records never hides (D-34). Decide is not in this table: it shows at every level, and its parts (debts, goals, safety net, repeating bills) stay reachable from Decide (D-33).

How to sign: move any feature to another level (change the `minLevel` number, 1 to 4), answer the yes/no list in section 5, then write your name and date on the `Signed:` line above.

## 1. The four levels

| level | name | sentence (draft, owner may edit) |
|---|---|---|
| 1 | Basics | Money in and out, categories, one account, a month at a time. |
| 2 | Everyday | Adds several accounts, category caps, goals, repeating bills and alerts. |
| 3 | Full picture | Adds debt payoff, investments, reconciliation and other currencies. |
| 4 | Everything | Adds the archive, undo history and every part of Decide. |

Level names are fixed (D-32). The sentences are drafts. "Alerts" and "the archive" are Phase 10 and are not rows yet, so the sentences for Everyday and Everything mention them for the day they land.

## 2. Feature table (every feature that is built in this repo)

Columns: feature id, area, label, one-line sub, level it appears at, needs a household, the "holds your records" probe (D-34), what the setup answers do (ported from the prototype `applyOnb`), and where the code lives.

| feature_id | area | label | one-line sub | minLevel | needsHousehold | holdsData probe | onboarding trigger (applyOnb) | evidence path |
|---|---|---|---|---|---|---|---|---|
| moneyInOut | Recording | Money in and out | The entry sheet and the Activity list | 1 | no | none | always on | src/features/record/entry |
| categories | Recording | Categories | Sort every line into a category | 1 | no | none | always on | app/(app)/categories.tsx |
| search | Recording | Search | Find a line by name inside the month | 1 | no | none | always on | src/features/record/activity/SearchBar.tsx |
| monthView | Recording | A month at a time | Switch months, and add new ones | 1 | no | none | always on | src/features/record/activity/MonthSwitcher.tsx |
| balances | Accounts | Balances and net worth | What each account holds, added up | 1 | no | none | always on | app/(app)/accounts/index.tsx |
| recurring | Recording | Repeating bills | Marks what comes back every month and spots new ones | 2 | no | exists recurring_series row not deleted | none | src/db/recurringSeries.ts |
| cloneMonth | Recording | Clone a month | Copy last month's repeating lines into this one | 2 | no | none | none | src/features/record/activity/CloneMonthSheet.tsx |
| refunds | Recording | Refunds | Money back on a purchase, netted off the category | 2 | no | exists refund link not deleted | none | src/data/mutations/refundLinks.ts |
| bulkSelect | Recording | Select several | Tag, move or delete a batch at once | 3 | no | none | none | src/features/record/activity/BulkBar.tsx |
| searchAllMonths | Recording | Search every month | Look across the whole ledger, not just this month | 4 | no | none | none | app/(app)/history.tsx |
| multiAccount | Accounts | Several accounts | Assign each line to an account | 2 | no | more than one active account | none | app/(app)/accounts/index.tsx |
| transfers | Accounts | Transfers | Move money between your own accounts | 2 | no | exists transfer row not deleted | none | src/data/mutations/transfers.ts |
| reconcile | Accounts | Reconcile | Tick off against a statement and find the gap | 3 | no | exists statement_periods row | none | src/features/record/import/ReconcileChoice.tsx |
| multiCurrency | Accounts | Other currencies | Enter in any currency, convert to your home one | 3 | no | exists account or line with a currency other than home | cur differs from home currency: on | src/db/customCurrencies.ts |
| caps | Planning | Category caps | A monthly ceiling per category | 2 | no | exists category with a cap | goal = stop: on | src/db/categories.ts |
| comingUp | Planning | What is coming | The next unpaid lines, on the home screen | 2 | no | none | none | src/features/home/ComingUpCard.tsx |
| goals | Grow | Savings goals | A target, a monthly amount and a date | 2 | no | exists savings_goals row not deleted | goal = save, or save question answered: on | src/db/savingsGoals.ts |
| goalContributions | Grow | Saving into a goal | Move an amount into a goal each month | 2 | no | exists goal contribution not deleted | goal = save, or save question answered: on | src/db/goalPlan.ts |
| debts | Grow | Debt | Balances, rates and minimums | 3 | no | exists debts row not deleted | goal = debt, or debt answer is not nothing: on | src/db/debts.ts |
| payoffPlan | Grow | Payoff planner | Pick an order to clear debts, and compare scenarios | 3 | no | exists debt_plan row | goal = debt, or debt answer is not nothing: on | src/db/debtPlan.ts |
| investing | Grow | Investments | Holdings and what they are worth | 3 | no | exists holdings row not deleted | investments answer is some or lots: on | src/db/holdings.ts |
| lots | Grow | Cost basis and lots | Every buy, sale, dividend and fee, with gain and loss | 4 | no | exists holding_lots row not deleted | investments answer is lots: on | src/db/holdingLots.ts |
| growthIllustration | Grow | Growth illustration | See what a saving or holding could grow to | 3 | no | none | none | app/(app)/grow/calculators/illustration.tsx |
| calculators | Grow | Calculators | Loan, savings, payoff and growth maths | 3 | no | none | none | app/(app)/grow/calculators/index.tsx |
| import | System | Import and paste | Bring in a list or a statement | 3 | no | exists import profile or imported line | none | src/features/record/import/PasteSheet.tsx |
| pdfImport | System | Read a PDF statement | Bring in a statement from a PDF | 3 | no | none | none | src/services/statementPdf/readPdf.ts |
| undoHistory | System | Undo history | Roll back one of your recent changes | 4 | no | none | none | src/data/mutations/undo.ts |
| hh.weightSplit | Sharing | Split by weight | Split a line by shares, such as 60 / 40 | 2 | yes | exists weight split on a line | sharing answer is not no: on | src/config/householdFeatures.ts |
| hh.amountSplit | Sharing | Split by amount | Split a line by exact amounts | 2 | yes | exists amount split on a line | sharing answer is not no: on | src/config/householdFeatures.ts |
| hh.categoryDefaults | Sharing | Category split rules | Groceries by weight, dining even, applied as you type | 2 | yes | exists category default split rule | sharing answer is not no: on | app/(app)/household/category-defaults.tsx |
| hh.sharedAccounts | Sharing | Shared accounts | Accounts the household sees together | 2 | yes | exists shared account | sharing answer is not no: on | app/(app)/household/shared-accounts.tsx |
| hh.settleUp | Sharing | Settle up | Writes the payment and locks the lines it covers | 2 | yes | exists settlement row | sharing answer is not no: on | src/db/settlements.ts |

Other prototype triggers that find no built feature, so nothing is switched on for them:
- income shape lumpy or mixed would switch on "forecast": dropped, not built as a separate feature (Decide owns forecasting).
- alerts answer "Not at all" would switch alerts off: dropped, alerts are Phase 10 (the answer is still stored for then).
- the prototype's claims question: dropped, that question is removed (D-26).

How the level is worked out (prototype `levelFor`, with tax removed): "Keep track" gives Basics, "Stop overspending" and "Save for something" give Everyday, "Clear debt" and "Run a business" give Full picture, owing anything gives at least Full picture, some investments gives at least Full picture, lots of investments gives Everything, and lumpy income gives at least Full picture. Skipping every question lands on Everyday (D-27). The planner flags that the prototype numbers levels 0 to 3 and the app numbers them 1 to 4.

## 3. Counts (the Features screen reads these)

32 features are listed. A level turns on every feature at that level or below.

- Basics: 5 of 32 on
- Everyday: 19 of 32 on
- Full picture: 29 of 32 on
- Everything: 32 of 32 on

The five household rows count at Everyday. Without a household they show "Not on for your household" and stay off, so a person with no household sees fewer on than the count.

## 4. Not listed (and why)

| Name | Reason |
|---|---|
| Receipts | Not built. Nothing to switch. |
| Round-ups | Not built. |
| Widgets | Not built. |
| Bank link | Cut from v1, parked for v1.1 (Plaid). |
| Tax pack and tax question | Question removed (D-26), feature never built. |
| Licence and devices | Not built, and not a feature the app offers. |
| Coach | Parked as backlog 999.4 (D-25). Its Home quick action stays hidden. |
| Alerts | Phase 10 builds them. The row appears then. |
| Archive | Phase 10 builds it. The row appears then. |
| Price feed | Not built. |
| Read-only summary link | Deferred (HH-12). |
| Export | Always open at every level and every plan (it is a You row, not a feature switch). |
| Decide and its parts | Visible at every level (D-33). |

## 5. Open for the owner (yes or no, plain English)

These prototype features have no clear built version. Answer each. A "no" means it is not listed. A "yes" means the planner checks what exists and lists it at the level in brackets.

1. Split one line across several categories. Not found as its own feature. List it if it exists? (Everything: yes / no)
2. Search every month. Marked as likely built (history screen). List it at Everything? (yes / no) It is already in the table above at level 4.
3. Stand-alone reconcile, outside the statement import. Only the import step exists. Keep "Reconcile" as one row at Full picture? (yes / no)
4. Chart modes (bars, share, blocks) on Insights. Only partly there. List them? (yes / no)
5. Health score, one figure for the month. Not found. List it? (yes / no)
6. Envelope rollover, unspent money carried to next month. Not found. List it? (yes / no)
7. Forecast, where the month ends if nothing changes. Decide owns this. Leave it out of Features? (yes / no)
8. Compare months. Not found. List it? (yes / no)
9. Cash flow by month. Not found. List it? (yes / no)
10. Extra views (by week, running balance, calendar). Not found. List it? (yes / no)
11. Year calendar. Not found. List it? (yes / no)
12. The five household rows: should they sit at Everyday (level 2), as drafted, or only turn on when someone answers that they share money? (Everyday / answer only)

Move any row above by editing its `minLevel`.
