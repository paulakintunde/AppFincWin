// Pure (no React or I/O). Port of the prototype levelFor/applyOnb (FincWin United.dc.html ~3618-3640); tax rule dropped (D-26); cut features removed (D-32).
import { FEATURES, type FeatureId } from './featureRegistry';
import type { OnboardingAnswers } from './onboardingAnswers';

export type FeatureOverrides = Partial<Record<FeatureId, boolean>>;

export interface ApplyOnbOptions {
  /** The device home currency. Defaults to USD, as in the prototype. */
  homeCurrency?: string;
}

/**
 * Answers to feature switch overrides. Only ids in FEATURES are produced.
 * The prototype's forecast, alerts-off, tax, household export and price-feed switches are
 * dropped: nothing is built for them (09-LEVEL-MAP.md). Skipped answers produce nothing.
 * `_level` is kept for the call shape; the level itself is applied by the caller.
 */
export function applyOnb(
  a: OnboardingAnswers,
  _level: number,
  opts: ApplyOnbOptions = {},
): FeatureOverrides {
  const out: FeatureOverrides = {};
  const home = opts.homeCurrency ?? 'USD';

  if (a.goal === 'debt' || (a.debt !== undefined && a.debt !== 'none')) {
    out.debts = true;
    out.payoffPlan = true;
  }
  if (a.inv === 'some' || a.inv === 'lots') out.investing = true;
  if (a.inv === 'lots') out.lots = true;
  if (a.share !== undefined && a.share !== 'no') {
    for (const f of FEATURES) if (f.id.startsWith('hh.')) out[f.id] = true;
  }
  if (a.goal === 'stop') out.caps = true;
  if (a.goal === 'save' || a.save !== undefined) out.goals = true;
  if (a.cur !== undefined && a.cur !== home) out.multiCurrency = true;
  return out;
}
