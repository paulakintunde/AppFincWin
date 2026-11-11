/**
 * 06.1-05 (D-18): the answer frame extras (D20), the answer after the stepper (D21), Give it more to go on (N03), the missing,
 * offline and not-ready cards (N21-N24), How this was worked out (D57), money help (D65) and the About entry.
 * Owner plans: 14, 35, 23. Verdicts, facts, basis and caveats stay on decide.v3.* and legal.decide* (D-18).
 * Draft copy, signed under D-08. "surer" is replaced by "Give it more to go on" (CMP-F12).
 */
export const answer = {
  frame: {
    itemA11y: '{{name}}, {{price}}',
    payTabs: 'How you pay',
    whenGroup: 'When you buy',
    whenToday: 'Today',
    whenPayday: 'Next payday',
    optionsA11y: 'Other ways to look at it',
    actionsA11y: 'What you did with this answer',
    helpLinkA11y: '{{name}}. Opens a website outside the app',
  },
  payA11y: 'How you pay',
  whenA11y: 'When',
  editSteps: 'Edit steps',
  moreDetail: 'More detail',
  runningRow: 'Running costs',
  runningNone: 'none counted · Add',
  runningSome: '{{monthly}} a month · Change',
  monthAfter: 'Your month after buying',
  stops: 'Costs that stop when you buy',
  fullCost: 'Full cost, with tax',
  everyDate: 'Every date, next 90 days',
  monthByMonth: 'Month by month',
  asCheckedOn: 'As checked on {{date}}',
  options: {
    later: 'Buy later',
    cheaper: 'Cheaper one',
    installments: 'Installments',
    sideBySide: 'Cash and installments side by side',
  },
  told: {
    title: 'What you told Decide',
    kind: 'Kind',
    priceAndPay: 'Price and how you pay',
    upFrontCash: '{{amount}} up front, cash',
    onPlan: '{{monthly}} a month on a plan',
    running: 'Running costs',
    runningMonthly: '{{monthly}} a month',
    runningNone: 'none counted',
  },
  giveMore: {
    title: 'Give it more to go on',
    link_one: '{{count}} way to give it more to go on',
    link_other: '{{count}} ways to give it more to go on',
  },
  netLocked: {
    unlockLink: 'Unlock in safety-net settings',
  },
  onYourAnswer: {
    changeAnswer: 'Change my answer',
  },
  missing: {
    fix: 'Fix',
    fixA11y: 'Fix: {{item}}',
  },
  notReady: {
    title: 'Not ready yet',
    finishSetup: 'Finish setup',
    fromEstimates: 'Answer from quick estimates',
  },
  worked: {
    title: 'How this was worked out',
    sub: 'From your own records.',
    balanceOn: 'Balance on {{date}}',
    afterBills: 'After bills due before payday',
    expectedEnd: 'Expected at month end',
    sources: 'Sources',
    payAndBills: 'Pay and bills',
    netAndGoals: 'Safety net and goals',
    rules: 'Your money rules',
    rulesCount_one: 'Decide · {{count}} rule',
    rulesCount_other: 'Decide · {{count}} rules',
  },
  help: {
    title: 'Money help at no cost',
    sub: 'Independent services. Not a loan, and not part of FincWin.',
    note: 'FincWin is not paid by these services. Opening one leaves the app.',
    openA11y: 'Open {{name}}. Leaves the app',
  },
  about: {
    entry: 'About Decide answers',
  },
} as const;
