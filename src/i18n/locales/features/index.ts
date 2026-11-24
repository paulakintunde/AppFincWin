/**
 * Phase 9 copy, owner-signed in .planning/phases/09-tiers-onboarding/09-WORDING.md (2026-11-19). features.* namespace.
 * Keys and text match that file row for row; src/i18n/__tests__/plansCopy.test.ts enforces it. Declarative, never advice.
 */
export const features = {
  title: 'Features',
  levelChip: 'Your level',
  count: '{{count}} of {{total}} features on',
  sublabel: '{{level}} · {{count}} of {{total}} on',
  runSetup: 'Run setup again',
  search: 'Find a feature',
  empty: {
    title: 'No feature matches that',
    body: 'Try another word.',
  },
  reasons: {
    level: 'Not in your level',
    household: 'Not on for your household',
    plan: 'Needs a plan',
    holdsData: 'Has your records, so it stays on',
    choosePlan: 'Choose a plan',
    setUpSharing: 'Set up sharing',
  },
  toastOn: '{{feature}} is on',
  toastOff: '{{feature}} is off',
  offer: {
    title: 'Turn on {{feature}}?',
    body: '{{feature}} {{what}}. You can turn it off in You > Features.',
    turnOn: 'Turn on',
    notNow: 'Not now',
    dontSuggest: 'Don’t suggest',
  },
  levels: {
    basics: {
      name: 'Basics',
      sentence: 'Money in and out, categories, one account, a month at a time.',
    },
    everyday: {
      name: 'Everyday',
      sentence: 'Adds several accounts, category caps, goals, repeating bills and alerts.',
    },
    fullPicture: {
      name: 'Full picture',
      sentence: 'Adds debt payoff, investments, reconciliation and other currencies.',
    },
    everything: {
      name: 'Everything',
      sentence: 'Adds the archive, undo history and every part of Decide.',
    },
  },
  areas: {
    recording: 'Recording',
    accounts: 'Accounts',
    planning: 'Planning',
    grow: 'Grow',
    sharing: 'Sharing',
    insight: 'Insight',
    system: 'System',
  },
  items: {
    moneyInOut: {
      label: 'Money in and out',
      sub: 'The entry sheet and the Activity list',
    },
    categories: {
      label: 'Categories',
      sub: 'Sort every line into a category',
    },
    search: {
      label: 'Search',
      sub: 'Find a line by name inside the month',
    },
    monthView: {
      label: 'A month at a time',
      sub: 'Switch months, and add new ones',
    },
    balances: {
      label: 'Balances and net worth',
      sub: 'What each account holds, added up',
    },
    recurring: {
      label: 'Repeating bills',
      sub: 'Marks what comes back every month and spots new ones',
    },
    cloneMonth: {
      label: 'Clone a month',
      sub: 'Copy last month’s repeating lines into this one',
    },
    refunds: {
      label: 'Refunds',
      sub: 'Money back on a purchase, netted off the category',
    },
    bulkSelect: {
      label: 'Select several',
      sub: 'Tag, move or delete a batch at once',
    },
    searchAllMonths: {
      label: 'Search every month',
      sub: 'Look across the whole ledger, not just this month',
    },
    multiAccount: {
      label: 'Several accounts',
      sub: 'Assign each line to an account',
    },
    transfers: {
      label: 'Transfers',
      sub: 'Move money between your own accounts',
    },
    reconcile: {
      label: 'Reconcile',
      sub: 'Tick off against a statement and find the gap',
    },
    multiCurrency: {
      label: 'Other currencies',
      sub: 'Enter in any currency, convert to your home one',
    },
    caps: {
      label: 'Category caps',
      sub: 'A monthly ceiling per category',
    },
    comingUp: {
      label: 'What is coming',
      sub: 'The next unpaid lines, on the home screen',
    },
    goals: {
      label: 'Savings goals',
      sub: 'A target, a monthly amount and a date',
    },
    goalContributions: {
      label: 'Saving into a goal',
      sub: 'Move an amount into a goal each month',
    },
    debts: {
      label: 'Debt',
      sub: 'Balances, rates and minimums',
    },
    payoffPlan: {
      label: 'Payoff planner',
      sub: 'Pick an order to clear debts, and compare scenarios',
    },
    investing: {
      label: 'Investments',
      sub: 'Holdings and what they are worth',
    },
    lots: {
      label: 'Cost basis and lots',
      sub: 'Every buy, sale, dividend and fee, with gain and loss',
    },
    growthIllustration: {
      label: 'Growth illustration',
      sub: 'See what a saving or holding could grow to',
    },
    calculators: {
      label: 'Calculators',
      sub: 'Loan, savings, payoff and growth maths',
    },
    insights: {
      label: 'Insights',
      sub: 'Money in and out, spending by category, and month against month',
    },
    netWorthTrend: {
      label: 'Net worth over time',
      sub: 'Your net worth month by month, from your records',
    },
    healthScore: {
      label: 'Score',
      sub: 'One number for this month, from the figures Decide reads',
    },
    import: {
      label: 'Import and paste',
      sub: 'Bring in a list or a statement',
    },
    pdfImport: {
      label: 'Read a PDF statement',
      sub: 'Bring in a statement from a PDF',
    },
    undoHistory: {
      label: 'Undo history',
      sub: 'Roll back one of your recent changes',
    },
    hh: {
      weightSplit: {
        label: 'Split by weight',
        sub: 'Split a line by shares, such as 60 / 40',
      },
      amountSplit: {
        label: 'Split by amount',
        sub: 'Split a line by exact amounts',
      },
      categoryDefaults: {
        label: 'Category split rules',
        sub: 'Groceries by weight, dining even, applied as you type',
      },
      sharedAccounts: {
        label: 'Shared accounts',
        sub: 'Accounts the household sees together',
      },
      settleUp: {
        label: 'Settle up',
        sub: 'Writes the payment and locks the lines it covers',
      },
    },
  },
} as const;
