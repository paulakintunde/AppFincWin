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
