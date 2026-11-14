/**
 * 06.2-04: Activity swipe actions and the day-total line read aloud. Owner plan: 10. Calendar words live in calendar.ts.
 */
export const activity = {
  swipe: {
    paid: 'Paid',
    delete: 'Delete',
    edit: 'Edit',
  },
  dayTotalA11y: '{{day}}, total {{amount}}',
} as const;
