/**
 * Plan 05.2-26 (D-03, D-05): the pure helpers behind the account-use screen. No React, no I/O.
 * The guess comes from kind and name. A suggestion is only a guess shown on screen; it is never stored until the user confirms it
 * ("These look right") or changes that row (UI-SPEC owner decision 6).
 */
import type { AccountUse } from '@/engine/decide/v3';
import type { AccountRow } from '@/db/rows';

/** Kinds whose balance is money in hand. Credit cards and loans are on the Loans step. */
export function holdsMoney(kind: AccountRow['kind']): boolean {
  return kind !== 'credit' && kind !== 'loan';
}

/** Words in an account name that say it is savings (F-16). Matched as whole words, so "Visa" never matches "isa". */
const SAVING_WORDS: readonly string[] = [
  'save', 'saver', 'saving', 'savings', 'isa', 'reserve', 'rainy', 'emergency', 'nest', 'invest', 'investment', 'investments', 'pension',
];

function nameWords(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0);
}

/**
 * The guess from the account kind and name. Never null for a money account (F-05); null only for credit
 * and loan, which are on the Loans step. Savings and investment kinds, or a saving word in the name, are
 * guessed as savings left alone; everything else as everyday money.
 */
export function suggestUse(account: Pick<AccountRow, 'kind' | 'name'>): AccountUse | null {
  if (!holdsMoney(account.kind)) return null;
  if (account.kind === 'savings' || account.kind === 'investment') return { kind: 'untouched' };
  if (nameWords(account.name).some((w) => SAVING_WORDS.includes(w))) return { kind: 'untouched' };
  return { kind: 'everyday' };
}

/** The copy key naming a use, for the answer lines. 'dedicated' is built separately (it names its target). */
export function labelKeyOfUse(use: AccountUse): string {
  switch (use.kind) {
    case 'everyday':
      return 'decide.setup.accountUse.useEveryday';
    case 'mixed':
      return 'decide.setup.accountUse.useMix';
    case 'untouched':
      return 'decide.setup.accountUse.useSavings';
    case 'dedicated':
      return 'decide.setup.accountUse.useKept';
  }
}

/** The answer line for a use ("Everyday", "Kept for emergency fund"...). `envelopeName` resolves an envelope id. */
export function accountUseText(
  use: AccountUse,
  t: (key: string, options?: Record<string, unknown>) => string,
  envelopeName: (id: string) => string | undefined
): string {
  if (use.kind !== 'dedicated') return t(labelKeyOfUse(use));
  if (use.purpose.kind === 'emergency') return t('decide.setup.accountUse.useKept', { target: t('decide.setup.accountUse.targetEmergency') });
  const name = envelopeName(use.purpose.envelopeId);
  // An envelope that is gone or not loaded yet: say only that the account is kept for one thing.
  return name === undefined ? t('decide.accountUse.optionKept') : t('decide.setup.accountUse.useKept', { target: name });
}
