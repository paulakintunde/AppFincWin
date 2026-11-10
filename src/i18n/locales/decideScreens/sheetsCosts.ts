/**
 * 06.1-05 (D-18): cost sheets: Add your own (D44 running, D44S stops, D44F one-off, D44K kind), Selling the one you have now
 * (D45) and the WaterfallCard labels. Owner plan: 16. Draft copy, signed under D-08.
 * The "Counts like" list leaves out Home (D-02). Up to 3 own items per kind (engine own-questions cap).
 */
export const sheetsCosts = {
  own: {
    running: {
      title: 'Add a running cost',
      hint: 'For example, a parking permit.',
      add: 'Add this cost',
    },
    stop: {
      title: 'Add a cost that stops',
      hint: 'For example, a bus pass you no longer need.',
      add: 'Add this cost',
    },
    oneOff: {
      title: 'Add a one-off cost',
      hint: 'For example, delivery or setting it up.',
      add: 'Add this cost',
    },
    kind: {
      title: 'Add your own kind',
      hint: 'For example, a bike or a boat. Decide fills in costs like the kind it counts like.',
      countsLike: 'Counts like',
      add: 'Add this kind',
    },
    addItem: 'Add this item',
    cap: 'Up to 3 of your own items for each kind.',
  },
  sale: {
    title: 'Selling the one you have now',
    switch: 'I’m selling one I have now',
    price: 'Sale price',
    owed: 'Still owed on it',
    inGrow: 'In Grow: {{debt}} · {{amount}} left. Selling pays it off and its payment stops.',
    whenQ: 'When does the money come in?',
    sameDay: 'The same day',
    monthLater: 'About a month later',
    laterNote: 'A sale a month later is not counted on the day you buy.',
    save: 'Save the sale',
    toast: 'Counted: {{amount}} from the sale.',
  },
  waterfall: {
    price: 'Price',
    tax: 'Sales tax, about {{percent}}%',
    fees: 'One-off fees',
    tradeIn: 'Trade-in',
    cashDown: 'Cash down',
    planFees: 'Plan fees',
    upFront: 'Up front',
    salePrice: 'Sale price',
    paysOff: 'Pays off its loan',
    toward: 'Toward this purchase',
    sumA11y: '{{label}}: {{total}}',
  },
} as const;
