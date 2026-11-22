// 08.1-25 (CMP-F19, owner one-earner fix 2026-11-21): what the app suggests when a member's share of the joint money is $0 because of
// the group's rule (engine/household zeroShareMembers). It only suggests: the screens open the set-shares editor pre-filled, and
// nothing changes until a member presses Save. 08.12 puts 'Both can use all of it' first by changing ZERO_SHARE_SUGGESTION; the
// trigger (engine zeroShareMembers) stays. The settings card and the answer line read their words and action from here.
import { evenWeights } from '@/engine/household/weights';
import { percentsOf } from './spendRuleView';

/** 08.12 widens this with 'freeAccess'. */
export type SuggestionTarget = 'equalShares';

export const ZERO_SHARE_SUGGESTION: SuggestionTarget = 'equalShares';

export interface Suggestion {
  /** the line on the member's own answer ({{rule}}, {{zero}}) */
  readonly lineKey: string;
  /** the card on "How spending is shared": one member ({{name}}), several ({{names}}), the viewer themself */
  readonly settingsKey: string;
  readonly settingsManyKey: string;
  readonly settingsYouKey: string;
  /** the button on both */
  readonly actionKey: string;
  /** where the button goes */
  readonly route: { readonly pathname: '/household/spending'; readonly params: { readonly suggest: string } };
  /** the editor's starting shares for n members: whole percents that add up to 100 */
  readonly prefill: (n: number) => number[];
}

type Registry = Readonly<Record<string, Suggestion>>;

const BASE = 'household.rules.zeroShare';

/** Every registered target. A test may pass its own registry to suggestionFor. */
export const SUGGESTIONS: Registry = Object.freeze({
  equalShares: {
    lineKey: `${BASE}.line`,
    settingsKey: `${BASE}.settings`,
    settingsManyKey: `${BASE}.settingsMany`,
    settingsYouKey: `${BASE}.settingsYou`,
    actionKey: `${BASE}.action`,
    route: { pathname: '/household/spending', params: { suggest: 'equalShares' } },
    prefill: (n: number) => percentsOf(evenWeights(n)),
  },
});

export function suggestionFor(target: string, registry: Registry = SUGGESTIONS): Suggestion {
  const s = registry[target];
  if (s === undefined) throw new RangeError(`suggestionFor: unknown target ${target}`);
  return s;
}

/** A route param names a registered target, or it is ignored. */
export function suggestTargetOf(param: string | readonly string[] | undefined, registry: Registry = SUGGESTIONS): string | undefined {
  const v = Array.isArray(param) ? param[0] : param;
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(registry, v) ? v : undefined;
}

/** The suggestion the screens show now: the one ZERO_SHARE_SUGGESTION names. */
export function currentSuggestion(): Suggestion {
  return suggestionFor(ZERO_SHARE_SUGGESTION);
}
