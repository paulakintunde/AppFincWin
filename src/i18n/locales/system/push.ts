// Phase 10 (10-04): UI-SPEC section 5c. Push and local texts. Params carry who, amount and category only; never a note or payee (D-12).
// partnerLarge is the owner's exact example ("Sam spent $320 on Home"). Everything else is draft.
export const push = {
  billsDue: '{{name}}, {{amount}}, is due {{when}}.',
  overCap: '{{category}} is over its cap by {{amount}} this month.',
  goalReached: '{{goal}} has reached its {{amount}} target.',
  largeOwn: 'A {{amount}} expense was added to {{category}}.',
  lowBalance: '{{account}} is below {{amount}}.',
  partnerLarge: '{{who}} spent {{amount}} on {{category}}',
  partnerLargeHidden: 'A household member spent {{amount}} on {{category}}',
  partnerLargePrivate: 'Someone spent {{amount}}.',
  digest: 'Today: {{parts}}.',
} as const;
