/** 08-12: delete-account additions for people in a household (UI-SPEC Screen 11, CMP-F23, D-27, D-29). 08-22 adds the screen's own lines. */
export const account = {
  title: 'Delete my account',
  /** 08-22: what deletion does for everyone, in or out of a household. Declarative, never advice. */
  intro: 'Deleting erases your account and everything personal in it: your lines, accounts, goals, checks and settings. It can’t be undone.',
  householdParagraph:
    'Shared lines you created stay in {{household}}, shown as “Former member”. Everything personal is erased. Balances others are owed stay correct.',
  ownerLine: '{{name}} becomes the owner and is told.',
  confirmLabel: 'Type {{word}} to confirm',
  confirmWord: 'DELETE',
  finalButton: 'Delete my account',
  progress: 'Deleting your account',
  failure: 'Your account wasn’t deleted. Nothing was changed. Check your connection and try again.',
  /** 08-22: shown under the button while there is no connection. */
  offline: 'Deleting needs a connection.',
} as const;
