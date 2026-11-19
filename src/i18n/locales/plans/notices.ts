/**
 * Phase 9 copy, owner-signed in .planning/phases/09-tiers-onboarding/09-WORDING.md (2026-11-19). plans.notices and plans.doubleCover.
 * Keys and text match that file row for row; src/i18n/__tests__/plansCopy.test.ts enforces it. Declarative, never advice.
 */
export const notices = {
  notices: {
    trialReminder: {
      title: 'Trial ends soon',
      body: 'Your free trial ends on {{date}} at {{time}}. After that, {{price}} a {{period}} is charged unless you cancel.',
      actions: {
        manage: 'Manage subscription',
        change: 'Choose a different plan',
      },
    },
    trialToday: {
      title: 'Trial ends soon',
      body: 'Your free trial ends today at {{time}}. {{price}} a {{period}} is charged then unless you cancel.',
      actions: {
        manage: 'Manage subscription',
      },
    },
    trialPush: {
      body: 'Your free trial ends on {{date}}. {{price}} is charged unless you cancel.',
    },
    paymentFailed: {
      title: 'Payment failed',
      body: '{{name}}’s payment did not go through. Your home keeps full access until {{date}}.',
      actions: {
        fix: 'Fix payment',
        takeOver: 'Take over the plan',
        notNow: 'Not now',
      },
    },
    payerLeft: {
      title: 'The payer left',
      body: '{{name}} left and no longer pays for this home. Full access continues until {{date}}.',
      actions: {
        takeOver: 'Take over the plan',
        notNow: 'Not now',
      },
    },
    takeoverDone: {
      row: 'Covered by {{name}}',
      toast: '{{name}} now pays for this home',
    },
    grace: {
      banner: 'Plan payment is overdue. Full access until {{date}}.',
      action: 'See plan details',
    },
    payerAfterLeaving: {
      title: 'You left {{home}}',
      body: 'You left {{home}}. Your subscription is still billing. Move to Solo to pay less.',
      actions: {
        manage: 'Manage subscription',
        moveSolo: 'Move to Solo',
      },
    },
    oldPlanRecovers: {
      title: 'Your old plan is not needed',
      body: '{{name}} now covers {{home}}. You do not need your plan for it. Cancel it in your app store. Your store decides on any refund.',
      actions: {
        manage: 'Manage subscription',
      },
    },
    memberLeft: {
      title: 'You have 7 days',
      body: 'You have full access until {{date}}. Continue on Solo to keep adding and changing things.',
      actions: {
        solo: 'Continue on Solo',
        notNow: 'Not now',
      },
    },
    downgradeOffer: {
      title: 'A smaller plan fits',
      body: 'Your home now has {{count}} people. {{plan}} fits them and costs {{price}} a {{period}}. It would start at your next renewal on {{date}}.',
      actions: {
        switch: 'Switch at renewal',
        notNow: 'Not now',
      },
    },
    existingUser: {
      title: 'Run setup to simplify the app',
      body: 'You are seeing everything. Answer 11 short questions and FincWin shows the parts that fit you.',
      actions: {
        run: 'Run setup',
        notNow: 'Not now',
      },
    },
  },
  // Added after owner sign-off 2026-11-19 - needs owner review (every plans.doubleCover.* row,
  // including notChosen.title and notChosen.body, P4). Keep this note until the owner confirms the text.
  doubleCover: {
    title: 'Two plans cover this home',
    body: 'Two plans cover this home. Pick one. The plan you do not pick is not used. Its payer is told to cancel it or ask their store for a refund. FincWin never cancels a plan for you.',
    choiceNew: 'Keep {{plan}}, paid by {{name}}',
    choiceOld: 'Keep {{plan}}, paid by {{name}}',
    defaultLine: 'If neither of you picks within 7 days, the newer plan stays. The other payer is told to cancel their plan or ask their store for a refund.',
    notChosen: {
      title: 'Your plan was not picked',
      body: '{{name}}’s plan now covers {{home}}. You do not need yours for it. Cancel it in your app store. Your store decides on any refund.',
    },
  },
} as const;
