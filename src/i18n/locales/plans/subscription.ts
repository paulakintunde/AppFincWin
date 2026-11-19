/**
 * Phase 9 copy, owner-signed in .planning/phases/09-tiers-onboarding/09-WORDING.md (2026-11-19). plans.subscription, member, freeHelp, deleteWarning, export.
 * Keys and text match that file row for row; src/i18n/__tests__/plansCopy.test.ts enforces it. Declarative, never advice.
 */
export const subscription = {
  subscription: {
    title: 'Subscription',
    manage: 'Manage subscription',
    manageSub: 'Opens {{store}}',
    // 09-25 (A5-2): added 2026-11-19, needs owner review.
    manageFailed: 'Your app store did not open. Open it to see your subscriptions.',
    endsLine: 'When a plan ends, FincWin becomes read-only. You can still export your data.',
    row: {
      plan: 'Plan',
      planValue: '{{plan}} · {{count}} people',
      paidBy: 'Paid by',
      paidByYou: 'You',
      trialEnds: 'Trial ends',
      trialEndsValue: '{{date}}, {{time}} (your time)',
      firstCharge: 'First charge',
      firstChargeValue: '{{price}} a {{period}}',
      renews: 'Renews',
      renewsValue: '{{date}} at {{price}}',
      endsNotRenewing: 'Ends {{date}}. Not renewing',
      places: 'Places',
      placesValue: '{{used}} of {{count}} in use',
      seeMembers: 'See members',
    },
    changePlan: 'Change plan',
    restore: 'Restore purchases',
    sublabel: {
      trial: 'Free trial · ends {{date}}',
      active: 'Active · renews {{date}}',
      readOnly: 'Read-only',
      covered: 'Covered by {{name}}',
    },
    empty: {
      title: 'No plan yet',
      body: 'Start the free trial to add your own records.',
    },
    tester: {
      freeUntil: 'Free until',
      note: 'Free access for testers ends on {{date}}. After that, the normal plans apply.',
      endsNotice: 'Your free access ends on {{date}}. After that, choose a plan to continue.',
      seePlans: 'See plans',
    },
  },
  member: {
    title: 'Your home already has a plan',
    body: '{{payer}} pays for it. It covers up to {{count}} people until {{date}}.',
    startOwn: 'Start your own plan',
    startOwnTitle: 'Start your own plan',
    startOwnBody: 'Solo covers one person. Starting it means leaving {{home}}.',
    startOwnContinue: 'Continue',
    startOwnStay: 'Stay in {{home}}',
  },
  freeHelp: {
    row: 'Free help',
    sub: 'Free money help and debt support links',
  },
  deleteWarning: {
    title: 'Billing keeps going',
    body: 'Deleting your account doesn’t cancel billing. Cancel in your app store first.',
    manage: 'Manage subscription',
    payerCovers: '{{count}} other people are covered by this plan. They will see a notice and 7 days of full access.',
  },
  export: {
    youRow: 'Export your data',
    title: 'Export your data',
    body: 'A CSV file of your own records. It stays open whatever your plan.',
    button: 'Export',
    done: 'Your export is ready',
    savedOnPhoneIncluded: 'Items saved on this phone are included.',
  },
} as const;
