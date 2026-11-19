/**
 * Phase 9 copy, owner-signed in .planning/phases/09-tiers-onboarding/09-WORDING.md (2026-11-19). plans.invite, leave, solo, switchRule and the household plan line.
 * Keys and text match that file row for row; src/i18n/__tests__/plansCopy.test.ts enforces it. Declarative, never advice.
 */
export const householdPlans = {
  invite: {
    soloConfirm: {
      title: 'Add a member',
      body: 'Adding a member needs a household plan. Your next bill would be {{monthly}} a month or {{yearly}} a year.',
      newPlan: 'New plan: {{plan}}, {{count}} people',
      takesEffectNow: 'Takes effect: now',
      takesEffectRenewal: 'Takes effect: at your next renewal',
      change: 'Change to {{plan}}',
      keep: 'Keep Solo',
    },
    approval: {
      title: 'Approve a bigger plan',
      heading: '{{name}} is waiting to join {{home}}',
      planNow: 'Plan now: {{plan}}, {{count}} people',
      planAfter: 'Plan after: {{plan}}, up to {{count}} people',
      takesEffectNow: 'Takes effect: now',
      takesEffectRenewal: 'Takes effect: at your next renewal on {{date}}',
      approve: 'Approve and change plan',
      cancel: 'Cancel invite',
      later: 'Decide later',
      push: '{{name}} wants to join {{home}}. Approve to change your plan.',
    },
    waiting: {
      badge: 'Waiting',
      heading: 'Waiting for {{payer}} to approve',
      body: '{{payer}} has been told. You will be added when they approve. You can close this screen.',
      expired: 'This invite expired. Ask {{payer}} to send a new one.',
    },
    thirdPersonTrial: 'Adding a 3rd person moves you to Household. Your free trial ends and {{price}} is charged today.',
    thirdPersonTrialContinues: 'Adding a 2nd person moves you to Duo. Your free trial continues, and the Duo price starts when it ends.',
  },
  leave: {
    member: 'You will have full access for 7 days after leaving. After that, FincWin needs a Solo plan to add or change things. Your records come with you.',
    memberLink: 'Continue on Solo',
    payer: 'You pay for this plan. Leaving does not cancel your subscription. It then covers your new household of one, and you can move to Solo.',
    confirm: 'Leave household',
    solo: {
      title: 'Leave and continue on Solo',
      body: 'You leave {{home}} and keep your own records. Solo covers one person: {{price}} a {{period}}. Access returns when the purchase goes through.',
      primary: 'Leave and subscribe',
      secondary: 'Stay in {{home}}',
    },
  },
  solo: {
    title: 'Move to Solo',
    body: 'Solo takes effect at your next renewal on {{date}}. Until then you keep the spare places.',
    primary: 'Move to Solo',
    secondary: 'Keep my plan',
    removeFirst: 'To move to Solo, remove other members first.',
    seeMembers: 'See members',
  },
  switchRule: {
    title: 'You left a home recently. You can join a different home from {{date}}.',
    body: 'Joining the same home is always open. If you left because of separation, bereavement or safety, contact support. No details are needed.',
    contact: 'Contact support',
  },
  household: {
    planLine: 'Plan: {{plan}} · {{name}} pays',
    coveredBy: 'Covered by {{name}}',
    notPayer: '{{name}} pays. Only they can change the plan.',
    full: '{{plan}} holds {{count}} people.',
    seePlans: 'See plans',
    askPayer: 'Ask {{payer}} to change the plan.',
  },
} as const;
