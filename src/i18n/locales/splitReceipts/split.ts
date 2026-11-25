// 10.1-07: UI-SPEC Copywriting Contract (approved 2026-11-24), minus the online-reading keys removed by D-18.
export const split = {
  title: 'Split {{name}}',
  note: 'One line, several categories. The parts have to add up to {{total}}.',
  part: {
    categoryTitle: 'Category for part {{n}}',
    remove: 'Remove part {{n}}',
    countsAsSaving: 'Counts as saving',
    countsAsTransfer: 'Counts as a move between your accounts',
    needsAmount: 'Every part needs an amount.',
  },
  add: 'Add another part',
  balance: {
    addsUp: 'Adds up',
    left: '{{amount}} left to place',
    over: '{{amount}} over',
  },
  save: 'Save split',
  saveBlocked: 'Make the parts add up',
  saved: 'Split saved',
  remove: {
    label: 'Remove the split',
    keepAs: 'Keep as',
    confirm: {
      title: 'Remove the split?',
      body: 'The line goes back to one category: {{category}}. Nothing else changes.',
      keep: 'Keep it',
    },
  },
  tag: '{{count}} categories',
  partOf: 'Part of {{amount}}',
  detail: {
    row: 'Categories',
    total: 'Total {{amount}}',
    edit: 'Edit split',
  },
  gap: {
    info: 'The parts add up to {{parts}}, the total is {{total}}. {{amount}} left to place.',
    place: 'Place it',
    badge: 'Parts need placing',
  },
  versionConflict: '{{name}} changed this line. Review and save again.',
  uncategorised: 'Uncategorised',
  a11y: {
    partRow: 'Part {{n}}, {{category}}, {{amount}}. Opens category list.',
  },
} as const;
