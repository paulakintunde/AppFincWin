import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PlansScreen } from '@/features/plans/PlansScreen';
import { getAnalytics } from '@/services/analytics';

const TRIGGERS = ['first_run', 'sample_bar', 'locked', 'change_plan', 'notice', 'invite'] as const;
type Trigger = (typeof TRIGGERS)[number];

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default function PlansRoute() {
  const params = useLocalSearchParams<{ mode?: string; trigger?: string; plan?: string }>();
  const router = useRouter();
  const trigger = one(params.trigger);

  // paywall_shown once per visit; an unknown or missing trigger is reported as the nearest entry, never invented detail.
  useEffect(() => {
    const known = TRIGGERS.find((x) => x === trigger);
    const fallback: Trigger = one(params.mode) === 'locked' ? 'locked' : 'change_plan';
    getAnalytics().track('paywall_shown', { trigger: known ?? fallback });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  return <PlansScreen mode={one(params.mode)} plan={one(params.plan)} onSeeMembers={() => router.push('/household' as never)} />;
}
