// Pure (no React or I/O). 09-22: use-based triggers for in-context offers (D-36). Read from the person's own cached lines on
// their device; nothing leaves it. A trigger only says "this looks relevant"; canShowOffer decides if it may be shown.
import { FEATURES, type FeatureId } from './featureRegistry';
import { DAY_MS } from './offers';

/** How far back a line counts as recent use. */
export const TRIGGER_WINDOW_DAYS = 60;

export interface TriggerLine {
  category_id: string | null;
  local_date: string;
  original_currency: string;
  deleted_at?: string | null;
  is_sample?: boolean;
}

export interface TriggerInput {
  lines: readonly TriggerLine[];
  /** Ids of the built-in Debt and Savings categories (null when the person has none). */
  debtCategoryId: string | null;
  savingsCategoryId: string | null;
  homeCurrency: string;
  /** How many "make this repeating" suggestions the person has waiting. */
  seriesOfferCount: number;
  /** Today as a local date, YYYY-MM-DD. */
  today: string;
}

const KNOWN = new Set<string>(FEATURES.map((f) => f.id));

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T12:00:00Z`) / DAY_MS);
}

export function triggeredFeatures(i: TriggerInput): Set<FeatureId> {
  const out = new Set<string>();
  const today = dayNumber(i.today);
  for (const l of i.lines) {
    if (l.deleted_at != null || l.is_sample === true) continue;
    const age = today - dayNumber(l.local_date);
    if (age < 0 || age > TRIGGER_WINDOW_DAYS) continue;
    if (i.debtCategoryId !== null && l.category_id === i.debtCategoryId) out.add('debts');
    if (i.savingsCategoryId !== null && l.category_id === i.savingsCategoryId) out.add('goals');
    if (l.original_currency !== i.homeCurrency) out.add('multiCurrency');
  }
  if (i.seriesOfferCount > 0) out.add('recurring');
  return new Set([...out].filter((id) => KNOWN.has(id)) as FeatureId[]);
}
