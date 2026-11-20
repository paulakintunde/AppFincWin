/**
 * Phase 9 copy, owner-signed in .planning/phases/09-tiers-onboarding/09-WORDING.md (2026-11-19). plans.paywall.* (Plans screen, states, locked-sheet titles).
 * Keys and text match that file row for row; src/i18n/__tests__/plansCopy.test.ts enforces it. Declarative, never advice.
 */
export const paywall = {
  paywall: {
    heading: {
      trial: 'Try everything free for 14 days',
      choose: 'Choose a plan',
      locked: 'Choose a plan to keep going',
    },
    startLine: 'Try everything free for 14 days. After the trial, choose a plan to continue. Subscriptions renew automatically until cancelled. Cancel anytime in You > Subscription or your app store’s subscription settings.',
    startLineNoTrial: 'After the trial, choose a plan to continue. Subscriptions renew automatically until cancelled. Cancel anytime in You > Subscription or your app store’s subscription settings.',
    period: {
      monthly: 'Monthly',
      yearly: 'Yearly',
    },
    cards: {
      solo: {
        name: 'Solo',
        people: '1 person',
      },
      duo: {
        name: 'Duo',
        people: '2 people',
      },
      household: {
        name: 'Household',
        people: 'Up to 6 people',
      },
      extended: {
        name: 'Extended',
        people: 'Up to 12 people',
      },
    },
    priceMonth: '{{price}} a month',
    priceYear: '{{price}} a year',
    priceOtherYear: 'or {{price}} a year',
    priceOtherMonth: 'or {{price}} a month',
    chipTrial: '14 days free',
    noTrial: 'No free trial',
    chargedInFull: 'Charged in full even if not every place is filled.',
    hiddenPlans: 'Plans for fewer than {{count}} people are not shown. To choose a smaller plan, remove members first.',
    hiddenPlansLink: 'See members',
    currentBadge: 'Active',
    currentPlan: 'Current plan',
    takesEffectNow: 'Takes effect now. The store adjusts the price for the time left.',
    takesEffectRenewal: 'Takes effect at your next renewal on {{date}}.',
    periodWord: {
      month: 'month',
      year: 'year',
    },
    disclosure: {
      trial: 'Free for 14 days, then {{price}} a {{period}}. First charge on {{date}}. Renews automatically until cancelled.',
      noTrial: '{{price}} a {{period}}, charged today. Renews automatically until cancelled.',
      everyPlan: 'Every plan includes everything. Plans differ only in how many people they cover.',
      cancel: 'Cancel in You > Subscription, or in your app store’s subscription settings.',
    },
    pledge: 'The price of your plan won’t go up while your subscription stays active. Taxes set by your app store, or moving to a bigger plan, can change what you pay.',
    terms: 'Terms of use',
    privacy: 'Privacy policy',
    cta: {
      startTrial: 'Start 14-day free trial',
      subscribe: 'Subscribe to {{plan}}',
      change: 'Change to {{plan}}',
    },
    restore: 'Restore purchases',
    trialUsed: 'A free trial has already been used for this account or home.',
    fixPaymentFirst: 'Fix your payment first. Plan changes open again once the payment goes through.',
    changeConfirm: {
      now: 'This change starts now.',
      renewal: 'This change starts at your next renewal on {{date}}.',
      keep: 'Keep my plan',
    },
    states: {
      loadingPrice: '...',
      loadFailed: 'Plans could not load. Check your connection and try again.',
      tryAgain: 'Try again',
      failed: 'The purchase did not go through.',
      notCharged: 'You have not been charged.',
      storeProblem: 'The store reported a problem. Check You > Subscription before trying again.',
      updating: 'Your purchase went through. Updating your plan...',
      slow: 'This is taking longer than usual. Your purchase is safe. Restore purchases or try again later.',
      restoreNone: 'No purchases found for this account',
      restoreFailed: 'Could not restore purchases. Check your connection and try again.',
    },
    lockActions: {
      addTransaction: 'Adding a transaction needs a plan',
      importStatement: 'Importing a statement needs a plan',
      newDecideCheck: 'A new Decide check needs a plan',
      editRecord: 'Editing records needs a plan',
      settleUp: 'Settling up needs a plan',
      invite: 'Inviting someone needs a plan',
      addAccount: 'Adding an account needs a plan',
      addGoal: 'Adding a goal needs a plan',
      addDebt: 'Adding a debt needs a plan',
      addHolding: 'Adding an investment needs a plan',
    },
  },
} as const;
