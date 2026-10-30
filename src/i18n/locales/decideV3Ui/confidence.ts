// 05.3 decide.v3.ui.confidence: UI-SPEC Answer (confidence sheet)
export const confidence = {
  level: { rough: 'Rough', fair: 'Fair', firm: 'Firm' },
  sheetTitle: 'How sure this answer is',
  a11y: '{{strength}}. Opens what this answer rests on.',
  close: 'Close',
  reason: {
    few_months: 'It is based on fewer than 3 months of records.',
    early_in_month: 'It is early in the month, so more spending could still come.',
    under_logged: 'This month looks lightly logged.',
    unsaved_changes: 'Some changes aren’t saved yet.',
    unspent_stale: 'Your unspent money was confirmed a while ago.',
    unspent_drifted: 'Your unspent money may be out of date.',
    rough_figures: 'It is worked out from figures you typed.',
    provisional_rates: 'An exchange rate used here is provisional.',
    no_setup: 'Decide setup isn’t finished yet.',
    user_said_cover: 'Part of it rests on your own answer.',
    pay_missed: 'An expected pay hasn’t arrived.',
  },
} as const;
