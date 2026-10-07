// The plain-words reading shown before any preview (D-42, REC-13): which kind of statement this
// is, what a positive amount means, and what the balance column means. Pure key/params
// assembly from a FormatProfile; the caller supplies already-formatted amounts and renders
// the parts through the catalogue. No React, no I/O.
import type { FormatProfile } from '@/engine/statement';

export interface SentencePart {
  key: string;
  params?: Record<string, string>;
}

export interface SentenceFigures {
  /** The owed or held amount, pre-formatted, or null when the file states none. */
  closing: string | null;
  /** The limit the balance is read against, pre-formatted, or null. */
  limit: string | null;
  /** True when the amount owed is above that limit. */
  overLimit: boolean;
}

const SIGN_KEYS = {
  card: { 'money-spent': 'cardPositivePurchases', 'money-in': 'cardNegativePurchases' },
  deposit: { 'money-spent': 'depositPositiveOut', 'money-in': 'depositPositiveIn' },
  loan: { 'money-spent': 'loanPositiveOut', 'money-in': 'loanPositiveIn' },
} as const;

export function formatSentenceKeys(profile: FormatProfile, figures: SentenceFigures): SentencePart[] {
  const parts: SentencePart[] = [
    { key: 'importCsv.format.readAs', params: { type: `importCsv.format.type.${profile.accountFamily}` } },
    { key: `importCsv.format.${SIGN_KEYS[profile.accountFamily][profile.positiveMeans]}` },
  ];

  const { closing, limit, overLimit } = figures;
  if (profile.balanceMeans === 'owed' && closing !== null) {
    if (limit !== null && overLimit) {
      parts.push({ key: 'importCsv.format.balanceOwedOverLimit', params: { amount: closing, limit } });
    } else {
      parts.push({ key: 'importCsv.format.balanceOwed', params: { amount: closing } });
    }
  } else if (profile.balanceMeans === 'held' && closing !== null) {
    parts.push({ key: 'importCsv.format.balanceHeld', params: { amount: closing } });
  } else if (profile.balanceMeans === 'available') {
    parts.push({ key: 'importCsv.format.balanceAvailable' });
  }
  return parts;
}

/**
 * Joins the parts into one sentence. A param named `type` holds a catalogue key (the kind of
 * statement) and is translated first; every other param is already display text.
 */
export function renderSentence(parts: readonly SentencePart[], t: (key: string, params?: Record<string, string>) => string): string {
  return parts
    .map((part) => {
      const params = part.params === undefined ? undefined : { ...part.params };
      if (params !== undefined && params.type !== undefined) params.type = t(params.type);
      return t(part.key, params);
    })
    .join(' ');
}
