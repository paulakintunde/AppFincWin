// F-14: English ordinals (1st, 2nd, 3rd, 24th) for day-of-month copy, registered with
// i18next as the `ordinal` formatter. Uses Intl.PluralRules where it exists and the
// English rule otherwise (Hermes builds without Intl plural support).
type Translate = (key: string, options?: Record<string, unknown>) => string;

type OrdinalCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

function englishCategory(n: number): OrdinalCategory {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'other';
  const mod10 = n % 10;
  if (mod10 === 1) return 'one';
  if (mod10 === 2) return 'two';
  if (mod10 === 3) return 'few';
  return 'other';
}

function categoryFor(n: number, locale: string): OrdinalCategory {
  try {
    return new Intl.PluralRules(locale, { type: 'ordinal' }).select(n) as OrdinalCategory;
  } catch {
    return englishCategory(n);
  }
}

export function formatOrdinal(n: number, locale: string, t: Translate): string {
  if (!Number.isInteger(n)) return String(n);
  const category = categoryFor(n, locale);
  const key = `ordinal.${category}`;
  const out = t(key, { n });
  // A missing category key (zero / many in a locale that lacks it) echoes the key back.
  return out === key ? t('ordinal.other', { n }) : out;
}
