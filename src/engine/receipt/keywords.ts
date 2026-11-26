// 10.1-15 (SCN-02): what a receipt row is, from its words. First rule wins; whole words only.

export type RowKind = 'total' | 'subtotal' | 'tax' | 'tip' | 'discount' | 'payment' | 'change' | 'item';

const RULES: readonly (readonly [RowKind, RegExp])[] = [
  ['subtotal', /\bsub[\s-]?total\b/i],
  ['change', /\bchange\b/i],
  ['total', /\b(?:total|amount\s+due|balance\s+due|to\s+pay)\b/i],
  ['tax', /\b(?:tax|gst|hst|pst|qst|vat)\b/i],
  ['tip', /\b(?:tip|gratuity|service\s+charge)\b/i],
  ['discount', /\b(?:discount|savings|coupon|promo|you\s+saved)\b/i],
  ['payment', /\b(?:cash|card|visa|mastercard|amex|debit|credit|tendered|auth)\b/i],
];

export function classifyRow(text: string): RowKind {
  for (const [kind, re] of RULES) if (re.test(text)) return kind;
  return 'item';
}
