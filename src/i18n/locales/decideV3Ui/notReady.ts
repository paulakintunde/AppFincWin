// 05.3 decide.v3.ui.notReady: UI-SPEC Decide tab states
export const notReady = {
  heading: 'Before Decide can check a purchase:',
  past_month_missing: 'Record {{month}}',
  activity_not_current: 'Bring {{month}} up to date',
  envelopes_unconfirmed: 'Link your envelopes',
  openActivity: 'Open Activity',
  openEnvelopes: 'Open envelopes',
  rowA11y: '{{title}}. {{reason}}. {{button}}',
  lastSaved: 'Last saved answer: {{chip}}, {{date}}',
} as const;
