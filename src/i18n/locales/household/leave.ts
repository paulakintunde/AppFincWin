/** 08-12: leaving, removing, ownership (UI-SPEC Screen 11). */
export const leave = {
  leaveTitle: 'Leave {{household}}?',
  leaveBody:
    'Your personal records come with you. Each shared line you were on becomes a personal copy of your share. {{household}} keeps the originals.',
  leaveOwes: 'You owe {{name}} {{amount}}. It stays on both sides as “{{self}} (left)” and either of you can settle or write it off later.',
  // 08-24: the owed-to-you side of the leave warning, the warning card's title and the waiting settle-up line.
  leaveOwed: '{{name}} owes you {{amount}}. It stays on both sides as “{{self}} (left)” and either of you can settle or write it off later.',
  balanceTitle: 'Open balance',
  leavePending: 'Your waiting settle-up with {{name}} will be cancelled. The balance stays.',
  leaveCta: 'Leave household',
  stay: 'Stay',
  ownerPick: 'Pick the new owner',
  ownerPickBody: 'The new owner can invite, remove, rename {{household}} and set its currency.',
  ownerCta: 'Make {{name}} the owner and leave',
  ownerCtaEmpty: 'Pick someone to continue',
  left: 'You left {{household}}',
  alone: {
    title: 'Just you here',
    body: 'You’re the only person in {{household}}, so there is no one to leave.',
    back: 'Back to household',
  },
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
  // 08-24: the owner-owes side of the remove warning, the waiting settle-up line and a person no longer listed.
  removeOwes: 'You owe {{name}} {{amount}}. It stays as “{{name}} (left)”.',
  removePending: 'Your waiting settle-up with {{name}} will be cancelled. The balance stays.',
  removeGone: 'This person is no longer in {{household}}.',
  removeCta: 'Remove {{name}}',
  keep: 'Keep {{name}}',
  removed: '{{name}} removed',
  undoWindow: '{{name}} was removed. Invite {{name}} again to reconnect their lines.',
  inviteAgain: 'Invite again',
  ownerNow: 'You’re now the owner of {{household}}.',
} as const;
