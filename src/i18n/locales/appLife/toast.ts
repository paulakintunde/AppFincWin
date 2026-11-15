/**
 * 06.2-04: save toasts (saved, saved on this phone, did not save). Owner plan: 14. Board source: L06 (toasts).
 * The Undo button keeps its existing key (a11y.toastUndo for the label read aloud).
 */
export const toast = {
  saved: 'Saved: {{name}}, {{amount}}',
  savedOffline: 'Saved on this phone. It syncs when you’re back online.',
  failed: 'That didn’t save. Your entry is still here.',
  retry: 'Try again',
  timeLeftA11y: '{{seconds}} seconds to undo',
} as const;
