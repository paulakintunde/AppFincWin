// 05.3-09b: part B keys that open with an imperative verb. Each carries its reason.
export const UI_ACTION_KEYS_B: readonly string[] = [
  'decide.v3.ui.refine.keepAmount', // button: "Keep {{amount}}" (keeps the user's own figure)
  'decide.v3.ui.refine.keepIt', // button: "Keep it" (keeps the user's own figure)
  'decide.v3.ui.worked.pay', // row label: "Pay (regular, date)" names the income line, a noun, not an order
];
export const UI_CONTROL_KEYS_B: readonly string[] = [
  'decide.v3.ui.refine.changeIt', // button: "Change it" (opens the figure for editing)
  'decide.v3.ui.instead.enterRate', // hint on the deposit row: "Enter a rate to see it"
];
