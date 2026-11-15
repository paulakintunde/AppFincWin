/**
 * 06.2-04: the category icon picker. Owner plan: 19.
 * 06.2-19 (D-06, D-07): every icon a custom category may pick has a plain word, used for its accessibility label and
 * beside it on the sheet's Icon row. One word per CUSTOM_CATEGORY_ICONS entry (src/ui/icons/iconFor.ts); a test keeps
 * the two lists in step. `iconNone` is the letter tile (no icon picked).
 */
export const categories = {
  iconLabel: 'Icon',
  iconPickerTitle: 'Pick an icon',
  iconA11y: '{{name}} icon',
  iconNone: 'Letter',
  iconNames: {
    housing: 'Home',
    utilities: 'Utilities',
    groceries: 'Groceries',
    transport: 'Transport',
    insurance: 'Insurance',
    health: 'Health',
    subscriptions: 'Subscriptions',
    debt: 'Debt',
    savings: 'Savings',
    business: 'Business',
    tax: 'Tax',
    dining: 'Dining',
    income: 'Income',
    settlement: 'Settle up',
    transfer: 'Transfer',
    acctPension: 'Pension',
    acctInvestment: 'Investments',
    acctCash: 'Cash',
    acctCard: 'Card',
    payBills: 'Bills',
    household: 'Household',
    calendar: 'Calendar',
    alerts: 'Bell',
    profile: 'Person',
    headphones: 'Headphones',
    laptop: 'Laptop',
    camera: 'Camera',
  },
} as const;
