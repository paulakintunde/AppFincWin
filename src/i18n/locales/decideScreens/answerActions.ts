/**
 * 06.1-05 (D-18): the answer action bar and what it opens: Save for it (N18), Goal made (N18S), the amount sheet (D64),
 * I bought it (N19 / D63), Added to records (N19S) and "I’m not buying it". Owner plan: 26. Draft copy, signed under D-08.
 * Nothing here moves money: the goal lives in Grow (D-22) and "I bought it" only updates the records.
 */
export const answerActions = {
  bar: {
    bought: 'I bought it',
    saveForIt: 'Save for it',
    notBuying: 'I’m not buying it',
    notBuyingToast: 'Marked as not buying.',
  },
  goal: {
    title: 'A goal for {{item}}',
    sub: 'A savings goal in Grow, linked to this check.',
    monthly: '{{monthly}} a month',
    toGo: '{{amount}} to go',
    readyBy: 'Ready by {{readyMonth}}',
    noReadyDate: 'No ready date yet. The amount is spread over twelve months.',
    // 06.1-82 (G-61-10): the engine's ready date is today, so there is no date to save towards. For plan 33's wording sign-off.
    fitsNow: 'The money for it is there today. The amount is spread over twelve months.',
    upFrontOnly: 'Only the up-front part is saved for.',
    make: 'Make the goal',
    changeAmount: 'Change the amount',
  },
  goalMade: {
    title: 'Goal made',
    body: 'The goal for {{item}} is in Grow. The check now waits for it.',
    seeInGrow: 'See it in Grow',
    toast: 'Goal made: {{item}}.',
  },
  // 06.1-63 (CS-9, CF-6): whether the ready-date reminder was set, and a save that failed.
  save: {
    reminderSet: 'Reminder set for {{date}}.',
    reminderOff: 'Reminders are off.',
    failed: 'The goal wasn’t made. Nothing changed.',
  },
  amount: {
    title: 'How much a month?',
    sub: 'A larger amount reaches the goal sooner.',
    reached: 'Reached {{readyMonth}}',
    usualLeaves: 'what a usual month leaves',
    moreThanUsual: 'more than a usual month leaves',
    use: 'Use this amount',
    useAmount: 'Use {{amount}} a month',
    optionA11y: '{{amount}} a month, reached {{readyMonth}}',
  },
  bought: {
    title: 'Record as bought',
    sub: 'This updates FincWin. No payment is made and no money moves.',
    lookBack: 'In 3 months, Your decisions asks if it cost what you expected.',
    save: 'Record purchase',
    account: 'Paid from',
    amountRow: 'Amount',
    dateRow: 'Date',
    planRow: 'Payments',
    // 08.1-09 (UI-SPEC 5): the date line and the tick rows. Draft copy, signed under D-08.
    boughtOn: 'Bought on {{date}}.',
    // 06.1-83: one / many forms, so a single payment never reads as 1 payments.
    planSummary_one: '{{up}} up front, then one payment',
    planSummary_other: '{{up}} up front, then {{count}} payments',
    noAccount: 'An everyday account is needed to add this to your records.',
    loadingAccounts: 'Loading your accounts…',
    groupCosts: 'Costs that start',
    groupMoney: 'Money in and out',
    groupStops: 'Costs that stop',
    groupGoal: 'Your goal',
    rowFixed: '{{name}}, {{amount}} a month',
    rowVaries: '{{name}}, about {{amount}} a month',
    subVaries: 'Counts until real spending replaces it',
    rowSale: 'Money in from selling {{item}}, {{amount}}',
    rowPayoff: 'Pay off {{debt}}, {{amount}}',
    rowStop: '{{bill}} stops from {{date}}',
    rowGoal: 'Close the goal {{goal}}',
    subGoal: 'It can stay open.',
    oldOne: 'the old one',
    rowFallback: 'Running cost',
    stateOn: 'ticked',
    stateOff: 'not ticked',
    toast: 'Recorded: {{item}}.',
  },
  added: {
    title: 'Recorded',
    body: '{{item}} is in your records, bought {{date}}.',
    undone: 'Undone. Nothing was added.',
  },
} as const;
