/**
 * 06.1-05 (D-18): shared Decide screen strings: buttons used on many screens, accessibility labels, the records line, and the
 * offline, error and field-error text. Owned by plan 05 only; later plans add keys to their own area file.
 * Draft copy, signed under D-08 (decide.screens is a locked root).
 */
export const common = {
  back: 'Back',
  close: 'Close',
  done: 'Done',
  cancel: 'Cancel',
  undo: 'Undo',
  next: 'Next',
  change: 'Change',
  remove: 'Remove',
  delete: 'Delete',
  newCheck: 'New check',
  backToDecide: 'Back to Decide',
  backToAnswer: 'Back to the answer',
  saveAndClose: 'Save and close',
  pickDate: 'Pick a date',
  whyWeAsk: 'Why we ask:',
  optional: 'optional',
  draft: 'Draft',
  quickEstimates: 'quick estimates',
  prefilled: 'pre-filled, not checked',
  recordsUpTo: 'Records up to {{date}}',
  cash: 'Cash',
  installments: 'Installments',
  name: 'Name',
  amount: 'Amount',
  howOften: 'How often',
  perMonth: 'a month',
  a11y: {
    back: 'Back',
    close: 'Close',
    stepProgress: 'Step {{step}} of 3, {{stepName}}',
    setupProgress: '{{count}} of 6 done',
    amountMonthly: '{{name}}, amount, {{amount}} a month',
  },
  offline: {
    title: 'Offline. Using records up to {{date}}.',
    retry: 'Retry',
    waiting: 'Changes wait until you are back online.',
  },
  error: {
    title: 'Couldn’t work this out',
    message: 'Couldn’t work this out right now. Your records are safe. Try the check again.',
    retry: 'Try the check again',
    retryA11y: 'Try the check again for {{item}}',
  },
  // Field errors are statements, never orders (2026-10-23 copy rule). Price errors use decide.v3.missing.no_price / price_too_large.
  fieldError: {
    noName: 'A name is needed.',
    amountAboveZero: 'The amount needs to be above 0.',
    rateRange: 'The rate goes from 0 to 30%.',
    lengthRange: 'The length goes from 1 to 120 months.',
    dayRange: 'The day goes from 1 to 31.',
  },
  // 06.1-52 (G-5): the NeedLine under a disabled button says what is still needed. Statements, never orders.
  need: {
    kind: 'A kind is needed to go on.',
    priceAboveZero: 'A price above zero is needed.',
    amount: 'No amount yet.',
    stillSaving: 'This check is still saving. It opens here once it is saved.',
    loading: 'Your records are still loading.',
  },
  toast: {
    added: 'Added: {{item}}.',
    removed: 'Removed: {{item}}.',
    deleted: 'Deleted: {{item}}.',
    saved: 'Saved: {{item}}.',
  },
} as const;
