// 06.1-28 (ARC-11): /decide/setup is the new checklist. Old links with ?only= or ?mode=standalone land on the matching new item.
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import { oneParam } from '@/features/navigation/routeParams';
import { SetupChecklistRoute } from '@/shell/decide/SetupChecklistRoute';

/** Old `only` values that have a new item screen. Every other old value shows the checklist. */
export const LEGACY_ONLY: Readonly<Record<string, string>> = {
  pay: '/decide/setup/pay',
  regular: '/decide/setup/bills',
  accountUse: '/decide/setup/records',
};

export default function SetupIndexRoute() {
  const p = useLocalSearchParams<{ only?: string; mode?: string; startAt?: string }>();
  const only = oneParam(p.only);
  if (oneParam(p.mode) === 'standalone' || only === 'pay') return <Redirect href={'/decide/setup/pay' as Href} />;
  if (only !== undefined && Object.prototype.hasOwnProperty.call(LEGACY_ONLY, only)) return <Redirect href={LEGACY_ONLY[only] as Href} />;
  return <SetupChecklistRoute />;
}
