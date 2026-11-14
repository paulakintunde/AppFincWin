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
    // 06.1-66 (CB-7, A-ANS-4): the payday chip shows its short date; the screen reader hears what the date is.
    whenPaydayA11y: 'Next payday, {{date}}',
    optionsA11y: 'Other ways to look at it',
    actionsA11y: 'What you did with this answer',
    helpLinkA11y: '{{name}}. Opens a website outside the app',
  },
  /** 06.1-49 (A-ANS-2): shown from Check it until the answer is worked out. */
  loading: 'Working out the answer…',
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
    sub: 'What would give this answer more to go on.',
    nextTitle: 'Next step',
    readinessTitle: 'In your records',
    missingTitle: 'Missing figures',
    // 06.1-67 (H-6, CS-4): the one inline line on an answer with missing figures; its More opens this sheet with the full list.
    // "Remind me on {{date}}" was removed (FQ9) and returns with the reminders work.
    missingShort_one: 'One figure is missing.',
    missingShort_other: '{{count}} figures are missing.',
    none: 'Nothing is missing from your records right now.',
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
  // 06.1-23: a missing figure named inside "To compare with saving up, add {{figure}}." (save_vs_borrow ask), by MissingCode.
  figureName: {
    no_income_figures: 'your income figures',
    unspent_not_confirmed: 'your spare money',
    records_look_behind: 'your latest records',
    no_price: 'a price',
    price_too_large: 'a smaller price',
    plan_count_missing: 'the number of payments',
    first_payment_not_chosen: 'the first payment date',
    pause_interest_not_answered: 'whether interest runs during the pause',
    plan_rate_missing: 'the plan’s rate',
    everyday_unknown: 'your everyday spending',
    legacy_invest_check: 'this check again',
    share_invalid: 'your share',
    income_pattern_unconfirmed: 'how your income arrives',
    expected_income_needed: 'your expected income',
    first_payment_passed: 'a first payment date still ahead',
    volatile_cover_question: 'your answer about low months',
    unexplained_money_question: 'what the unexplained money is for',
    account_use_question: 'what the account is used for',
    pay_arrival_question: 'when your pay arrives',
  },
  notReady: {
    // 06.1-66 (OQ-66-1, DN-10): no count. Decide finds some items only after earlier ones are done, so the card names the first
    // item and says more may follow.
    title: 'Not ready yet',
    first: 'First: {{item}}',
    moreMayFollow: 'More may follow once this is done.',
    // 06.1-66 (FQ6): the second exit on the Not ready page, with Undo.
    deleteCheck: 'Delete this check',
    finishSetup: 'Finish setup',
    fromEstimates: 'Answer from quick estimates',
    item: {
      pay: '{{name}}, {{amount}} on {{date}}, isn’t in your records yet.',
      payNoName: 'Income of {{amount}} on {{date}} isn’t in your records yet.',
      bill: '{{name}}, {{amount}} due {{date}}, isn’t in your records yet.',
      billNoName: 'A bill of {{amount}} due {{date}} isn’t in your records yet.',
      spending: 'No everyday spending is recorded for {{monthName}} yet.',
      spendingNow: 'Nothing spent is recorded since {{date}}.',
      lateStart: '{{monthName}} isn’t fully recorded yet.',
    },
    fix: {
      records: 'Records for {{monthName}}',
      envelope: 'Which account?',
    },
    choice: {
      markSkipped: 'It didn’t happen',
      didntHappen: 'It didn’t happen',
      paidByOther: 'Someone else paid it',
      alwaysOther: 'Someone else always pays it',
      noPay: 'No pay that time',
      incomeElsewhere: 'Income comes in elsewhere',
      nothingToAdd: 'Nothing more for {{monthName}}',
      startFrom: 'Records begin in {{monthName}}',
    },
    saved: 'Answer saved.',
  },
  // 06.1-68 (H-7, CB-11, CF-2): an answered readiness row reads this at once, with its choices off, until the engine agrees.
  // DS-1: a goal row says it is a Grow goal; why it matters sits behind the shared Why? link (06.1-59 WhyLine).
  readiness: {
    savedUpdating: 'Saved, updating…',
    goalNoAccount: '{{envelope}} (a Grow goal) has no account yet.',
    goalNoAccountNoName: 'A Grow goal has no account yet.',
    goalWhy: 'Decide sets goal money aside before it answers, so it needs the account that holds it.',
  },
  // 06.1-68 (CF-3): shown over the dimmed verdict while it is worked out again.
  updating: 'Updating…',
  // 06.1-68 (CF-4, CC-8): the answers given under a fact line, each with Undo.
  fact: {
    noneSaved: 'Saved: no other debts.',
    coverChanged: 'Answer changed.',
  },
  // 06.1-66 (FQ8, CC-2): a decided check shows what happened and links to its entry in Past decisions; no buy or save buttons.
  outcome: {
    bought: 'Bought on {{date}}.',
    waiting: 'Saving for it since {{date}}.',
    passed: 'Not buying, {{date}}.',
    pastLink: 'See it in Past decisions',
  },
  // 06.1-66 (FQ5, CS-8): the safety-net question was put away unanswered; this line opens it again.
  netLine: 'Safety net: not answered yet.',
  worked: {
    title: 'How this was worked out',
    sub: 'From your own records. Nothing here is a guess about you.',
    balanceOn: 'Balance on {{date}}',
    afterBills: 'After bills due before payday',
    expectedEnd: 'Expected at month end',
    sources: 'Sources',
    payAndBills: 'Pay and bills',
    netAndGoals: 'Safety net and goals',
    rules: 'Your money rules',
    unusedOverdraft: 'Unused overdraft',
    notCountedAbove: 'Not counted above',
    range: '{{from}} to {{to}}',
    fromActivity: 'Activity',
    fromGrow: 'Grow',
    locked: 'Locked',
    unlocked: 'Unlocked',
    recordsDate: 'Based on records up to {{date}}.',
    rulesCount_one: 'Decide · {{count}} rule',
    rulesCount_other: 'Decide · {{count}} rules',
  },
  help: {
    title: 'Money help at no cost',
    sub: 'Independent services. Not a loan, and not part of FincWin.',
    note: 'FincWin is not paid by these services. Opening one leaves the app.',
    openA11y: 'Open {{name}}. Leaves the app',
    none: 'No service is listed for your country yet.',
  },
  about: {
    entry: 'About Decide answers',
  },
} as const;
