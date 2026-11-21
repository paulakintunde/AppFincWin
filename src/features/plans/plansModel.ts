// 09-14: the paywall's rules as one pure function (UI-SPEC section 5). No React, no store SDK, no strings: every line is a
// copy key plus params, and every price is a store string from `offers` (never remembered, never hard-coded: T-09-53).
import { changeRule, planHasTrial, plansThatFit, type GoogleChangeMode, type StorePlatform } from './store/catalog';
import type { ChangeTiming, PlanKey, PlanOffer, PlanPeriod, PlanView } from './types';

export type PlansMode = 'first_run' | 'change' | 'locked';

export type HeadingKey = 'plans.paywall.heading.trial' | 'plans.paywall.heading.choose' | 'plans.paywall.heading.locked';
export type StartLineKey = 'plans.paywall.startLine' | 'plans.paywall.startLineNoTrial';
export type CardNameKey = 'plans.paywall.cards.solo.name' | 'plans.paywall.cards.duo.name' | 'plans.paywall.cards.household.name' | 'plans.paywall.cards.extended.name';
export type CardPeopleKey = 'plans.paywall.cards.solo.people' | 'plans.paywall.cards.duo.people' | 'plans.paywall.cards.household.people' | 'plans.paywall.cards.extended.people';
export type PriceKey = 'plans.paywall.priceMonth' | 'plans.paywall.priceYear' | 'plans.paywall.priceOtherMonth' | 'plans.paywall.priceOtherYear';
export type ChangeLineKey = 'plans.paywall.takesEffectNow' | 'plans.paywall.takesEffectRenewal' | 'plans.invite.thirdPersonTrialContinues';
export type CtaKey = 'plans.paywall.cta.startTrial' | 'plans.paywall.cta.subscribe' | 'plans.paywall.cta.change' | 'plans.paywall.currentPlan';

export interface PlansModelInput {
  plan: PlanView;
  /** null while the store is still answering. */
  offers: PlanOffer[] | null;
  /** The store call failed (offline, no key): no price is shown from memory. */
  offersError: boolean;
  mode: PlansMode;
  selected: { plan: PlanKey | null; period: PlanPeriod } | null;
  platform: StorePlatform;
  now: number;
}

export interface PlanCardModel {
  planKey: PlanKey;
  nameKey: CardNameKey;
  peopleKey: CardPeopleKey;
  priceMain: { key: PriceKey; price: string } | null;
  priceOther: { key: PriceKey; price: string } | null;
  chip: boolean;
  noTrial: boolean;
  chargedInFull: true;
  current: boolean;
  changeLine: { key: ChangeLineKey; date: string | null } | null;
  selected: boolean;
}

export interface DisclosureLine {
  key: string;
  /** `period` is a locale key (plans.paywall.periodWord.*), resolved to words where the line is rendered. */
  params?: Record<string, string>;
}

export interface PlansModel {
  state: 'loading' | 'storeError' | 'ready';
  heading: HeadingKey;
  startLine: StartLineKey;
  /** The trial-used label shows above the cards (D-16). The model never says which check fired. */
  showTrialUsed: boolean;
  selection: { plan: PlanKey; period: PlanPeriod };
  cards: PlanCardModel[];
  hiddenPlansCount: number | null;
  disclosure: DisclosureLine[];
  blocked: 'fixPaymentFirst' | null;
  cta: {
    labelKey: CtaKey;
    params: { plan?: PlanKey };
    disabled: boolean;
    requiresConfirm: boolean;
    timing: ChangeTiming | null;
    googleMode: GoogleChangeMode | null;
    /** The selected plan's offer: what the button buys. null while loading or on an error. */
    offer: PlanOffer | null;
  };
}

const NAME_KEY: Record<PlanKey, CardNameKey> = {
  solo: 'plans.paywall.cards.solo.name',
  duo: 'plans.paywall.cards.duo.name',
  household: 'plans.paywall.cards.household.name',
  extended: 'plans.paywall.cards.extended.name',
};
const PEOPLE_KEY: Record<PlanKey, CardPeopleKey> = {
  solo: 'plans.paywall.cards.solo.people',
  duo: 'plans.paywall.cards.duo.people',
  household: 'plans.paywall.cards.household.people',
  extended: 'plans.paywall.cards.extended.people',
};

const DAY_MS = 86_400_000;

function findOffer(offers: PlanOffer[] | null, plan: PlanKey, period: PlanPeriod): PlanOffer | null {
  return offers?.find((o) => o.planKey === plan && o.period === period) ?? null;
}

/** A plan the person holds right now (trial, active or in grace). A tester or sample household holds none. */
export function heldPlan(plan: PlanView): { plan: PlanKey; period: PlanPeriod; inTrial: boolean } | null {
  if (!plan.planKey || !plan.period) return null;
  if (plan.status !== 'trial' && plan.status !== 'active' && plan.status !== 'grace') return null;
  return { plan: plan.planKey, period: plan.period, inTrial: plan.status === 'trial' };
}

export function plansModel(input: PlansModelInput): PlansModel {
  const { plan, offers, offersError, mode, platform, now } = input;
  const members = Math.max(1, plan.members);
  const fits = plansThatFit(members);
  const held = heldPlan(plan);

  const state: PlansModel['state'] = offersError || (offers !== null && offers.length === 0) ? 'storeError' : offers === null ? 'loading' : 'ready';

  // Yearly is the default (owner answer Q1); the first plan that fits is the default plan.
  const firstFit = fits[0] ?? 'extended';
  const selection = input.selected?.plan && fits.includes(input.selected.plan) ? { plan: input.selected.plan, period: input.selected.period } : { plan: firstFit, period: input.selected?.period ?? ('year' as PlanPeriod) };
  const period = selection.period;

  const trialOn = plan.trialAvailable && fits.some(planHasTrial);
  const heading: HeadingKey = mode === 'locked' ? 'plans.paywall.heading.locked' : trialOn && mode === 'first_run' ? 'plans.paywall.heading.trial' : 'plans.paywall.heading.choose';
  const startLine: StartLineKey = trialOn ? 'plans.paywall.startLine' : 'plans.paywall.startLineNoTrial';

  const billingIssue = plan.billingIssueAt !== null;
  const renewalDate = plan.coveredUntil;

  const cards: PlanCardModel[] = fits.map((planKey) => {
    const offer = findOffer(offers, planKey, period);
    const otherOffer = findOffer(offers, planKey, period === 'year' ? 'month' : 'year');
    const isHeld = held?.plan === planKey;
    let changeLine: PlanCardModel['changeLine'] = null;
    if (held && !isHeld && !billingIssue) {
      const rule = changeRule({ from: { ...held, billingIssue: false }, to: { plan: planKey, period }, platform });
      if ('timing' in rule) {
        changeLine =
          rule.timing === 'renewal'
            ? { key: 'plans.paywall.takesEffectRenewal', date: renewalDate }
            : rule.timing === 'trialContinues'
              ? { key: 'plans.invite.thirdPersonTrialContinues', date: null }
              : { key: 'plans.paywall.takesEffectNow', date: null };
      }
    }
    return {
      planKey,
      nameKey: NAME_KEY[planKey],
      peopleKey: PEOPLE_KEY[planKey],
      priceMain: offer ? { key: period === 'year' ? 'plans.paywall.priceYear' : 'plans.paywall.priceMonth', price: offer.priceString } : null,
      priceOther: otherOffer ? { key: period === 'year' ? 'plans.paywall.priceOtherMonth' : 'plans.paywall.priceOtherYear', price: otherOffer.priceString } : null,
      chip: planHasTrial(planKey) && plan.trialAvailable && (offer?.hasTrial ?? false),
      noTrial: !planHasTrial(planKey),
      chargedInFull: true,
      current: isHeld,
      changeLine,
      selected: planKey === selection.plan,
    };
  });

  const selectedOffer = findOffer(offers, selection.plan, period);
  const selectedIsCurrent = held?.plan === selection.plan && held.period === period;
  const trialSelected = !held && plan.trialAvailable && planHasTrial(selection.plan) && (selectedOffer?.hasTrial ?? false);

  let blocked: PlansModel['blocked'] = null;
  let timing: ChangeTiming | null = null;
  let googleMode: GoogleChangeMode | null = null;
  let labelKey: CtaKey;
  let requiresConfirm = false;
  if (held) {
    if (selectedIsCurrent) {
      labelKey = 'plans.paywall.currentPlan';
    } else {
      labelKey = 'plans.paywall.cta.change';
      requiresConfirm = true;
      const rule = changeRule({ from: { ...held, billingIssue }, to: { plan: selection.plan, period }, platform });
      if ('blocked' in rule) blocked = rule.blocked;
      else {
        timing = rule.timing;
        googleMode = rule.googleMode ?? null;
      }
    }
  } else {
    labelKey = trialSelected ? 'plans.paywall.cta.startTrial' : 'plans.paywall.cta.subscribe';
  }

  const disclosure: DisclosureLine[] = [];
  if (selectedOffer) {
    const periodWord = period === 'year' ? 'plans.paywall.periodWord.year' : 'plans.paywall.periodWord.month';
    if (trialSelected) {
      const firstCharge = new Date(now + (selectedOffer.trialDays ?? 14) * DAY_MS).toISOString();
      disclosure.push({ key: 'plans.paywall.disclosure.trial', params: { price: selectedOffer.priceString, period: periodWord, date: firstCharge } });
    } else {
      disclosure.push({ key: 'plans.paywall.disclosure.noTrial', params: { price: selectedOffer.priceString, period: periodWord } });
    }
  }
  disclosure.push({ key: 'plans.paywall.disclosure.everyPlan' }, { key: 'plans.paywall.disclosure.cancel' }, { key: 'plans.paywall.pledge' });

  return {
    state,
    heading,
    startLine,
    showTrialUsed: !plan.trialAvailable && !held && state === 'ready',
    selection,
    cards,
    hiddenPlansCount: fits.length < 4 ? members : null,
    disclosure,
    blocked,
    cta: {
      labelKey,
      params: { plan: selection.plan },
      disabled: state !== 'ready' || selectedOffer === null || selectedIsCurrent || blocked !== null,
      requiresConfirm,
      timing,
      googleMode,
      offer: state === 'ready' ? selectedOffer : null,
    },
  };
}
