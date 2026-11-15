/** 08-12: split rules, category defaults and the apply-to-existing offer (UI-SPEC Screen 6 and the split sheet). */
export const rules = {
  splitTitle: 'How this is split',
  names: {
    even: 'Even',
    weight: 'By weight',
    amount: 'By amount',
    mine: 'Mine only',
  },
  descriptions: {
    even: 'Divided equally between everyone on the line',
    weight: 'Each person’s set share of the household',
    amount: 'Exact figures, typed per person',
    mine: 'Not shared',
  },
  whosInIt: 'Who’s in it',
  addsUp: 'Adds up to {{amount}}',
  leftToAssign: 'Left to assign: {{amount}}',
  saveSplit: 'Save split',
  saveDefault: 'Save default',
  changeWeights: 'Change weights',
  weightsReadOnly: 'Household weights',
  defaultSheet: {
    title: 'Household default',
    helper: 'New lines default to this when marked shared.',
    changed: '{{name}} changed the default to {{rule}}',
  },
  categories: {
    title: 'Category defaults',
    helper: 'Applies once a line is marked shared. Categories never share a line by themselves.',
    useDefault: 'Use household default',
    householdDefault: 'Household default',
    emptyTitle: 'Using the household split for every category',
    emptyBody: 'Pick a different split for one category if you want.',
    changed: '{{name}} changed {{category}} to {{rule}}',
  },
  apply: {
    title: 'Change the split?',
    body: 'New lines use the new split. Lines already logged keep the split they had.',
    toggle: 'Also apply to the {{count}} unsettled lines',
    settledNote: 'Settled lines never change.',
    keep: 'Keep current split',
  },
} as const;
