// Phase 10 (10-04): UI-SPEC section 7. fullBody is the owner's exact 500-change sentence (D-28); at count 500 it reads verbatim. Draft otherwise.
export const queue = {
  noteTitle_one: '{{count}} change waiting to send',
  noteTitle_other: '{{count}} changes waiting to send',
  noteBody: 'Your phone is holding a lot of changes. Connect to the internet to send them.',
  fullBody_one: 'You have {{count}} change waiting to send. Connect to the internet to send it, then you can add more. Nothing is lost.',
  fullBody_other: 'You have {{count}} changes waiting to send. Connect to the internet to send them, then you can add more. Nothing is lost.',
  saveDisabledA11y_one: 'disabled, {{count}} change waiting',
  saveDisabledA11y_other: 'disabled, {{count}} changes waiting',
} as const;
