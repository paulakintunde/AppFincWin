/** 08-12: delete-account additions for people in a household (UI-SPEC Screen 11, CMP-F23, D-27, D-29). */
export const account = {
  title: 'Delete my account',
  householdParagraph:
    'Shared lines you created stay in {{household}}, shown as “Former member”. Everything personal is erased. Balances others are owed stay correct.',
  ownerLine: '{{name}} becomes the owner and is told.',
  confirmLabel: 'Type {{word}} to confirm',
  confirmWord: 'DELETE',
  finalButton: 'Delete my account',
  progress: 'Deleting your account',
  failure: 'Your account wasn’t deleted. Nothing was changed. Check your connection and try again.',
} as const;
