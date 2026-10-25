from pe import edit
edit('05-68-PLAN.md', [
('depends_on: ["05-54", "05-55", "05-58", "05-61"]', 'depends_on: ["05-54", "05-55", "05-58", "05-61", "05-80"]'),
("    - the cardMinimum ⓘ inside CardMinimumSheet opens its InfoSheet stacked over the card terms sheet (rendered inside it)",
 "    - the cardMinimum ⓘ inside CardMinimumSheet opens its InfoSheet stacked over the card terms sheet (rendered inside it); the sheet's \"Paid in full monthly\" toggle carries the `paidInFullMonthly` ⓘ (R15.8, key from 05-80)"),
("`it('D-70 the card terms sheet and the minimum payment row carry cardMinimum')`",
 "`it('D-70 the card terms sheet and the minimum payment row carry cardMinimum')`, `it('D-84 Paid in full monthly carries its ⓘ')`"),
])
edit('05-84-PLAN.md', [
("  - src/features/decide/check/steps/Step2PriceAndPay.tsx\n", "  - src/features/decide/check/steps/Step2PriceAndPay.tsx\n  - src/features/decide/check/LineEditorSheet.tsx\n"),
("  <files>src/features/decide/check/steps/step2/PaymentMethods.tsx, src/features/decide/check/steps/step2/MethodPanels.tsx, src/features/decide/check/steps/Step2PriceAndPay.tsx,",
 "  <files>src/features/decide/check/steps/step2/PaymentMethods.tsx, src/features/decide/check/steps/step2/MethodPanels.tsx, src/features/decide/check/steps/Step2PriceAndPay.tsx, src/features/decide/check/LineEditorSheet.tsx,"),
("    - Step2PriceAndPay.test.tsx and depthStep2.test.tsx move",
 "    - LineEditorSheet: \"Takes off the price\" carries the `tradeIn` ⓘ (R15.8 Where column), stacking over the editor sheet\n    - Step2PriceAndPay.test.tsx and depthStep2.test.tsx move"),
])
