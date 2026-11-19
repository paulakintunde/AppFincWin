import type { Href } from 'expo-router';
import type { PlanKey } from './types';

// 09-10: every plan route in one place; plans 09-14..09-24 import these, never literals.
// Cast because Expo Router's generated route types may not know the routes yet (same reason as appHome.ts).
export const PLANS_HREF = '/plans' as Href;
export const SUBSCRIPTION_HREF = '/subscription' as Href;
export const FEATURES_HREF = '/features' as Href;
export const FREE_HELP_HREF = '/free-help' as Href;
export const PLAN_ENDED_HREF = '/plan-ended' as Href;
export const APPROVE_PLAN_HREF = '/household/approve' as Href;
export const ONBOARDING_HREF = '/onboarding' as Href;
export const EXPORT_HREF = '/export' as Href;

export function plansHref(params: {
  mode?: 'first_run' | 'change' | 'locked';
  trigger?: 'first_run' | 'sample_bar' | 'locked' | 'change_plan' | 'notice' | 'invite';
  plan?: PlanKey;
}): Href {
  return { pathname: '/plans', params } as unknown as Href;
}

/** 09-23: the onboarding route in one of its three modes (UI-SPEC 2, 2c, 2d). */
export function onboardingHref(mode: 'first_run' | 'partner' | 'rerun'): Href {
  return { pathname: '/onboarding', params: { mode } } as unknown as Href;
}

/**
 * 09-23: You > Features as a read-only preview of a level and switch map not applied yet (the onboarding summary's
 * "See what is on", UI-SPEC 2b). `on` and `off` are comma-separated feature ids; the screen ignores ids it does not know.
 */
export function featuresPreviewHref(level: number, switches: Readonly<Record<string, boolean | undefined>>): Href {
  const ids = Object.keys(switches);
  const on = ids.filter((id) => switches[id] === true).join(',');
  const off = ids.filter((id) => switches[id] === false).join(',');
  return { pathname: '/features', params: { preview: '1', level: String(level), on, off } } as unknown as Href;
}
