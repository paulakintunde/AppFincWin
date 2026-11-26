// Push text (10-23, D-12, UI-SPEC 5c). TEMPLATES must equal system.push.* in the app catalogue (src/i18n/__tests__/pushTextParity.test.ts).
// Only whitelisted params are read below. Other keys are never read, so they cannot reach a phone.
export const TEMPLATES = {
  billsDue: '{{name}}, {{amount}}, is due {{when}}.',
  overCap: '{{category}} is over its cap by {{amount}} this month.',
  goalReached: '{{goal}} has reached its {{amount}} target.',
  largeOwn: 'A {{amount}} expense was added to {{category}}.',
  lowBalance: '{{account}} is below {{amount}}.',
  partnerLarge: '{{who}} spent {{amount}} on {{category}}',
  partnerLargeHidden: 'A household member spent {{amount}} on {{category}}',
  partnerLargePrivate: 'Someone spent {{amount}}.',
  digest: 'Today: {{parts}}.',
  whenToday: 'today',
  whenTomorrow: 'tomorrow',
  whenInDays: 'in {{count}} days',
} as const;

export type AlertParams = Record<string, unknown>;

function fill(t: string, v: Record<string, string | number>): string {
  return t.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k] ?? ''));
}

/** Amount in the alert's currency, whole amounts without ".00". Unknown currency codes fall back to "12.50 CODE". */
export function formatAmount(minor: number, currency: string): string {
  try {
    const probe = new Intl.NumberFormat('en', { style: 'currency', currency });
    const exp = probe.resolvedOptions().maximumFractionDigits ?? 2;
    const factor = 10 ** exp;
    const whole = Math.abs(minor) % factor === 0;
    const f = new Intl.NumberFormat('en', {
      style: 'currency', currency, minimumFractionDigits: whole ? 0 : exp, maximumFractionDigits: exp,
    });
    return f.format(minor / factor);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

const str = (v: unknown, d = ''): string => (typeof v === 'string' && v ? v : d);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function pushText(kind: string, p: AlertParams): string {
  const amount = formatAmount(num(p.amount_minor ?? p.over_minor), str(p.currency, 'USD'));
  switch (kind) {
    case 'bills_due': {
      const lead = num(p.lead_days);
      const when = lead <= 0 ? TEMPLATES.whenToday : lead === 1 ? TEMPLATES.whenTomorrow : fill(TEMPLATES.whenInDays, { count: lead });
      return fill(TEMPLATES.billsDue, { name: str(p.bill, 'A bill'), amount, when });
    }
    case 'over_cap':
      return fill(TEMPLATES.overCap, { category: str(p.category, 'A category'), amount });
    case 'goal_reached':
      return fill(TEMPLATES.goalReached, { goal: str(p.goal, 'Your goal'), amount });
    case 'large_txn':
      return fill(TEMPLATES.largeOwn, { amount, category: str(p.category, 'a category') });
    case 'low_balance':
      return fill(TEMPLATES.lowBalance, { account: str(p.account, 'An account'), amount });
    case 'partner_large': {
      const category = typeof p.category === 'string' && p.category ? p.category : null;
      if (category === null) return fill(TEMPLATES.partnerLargePrivate, { amount });
      if (p.hidden === true || !str(p.who)) return fill(TEMPLATES.partnerLargeHidden, { amount, category });
      return fill(TEMPLATES.partnerLarge, { who: str(p.who), amount, category });
    }
    default:
      return 'FincWin has an update.';
  }
}

const DIGEST_PARTS: Record<string, [string, string]> = {
  bills_due: ['bill due', 'bills due'],
  over_cap: ['category over its cap', 'categories over their cap'],
  goal_reached: ['goal reached', 'goals reached'],
  large_txn: ['large transaction', 'large transactions'],
  low_balance: ['low balance', 'low balances'],
  partner_large: ['household expense', 'household expenses'],
};

/** "Today: 2 bills due, 1 category over its cap." from counts by kind, in a fixed order. */
export function digestText(counts: Record<string, number>): string {
  const parts: string[] = [];
  for (const k of Object.keys(DIGEST_PARTS)) {
    const n = counts[k] ?? 0;
    if (n > 0) parts.push(`${n} ${DIGEST_PARTS[k][n === 1 ? 0 : 1]}`);
  }
  return fill(TEMPLATES.digest, { parts: parts.join(', ') || 'nothing new' });
}
