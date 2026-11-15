/** 08-12: leaving, removing, ownership (UI-SPEC Screen 11). */
export const leave = {
  leaveTitle: 'Leave {{household}}?',
  leaveBody:
    'Your personal records come with you. Each shared line you were on becomes a personal copy of your share. {{household}} keeps the originals.',
  leaveOwes: 'You owe {{name}} {{amount}}. It stays on both sides as “{{self}} (left)” and either of you can settle or write it off later.',
  leaveCta: 'Leave household',
  stay: 'Stay',
  ownerPick: 'Pick the new owner',
  ownerCta: 'Make {{name}} the owner and leave',
  left: 'You left {{household}}',
  noLonger: {
    title: 'You’re no longer in {{household}}',
    page: 'Your personal records are still yours.',
    body: 'Your personal records are still yours and are in your own household now. Lines you were on are saved as personal copies of your share.',
    gotIt: 'Got it',
  },
  removeTitle: 'Remove {{name}} from {{household}}?',
  removeBody:
    '{{name}}’s personal records move to a household of their own. Lines {{name}} was on keep the split you gave them. {{name}} is told, and you can undo this for 24 hours by inviting {{name}} again.',
  removeOwed: '{{name}} owes you {{amount}}. It stays as “{{name}} (left)”.',
  removeCta: 'Remove {{name}}',
  keep: 'Keep {{name}}',
  removed: '{{name}} removed',
  undoWindow: '{{name}} was removed. Invite {{name}} again to reconnect their lines.',
  inviteAgain: 'Invite again',
  ownerNow: 'You’re now the owner of {{household}}.',
} as const;
