// 05.3 decide.v3.ui.instead: UI-SPEC What could I do instead
export const instead = {
  title: 'What could this {{price}} do instead?',
  youSaid: 'You said: {{purpose}}',
  buyNow: '1 · Buy it now',
  spent: '{{price}} spent',
  notCovered: 'not covered yet',
  buyNowBody: 'Unspent money goes from {{before}} to {{after}}. Your emergency fund stays untouched.',
  buyNowNotCovered: 'Your unspent money doesn’t cover this yet.',
  keep: '2 · Keep it',
  kept: '{{amount}} unspent',
  keepBody: 'The money stays unspent and available for whatever comes up. Your emergency fund stays aside either way.',
  deposit: '3 · A fixed-rate deposit',
  rateField: 'Rate from your bank or finance company',
  ratePlaceholder: 'e.g. 4.25%',
  y1: '1y',
  y3: '3y',
  y5: '5y',
  depositSentence_one:
    'At the {{rate}}% you entered, about {{value}} after 1 year. Buying now gives up the {{interest}} of interest, not the {{price}} itself.',
  depositSentence_other:
    'At the {{rate}}% you entered, about {{value}} after {{count}} years. Buying now gives up the {{interest}} of interest, not the {{price}} itself.',
  enterRate: 'Enter a rate to see it',
  disclosure:
    'A term deposit, GIC or CD pays the rate it states for its term. Check fees and early-withdrawal rules with the provider.',
  later: '4 · Buy it later',
  by: 'by {{month}}',
  laterBody: 'Based on your typical pace, the money could be there by {{month}}.',
  slider: 'If everyday spending were lower by {{amount}} a month',
  then: 'Then: by {{month}} (about {{count}} months).',
  thenSeasonal: 'Then: by {{month}}.',
  never: 'Regular bills, loan payments, fixed saving and your emergency fund are never included.',
  footer: 'Each choice gives up the others. The choice is yours.',
} as const;
