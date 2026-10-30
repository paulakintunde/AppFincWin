/**
 * 05.3-22: refine card on Decide home and the review screen. Pure: describes what refine() found and which two
 * choices each card offers. Nothing here writes; a write happens only when the user picks a choice (05.3-33).
 */
import type { RefineCard, RefineCardKind, RefineResult, RefineTrigger } from '@/engine/decide/v3';
import type { MinorUnits } from '@/engine/money';

const K = 'decide.v3.ui.refine.';

export interface RefineChoice {
  readonly id: string;
  readonly key: string;
  /** Which card figure the label shows ({{amount}}); null when the label has none. */
  readonly amount: 'suggested' | 'current' | null;
}

const update: RefineChoice = { id: 'update', key: `${K}use`, amount: 'suggested' };
const keep: RefineChoice = { id: 'keep', key: `${K}keepAmount`, amount: 'current' };
const choice = (id: string, name: string): RefineChoice => ({ id, key: `${K}${name}`, amount: null });
const valueChoices = [update, keep] as const;

export const REFINE_CHOICES: Readonly<Record<RefineCardKind, readonly [RefineChoice, RefineChoice]>> = {
  pay: valueChoices,
  everyday: valueChoices,
  everyday_override_expiring: valueChoices,
  unspent: valueChoices,
  steady_above_income: valueChoices,
  series_drift: valueChoices,
  saving_bucket: [choice('looksRight', 'looksRight'), choice('changeIt', 'changeIt')],
  new_regular: [choice('regular', 'regular'), choice('notRegular', 'notRegular')],
  changing_income: [choice('lowerIt', 'lowerIt'), choice('keepIt', 'keepIt')],
  pay_stopped: [choice('lowerIt', 'lowerIt'), choice('keepIt', 'keepIt')],
  card_not_paid_in_full: [choice('looksRight', 'looksRight'), choice('keepIt', 'keepIt')],
  under_logged_month: [choice('looksRight', 'looksRight'), choice('keepIt', 'keepIt')],
};

export interface RefineHomeCard {
  readonly show: boolean;
  readonly eyebrowKey: string;
  readonly bodyKey: string;
  readonly count: number;
}

/** Takes a RefineResult (triggers list) or a single leading trigger; either gives the three-months eyebrow. */
export type RefineHomeInput = { readonly cards: RefineResult['cards']; readonly trigger?: RefineTrigger; readonly triggers?: RefineResult['triggers'] };

export function refineHomeCard(r: RefineHomeInput | null, snoozed: boolean): RefineHomeCard {
  const count = r === null ? 0 : r.cards.length;
  const three = r !== null && (r.trigger === 'three_months' || (r.triggers ?? []).includes('three_months'));
  return {
    show: count > 0 && !snoozed,
    eyebrowKey: `${K}${three ? 'eyebrowThree' : 'eyebrowNew'}`,
    bodyKey: `${K}${count === 1 ? 'body_one' : 'body_other'}`,
    count,
  };
}

export interface RefineCardModel {
  readonly kind: RefineCardKind;
  readonly ref: string | null;
  readonly kickerKey: string;
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly params: { readonly current: MinorUnits | null; readonly suggested: MinorUnits | null; readonly month: string | null };
  readonly choices: readonly [RefineChoice, RefineChoice];
}

export function refineCards(cards: readonly RefineCard[]): readonly RefineCardModel[] {
  return cards.map((c) => ({
    kind: c.kind,
    ref: c.ref,
    kickerKey: `${K}kind.${c.kind}.kicker`,
    titleKey: `${K}kind.${c.kind}.title`,
    bodyKey: `${K}kind.${c.kind}.body`,
    params: { current: c.current, suggested: c.suggested, month: c.month },
    choices: REFINE_CHOICES[c.kind],
  }));
}
